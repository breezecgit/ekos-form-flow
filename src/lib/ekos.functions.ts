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
          .select("id, sale_id, form_type, status, is_draft, customer_signed_at, construction_signed_at, updated_at")
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
      .insert({ created_by: context.userId, order_number: "" })
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
    const prefill = await buildPrefill(sale, data.formType);
    const { data: submission, error } = await db
      .from("form_submissions")
      .insert({
        sale_id: sale.id,
        form_type: data.formType,
        order_number: sale.order_number,
        created_by: context.userId,
        status: "Draft",
        is_draft: true,
        data: prefill as never,
      })
      .select()
      .single();
    if (error || !submission) throw new Error(error?.message ?? "Could not start the form");
    return { submissionId: submission.id };
  });

/**
 * Prefill a new form from everything already captured on this sale's earlier
 * forms: park + park details, customer, sales person, home details. Signatures,
 * uploads, T&Cs ticks and statuses are never carried over.
 */
async function buildPrefill(
  sale: { id: string; park_name: string; customer_name: string; customer_email: string; customer_phone: string; sales_person: string },
  formType: string,
): Promise<Record<string, unknown>> {
  const db = await admin();
  const { getForm } = await import("@/lib/forms/registry");
  const def = getForm(formType);
  const { data: earlier } = await db
    .from("form_submissions")
    .select("form_type, data, created_at")
    .eq("sale_id", sale.id)
    .order("created_at", { ascending: true });
  const merged: Record<string, unknown> = {};
  for (const row of earlier ?? []) Object.assign(merged, (row.data ?? {}) as Record<string, unknown>);
  const reservation = (earlier ?? []).find((r) => r.form_type === "reservation");
  const resData = (reservation?.data ?? {}) as Record<string, unknown>;
  if (resData["total_cost"] !== undefined && merged["cost_new_home"] === undefined) merged["cost_new_home"] = resData["total_cost"];

  const out: Record<string, unknown> = {};
  for (const f of def.steps.flatMap((s) => s.fields)) {
    if (["signature", "checkbox", "static", "links"].includes(f.type)) continue;
    if (f.group || f.key === "status" || f.key.startsWith("rep_")) continue;
    const v = merged[f.key];
    if (v === undefined || v === null || v === "") continue;
    if (f.type === "select" && !(f.options ?? []).some((o) => o.value === v)) continue;
    if (f.type === "multiselect") {
      const allowed = new Set((f.options ?? []).map((o) => o.value));
      const list = Array.isArray(v) ? (v as string[]).filter((x) => allowed.has(x)) : [];
      if (list.length) out[f.key] = list;
      continue;
    }
    out[f.key] = v;
  }
  if (sale.park_name) out["park_name"] = sale.park_name;
  for (const k of ["customer_name", "customer_email", "customer_phone", "sales_person"] as const) {
    if (!out[k] && sale[k]) out[k] = sale[k];
  }
  if (formType === "written_statement") {
    if (sale.park_name) out["park_name_confirm"] = sale.park_name;
    if (!out["party_customer_name"] && out["customer_name"]) out["party_customer_name"] = out["customer_name"];
  }
  return out;
}

/** Later forms never change the park chosen on the Reservation Form. */
async function lockPark(submission: { form_type: string; sale_id: string }, values: Record<string, unknown>) {
  if (submission.form_type === "reservation") return values;
  const db = await admin();
  const { data: sale } = await db.from("sales").select("park_name").eq("id", submission.sale_id).maybeSingle();
  if (!sale?.park_name) return values;
  const out: Record<string, unknown> = { ...values, park_name: sale.park_name };
  if (submission.form_type === "written_statement") out["park_name_confirm"] = sale.park_name;
  return out;
}

export const uploadFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        submissionId: z.string().uuid(),
        fieldKey: z.string().min(1).max(100),
        fileName: z.string().min(1).max(200),
        mimeType: z.string().max(100),
        base64: z.string().max(22_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(data.submissionId, context.userId);
    const allowed = ["image/png", "image/jpeg", "application/pdf"];
    const mime = data.mimeType === "image/jpg" ? "image/jpeg" : data.mimeType;
    if (!allowed.includes(mime)) throw new Error("Please upload a JPG, PNG or PDF file.");
    const db = await admin();
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const id = crypto.randomUUID();
    const safe = data.fileName.replace(/[^\w.\- ]+/g, "_");
    const path = `submissions/${data.submissionId}/files/${id}-${safe}`;
    const { error } = await db.storage.from("ekos-documents").upload(path, bytes, { contentType: mime });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    await db.from("submission_files").insert({
      id,
      submission_id: data.submissionId,
      field_key: data.fieldKey,
      file_name: data.fileName,
      mime_type: mime,
      storage_path: path,
    });
    return { id, name: data.fileName, path, mime };
  });

export const getSubmission = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    const submission = await assertAccess(data.submissionId, context.userId);
    const db = await admin();
    const { data: linkRow } = await db.from("app_settings").select("value").eq("key", "links").maybeSingle();
    const welcomePackUrl =
      String(((linkRow?.value ?? {}) as Record<string, unknown>)["welcome_pack_url"] ?? "") ||
      "https://ekosgroup.co.uk/ekos-welcome-pack";
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
    const { data: tokens } = await db
      .from("signing_tokens")
      .select("token, kind")
      .eq("submission_id", submission.id)
      .is("used_at", null);
    const token = (tokens ?? []).find((t) => t.kind === "customer_offsite");
    const cToken = (tokens ?? []).find((t) => t.kind === "construction");
    const dToken = (tokens ?? []).find((t) => t.kind === "director");
    const { templatesForSubmission } = await import("@/lib/statement.server");
    const statement = await templatesForSubmission(
      submission.form_type,
      (submission.data ?? {}) as Record<string, unknown>,
    );
    return {
      statement: statement ?? null,
      directorLink: dToken?.token ? `${s.appOrigin()}/sign/${dToken.token}` : "",
      submission,
      sale,
      parks: parks ?? [],
      isDirector: director,
      audit: audit ?? [],
      welcomePackUrl,
      pdfUrl,
      offsiteLink: token?.token ? `${s.appOrigin()}/sign/${token.token}` : "",
      constructionLink: cToken?.token ? `${s.appOrigin()}/sign/${cToken.token}` : "",
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
    data.values = await lockPark(submission, data.values);
    await db
      .from("form_submissions")
      .update({
        data: data.values as never,
        is_draft: true,
        status: submission.status === "Disapproved" ? "Disapproved" : "Draft",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.submissionId);
    await syncSale(submission.sale_id, data.values, submission.form_type);
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

async function syncSale(saleId: string, values: Record<string, unknown>, formType: string) {
  const db = await admin();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (formType === "reservation" && values["park_name"]) patch['park_name'] = String(values["park_name"]);
  if (values["customer_name"]) patch['customer_name'] = String(values["customer_name"]);
  if (values["customer_email"]) patch['customer_email'] = String(values["customer_email"]);
  if (values["customer_phone"]) patch['customer_phone'] = String(values["customer_phone"]);
  if (values["sales_person"]) patch['sales_person'] = String(values["sales_person"]);
  if (values["deposit_date"]) patch['deposit_date'] = String(values["deposit_date"]);
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
    const s0 = await server();
    const isWS = s0.needsDirectorWitness(submission.form_type);
    if (isWS && requested === "Completed") {
      throw new Error("The Written Statement is completed when the Director and witness sign.");
    }
    const status = requested;
    data.values = await lockPark(submission, data.values);
    if (isWS) {
      const { getStatementTemplate } = await import("@/lib/statement.server");
      data.values["statement_version"] = (await getStatementTemplate()).version;
    }
    const signedOnSite = isWS && status === "In Review";
    await db
      .from("form_submissions")
      .update({
        data: data.values as never,
        status,
        is_draft: false,
        disapproval_note: null,
        ...(signedOnSite ? { customer_signed_at: new Date().toISOString() } : {}),
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.submissionId);
    await syncSale(submission.sale_id, data.values, submission.form_type);

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
    } else if (isWS) {
      await s.sendDirectorWitnessEmail(data.submissionId);
    } else if (s.needsConstruction(submission.form_type) && !submission.construction_signed_at) {
      await s.sendConstructionEmail(data.submissionId);
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
    if (data.status === "Completed" && s.needsDirectorWitness(submission.form_type)) {
      throw new Error(
        "The Written Statement is completed automatically when you and your witness sign on the Director & Witness signing page.",
      );
    }

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
        kind: z.enum(["review", "offsite", "completion", "construction", "director"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(data.submissionId, context.userId);
    const s = await server();
    if (data.kind === "review") await s.sendReviewRequiredEmail(data.submissionId);
    if (data.kind === "offsite") await s.sendOffsiteCustomerEmail(data.submissionId);
    if (data.kind === "construction") await s.sendConstructionEmail(data.submissionId);
    if (data.kind === "director") await s.sendDirectorWitnessEmail(data.submissionId);
    if (data.kind === "completion") {
      const sub = await assertAccess(data.submissionId, context.userId);
      const built = await s.buildAndStorePdf(data.submissionId, {
        includeDirectorSignature: !s.needsDirectorWitness(sub.form_type),
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
