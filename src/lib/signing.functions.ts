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

async function loadByToken(token: string) {
  const db = await admin();
  const { data: row } = await db
    .from("signing_tokens")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (!row) throw new Error("This signing link is not valid.");
  if (row.used_at) throw new Error("This form has already been signed.");
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error("This signing link has expired. Please contact EKOS Group.");
  }
  const { data: submission } = await db
    .from("form_submissions")
    .select("*")
    .eq("id", row.submission_id)
    .maybeSingle();
  if (!submission) throw new Error("This signing link is not valid.");
  return { row, submission };
}

export const getSigningContext = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: z.string().min(10) }).parse(d))
  .handler(async ({ data }) => {
    const { row, submission } = await loadByToken(data.token);
    const { signedPdfUrl } = await import("@/lib/ekos.server");
    const values = (submission.data ?? {}) as Record<string, unknown>;
    return {
      kind: row.kind === "construction" ? ("construction" as const) : ("customer" as const),
      formType: submission.form_type,
      orderNumber: submission.order_number,
      customerName: String(values["customer_name"] ?? ""),
      customerEmail: String(values["customer_email"] ?? ""),
      parkName: String(values["park_name"] ?? ""),
      secondCustomer: String(values["second_customer"] ?? ""),
      pdfUrl: submission.pdf_path ? await signedPdfUrl(submission.pdf_path) : "",
    };
  });

const CUSTOMER_KEYS = [
  "customer_one_name",
  "customer_one_signature",
  "customer_one_date",
  "second_customer",
  "customer_two_name",
  "customer_two_signature",
  "customer_two_date",
  "accept_terms",
  "accept_extras",
];
const CONSTRUCTION_KEYS = ["construction_name", "construction_signature", "construction_date"];

function pick(values: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (values[k] !== undefined) out[k] = values[k];
  return out;
}

export const submitCustomerSignature = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({ token: z.string().min(10), values: z.record(z.string(), z.unknown()) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { row, submission } = await loadByToken(data.token);
    const db = await admin();
    const s = await import("@/lib/ekos.server");
    const now = new Date().toISOString();
    const existing = (submission.data ?? {}) as Record<string, unknown>;

    if (row.kind === "construction") {
      const v = pick(data.values, CONSTRUCTION_KEYS);
      if (!v["construction_name"] || !v["construction_signature"] || !v["construction_date"]) {
        throw new Error("Name, signature and date are all required.");
      }
      await db
        .from("form_submissions")
        .update({ data: { ...existing, ...v } as never, construction_signed_at: now, updated_at: now })
        .eq("id", submission.id);
      await db.from("signing_tokens").update({ used_at: now }).eq("token", row.token);
      await s.buildAndStorePdf(submission.id);
      await s.addAudit({
        submissionId: submission.id,
        actorLabel: `${String(v["construction_name"])} (Construction team)`,
        action: "Construction team signed",
      });
      await s.sendReviewRequiredEmail(submission.id);
      return { ok: true };
    }

    const v = pick(data.values, CUSTOMER_KEYS);
    if (!v["customer_one_signature"] || v["accept_terms"] !== true || v["accept_extras"] !== true) {
      throw new Error("Please sign and tick both boxes before submitting.");
    }
    await db
      .from("form_submissions")
      .update({ data: { ...existing, ...v } as never, customer_signed_at: now, updated_at: now })
      .eq("id", submission.id);
    await db.from("signing_tokens").update({ used_at: now }).eq("token", row.token);
    await s.buildAndStorePdf(submission.id);
    await s.addAudit({
      submissionId: submission.id,
      actorLabel: String(v["customer_one_name"] ?? "Customer"),
      action: "Customer signed off site",
    });
    if (s.needsConstruction(submission.form_type) && !submission.construction_signed_at) {
      await s.sendConstructionEmail(submission.id);
    } else {
      await s.sendReviewRequiredEmail(submission.id);
    }
    return { ok: true };
  });
