import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const idInput = z.object({ submissionId: z.string().uuid() });

async function server() {
  return await import("@/lib/ekos.server");
}
async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function isDirector(userId: string): Promise<boolean> {
  const db = await admin();
  const { data } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "director")
    .maybeSingle();
  return Boolean(data);
}

async function assertAccess(submissionId: string, userId: string) {
  const db = await admin();
  const { data } = await db
    .from("form_submissions")
    .select("*")
    .eq("id", submissionId)
    .maybeSingle();
  if (!data) throw new Error("Submission not found");
  if (data.created_by !== userId && !(await isDirector(userId))) {
    throw new Error("You do not have access to this submission");
  }
  return data;
}

/** Who am I + my role + reference data the forms need. */
export const getBootstrap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const [{ data: profile }, director, { data: parks }, { data: people }] = await Promise.all([
      db.from("profiles").select("*").eq("id", context.userId).maybeSingle(),
      isDirector(context.userId),
      db.from("parks").select("*").order("sort_order"),
      db.from("sales_people").select("*").order("sort_order"),
    ]);
    return {
      userId: context.userId,
      email: profile?.email ?? "",
      fullName: profile?.full_name ?? "",
      isDirector: director,
      parks: parks ?? [],
      salesPeople: people ?? [],
    };
  });

/** Rep dashboard: my sales with a status chip per form. */
export const listSales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const director = await isDirector(context.userId);
    let salesQuery = db.from("sales").select("*").order("created_at", { ascending: false });
    if (!director) salesQuery = salesQuery.eq("created_by", context.userId);
    const { data: sales } = await salesQuery;
    const ids = (sales ?? []).map((s) => s.id);
    const { data: subs } = ids.length
      ? await db
          .from("form_submissions")
          .select("id, sale_id, form_type, status, is_draft, customer_signed_at, updated_at")
          .in("sale_id", ids)
      : { data: [] as never[] };
    return { sales: sales ?? [], submissions: subs ?? [], isDirector: director };
  });

/** Starts a new sale and its Customer Reservation Form draft. */
export const createSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data: sale, error } = await db
      .from("sales")
      .insert({ created_by: context.userId })
      .select()
      .single();
    if (error || !sale) throw new Error(error?.message ?? "Could not create the sale");
    const { data: submission, error: subError } = await db
      .from("form_submissions")
      .insert({
        sale_id: sale.id,
        form_type: "reservation",
        order_number: sale.order_number,
        created_by: context.userId,
        status: "Draft",
        is_draft: true,
        data: {},
      })
      .select()
      .single();
    if (subError || !submission) throw new Error(subError?.message ?? "Could not create the form");
    return { saleId: sale.id, submissionId: submission.id, orderNumber: sale.order_number };
  });

/** Starts the next form for an existing sale, prefilling park + customer. */
export const startNextForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ saleId: z.string().uuid(), formType: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: sale } = await db.from("sales").select("*").eq("id", data.saleId).maybeSingle();
    if (!sale) throw new Error("Sale not found");
    const { data: existing } = await db
      .from("form_submissions")
      .select("id")
      .eq("sale_id", data.saleId)
      .eq("form_type", data.formType)
      .maybeSingle();
    if (existing) return { submissionId: existing.id };
    const { data: submission, error } = await db
      .from("form_submissions")
      .insert({
        sale_id: sale.id,
        form_type: data.formType,
        order_number: sale.order_number,
        created_by: context.userId,
        status: "Draft",
        is_draft: true,
        data: {
          park_name: sale.park_name,
          customer_name: sale.customer_name,
          customer_email: sale.customer_email,
          customer_phone: sale.customer_phone,
          sales_person: sale.sales_person,
        },
      })
      .select()
      .single();
    if (error || !submission) throw new Error(error?.message ?? "Could not start the form");
    return { submissionId: submission.id };
  });

export const getSubmission = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    const submission = await assertAccess(data.submissionId, context.userId);
    const db = await admin();
    const [{ data: sale }, { data: parks }, director] = await Promise.all([
      db.from("sales").select("*").eq("id", submission.sale_id).maybeSingle(),
      db.from("parks").select("*").order("sort_order"),
      isDirector(context.userId),
    ]);
    const { data: audit } = await db
      .from("audit_log")
      .select("*")
      .eq("submission_id", submission.id)
      .order("created_at", { ascending: false });
    const s = await server();
    const pdfUrl = submission.pdf_path ? await s.signedPdfUrl(submission.pdf_path) : "";
    const { data: token } = await db
      .from("signing_tokens")
      .select("token")
      .eq("submission_id", submission.id)
      .is("used_at", null)
      .maybeSingle();
    return {
      submission,
      sale,
      parks: parks ?? [],
      isDirector: director,
      audit: audit ?? [],
      pdfUrl,
      offsiteLink: token?.token ? `${s.appOrigin()}/sign/${token.token}` : "",
    };
  });

export const saveDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        submissionId: z.string().uuid(),
        values: z.record(z.string(), z.unknown()),
        emailLink: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const submission = await assertAccess(data.submissionId, context.userId);
    const db = await admin();
    await db
      .from("form_submissions")
      .update({
        data: data.values as never,
        is_draft: true,
        status: submission.status === "Disapproved" ? "Disapproved" : "Draft",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.submissionId);
    await syncSale(submission.sale_id, data.values);
    const s = await server();
    await s.addAudit({
      submissionId: data.submissionId,
      actorId: context.userId,
      actorLabel: String(context.claims["email"] ?? ""),
      action: "Draft saved",
    });
    const origin = s.appOrigin();
    const resumeLink = `${origin}/forms/${submission.form_type}/${data.submissionId}`;
    if (data.emailLink !== false) {
      const { data: profile } = await db
        .from("profiles")
        .select("email")
        .eq("id", context.userId)
        .maybeSingle();
      if (profile?.email) await s.sendResumeLinkEmail(data.submissionId, profile.email);
    }
    return { resumeLink };
  });

async function syncSale(saleId: string, values: Record<string, unknown>) {
  const db = await admin();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (values["park_name"]) patch.park_name = String(values["park_name"]);
  if (values["customer_name"]) patch.customer_name = String(values["customer_name"]);
  if (values["customer_email"]) patch.customer_email = String(values["customer_email"]);
  if (values["customer_phone"]) patch.customer_phone = String(values["customer_phone"]);
  if (values["sales_person"]) patch.sales_person = String(values["sales_person"]);
  if (values["deposit_date"]) patch.deposit_date = String(values["deposit_date"]);
  await db.from("sales").update(patch as never).eq("id", saleId);
}

export const submitForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ submissionId: z.string().uuid(), values: z.record(z.string(), z.unknown()) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const submission = await assertAccess(data.submissionId, context.userId);
    const db = await admin();
    const director = await isDirector(context.userId);
    const requested = String(data.values["status"] ?? "In Review");
    if (requested === "Completed" && !director) {
      throw new Error("Only the Director can mark a form as Completed.");
    }
    const status = requested;
    await db
      .from("form_submissions")
      .update({
        data: data.values as never,
        status,
        is_draft: false,
        disapproval_note: null,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.submissionId);
    await syncSale(submission.sale_id, data.values);

    const s = await server();
    await s.buildAndStorePdf(data.submissionId);
    await s.addAudit({
      submissionId: data.submissionId,
      actorId: context.userId,
      actorLabel: String(context.claims["email"] ?? ""),
      action: "Form submitted",
      fromStatus: submission.status,
      toStatus: status,
    });

    if (status === "In Review (Offsite)") {
      await s.sendOffsiteCustomerEmail(data.submissionId);
    } else {
      await s.sendReviewRequiredEmail(data.submissionId);
    }
    return { status };
  });

export const setStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        submissionId: z.string().uuid(),
        status: z.enum(["Completed", "Disapproved", "In Review", "In Review (Offsite)"]),
        note: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isDirector(context.userId))) throw new Error("Director access is required.");
    const db = await admin();
    const { data: submission } = await db
      .from("form_submissions")
      .select("*")
      .eq("id", data.submissionId)
      .maybeSingle();
    if (!submission) throw new Error("Submission not found");
    const s = await server();

    await db
      .from("form_submissions")
      .update({
        status: data.status,
        is_draft: data.status === "Disapproved",
        disapproval_note: data.status === "Disapproved" ? (data.note ?? "") : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.submissionId);

    await s.addAudit({
      submissionId: data.submissionId,
      actorId: context.userId,
      actorLabel: String(context.claims["email"] ?? ""),
      action: `Status changed to ${data.status}`,
      fromStatus: submission.status,
      toStatus: data.status,
      note: data.note ?? null,
    });

    if (data.status === "Completed") {
      const result = await s.runCompletion(data.submissionId);
      return { ok: true, driveId: result.driveId };
    }
    if (data.status === "Disapproved") {
      await s.sendDisapprovalEmail(data.submissionId, data.note ?? "");
    }
    return { ok: true, driveId: null };
  });

export const resendEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        submissionId: z.string().uuid(),
        kind: z.enum(["review", "offsite", "completion"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(data.submissionId, context.userId);
    const s = await server();
    if (data.kind === "review") await s.sendReviewRequiredEmail(data.submissionId);
    if (data.kind === "offsite") await s.sendOffsiteCustomerEmail(data.submissionId);
    if (data.kind === "completion") {
      const built = await s.buildAndStorePdf(data.submissionId, {
        includeDirectorSignature: true,
      });
      await s.sendCompletionEmails(data.submissionId, built.bytes, built.fileName);
    }
    return { ok: true };
  });

export const listEmailLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isDirector(context.userId))) throw new Error("Director access is required.");
    const db = await admin();
    const { data } = await db
      .from("email_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });
