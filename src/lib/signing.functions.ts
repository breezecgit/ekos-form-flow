import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public (tokenised) off-site customer signing. No login — the secure token in
 * the link is the only credential, so every read is narrowed to that token.
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
    const { submission } = await loadByToken(data.token);
    const { signedPdfUrl } = await import("@/lib/ekos.server");
    const values = (submission.data ?? {}) as Record<string, unknown>;
    return {
      formType: submission.form_type,
      orderNumber: submission.order_number,
      customerName: String(values["customer_name"] ?? ""),
      customerEmail: String(values["customer_email"] ?? ""),
      parkName: String(values["park_name"] ?? ""),
      pdfUrl: submission.pdf_path ? await signedPdfUrl(submission.pdf_path) : "",
    };
  });

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

    const merged = {
      ...((submission.data ?? {}) as Record<string, unknown>),
      ...data.values,
    };

    await db
      .from("form_submissions")
      .update({
        data: merged as never,
        customer_signed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", submission.id);

    await db
      .from("signing_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("token", row.token);

    await s.buildAndStorePdf(submission.id);
    await s.addAudit({
      submissionId: submission.id,
      actorLabel: String(merged["customer_one_name"] ?? "Customer"),
      action: "Customer signed off site",
    });
    await s.sendReviewRequiredEmail(submission.id);

    return { ok: true };
  });
