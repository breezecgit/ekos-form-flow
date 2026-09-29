import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateFormPdf, type PdfAttachment } from "@/lib/pdf/generate.server";
import { getForm } from "@/lib/forms/registry";
import { driveFileName, formatDate, pdfFileName, todayISO } from "@/lib/format";
import { uploadPdfToDrive } from "@/lib/drive.server";
import { button, emailShell, sendEmail } from "@/lib/email.server";
import type { FormValues, UploadedFile } from "@/lib/forms/types";
import { isVisible } from "@/lib/forms/types";

/** Forms that need the Construction team to sign before Sadie reviews. */
export function needsConstruction(formType: string): boolean {
  return formType === "new_home_order";
}

/** Written Statement: after the customer signs, Sadie + witness sign on a secure page. */
export function needsDirectorWitness(formType: string): boolean {
  return formType === "written_statement";
}

export const BUCKET = "ekos-documents";

export function appOrigin(): string {
  try {
    const req = getRequest();
    const origin = req?.headers.get("origin");
    if (origin) return origin;
    const host = req?.headers.get("host");
    if (host) return `${host.includes("localhost") ? "http" : "https"}://${host}`;
  } catch {
    /* ignore */
  }
  return "https://project--bcc818c5-4e07-4ebe-94b2-ee00eb74094c.lovable.app";
}

export function logoUrl(): string {
  return `${appOrigin()}/ekos-logo.png`;
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
  const attachments: PdfAttachment[] = [];
  const pdfCtx = { mode: "rep" as const, isDirector: true };
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
    ctx: { mode: "rep", isDirector: true, ...(tpl ? { templates: tpl.sections } : {}) },
    orderNumber: submission.order_number,
    park: parkName,
    customerName,
    parkLinks: parkLinksFrom(park, settings),
    attachments,
    ...(directorSignature ? { directorSignature } : {}),
  });

  const fileName = pdfFileName(def.title, parkName, customerName, submission.order_number);
  const path = `submissions/${submissionId}/${fileName}`;
  await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  await supabaseAdmin
    .from("form_submissions")
    .update({ pdf_path: path, updated_at: new Date().toISOString() })
    .eq("id", submissionId);

  return { bytes, path, fileName };
}

export async function signedPdfUrl(path: string, seconds = 60 * 60 * 24 * 30) {
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
  await supabaseAdmin.from("audit_log").insert({
    submission_id: entry.submissionId,
    actor_id: entry.actorId ?? null,
    actor_label: entry.actorLabel,
    action: entry.action,
    from_status: entry.fromStatus ?? null,
    to_status: entry.toStatus ?? null,
    note: entry.note ?? null,
  });
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
  const { data } = await supabaseAdmin
    .from("signing_tokens")
    .select("token")
    .eq("submission_id", submissionId)
    .eq("kind", kind)
    .is("used_at", null)
    .maybeSingle();
  if (data?.token) return data.token;
  const token = newToken();
  await supabaseAdmin.from("signing_tokens").insert({ submission_id: submissionId, token, kind });
  return token;
}

// ---------------------------------------------------------------- emails ---

export async function sendReviewRequiredEmail(submissionId: string) {
  const { submission } = await loadSubmission(submissionId);
  const settings = await getSettingsMap();
  const director = String(settings["notifications"]?.["director_email"] ?? "sadie@ekosgroup.co.uk");
  const def = getForm(submission.form_type);
  const values = (submission.data ?? {}) as FormValues;
  const origin = appOrigin();
  const pdfLink = submission.pdf_path ? await signedPdfUrl(submission.pdf_path) : "";

  const html = emailShell({
    logoUrl: logoUrl(),
    heading: "Review (&amp; Signature) Required",
    bodyHtml: `
      <p style="font-size:15px;line-height:1.6;">A <strong>${def.title}</strong> has been submitted and needs your review and signature.</p>
      <table style="font-size:14px;line-height:1.8;">
        <tr><td><strong>Order Number</strong></td><td style="padding-left:12px;">${submission.order_number}</td></tr>
        <tr><td><strong>Customer</strong></td><td style="padding-left:12px;">${values["customer_name"] ?? ""}</td></tr>
        <tr><td><strong>Park</strong></td><td style="padding-left:12px;">${values["park_name"] ?? ""}</td></tr>
        <tr><td><strong>Status</strong></td><td style="padding-left:12px;">${submission.status}</td></tr>
      </table>
      ${pdfLink ? button("View the PDF", pdfLink) : ""}
      <p style="font-size:14px;"><a href="${origin}/admin/submissions/${submission.id}">Open the tracker entry</a></p>
      <p style="font-size:14px;"><a href="${origin}/auth">Staff login</a></p>`,
  });

  await sendEmail({
    to: [director],
    subject: `Review (& Signature) Required – ${def.title} – ${submission.order_number}`,
    html,
    template: "review_required",
    submissionId,
  });
}

export async function sendOffsiteCustomerEmail(submissionId: string) {
  const { submission } = await loadSubmission(submissionId);
  const def = getForm(submission.form_type);
  const values = (submission.data ?? {}) as FormValues;
  const token = await getOrCreateSigningToken(submissionId);
  const origin = appOrigin();
  const pdfLink = submission.pdf_path ? await signedPdfUrl(submission.pdf_path) : "";
  const customerEmail = String(values["customer_email"] ?? "");

  const html = emailShell({
    logoUrl: logoUrl(),
    heading: `Please sign your ${def.title}`,
    bodyHtml: `
      <p style="font-size:15px;line-height:1.6;">Dear ${values["customer_name"] ?? "Customer"},</p>
      <p style="font-size:15px;line-height:1.6;">Thank you for reserving your new home with EKOS Group. Your order number is <strong>${submission.order_number}</strong>.</p>
      <p style="font-size:15px;line-height:1.6;">A copy of your ${def.title} is attached. When you are ready, please use the secure link below to add your signature.</p>
      ${button("Sign your form", `${origin}/sign/${token}`)}
      ${pdfLink ? `<p style="font-size:14px;"><a href="${pdfLink}">View your full form (PDF)</a></p>` : ""}`,
  });

  const attachments = submission.pdf_path
    ? await (async () => {
        const dl = await supabaseAdmin.storage.from(BUCKET).download(submission.pdf_path!);
        if (!dl.data) return [];
        return [
          {
            filename: submission.pdf_path!.split("/").pop()!,
            bytes: new Uint8Array(await dl.data.arrayBuffer()),
          },
        ];
      })()
    : [];

  await sendEmail({
    to: [customerEmail],
    subject: `Your ${def.title} – ${submission.order_number} – please sign`,
    html,
    attachments,
    template: "offsite_signature_request",
    submissionId,
  });
}

/** Written Statement: secure Director & Witness signing link – to Sadie only. */
export async function sendDirectorWitnessEmail(submissionId: string) {
  const { submission } = await loadSubmission(submissionId);
  const def = getForm(submission.form_type);
  const values = (submission.data ?? {}) as FormValues;
  const settings = await getSettingsMap();
  const director = String(settings["notifications"]?.["director_email"] ?? "") || "sadie@ekosgroup.co.uk";
  const token = await getOrCreateSigningToken(submissionId, "director");
  const origin = appOrigin();
  const pdfLink = submission.pdf_path ? await signedPdfUrl(submission.pdf_path) : "";

  const html = emailShell({
    logoUrl: logoUrl(),
    heading: "Director &amp; Witness Signatures Required",
    bodyHtml: `
      <p style="font-size:15px;line-height:1.6;">The customer has signed <strong>${def.title}</strong>. Please sign it with your witness present, using the secure link below.</p>
      <table style="font-size:14px;line-height:1.8;">
        <tr><td><strong>Order Number</strong></td><td style="padding-left:12px;">${submission.order_number}</td></tr>
        <tr><td><strong>Customer</strong></td><td style="padding-left:12px;">${values["customer_name"] ?? ""}</td></tr>
        <tr><td><strong>Park</strong></td><td style="padding-left:12px;">${values["park_name"] ?? ""}</td></tr>
      </table>
      ${button("Sign as Director with Witness", `${origin}/sign/${token}`)}
      ${pdfLink ? `<p style="font-size:14px;"><a href="${pdfLink}">View the full statement (PDF)</a></p>` : ""}`,
  });

  await sendEmail({
    to: [director],
    subject: `Director & Witness Signatures Required – ${def.title} – ${submission.order_number}`,
    html,
    template: "director_witness_request",
    submissionId,
  });
}

/** New Home Order Form: full signed form + secure link to the Construction team. */
export async function sendConstructionEmail(submissionId: string) {
  const { submission } = await loadSubmission(submissionId);
  const def = getForm(submission.form_type);
  const values = (submission.data ?? {}) as FormValues;
  const settings = await getSettingsMap();
  const to = String(settings["notifications"]?.["construction_email"] ?? "");
  const token = await getOrCreateSigningToken(submissionId, "construction");
  const origin = appOrigin();
  const pdfLink = submission.pdf_path ? await signedPdfUrl(submission.pdf_path) : "";

  const html = emailShell({
    logoUrl: logoUrl(),
    heading: "Construction Signature Required",
    bodyHtml: `
      <p style="font-size:15px;line-height:1.6;">The <strong>${def.title}</strong> below has been signed by the customer and needs the Construction team's signature before it goes to the Director for approval.</p>
      <table style="font-size:14px;line-height:1.8;">
        <tr><td><strong>Order Number</strong></td><td style="padding-left:12px;">${submission.order_number}</td></tr>
        <tr><td><strong>Customer</strong></td><td style="padding-left:12px;">${values["customer_name"] ?? ""}</td></tr>
        <tr><td><strong>Park</strong></td><td style="padding-left:12px;">${values["park_name"] ?? ""}</td></tr>
      </table>
      ${button("Sign as Construction team", `${origin}/sign/${token}`)}
      ${pdfLink ? `<p style="font-size:14px;"><a href="${pdfLink}">View the full form (PDF)</a></p>` : ""}`,
  });

  const attachments = submission.pdf_path
    ? await (async () => {
        const dl = await supabaseAdmin.storage.from(BUCKET).download(submission.pdf_path!);
        if (!dl.data) return [];
        return [{ filename: submission.pdf_path!.split("/").pop()!, bytes: new Uint8Array(await dl.data.arrayBuffer()) }];
      })()
    : [];

  await sendEmail({
    to: [to],
    subject: `Construction Signature Required – ${def.title} – ${submission.order_number}`,
    html,
    attachments,
    template: "construction_signature_request",
    submissionId,
  });
}

export async function sendCompletionEmails(submissionId: string, pdfBytes: Uint8Array, fileName: string) {
  const { submission } = await loadSubmission(submissionId);
  const def = getForm(submission.form_type);
  const values = (submission.data ?? {}) as FormValues;
  const settings = await getSettingsMap();
  const notif = settings["notifications"] ?? {};

  // Park inbox: this form's Email box, else the one from the Reservation Form, else Settings.
  let parkEmail = String(values["park_email"] ?? "");
  if (!parkEmail) {
    const { data: res } = await supabaseAdmin
      .from("form_submissions")
      .select("data")
      .eq("sale_id", submission.sale_id)
      .eq("form_type", "reservation")
      .maybeSingle();
    parkEmail = String(((res?.data ?? {}) as FormValues)["park_email"] ?? "");
  }
  if (!parkEmail) {
    const park = await getPark(String(values["park_name"] ?? ""));
    parkEmail = park?.inbox_email ?? "";
  }
  const recipients = [
    String(values["customer_email"] ?? ""),
    parkEmail,
    String(notif["sales_email"] ?? "sales@ekosgroup.co.uk"),
    String(notif["director_email"] ?? "sadie@ekosgroup.co.uk"),
  ];

  const html = emailShell({
    logoUrl: logoUrl(),
    heading: `Your ${def.title} is complete`,
    bodyHtml: `
      <p style="font-size:15px;line-height:1.6;">Your <strong>${def.title}</strong> is complete – please find your signed copy attached.</p>
      <table style="font-size:14px;line-height:1.8;">
        <tr><td><strong>Order Number</strong></td><td style="padding-left:12px;">${submission.order_number}</td></tr>
        <tr><td><strong>Customer</strong></td><td style="padding-left:12px;">${values["customer_name"] ?? ""}</td></tr>
        <tr><td><strong>Park</strong></td><td style="padding-left:12px;">${values["park_name"] ?? ""}</td></tr>
      </table>
      <p style="font-size:15px;line-height:1.6;">Thank you for choosing EKOS Group.</p>`,
  });

  await sendEmail({
    to: recipients,
    subject: `Your ${def.title} is complete – ${submission.order_number}`,
    html,
    attachments: [{ filename: fileName, bytes: pdfBytes }],
    template: "completion",
    submissionId,
  });
}

export async function sendDisapprovalEmail(submissionId: string, note: string) {
  const { submission } = await loadSubmission(submissionId);
  const def = getForm(submission.form_type);
  const origin = appOrigin();
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", submission.created_by)
    .maybeSingle();
  if (!profile?.email) return;

  const html = emailShell({
    logoUrl: logoUrl(),
    heading: "Changes needed before approval",
    bodyHtml: `
      <p style="font-size:15px;line-height:1.6;">The <strong>${def.title}</strong> for order <strong>${submission.order_number}</strong> has been disapproved and reopened for edits.</p>
      <p style="font-size:15px;line-height:1.6;"><strong>Note from the Director:</strong><br/>${note || "(no note)"}</p>
      <p style="font-size:15px;line-height:1.6;">It stays here until edits are complete. When you resubmit it goes back to Sadie for review.</p>
      ${button("Open the form", `${origin}/forms/${submission.form_type}/${submission.id}`)}`,
  });

  await sendEmail({
    to: [profile.email],
    subject: `Action needed – ${def.title} – ${submission.order_number}`,
    html,
    template: "disapproved",
    submissionId,
  });
}

export async function sendResumeLinkEmail(submissionId: string, repEmail: string) {
  const { submission } = await loadSubmission(submissionId);
  const def = getForm(submission.form_type);
  const origin = appOrigin();
  const html = emailShell({
    logoUrl: logoUrl(),
    heading: "Your saved draft",
    bodyHtml: `
      <p style="font-size:15px;line-height:1.6;">Your <strong>${def.title}</strong> draft for order <strong>${submission.order_number}</strong> has been saved.</p>
      ${button("Resume this form", `${origin}/forms/${submission.form_type}/${submission.id}`)}`,
  });
  await sendEmail({
    to: [repEmail],
    subject: `Draft saved – ${def.title} – ${submission.order_number}`,
    html,
    template: "draft_resume",
    submissionId,
  });
}

/** Completion: merge Sadie's signature, email everyone, copy to Google Drive. */
export async function runCompletion(submissionId: string, opts: { storedSignature?: boolean } = {}) {
  const { bytes, fileName } = await buildAndStorePdf(submissionId, {
    includeDirectorSignature: opts.storedSignature !== false,
  });
  await sendCompletionEmails(submissionId, bytes, fileName);

  const { submission, sale } = await loadSubmission(submissionId);
  const values = (submission.data ?? {}) as FormValues;
  const settings = await getSettingsMap();
  const folderId = String(settings["google_drive"]?.["folder_id"] ?? "");
  const driveName = driveFileName(
    String(values["park_name"] ?? sale?.park_name ?? ""),
    String(values["customer_name"] ?? sale?.customer_name ?? ""),
    submission.order_number,
  );
  const driveId = await uploadPdfToDrive(driveName, folderId, bytes);
  if (driveId) {
    await supabaseAdmin.from("form_submissions").update({ drive_file_id: driveId }).eq("id", submissionId);
  }
  return { driveId, fileName };
}

export function describeDate(d: string | null | undefined) {
  return d ? formatDate(d) : "";
}
