import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { amendmentPermissions } from "@/lib/forms/amendments";

async function requireDirector(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "director").maybeSingle();
  if (!data) throw new Error("Director access is required.");
}

async function actor(userId: string, claims: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("profiles").select("full_name, email").eq("id", userId).maybeSingle();
  return data?.full_name || data?.email || String(claims["email"] ?? "");
}

async function isDirector(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "director").maybeSingle();
  return Boolean(data);
}

/** Same access pattern as other form actions: the form's rep or the Director. */
async function amendAccess(submissionId: string, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("form_submissions").select("created_by").eq("id", submissionId).maybeSingle();
  if (!data) throw new Error("Submission not found");
  const director = await isDirector(userId);
  const perms = amendmentPermissions({ isDirector: director, userId, submissionOwner: data.created_by });
  if (!perms.canStart) throw new Error("You do not have access to this submission");
  return { director, owner: data.created_by as string | null };
}

async function manageAccess(amendmentId: string, userId: string) {
  const s = await import("@/lib/amendments.server");
  const a = await s.getAmendmentOwner(amendmentId);
  const { director, owner } = await amendAccess(a.submission_id, userId);
  if (!amendmentPermissions({ isDirector: director, userId, submissionOwner: owner, amendmentOwner: a.created_by }).canManage) {
    throw new Error("Only the person who started this amendment or the Director can do that.");
  }
}

const amendmentId = z.object({ amendmentId: z.string().uuid() });

export const listFormAmendments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ submissionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { director, owner } = await amendAccess(data.submissionId, context.userId);
    const s = await import("@/lib/amendments.server");
    const { signedPdfUrl } = await import("@/lib/ekos.server");
    try {
      const rows = await s.listAmendments(data.submissionId);
      return {
        available: true,
        canStart: true,
        canApprove: director,
        amendments: await Promise.all(rows.map(async (a) => ({
          id: a.id,
          number: a.amendment_number,
          reason: a.reason,
          status: a.status,
          createdAt: a.created_at,
          changes: a.changes,
          customerSignedAt: a.customer_signed_at,
          approvedAt: a.approved_at,
          canManage: amendmentPermissions({ isDirector: director, userId: context.userId, submissionOwner: owner, amendmentOwner: a.created_by }).canManage,
          pdfUrl: a.pdf_path ? await signedPdfUrl(a.pdf_path, 60 * 60) : "",
        }))),
      };
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Amendments are not switched on")) return { available: false, canStart: false, canApprove: false, amendments: [] };
      throw e;
    }
  });

export const startFormAmendment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    submissionId: z.string().uuid(),
    reason: z.string().max(2000),
    values: z.record(z.string(), z.unknown()),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { director } = await amendAccess(data.submissionId, context.userId);
    const s = await import("@/lib/amendments.server");
    const row = await s.startAmendment({ ...data, userId: context.userId, actorLabel: await actor(context.userId, context.claims), isDirector: director });
    return { number: row.amendment_number, status: row.status };
  });

export const cancelFormAmendment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => amendmentId.extend({ note: z.string().max(1000).default("") }).parse(d))
  .handler(async ({ data, context }) => {
    await manageAccess(data.amendmentId, context.userId);
    const s = await import("@/lib/amendments.server");
    await s.cancelAmendment(data.amendmentId, context.userId, await actor(context.userId, context.claims), data.note);
    return { ok: true };
  });

export const resendFormAmendmentEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => amendmentId.parse(d))
  .handler(async ({ data, context }) => {
    await manageAccess(data.amendmentId, context.userId);
    const s = await import("@/lib/amendments.server");
    await s.resendAmendmentEmail(data.amendmentId, context.userId, await actor(context.userId, context.claims));
    return { ok: true };
  });

export const approveFormAmendment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => amendmentId.parse(d))
  .handler(async ({ data, context }) => {
    await requireDirector(context.userId);
    const s = await import("@/lib/amendments.server");
    const res = await s.approveAmendment(data.amendmentId, context.userId, await actor(context.userId, context.claims));
    const { syncSale } = await import("@/lib/ekos.functions");
    await syncSale(res.saleId, res.values, res.formType);
    return { ok: true };
  });

/** Public: the secure link is the only credential and exposes only the amendment. */
export const getAmendmentSigning = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: z.string().min(10).max(128) }).parse(d))
  .handler(async ({ data }) => {
    const s = await import("@/lib/amendments.server");
    return await s.publicAmendmentContext(data.token);
  });

export const signFormAmendment = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    token: z.string().min(10).max(128),
    signature: z.string().max(1_500_000),
    name: z.string().max(200),
  }).parse(d))
  .handler(async ({ data }) => {
    const s = await import("@/lib/amendments.server");
    await s.signAmendment(data.token, data.signature, data.name);
    return { ok: true };
  });
