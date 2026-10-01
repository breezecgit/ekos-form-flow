import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public (tokenised) signing pages: customer off-site signing and the
 * Construction team sign-off. No login – the secure token in the link is the
 * only credential, so every read is narrowed to that token.
 */

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

class TokenError extends Error {}

async function loadByToken(token: string) {
  const db = await admin();
  const { data: row } = await db
    .from("signing_tokens")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (!row) throw new TokenError("This signing link is not valid.");
  if (row.used_at) throw new TokenError("This form has already been signed.");
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new TokenError("This signing link has expired. Please contact EKOS Group.");
  }
  const { data: submission } = await db
    .from("form_submissions")
    .select("*")
    .eq("id", row.submission_id)
    .maybeSingle();
  if (!submission) throw new TokenError("This signing link is not valid.");
  if (submission.form_type === "identification") throw new TokenError("This signing link is not valid.");
  if (submission.status === "Completed") throw new TokenError("This form has already been completed.");
  return { row, submission };
}

export const getSigningContext = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: z.string().min(10) }).parse(d))
  .handler(async ({ data }) => {
    let loaded;
    try {
      loaded = await loadByToken(data.token);
    } catch (e) {
      if (e instanceof TokenError) return { error: e.message };
      throw e;
    }
    const { row, submission } = loaded;
    const { signedPdfUrl, getPark, parkLinksFrom } = await import("@/lib/ekos.server");
    const values = (submission.data ?? {}) as Record<string, unknown>;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: linkRow } = await supabaseAdmin.from("app_settings").select("value").eq("key", "links").maybeSingle();
    const parkLinks = parkLinksFrom(await getPark(String(values["park_name"] ?? "")), {
      links: (linkRow?.value ?? {}) as Record<string, unknown>,
    });
    return {
      parkLinks,
      kind: kindOf(row.kind),
      formType: submission.form_type,
      orderNumber: submission.order_number,
      customerName: String(values["customer_name"] ?? ""),
      customerEmail: String(values["customer_email"] ?? ""),
      parkName: String(values["park_name"] ?? ""),
      secondCustomer: String(values["second_customer"] ?? ""),
      customerSigned: Boolean(submission.customer_signed_at),
      pdfUrl: submission.pdf_path ? await signedPdfUrl(submission.pdf_path) : "",
    };
  });

type Kind = "customer" | "construction" | "director";
const GROUP = {
  customer: "customerSignature",
  construction: "constructionSignature",
  director: "directorSignature",
} as const;
const MODE = { customer: "offsite", construction: "construction", director: "director" } as const;

function kindOf(raw: string): Kind {
  return raw === "construction" ? "construction" : raw === "director" ? "director" : "customer";
}

function isEmpty(type: string, v: unknown) {
  if (type === "checkbox") return v !== true;
  return v === undefined || v === null || String(v).trim() === "";
}

export const submitCustomerSignature = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({ token: z.string().min(10), values: z.record(z.string(), z.unknown()) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    let loaded;
    try {
      loaded = await loadByToken(data.token);
    } catch (e) {
      if (e instanceof TokenError) return { ok: false, error: e.message };
      throw e;
    }
    const { row, submission } = loaded;
    const kind = kindOf(row.kind);
    const db = await admin();
    const s = await import("@/lib/ekos.server");
    const { getForm } = await import("@/lib/forms/registry");
    const { allFields, isRequired, isVisible } = await import("@/lib/forms/types");
    const def = getForm(submission.form_type);
    const now = new Date().toISOString();
    const existing = (submission.data ?? {}) as Record<string, unknown>;

    // Only this page's own fields may be written, and every visible one is mandatory.
    const fields = allFields(def).filter((f) => f.group === GROUP[kind]);
    const v: Record<string, unknown> = {};
    for (const f of fields) if (data.values[f.key] !== undefined) v[f.key] = data.values[f.key];
    const merged = { ...existing, ...v };
    const ctx = { mode: MODE[kind], isDirector: false };
    const missing = fields.filter(
      (f) => isRequired(f) && isVisible(f, merged, ctx) && isEmpty(f.type, merged[f.key]),
    );
    if (missing.length) {
      throw new Error(
        `Please complete every box before submitting (missing: ${missing.map((f) => f.label ?? f.key).join(", ")}).`,
      );
    }

    if (kind === "construction") {
      await db
        .from("form_submissions")
        .update({ data: merged as never, construction_signed_at: now, updated_at: now })
        .eq("id", submission.id);
      await db.from("signing_tokens").update({ used_at: now }).eq("token", row.token);
      await s.publishInReview(submission.id, (await s.buildAndStorePdf(submission.id)).bytes);
      await s.addAudit({
        submissionId: submission.id,
        actorLabel: `${String(v["construction_name"])} (Construction team)`,
        action: "Construction team signed",
      });
      await s.sendReviewRequiredEmail(submission.id);
      return { ok: true };
    }

    if (kind === "director") {
      if (!submission.customer_signed_at) {
        throw new Error("The customer must sign before the Director and witness.");
      }
      await db
        .from("form_submissions")
        .update({ data: merged as never, status: "Completed", is_draft: false, updated_at: now })
        .eq("id", submission.id);
      await db.from("signing_tokens").update({ used_at: now }).eq("token", row.token);
      await s.addAudit({
        submissionId: submission.id,
        actorLabel: `${String(v["director_name"])} (Director) with witness ${String(v["witness_name"])}`,
        action: "Director and witness signed – Completed",
        fromStatus: submission.status,
        toStatus: "Completed",
      });
      await s.runCompletion(submission.id, { storedSignature: false });
      return { ok: true };
    }

    await db
      .from("form_submissions")
      .update({ data: merged as never, customer_signed_at: now, updated_at: now })
      .eq("id", submission.id);
    await db.from("signing_tokens").update({ used_at: now }).eq("token", row.token);
    await s.publishInReview(submission.id, (await s.buildAndStorePdf(submission.id)).bytes);
    await s.addAudit({
      submissionId: submission.id,
      actorLabel: String(v["customer_one_name"] ?? v["occupier_one_name"] ?? "Customer"),
      action: "Customer signed off site",
    });
    await s.sendSignatureCompleteEmail(submission.id);
    if (s.needsDirectorWitness(submission.form_type)) {
      await s.sendDirectorWitnessEmail(submission.id);
    } else if (s.needsConstruction(submission.form_type) && !submission.construction_signed_at) {
      await s.sendConstructionEmail(submission.id);
    } else {
      await s.sendReviewRequiredEmail(submission.id);
    }
    return { ok: true };
  });
