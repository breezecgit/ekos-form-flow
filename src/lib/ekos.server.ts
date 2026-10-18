import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateFormPdf, type PdfAttachment } from "@/lib/pdf/generate.server";
import { getForm } from "@/lib/forms/registry";
import { formatDate, pdfFileName, todayISO } from "@/lib/format";
import {
  button,
  detailsTable,
  emailShell,
  esc,
  FROM_CUSTOMER,
  FROM_INTERNAL,
  goldBox,
  h3,
  outlineButton,
  p,
  sendEmail,
} from "@/lib/email.server";
import { contactsFor, emailFormName, saveStageToDrive, syncTrackerSheet } from "@/lib/automations.server";
import type { FormValues, UploadedFile } from "@/lib/forms/types";
import { isVisible } from "@/lib/forms/types";
import { staffEmailLink } from "@/lib/email-links";

/** Forms that need the Construction team to sign before Sadie reviews. */
export function needsConstruction(formType: string): boolean {
  return formType === "new_home_order";
}

/** Written Statement: after the customer signs, Sadie + witness sign on a secure page. */
export function needsDirectorWitness(formType: string): boolean {
  return formType === "written_statement";
}

export const BUCKET = "ekos-documents";

export const DEFAULT_APP_BASE_URL = "https://forms.ekosgroup.co.uk";

/**
 * Every link in emails / copied links is built from Admin > Settings "App base URL"
 * (never the request origin – the editor preview needs a Lovable login).
 */
export async function appOrigin(): Promise<string> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "app_base_url").maybeSingle();
  const url = String(((data?.value ?? {}) as Record<string, unknown>)["url"] ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(url) ? url : DEFAULT_APP_BASE_URL;
}

/** "Your" + form name without doubling ("Your Your Written Statement"). */
export function yourForm(name: string): string {
  return `Your ${name.replace(/^your\s+/i, "")}`;
}

export async function getSettingsMap(): Promise<Record<string, Record<string, unknown>>> {
  const { data } = await supabaseAdmin.from("app_settings").select("key, value");
  const out: Record<string, Record<string, unknown>> = {};
  for (const row of data ?? []) out[row.key] = (row.value ?? {}) as Record<string, unknown>;
  return out;
}

export async function getPark(name: string) {
  if (!name) return null;
  const { data } = await supabaseAdmin.from("parks").select("*").eq("name", name).maybeSingle();
  return data;
}

export function parkLinksFrom(
  park: Awaited<ReturnType<typeof getPark>>,
  settings: Record<string, Record<string, unknown>> = {},
) {
  return {
    welcome_pack_url:
      String(settings["links"]?.["welcome_pack_url"] ?? "") || "https://ekosgroup.co.uk/ekos-welcome-pack",
    brochure_url: park?.brochure_url ?? "",
    site_licence_url: park?.site_licence_url ?? "",
    park_rules_url: park?.park_rules_url ?? "",
  };
}

export async function loadSubmission(submissionId: string) {
  const { data: submission, error } = await supabaseAdmin
    .from("form_submissions")
    .select("*")
    .eq("id", submissionId)
    .maybeSingle();
  if (error || !submission) throw new Error("Submission not found");
  const { data: sale } = await supabaseAdmin
    .from("sales")
    .select("*")
    .eq("id", submission.sale_id)
    .maybeSingle();
  return { submission, sale };
}

/** Rebuilds the PDF from the stored answers and saves it to Cloud storage. */
export async function buildAndStorePdf(
  submissionId: string,
  opts: { includeDirectorSignature?: boolean } = {},
): Promise<{ bytes: Uint8Array; path: string; fileName: string }> {
  const { submission, sale } = await loadSubmission(submissionId);
  const def = getForm(submission.form_type);
  const values = (submission.data ?? {}) as FormValues;
  const parkName = String(values["park_name"] ?? sale?.park_name ?? "");
  const customerName = String(values["customer_name"] ?? sale?.customer_name ?? "");
  const park = await getPark(parkName);
  const settings = await getSettingsMap();

  // Uploaded documents are embedded / appended in form order so the PDF is the full record.
  // Only files uploaded to a form of this same sale may be embedded.
  let prefixes: string[] | null = null;
  const allowedPrefixes = async () => {
    if (prefixes) return prefixes;
    const { data: rows } = await supabaseAdmin
      .from("form_submissions")
      .select("id")
      .eq("sale_id", submission.sale_id);
    prefixes = [submission.id, ...(rows ?? []).map((r) => r.id)].map((id) => `submissions/${id}/files/`);
    return prefixes;
  };
  const attachments: PdfAttachment[] = [];
  const pdfCtx = { mode: "director" as const, isDirector: true };
  let section = "";
  for (const f of def.steps.flatMap((s) => s.fields)) {
    if (f.sectionLabel) section = f.sectionLabel;
    if (f.type === "static") {
      const heads = (f.content ?? []).filter((b) => b.kind === "subheading" || b.kind === "heading");
      if (heads.length) section = (heads[heads.length - 1] as { text: string }).text;
    }
    if (f.type !== "file" || !isVisible(f, values, pdfCtx)) continue;
    const list = Array.isArray(values[f.key]) ? (values[f.key] as UploadedFile[]) : [];
    for (const file of list) {
      if (!(await allowedPrefixes()).some((p) => typeof file?.path === "string" && file.path.startsWith(p) && !file.path.includes(".."))) continue;
      const dl = await supabaseAdmin.storage.from(BUCKET).download(file.path);
      if (dl.data) {
        attachments.push({
          fileName: file.name,
          mimeType: file.mime,
          bytes: new Uint8Array(await dl.data.arrayBuffer()),
          label: `${section && section !== f.label ? `${section} – ` : ""}${f.pdfLabel ?? f.label ?? f.key} – ${file.name}`,
        });
      }
    }
  }

  let directorSignature: import("@/lib/pdf/generate.server").DirectorSignature | undefined;
  if (opts.includeDirectorSignature) {
    const ds = settings["director_signature"] ?? {};
    let imageBytes: Uint8Array | undefined;
    const imagePath = String(ds["image_path"] ?? "");
    if (imagePath) {
      const dl = await supabaseAdmin.storage.from(BUCKET).download(imagePath);
      if (dl.data) imageBytes = new Uint8Array(await dl.data.arrayBuffer());
    }
    directorSignature = {
      name: String(ds["name"] ?? "Sadie Deveraux"),
      title: String(ds["title"] ?? "Director – authorised signatory of EKOS Group"),
      date: todayISO(),
      ...(imageBytes ? { imageBytes } : {}),
    };
  }

  const { templatesForSubmission } = await import("@/lib/statement.server");
  const tpl = await templatesForSubmission(submission.form_type, values);
  const bytes = await generateFormPdf({
    def,
    values,
    ctx: { mode: "director", isDirector: true, ...(tpl ? { templates: tpl.sections } : {}) },
    orderNumber: submission.order_number,
    park: parkName,
    customerName,
    parkLinks: parkLinksFrom(park, settings),
    attachments,
    ...(directorSignature ? { directorSignature } : {}),
  });

  const fileName = pdfFileName(def.title, parkName, customerName, submission.order_number);
  const path = `submissions/${submissionId}/${fileName}`;
  const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (uploadError) throw new Error("The PDF could not be stored. Please retry generation.");
  const { error: pathError } = await supabaseAdmin
    .from("form_submissions")
    .update({ pdf_path: path, updated_at: new Date().toISOString() })
    .eq("id", submissionId);
  if (pathError) throw new Error("The PDF was stored but could not be linked to the form. Please retry generation.");

  return { bytes, path, fileName };
}

export async function signedPdfUrl(path: string, seconds = 60 * 60 * 24 * 60) {
  const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? "";
}

export async function addAudit(entry: {
  submissionId: string;
  actorId?: string | null;
  actorLabel: string;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
}) {
  const { error } = await supabaseAdmin.from("audit_log").insert({
    submission_id: entry.submissionId,
    actor_id: entry.actorId ?? null,
    actor_label: entry.actorLabel,
    action: entry.action,
    from_status: entry.fromStatus ?? null,
    to_status: entry.toStatus ?? null,
    note: entry.note ?? null,
  });
  if (error) throw new Error("The action could not be recorded in the audit history. Please contact EKOS before retrying.");
}

export function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getOrCreateSigningToken(
  submissionId: string,
  kind: "customer_offsite" | "construction" | "director" = "customer_offsite",
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("signing_tokens")
    .select("token")
    .eq("submission_id", submissionId)
    .eq("kind", kind)
    .is("used_at", null)
    .gt("expires_at", new Date(Date.now() + 30 * 86400000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("A signing link could not be checked. Please retry without resending.");
  if (data?.token) return data.token;
  const token = newToken();
  const { error: insertError } = await supabaseAdmin.from("signing_tokens").insert({ submission_id: submissionId, token, kind });
  if (insertError) throw new Error("A signing link could not be created. Please retry.");
  return token;
}

// ---------------------------------------------------------------- emails ---

async function emailContext(submissionId: string) {
  const { submission, sale } = await loadSubmission(submissionId);
  const values = (submission.data ?? {}) as FormValues;
  const parkName = String(values["park_name"] ?? sale?.park_name ?? "");
  const salesPerson = String(values["sales_person"] ?? sale?.sales_person ?? "");
  const contacts = await contactsFor(salesPerson, parkName);
  const name = String(values["customer_name"] ?? sale?.customer_name ?? "");
  const email = String(values["customer_email"] ?? sale?.customer_email ?? "");
  const phone = String(values["customer_phone"] ?? sale?.customer_phone ?? "");
  const formName = emailFormName(submission.form_type);
  const pdfLink = submission.pdf_path ? await signedPdfUrl(submission.pdf_path) : "";
  const table = detailsTable([
    ["Form", formName],
    ["Name", name],
    ["Email", email],
    ["Phone", phone],
    ["Park", parkName],
  ]);
  return { submission, sale, values, parkName, contacts, name, email, formName, pdfLink, table, origin: await appOrigin() };
}

async function pdfAttachment(path: string | null) {
  if (!path) return [];
  const dl = await supabaseAdmin.storage.from(BUCKET).download(path);
  if (!dl.data) return [];
  return [{ filename: path.split("/").pop()!, bytes: new Uint8Array(await dl.data.arrayBuffer()) }];
}

/** (b) Sadie review – to Sadie only. Written Statement adds the Director & Witness signing button. */
export async function sendReviewRequiredEmail(submissionId: string) {
  const c = await emailContext(submissionId);
  const isWS = needsDirectorWitness(c.submission.form_type);
  const reservationOnSite = c.submission.form_type === "reservation" && c.submission.status === "In Review";
  const withSignature = isWS || reservationOnSite;
  const signLink = isWS ? `${c.origin}/sign/${await getOrCreateSigningToken(submissionId, "director")}` : "";

  const html = emailShell({
    heading: "New form submission",
    bodyHtml: `
      ${p(`A new ${esc(c.formName)} has been submitted.`)}
      ${c.table}
      ${isWS ? p("<strong>Director and Witness signature required before completion.</strong>") + button("Sign the form", signLink) : ""}
      ${c.pdfLink ? button("Open the form PDF", c.pdfLink) : ""}
      ${outlineButton("View the tracker", staffEmailLink(c.origin, `/admin/submissions/${submissionId}`))}
      ${outlineButton("Log in to the website", staffEmailLink(c.origin, `/admin/submissions/${submissionId}`))}
      ${c.pdfLink ? p("The form PDF is also attached to this email.") : ""}`,
  });

  await sendEmail({
    from: FROM_INTERNAL,
    to: [c.contacts.sadie],
    subject: withSignature
      ? "New Customer Form Submission - Review & Signature Required"
      : "New Customer Form Submission - Review Required",
    html,
    attachments: await pdfAttachment(c.submission.pdf_path),
    template: isWS ? "review_signature_required" : "review_required",
    submissionId,
  });
}

/** Written Statement: the review email carries Sadie's Director & Witness signing link. */
export async function sendDirectorWitnessEmail(submissionId: string) {
  await sendReviewRequiredEmail(submissionId);
}

/** (a) Customer "ready to sign" (off site). */
export async function sendOffsiteCustomerEmail(submissionId: string) {
  const c = await emailContext(submissionId);
  // Identification Checks are never signed by the customer – no link, no customer email.
  if (c.submission.form_type === "identification") return;
  const token = await getOrCreateSigningToken(submissionId);
  const f = esc(c.formName);
  const html = emailShell({
    heading: `${yourForm(f)} is ready`,
    bodyHtml: `
      ${goldBox(`Please review and sign your ${f}.`)}
      ${p("Thank you for choosing EKOS Homes. There are just two short steps to complete.")}
      ${h3("Step 1 — Review your form")}
      ${p("Please take a moment to check that all the details on your form are correct.")}
      ${c.pdfLink ? button("Review form", c.pdfLink) : ""}
      ${h3("Step 2 — Sign your form")}
      ${p("Once you're happy that everything is correct, please click below to sign and submit.")}
      ${outlineButton("Sign form", `${c.origin}/sign/${token}`)}
      ${p("If you have any questions, don't hesitate to contact us – we're here to help.")}`,
  });
  await sendEmail({
    from: FROM_CUSTOMER,
    to: [c.email],
    cc: [c.contacts.sadie, c.contacts.sales, c.contacts.repEmail, c.contacts.parkInbox],
    subject: `${yourForm(c.formName)} is ready`,
    html,
    attachments: await pdfAttachment(c.submission.pdf_path),
    template: "offsite_ready_to_sign",
    submissionId,
  });
}

/** (c) Customer submitted the off-site signing page – rep + park inbox. */
export async function sendSignatureCompleteEmail(submissionId: string) {
  const c = await emailContext(submissionId);
  const html = emailShell({
    heading: "Signature completed",
    bodyHtml: `${p(`The ${esc(c.formName)} has been signed.`)}${c.table}`,
  });
  await sendEmail({
    from: FROM_INTERNAL,
    to: [c.contacts.repEmail, c.contacts.parkInbox],
    subject: "Signature Complete",
    html,
    template: "signature_complete",
    submissionId,
  });
}

/** (d) New Home Order Form: Construction final sign-off. */
export async function sendConstructionEmail(submissionId: string) {
  const c = await emailContext(submissionId);
  const token = await getOrCreateSigningToken(submissionId, "construction");
  const html = emailShell({
    heading: "Final sign-off required",
    bodyHtml: `
      ${goldBox("A signed New Home Order Form is ready for the Construction team's final sign-off.")}
      ${p("The customer has completed and signed their form. Please review the signed form below, then complete the Construction sign-off.")}
      ${c.pdfLink ? button("View signed form (PDF)", c.pdfLink) : ""}
      ${outlineButton("Complete final sign-off", `${c.origin}/sign/${token}`)}`,
  });
  await sendEmail({
    from: FROM_INTERNAL,
    to: [c.contacts.construction],
    cc: [c.contacts.sadie, c.contacts.sales, c.contacts.repEmail, c.contacts.parkInbox],
    subject: "New Home Order Form - Final sign-off required",
    html,
    attachments: await pdfAttachment(c.submission.pdf_path),
    template: "construction_signoff",
    submissionId,
  });
}

/** (e) Completed – to customer, CC rep, park inbox, Sadie, sales@. */
export async function sendCompletionEmails(submissionId: string, pdfBytes: Uint8Array, fileName: string) {
  const c = await emailContext(submissionId);
  const subject =
    c.submission.form_type === "identification"
      ? "Your Identification Checks are complete"
      : `${yourForm(c.formName)} is complete`;
  const html = emailShell({
    heading: esc(subject),
    bodyHtml: `
      ${goldBox(`We're happy to confirm that we've received your completed ${esc(c.formName)}.`)}
      ${p(c.pdfLink ? `<a href="${c.pdfLink}" style="color:#d2a065;">Please click here for your copy of the form you completed with your sales executive for your records.</a>` : "Please find attached your copy of the form you completed with your sales executive for your records.")}
      ${p("To help you prepare for the next steps, please refer to the What Happens Next Guide at the bottom of the form.")}
      ${p("If you have any questions, don't hesitate to contact us – we're here to help.")}
      <p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#d2a065;">Welcome to the EKOS Homes family!</p>`,
  });
  await sendEmail({
    from: FROM_CUSTOMER,
    to: [c.email],
    cc: [c.contacts.repEmail, c.contacts.parkInbox, c.contacts.sadie, c.contacts.sales],
    subject,
    html,
    attachments: [{ filename: fileName, bytes: pdfBytes }],
    template: "completion",
    submissionId,
  });
}

export async function sendDisapprovalEmail(submissionId: string, note: string) {
  const c = await emailContext(submissionId);
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", c.submission.created_by)
    .maybeSingle();
  const html = emailShell({
    heading: "Changes needed before approval",
    bodyHtml: `
      ${p(`The ${esc(c.formName)} for ${esc(c.name)} (${esc(c.submission.order_number)}) has been disapproved and reopened for edits.`)}
      ${goldBox(`Note from the Director: ${esc(note || "(no note)")}`)}
      ${c.table}
      ${button("Open the form", staffEmailLink(c.origin, `/forms/${c.submission.form_type}/${c.submission.id}`))}`,
  });
  await sendEmail({
    from: FROM_INTERNAL,
    to: [c.contacts.repEmail || profile?.email || ""],
    cc: [profile?.email ?? ""],
    subject: `Action needed - ${c.formName} - ${c.name}`,
    html,
    template: "disapproved",
    submissionId,
  });
}

export async function sendResumeLinkEmail(submissionId: string, repEmail: string) {
  const c = await emailContext(submissionId);
  const html = emailShell({
    heading: "Your saved draft",
    bodyHtml: `
      ${p(`${esc(yourForm(c.formName))} draft for ${esc(c.name || c.submission.order_number)} has been saved.`)}
      ${button("Resume this form", staffEmailLink(c.origin, `/forms/${c.submission.form_type}/${c.submission.id}`))}`,
  });
  await sendEmail({
    from: FROM_INTERNAL,
    to: [repEmail],
    subject: `Draft saved - ${c.formName} - ${c.submission.order_number}`,
    html,
    template: "draft_resume",
    submissionId,
  });
}

// ------------------------------------------------------ Drive + tracker ---

/** Save the current PDF as an "- In Review" stage in the customer's Drive sub-folder and sync the sheet. */
export async function publishInReview(submissionId: string, bytes: Uint8Array) {
  const { submission } = await loadSubmission(submissionId);
  await saveStageToDrive({
    saleId: submission.sale_id,
    submissionId,
    formType: submission.form_type,
    suffix: "In Review",
    bytes,
  });
  await syncTrackerSheet(submission.sale_id);
}

export async function syncSheetForSubmission(submissionId: string) {
  const { submission } = await loadSubmission(submissionId);
  await syncTrackerSheet(submission.sale_id);
}

/** Completion: merged PDF (form + customer + construction + Sadie), emails, Drive, tracker sheet. */
export async function runCompletion(submissionId: string, opts: { storedSignature?: boolean } = {}) {
  const { submission } = await loadSubmission(submissionId);
  const isWS = opts.storedSignature === false;
  let driveId: string | null = null;
  let merged: { bytes: Uint8Array; fileName: string };

  if (isWS) {
    // Director + witness signed on the page: the statement itself is the fully signed record.
    merged = await buildAndStorePdf(submissionId);
    await saveStageToDrive({
      saleId: submission.sale_id,
      submissionId,
      formType: submission.form_type,
      suffix: "Sadie Signature & Witness - Completed",
      bytes: merged.bytes,
      latest: false,
    });
  } else {
    const plain = await buildAndStorePdf(submissionId);
    await saveStageToDrive({
      saleId: submission.sale_id,
      submissionId,
      formType: submission.form_type,
      suffix: "Completed",
      bytes: plain.bytes,
      latest: false,
    });
    merged = await buildAndStorePdf(submissionId, { includeDirectorSignature: true });
  }
  driveId = await saveStageToDrive({
    saleId: submission.sale_id,
    submissionId,
    formType: submission.form_type,
    suffix: "Completed - Merged",
    bytes: merged.bytes,
  });

  await sendCompletionEmails(submissionId, merged.bytes, merged.fileName);
  await syncTrackerSheet(submission.sale_id);
  return { driveId, fileName: merged.fileName };
}

export function describeDate(d: string | null | undefined) {
  return d ? formatDate(d) : "";
}

// ------------------------------------------------------ email self-test ---

const SAMPLE_EMAIL = "sample.customer@example.com";

async function sampleSubmission(saleId: string, orderNumber: string, formType: string, userId: string, extra: Record<string, unknown>, customerSigned: boolean) {
  const { data: existing } = await supabaseAdmin
    .from("form_submissions")
    .select("id")
    .eq("sale_id", saleId)
    .eq("form_type", formType)
    .neq("status", "Completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: model } = await supabaseAdmin
    .from("form_submissions")
    .select("data")
    .eq("form_type", formType)
    .neq("sale_id", saleId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const base = { ...((model?.data ?? {}) as Record<string, unknown>) };
  for (const k of Object.keys(base)) if (/^(director|witness|construction)_/.test(k)) delete base[k];
  const now = new Date().toISOString();
  const { data: row, error } = await supabaseAdmin
    .from("form_submissions")
    .insert({
      sale_id: saleId,
      form_type: formType,
      order_number: orderNumber,
      status: "In Review (Offsite)",
      is_draft: false,
      submitted_at: now,
      customer_signed_at: customerSigned ? now : null,
      created_by: userId,
      data: { ...base, ...extra, status: "In Review (Offsite)" } as never,
    })
    .select("id")
    .single();
  if (error || !row) throw new Error(`Could not create sample ${formType}: ${error?.message}`);
  return row.id;
}

/** Director-only: renders every email template for a sample sale and sends it (test mode applies). */
export async function sendAllTestEmails(userId: string, userEmail: string) {
  let { data: sale } = await supabaseAdmin.from("sales").select("*").eq("customer_email", SAMPLE_EMAIL).maybeSingle();
  if (!sale) {
    const ins = await supabaseAdmin
      .from("sales")
      .insert({
        order_number: "",
        park_name: "Castle View",
        customer_name: "Sample Customer (email test)",
        customer_email: SAMPLE_EMAIL,
        customer_phone: "07700 900000",
        sales_person: "Ben Cook",
        created_by: userId,
      })
      .select("*")
      .single();
    if (ins.error || !ins.data) throw new Error(`Could not create the sample sale: ${ins.error?.message}`);
    sale = ins.data;
  }
  const extra = {
    customer_name: sale.customer_name,
    party_customer_name: sale.customer_name,
    customer_email: SAMPLE_EMAIL,
    customer_phone: sale.customer_phone,
    park_name: sale.park_name,
    park_name_confirm: sale.park_name,
    sales_person: sale.sales_person,
  };
  const res = await sampleSubmission(sale.id, sale.order_number, "reservation", userId, extra, false);
  const nho = await sampleSubmission(sale.id, sale.order_number, "new_home_order", userId, extra, true);
  const ws = await sampleSubmission(sale.id, sale.order_number, "written_statement", userId, extra, true);
  const resPdf = await buildAndStorePdf(res);
  await buildAndStorePdf(nho);
  await buildAndStorePdf(ws);

  const steps: [string, () => Promise<unknown>][] = [
    ["Sadie review (Review Required)", () => sendReviewRequiredEmail(res)],
    ["Sadie review + Director & Witness signing (Written Statement)", () => sendDirectorWitnessEmail(ws)],
    ["Customer ready to sign (off site)", () => sendOffsiteCustomerEmail(res)],
    ["Customer ready to sign – Written Statement", () => sendOffsiteCustomerEmail(ws)],
    ["Construction final sign-off", () => sendConstructionEmail(nho)],
    ["Signature complete", () => sendSignatureCompleteEmail(res)],
    ["Completed", () => sendCompletionEmails(res, resPdf.bytes, resPdf.fileName)],
    ["Disapproved", () => sendDisapprovalEmail(res, "Sample note – email test only")],
    ["Draft saved / resume link", () => sendResumeLinkEmail(res, userEmail)],
  ];
  const results: { label: string; ok: boolean; error?: string }[] = [];
  for (const [label, fn] of steps) {
    try {
      await fn();
      results.push({ label, ok: true });
    } catch (e) {
      results.push({ label, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { orderNumber: sale.order_number, results };
}
