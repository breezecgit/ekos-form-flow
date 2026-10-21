import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getForm, FORM_TITLES } from "@/lib/forms/registry";
import { AMENDMENT_STATUS, OPEN_AMENDMENT_STATUSES, buildChangeList, prepareAmendment, type AmendmentChange } from "@/lib/forms/amendments";
import { withoutRetiredTopup } from "@/lib/forms/retired-topup";
import { prepareHomeCost } from "@/lib/forms/home-cost";
import { validateFormWrite } from "@/lib/forms/write-validation";
import { pdfFileName, todayISO } from "@/lib/format";
import type { FormValues } from "@/lib/forms/types";
import { planUsaUpdate } from "@/lib/forms/nho-to-usa";

/** Untyped service-role client: form_amendments is not in generated types until its migration is applied. */
function db(): SupabaseClient {
  const url = process.env["SUPABASE_URL"], key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Server configuration unavailable");
  return createClient(url, key, { auth: { persistSession: false }, global: { fetch: (input, init) => {
    const h = new Headers(init?.headers); h.set("apikey", key);
    if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
    return fetch(input, { ...init, headers: h });
  } } });
}

export interface AmendmentRow {
  id: string;
  submission_id: string;
  amendment_number: number;
  reason: string;
  changes: AmendmentChange[];
  values_before: FormValues;
  values_after: FormValues;
  status: string;
  created_by: string;
  created_at: string;
  customer_signature: string | null;
  customer_signed_name: string | null;
  customer_signed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  pdf_path: string | null;
  cancelled_at: string | null;
}

const UNAVAILABLE = "Amendments are not switched on yet – the database update for amendments still needs approval.";

function check<T>(r: { data: T; error: { message?: string; code?: string } | null }, message: string): T {
  if (r.error) {
    if (r.error.code === "42P01" || /form_amendments/.test(r.error.message ?? "")) throw new Error(UNAVAILABLE);
    throw new Error(message);
  }
  return r.data;
}

export function originalSignedDate(s: { customer_signed_at?: string | null; submitted_at?: string | null; updated_at: string }) {
  return (s.customer_signed_at ?? s.submitted_at ?? s.updated_at).slice(0, 10);
}

async function loadSale(submissionId: string) {
  const { loadSubmission } = await import("@/lib/ekos.server");
  return await loadSubmission(submissionId);
}

function originalFileName(submission: { form_type: string; order_number: string; data: unknown }, sale: { park_name?: string; customer_name?: string } | null) {
  const v = (submission.data ?? {}) as FormValues;
  return pdfFileName(getForm(submission.form_type).title, String(v["park_name"] ?? sale?.park_name ?? ""), String(v["customer_name"] ?? sale?.customer_name ?? ""), submission.order_number);
}

export async function listAmendments(submissionId: string): Promise<AmendmentRow[]> {
  const rows = check(await db().from("form_amendments").select("*").eq("submission_id", submissionId).order("amendment_number"), "Amendments could not be loaded.");
  return (rows ?? []) as AmendmentRow[];
}

async function audit(submissionId: string, actorId: string | null, actorLabel: string, action: string, note?: string) {
  const { addAudit } = await import("@/lib/ekos.server");
  await addAudit({ submissionId, actorId, actorLabel, action, note: note ?? null });
}

/** Director starts an amendment of a Completed form. Original data and signed PDF are not touched. */
export async function startAmendment(input: { submissionId: string; userId: string; actorLabel: string; values: FormValues; reason: string; isDirector?: boolean; carriedOver?: boolean }) {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("Please give a reason for the amendment.");
  const { submission } = await loadSale(input.submissionId);
  if (submission.status !== "Completed") throw new Error("Only Completed forms can be amended.");
  const def = getForm(submission.form_type);
  const before = withoutRetiredTopup(submission.form_type, (submission.data ?? {}) as FormValues);
  const edited = prepareHomeCost(submission.form_type, withoutRetiredTopup(submission.form_type, input.values));
  // Carried-over amendments change only figures the approved NHO already validated; a signed form
  // missing a box made required later must not block them, so only value types are checked.
  validateFormWrite(def, edited, { mode: "rep", isDirector: input.isDirector ?? true }, input.carriedOver ? "draft" : "submit", before);
  const { after, changes } = prepareAmendment(def, before, edited);

  const d = db();
  const existing = (check(await d.from("form_amendments").select("amendment_number,status").eq("submission_id", input.submissionId), "Amendments could not be checked.") ?? []) as { amendment_number: number; status: string }[];
  if (existing.some((a) => OPEN_AMENDMENT_STATUSES.includes(a.status))) throw new Error("This form already has an open amendment. Complete or cancel it first.");
  const number = Math.max(0, ...existing.map((a) => a.amendment_number)) + 1;
  // Identification Checks are never signed by the customer, so they go straight to Sadie's approval.
  const customerSigns = submission.form_type !== "identification";
  const row = check(await d.from("form_amendments").insert({
    submission_id: input.submissionId,
    amendment_number: number,
    reason,
    changes,
    values_before: before,
    values_after: after,
    status: customerSigns ? AMENDMENT_STATUS.awaitingCustomer : AMENDMENT_STATUS.awaitingApproval,
    created_by: input.userId,
  }).select("*").single(), "The amendment could not be saved – another amendment may have just been started. Please reload.") as AmendmentRow;
  await audit(input.submissionId, input.userId, input.actorLabel, `Amendment ${number} started`, `Reason: ${reason} · ${changes.length} change(s)`);
  if (customerSigns) {
    const { sendAmendmentCustomerEmail } = await import("@/lib/ekos.server");
    await sendAmendmentCustomerEmail(input.submissionId, number);
    await audit(input.submissionId, input.userId, input.actorLabel, `Amendment ${number} sent to customer for signature`);
  } else {
    await notifyDirector(input.submissionId, number);
  }
  return row;
}

export async function resendAmendmentEmail(amendmentId: string, userId: string, actorLabel: string) {
  const a = await getAmendment(amendmentId);
  if (a.status !== AMENDMENT_STATUS.awaitingCustomer) throw new Error("This amendment is not waiting for the customer.");
  const { sendAmendmentCustomerEmail } = await import("@/lib/ekos.server");
  await sendAmendmentCustomerEmail(a.submission_id, a.amendment_number);
  await audit(a.submission_id, userId, actorLabel, `Amendment ${a.amendment_number} sent to customer for signature`, "Resent");
}

/** Never blocks the amendment: a failed notification is logged in the email log and sale history. */
async function notifyDirector(submissionId: string, number: number) {
  try {
    const { sendAmendmentApprovalEmail } = await import("@/lib/ekos.server");
    await sendAmendmentApprovalEmail(submissionId, number);
  } catch (e) {
    console.error("Amendment approval notification failed", { submissionId, number, message: e instanceof Error ? e.message : "" });
    await audit(submissionId, null, "System", `Amendment ${number} approval email to Director failed`).catch(() => undefined);
  }
}

export async function getAmendmentOwner(id: string): Promise<{ created_by: string; submission_id: string }> {
  const a = await getAmendment(id);
  return { created_by: a.created_by, submission_id: a.submission_id };
}

async function getAmendment(id: string): Promise<AmendmentRow> {
  const row = check(await db().from("form_amendments").select("*").eq("id", id).maybeSingle(), "The amendment could not be loaded.");
  if (!row) throw new Error("Amendment not found");
  return row as AmendmentRow;
}

async function retireTokens(submissionId: string) {
  const { error } = await db().from("signing_tokens").update({ used_at: new Date().toISOString() })
    .eq("submission_id", submissionId).eq("kind", "amendment").is("used_at", null);
  if (error) throw new Error("The amendment signing link could not be closed. Please retry.");
}

export async function cancelAmendment(amendmentId: string, userId: string, actorLabel: string, note: string) {
  const a = await getAmendment(amendmentId);
  if (!OPEN_AMENDMENT_STATUSES.includes(a.status)) throw new Error("Only open amendments can be cancelled.");
  const updated = check(await db().from("form_amendments")
    .update({ status: AMENDMENT_STATUS.cancelled, cancelled_by: userId, cancelled_at: new Date().toISOString(), cancel_reason: note || null })
    .eq("id", amendmentId).eq("status", a.status).select("id"), "The amendment could not be cancelled.") as unknown[];
  if (!updated?.length) throw new Error("The amendment changed elsewhere. Please reload.");
  await retireTokens(a.submission_id);
  await audit(a.submission_id, userId, actorLabel, `Amendment ${a.amendment_number} cancelled`, note || undefined);
}

class AmendmentTokenError extends Error {}

async function loadByAmendmentToken(token: string) {
  const d = db();
  const { data: row, error } = await d.from("signing_tokens").select("*").eq("token", token).maybeSingle();
  if (error) throw new Error("This link could not be checked. Please try again later.");
  if (!row || row.kind !== "amendment") throw new AmendmentTokenError("This link is not valid.");
  if (row.used_at) throw new AmendmentTokenError("This amendment has already been signed or is no longer open.");
  if (!(new Date(row.expires_at).getTime() > Date.now())) throw new AmendmentTokenError("This link has expired. Please contact EKOS Group.");
  const open = (check(await d.from("form_amendments").select("*").eq("submission_id", row.submission_id)
    .eq("status", AMENDMENT_STATUS.awaitingCustomer).limit(1), "The amendment could not be loaded.") ?? []) as AmendmentRow[];
  const amendment = open[0];
  if (!amendment) throw new AmendmentTokenError("This amendment is no longer open.");
  return { token: row as { token: string; submission_id: string }, amendment };
}

/** Public (token-only) view: just the amendment, never the full form. */
export async function publicAmendmentContext(token: string) {
  let loaded;
  try { loaded = await loadByAmendmentToken(token); } catch (e) {
    if (e instanceof AmendmentTokenError) return { error: e.message };
    throw e;
  }
  const { amendment } = loaded;
  const { submission, sale } = await loadSale(amendment.submission_id);
  const { signedPdfUrl } = await import("@/lib/ekos.server");
  const formName = FORM_TITLES[submission.form_type] ?? getForm(submission.form_type).title;
  return {
    amendmentNumber: amendment.amendment_number,
    orderNumber: submission.order_number,
    formName,
    reason: amendment.reason,
    changes: amendment.changes.map(({ label, previous, next }) => ({ label, previous, next })),
    originalSignedDate: originalSignedDate(submission),
    originalPdfUrl: submission.pdf_path ? await signedPdfUrl(submission.pdf_path, 60 * 60 * 24) : "",
    customerName: String(((submission.data ?? {}) as FormValues)["customer_name"] ?? sale?.customer_name ?? ""),
  };
}

export async function signAmendment(token: string, signature: string, name: string) {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature) || signature.length > 1_500_000) throw new Error("Please sign in the box before submitting.");
  if (!name.trim() || name.length > 200) throw new Error("Please type your full name.");
  let loaded;
  try { loaded = await loadByAmendmentToken(token); } catch (e) {
    if (e instanceof AmendmentTokenError) throw new Error(e.message);
    throw e;
  }
  const { amendment } = loaded;
  const d = db();
  const now = new Date().toISOString();
  const updated = check(await d.from("form_amendments").update({
    customer_signature: signature, customer_signed_name: name.trim(), customer_signed_at: now, status: AMENDMENT_STATUS.awaitingApproval,
  }).eq("id", amendment.id).eq("status", AMENDMENT_STATUS.awaitingCustomer).select("id"), "Your signature could not be saved. Please try again.") as unknown[];
  if (!updated?.length) throw new Error("This amendment has already been signed or is no longer open.");
  const { error } = await d.from("signing_tokens").update({ used_at: now }).eq("token", token);
  if (error) console.error("Amendment token could not be closed after signing", { submissionId: amendment.submission_id });
  await audit(amendment.submission_id, null, `Customer: ${name.trim()}`, `Amendment ${amendment.amendment_number} signed by customer`);
  await notifyDirector(amendment.submission_id, amendment.amendment_number);
}

/** Director approval: builds amendment-{n}.pdf, updates current answers, emails, then optional Drive backup. */
export async function approveAmendment(amendmentId: string, userId: string, actorLabel: string) {
  const a = await getAmendment(amendmentId);
  if (a.status !== AMENDMENT_STATUS.awaitingApproval) throw new Error("This amendment is not waiting for approval.");
  const { submission, sale } = await loadSale(a.submission_id);
  if (submission.status !== "Completed") throw new Error("The form is no longer Completed. Please reload.");
  const current = withoutRetiredTopup(submission.form_type, (submission.data ?? {}) as FormValues);
  if (buildChangeList(getForm(submission.form_type), a.values_before, current).length) {
    throw new Error("The signed form was edited after this amendment started. Cancel this amendment and start a new one.");
  }
  const s = await import("@/lib/ekos.server");
  const settings = await s.getSettingsMap();
  const ds = settings["director_signature"] ?? {};
  let imageBytes: Uint8Array | undefined;
  const imagePath = String(ds["image_path"] ?? "");
  if (imagePath) {
    const dl = await db().storage.from(s.BUCKET).download(imagePath);
    if (dl.data) imageBytes = new Uint8Array(await dl.data.arrayBuffer());
  }
  const values = (submission.data ?? {}) as FormValues;
  const formName = FORM_TITLES[submission.form_type] ?? getForm(submission.form_type).title;
  const customerName = String(a.values_after["customer_name"] ?? values["customer_name"] ?? sale?.customer_name ?? "");
  const park = String(a.values_after["park_name"] ?? values["park_name"] ?? sale?.park_name ?? "");
  const { generateAmendmentPdf, amendmentTitle } = await import("@/lib/pdf/amendment.server");
  const bytes = await generateAmendmentPdf({
    amendmentNumber: a.amendment_number,
    formName,
    orderNumber: submission.order_number,
    park,
    customerName,
    reason: a.reason,
    changes: a.changes,
    originalSignedDate: originalSignedDate(submission),
    originalFileName: originalFileName(submission, sale),
    customerSignature: a.customer_signature
      ? { dataUrl: a.customer_signature, name: a.customer_signed_name ?? "", date: (a.customer_signed_at ?? "").slice(0, 10) }
      : undefined,
    directorSignature: {
      name: String(ds["name"] ?? "Sadie Deveraux"),
      title: String(ds["title"] ?? "Director – authorised signatory of EKOS Group"),
      date: todayISO(),
      imageBytes,
    },
  });
  // Fixed key (no customer text); the original form.pdf is never touched.
  const path = `submissions/${a.submission_id}/amendment-${a.amendment_number}.pdf`;
  const up = await db().storage.from(s.BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (up.error) throw new Error("The amendment PDF could not be stored. Please retry approval.");
  const fileName = `${amendmentTitle(a.amendment_number, formName, submission.order_number)}.pdf`
    .replace(/[\u2013\u2014]/g, "-").replace(/[^A-Za-z0-9 ._()&'-]/g, "");

  const d = db();
  const wrote = check(await d.from("form_submissions").update({ data: a.values_after, updated_at: new Date().toISOString() })
    .eq("id", a.submission_id).eq("status", "Completed").select("id"), "The form could not be updated with the amendment. Please retry.") as unknown[];
  if (!wrote?.length) throw new Error("The form changed elsewhere. Please reload.");
  const done = check(await d.from("form_amendments").update({
    status: AMENDMENT_STATUS.completed, approved_by: userId, approved_at: new Date().toISOString(), pdf_path: path,
  }).eq("id", a.id).eq("status", AMENDMENT_STATUS.awaitingApproval).select("id"), "The amendment could not be marked approved.") as unknown[];
  if (!done?.length) throw new Error("The amendment changed elsewhere. Please reload.");
  await audit(a.submission_id, userId, actorLabel, `Amendment ${a.amendment_number} approved`, `By ${actorLabel}`);

  await s.sendAmendmentCompletionEmail(a.submission_id, a.amendment_number, bytes, fileName);
  const { snapshotPdf, backgroundBackup } = await import("@/lib/drive-backups.server");
  backgroundBackup(() => snapshotPdf(a.submission_id, bytes, fileName));
  if (submission.form_type === "new_home_order") {
    await syncUsaFromNhoAmendment({ saleId: submission.sale_id, amendmentNumber: a.amendment_number, before: a.values_before, after: a.values_after, userId, actorLabel })
      .catch((e) => console.error("Unit Sale Agreement sync failed", { saleId: submission.sale_id, message: e instanceof Error ? e.message : "" }));
  }
  return { saleId: submission.sale_id, formType: submission.form_type, values: a.values_after };
}

/**
 * After an NHO amendment is approved: update an unsigned Unit Sale Agreement (fresh signing link if one
 * was sent) or open a USA amendment when it is already Completed. Never fails the NHO approval.
 */
export async function syncUsaFromNhoAmendment(input: { saleId: string; amendmentNumber: number; before: FormValues; after: FormValues; userId: string; actorLabel: string }) {
  const n = input.amendmentNumber;
  const d = db();
  const rows = (check(await d.from("form_submissions").select("id,status,is_draft,customer_signed_at,data")
    .eq("sale_id", input.saleId).eq("form_type", "unit_sale_agreement").limit(1), "The Unit Sale Agreement could not be loaded.") ?? []) as
    { id: string; status: string; is_draft: boolean; customer_signed_at: string | null; data: FormValues }[];
  const usa = rows[0] ?? null;
  const usaDef = getForm("unit_sale_agreement");
  const plan = planUsaUpdate(usaDef, usa ? { ...usa, data: withoutRetiredTopup("unit_sale_agreement", usa.data ?? {}) } : null, input.before, input.after);
  if (!usa || plan.action === "none") {
    if (usa && plan.action === "none" && plan.why === "awaiting-approval") {
      await audit(usa.id, input.userId, input.actorLabel, `Unit Sale Agreement not updated from New Home Order Amendment ${n}`,
        "The customer has already signed it and it is waiting for approval – review the figures before approving.");
    }
    return plan;
  }
  try {
    if (plan.action === "update") {
      const wrote = check(await d.from("form_submissions").update({ data: plan.values, updated_at: new Date().toISOString() })
        .eq("id", usa.id).eq("status", usa.status).select("id"), "The Unit Sale Agreement could not be updated.") as unknown[];
      if (!wrote?.length) throw new Error("The Unit Sale Agreement changed elsewhere.");
      await audit(usa.id, input.userId, input.actorLabel, `Unit Sale Agreement updated from New Home Order Amendment ${n}`);
      if (plan.resendSigningLink) {
        const { error } = await d.from("signing_tokens").update({ used_at: new Date().toISOString() })
          .eq("submission_id", usa.id).eq("kind", "customer_offsite").is("used_at", null);
        if (error) throw new Error("The old Unit Sale Agreement signing link could not be closed.");
        const s = await import("@/lib/ekos.server");
        await s.buildAndStorePdf(usa.id);
        await s.sendOffsiteCustomerEmail(usa.id);
        await audit(usa.id, input.userId, input.actorLabel, "Fresh signing link sent to customer", `Previous link cancelled after New Home Order Amendment ${n}`);
      }
    } else {
      const row = await startAmendment({
        submissionId: usa.id, userId: input.userId, actorLabel: input.actorLabel, values: plan.values,
        reason: `Updated from New Home Order Amendment ${n}`, isDirector: true, carriedOver: true,
      });
      await audit(usa.id, input.userId, input.actorLabel, `Unit Sale Agreement Amendment ${row.amendment_number} created from New Home Order Amendment ${n}`);
    }
  } catch (e) {
    console.error("Unit Sale Agreement sync failed", { saleId: input.saleId, n, message: e instanceof Error ? e.message : "" });
    await audit(usa.id, input.userId, input.actorLabel, `Unit Sale Agreement could not be updated from New Home Order Amendment ${n}`,
      e instanceof Error ? e.message : "Please update it manually.").catch(() => undefined);
  }
  return plan;
}
