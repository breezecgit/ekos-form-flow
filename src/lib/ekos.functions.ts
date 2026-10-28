import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCustomerEmail, assertEditable, canResend, parseSubmitStatus } from "@/lib/security-rules";
import { validateFormWrite } from "@/lib/forms/write-validation";
import { getForm } from "@/lib/forms/registry";
import { validateUpload } from "@/lib/forms/upload-validation";
import { withoutRetiredAnswers } from "@/lib/forms/retired-answers";
import { prepareHomeCost, prepareHomeCostDraft, hasHomeCost } from "@/lib/forms/home-cost";

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
    const [{ data: profile }, director, { data: parks }, { data: people }, { data: tm }] = await Promise.all([
      db.from("profiles").select("*").eq("id", context.userId).maybeSingle(),
      isDirector(context.userId),
      db.from("parks").select("*").order("sort_order"),
      db.from("sales_people").select("*").order("sort_order"),
      db.from("app_settings").select("value").eq("key", "email_test_mode").maybeSingle(),
    ]);
    const tmv = (tm?.value ?? {}) as Record<string, unknown>;
    return {
      userId: context.userId,
      email: profile?.email ?? "",
      fullName: profile?.full_name ?? "",
      isDirector: director,
      parks: parks ?? [],
      salesPeople: people ?? [],
      emailTestMode: {
        enabled: String(tmv["enabled"] ?? "true") !== "false",
        // Test recipient addresses are internal: only the Director sees them.
        recipient: director
          ? String(tmv["recipient"] ?? "") || "emma.frew@breezeconnection.co.uk, eilidh@breezeconnection.co.uk"
          : "the test inbox",
      },
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
          .select("id, sale_id, form_type, status, is_draft, customer_signed_at, construction_signed_at, updated_at, created_at, submitted_at, total_cost:data->>total_cost")
          .in("sale_id", ids)
      : { data: [] as never[] };
    // Open amendments are display-only: flag the form, never move the sale.
    const subIds = (subs ?? []).map((s) => s.id);
    const openIds = new Set<string>();
    if (subIds.length) {
      const { data: open } = await db
        .from("form_amendments")
        .select("submission_id")
        .in("submission_id", subIds)
        .in("status", ["Awaiting customer signature", "Awaiting approval"]); // keep in sync with OPEN_AMENDMENT_STATUSES
      for (const a of open ?? []) openIds.add(a.submission_id);
    }
    const submissions = (subs ?? []).map((s) => ({ ...s, amendment_open: openIds.has(s.id) }));
    return { sales: sales ?? [], submissions, isDirector: director };
  });

/** Starts a new sale with a draft of the chosen first form (Reservation by default). */
export const createSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ formType: z.enum(["reservation", "identification", "new_home_order", "unit_sale_agreement", "written_statement"]).default("reservation") })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
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
        form_type: data.formType,
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
    if (sale.created_by !== context.userId && !(await isDirector(context.userId))) throw new Error("Sale not found");
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
  excludeSubmissionId?: string,
): Promise<Record<string, unknown>> {
  const db = await admin();
  const { getForm } = await import("@/lib/forms/registry");
  const def = getForm(formType);
  const { data: earlier } = await db
    .from("form_submissions")
    .select("id, form_type, data, created_at, is_draft")
    .eq("sale_id", sale.id)
    .order("created_at", { ascending: true });
  const others = (earlier ?? []).filter((r) => r.form_type !== formType && (r as { id?: string }).id !== excludeSubmissionId);
  const merged: Record<string, unknown> = {};
  const isBlank = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
  // Reservation Form answers win; other earlier forms only fill gaps.
  const reservation = others.find((r) => r.form_type === "reservation");
  // Submitted forms win over drafts; the Reservation Form wins over everything.
  const rest = others.filter((r) => r !== reservation) as Array<(typeof others)[number] & { is_draft?: boolean }>;
  const ordered = [...rest.filter((r) => r.is_draft), ...rest.filter((r) => !r.is_draft)];
  for (const row of [...ordered, ...(reservation ? [reservation] : [])]) {
    for (const [k, v] of Object.entries((row.data ?? {}) as Record<string, unknown>)) if (!isBlank(v)) merged[k] = v;
  }

  const out: Record<string, unknown> = {};
  for (const f of def.steps.flatMap((s) => s.fields)) {
    if (["signature", "checkbox", "static", "links"].includes(f.type)) continue;
    if (f.group || f.key === "status" || f.key.startsWith("rep_")) continue;
    if (f.compute) continue; // auto-calculated boxes recalculate on load from the filled values
    const v = merged[f.key];
    if (v === undefined || v === null || v === "") continue;
    if ((f.type === "select" || f.type === "radio") && !(f.options ?? []).some((o) => o.value === v)) continue;
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
  // Second customer name carries over (Reservation stores it as customer_two_name).
  const secondName = merged["customer_two_name"] || merged["customer_two_id_name"];
  if (secondName) {
    const fields = def.steps.flatMap((s) => s.fields);
    for (const k of ["customer_two_id_name", "customer_two_name"]) {
      if (!out[k] && fields.some((f) => f.key === k)) out[k] = secondName;
    }
    if (!out["second_customer"] && fields.some((f) => f.key === "second_customer")) out["second_customer"] = "Yes";
  }
  if (formType === "written_statement") {
    if (sale.park_name) out["park_name_confirm"] = sale.park_name;
    if (!out["party_customer_name"] && out["customer_name"]) out["party_customer_name"] = out["customer_name"];
  }
  return prepareHomeCost(formType, out);
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


/** Fails when a write errors or changes no rows (stale status, missing record). */
async function expectRows(op: PromiseLike<{ data: unknown; error: unknown }>, message: string) {
  const { data, error } = await op;
  if (error || !Array.isArray(data) || data.length === 0) throw new Error(message);
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
    const target = await assertAccess(data.submissionId, context.userId);
    assertEditable(target.status, await isDirector(context.userId));
    const mime = data.mimeType === "image/jpg" ? "image/jpeg" : data.mimeType;
    const bytes = validateUpload(getForm(target.form_type), data.fieldKey, mime, data.base64);
    const db = await admin();
    const id = crypto.randomUUID();
    const safe = data.fileName.replace(/[^\w.\- ]+/g, "_");
    const path = `submissions/${data.submissionId}/files/${id}-${safe}`;
    const { error } = await db.storage.from("ekos-documents").upload(path, bytes, { contentType: mime });
    if (error) throw new Error("The file could not be uploaded. Please retry or contact EKOS.");
    const { error: metadataError } = await db.from("submission_files").insert({
      id,
      submission_id: data.submissionId,
      field_key: data.fieldKey,
      file_name: data.fileName,
      mime_type: mime,
      storage_path: path,
    });
    if (metadataError) {
      await db.storage.from("ekos-documents").remove([path]);
      throw new Error("The file uploaded but could not be attached to the form. Please retry or contact EKOS.");
    }
    const { wakeDriveBackups } = await import("./drive-backups.server");
    wakeDriveBackups();
    return { id, name: data.fileName, path, mime };
  });

export const getSubmission = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    const submission = await assertAccess(data.submissionId, context.userId);
    const db = await admin();
    // Re-run carry-over on every open of a later-form draft: fill only boxes that are still empty.
    if (submission.status !== "Completed" && submission.is_draft && submission.form_type !== "reservation") {
      const { data: saleRow } = await db.from("sales").select("*").eq("id", submission.sale_id).maybeSingle();
      if (saleRow) {
        const prefill = await buildPrefill(saleRow, submission.form_type, submission.id);
        const cur = { ...((submission.data ?? {}) as Record<string, unknown>) };
        let changed = false;
        for (const [k, v] of Object.entries(prefill)) {
          const c = cur[k];
          if (c === undefined || c === null || c === "" || (Array.isArray(c) && c.length === 0)) {
            cur[k] = v;
            changed = true;
          }
        }
        if (changed) {
          const { error } = await db.from("form_submissions").update({ data: cur as never }).eq("id", submission.id);
          if (error) throw new Error("The carried-over answers could not be saved. Please retry.");
          (submission as { data: unknown }).data = cur;
        }
      }
    }
    submission.data = withoutRetiredAnswers(submission.form_type, (submission.data ?? {}) as Record<string, unknown>) as never;
    if (submission.is_draft && submission.status !== "Completed" && hasHomeCost(submission.form_type)) {
      // No saved-answer history means the stored value is still the original prefill.
      const { data: saved, error: historyError } = await db.from("audit_log").select("id")
        .eq("submission_id", submission.id).in("action", ["Draft saved", "Form submitted"]).limit(1);
      let pristinePrefill: unknown;
      if (!historyError && Array.isArray(saved) && saved.length === 0) {
        const { data: reservation } = await db.from("form_submissions").select("data")
          .eq("sale_id", submission.sale_id).eq("form_type", "reservation").maybeSingle();
        pristinePrefill = (reservation?.data as Record<string, unknown> | undefined)?.["total_cost"];
      }
      submission.data = prepareHomeCostDraft(getForm(submission.form_type), submission.data as Record<string, unknown>, pristinePrefill) as never;
    }
    const { data: linkRow } = await db.from("app_settings").select("value").eq("key", "links").maybeSingle();
    const welcomePackUrl =
      String(((linkRow?.value ?? {}) as Record<string, unknown>)["welcome_pack_url"] ?? "") ||
      "https://ekosgroup.co.uk/ekos-welcome-pack";
    const [{ data: sale }, { data: parks }, director] = await Promise.all([
      db.from("sales").select("*").eq("id", submission.sale_id).maybeSingle(),
      db.from("parks").select("*").order("sort_order"),
      isDirector(context.userId),
    ]);
    const { data: audit, error: auditError } = await db
      .from("audit_log")
      .select("*")
      .eq("submission_id", submission.id)
      .order("created_at", { ascending: false });
    if (auditError) throw new Error("The audit history could not be loaded. Please retry.");
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
    const origin = await s.appOrigin();
    // Uploaded files: short-lived signed links, only issued after the access check above.
    const fileUrls: Record<string, string> = {};
    const subData = (submission.data ?? {}) as Record<string, unknown>;
    const paths = Object.values(subData)
      .flatMap((v) => (Array.isArray(v) ? v : []))
      .filter((x): x is { path: string } => !!x && typeof x === "object" && typeof (x as { path?: unknown }).path === "string")
      .map((x) => x.path)
      .filter((p) => p.startsWith(`submissions/${submission.id}/files/`));
    await Promise.all(
      paths.map(async (p) => {
        fileUrls[p] = await s.signedPdfUrl(p, 60 * 60);
      }),
    );
    return {
      fileUrls,
      statement: statement ?? null,
      directorLink: dToken?.token ? `${origin}/sign/${dToken.token}` : "",
      submission,
      sale,
      parks: parks ?? [],
      isDirector: director,
      audit: audit ?? [],
      welcomePackUrl,
      pdfUrl,
      offsiteLink: token?.token ? `${origin}/sign/${token.token}` : "",
      constructionLink: cToken?.token ? `${origin}/sign/${cToken.token}` : "",
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
    assertEditable(submission.status, await isDirector(context.userId));
    const db = await admin();
    data.values = prepareHomeCost(submission.form_type, withoutRetiredAnswers(submission.form_type, await lockPark(submission, data.values)));
    validateFormWrite(getForm(submission.form_type), data.values, { mode: "rep", isDirector: await isDirector(context.userId) }, "draft", (submission.data ?? {}) as Record<string, unknown>);
    await expectRows(db
      .from("form_submissions")
      .update({
        data: data.values as never,
        // A Director editing a completed form keeps it Completed rather than reopening it as a draft.
        is_draft: submission.status !== "Completed",
        status: submission.status === "Completed" ? "Completed" : submission.status === "Disapproved" ? "Disapproved" : "Draft",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.submissionId)
      .eq("status", submission.status)
      .select("id"), "The form could not be saved – it may have changed elsewhere. Please reload and retry.");
    await syncSale(submission.sale_id, data.values, submission.form_type);
    const s = await server();
    await s.addAudit({
      submissionId: data.submissionId,
      actorId: context.userId,
      actorLabel: String(context.claims["email"] ?? ""),
      action: "Draft saved",
    });
    const origin = await s.appOrigin();
    const { staffEmailLink } = await import("@/lib/email-links");
    const resumeLink = staffEmailLink(origin, `/forms/${submission.form_type}/${data.submissionId}`);
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

/** Director-only unsigned draft PDF: saves on-screen values (status unchanged), then builds it on the fly. */
export const downloadDraftPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ submissionId: z.string().uuid(), values: z.record(z.string(), z.unknown()).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isDirector(context.userId))) throw new Error("Director access is required.");
    const submission = await assertAccess(data.submissionId, context.userId);
    const db = await admin();
    if (data.values) {
      const values = prepareHomeCost(submission.form_type, withoutRetiredAnswers(submission.form_type, await lockPark(submission, data.values)));
      validateFormWrite(getForm(submission.form_type), values, { mode: "rep", isDirector: true }, "draft", (submission.data ?? {}) as Record<string, unknown>);
      await expectRows(db
        .from("form_submissions")
        .update({ data: values as never, updated_at: new Date().toISOString() })
        .eq("id", data.submissionId)
        .eq("status", submission.status)
        .select("id"), "The form could not be saved – it may have changed elsewhere. Please reload and retry.");
      await syncSale(submission.sale_id, values, submission.form_type);
    }
    const s = await server();
    const { bytes, fileName } = await s.buildDraftPdf(data.submissionId);
    const { data: profile } = await db.from("profiles").select("full_name, email").eq("id", context.userId).maybeSingle();
    const who = profile?.full_name || profile?.email || String(context.claims["email"] ?? "");
    await s.addAudit({
      submissionId: data.submissionId,
      actorId: context.userId,
      actorLabel: String(context.claims["email"] ?? who),
      action: `Draft PDF downloaded by ${who}`,
    });
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { fileName, base64: btoa(bin) };
  });

export async function syncSale(saleId: string, values: Record<string, unknown>, formType: string) {
  const db = await admin();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const park = String(values["park_name"] || values["park_name_confirm"] || "");
  if (park) {
    if (formType === "reservation") patch['park_name'] = park;
    else {
      // Sales started mid-way: the first form that names a park sets it on the sale.
      const { data: cur } = await db.from("sales").select("park_name").eq("id", saleId).maybeSingle();
      if (!cur?.park_name) patch['park_name'] = park;
    }
  }
  if (values["customer_name"]) patch['customer_name'] = String(values["customer_name"]);
  if (values["customer_email"]) patch['customer_email'] = String(values["customer_email"]);
  if (values["customer_phone"]) patch['customer_phone'] = String(values["customer_phone"]);
  if (values["sales_person"]) patch['sales_person'] = String(values["sales_person"]);
  if (values["deposit_date"]) patch['deposit_date'] = String(values["deposit_date"]);
  const { error } = await db.from("sales").update(patch as never).eq("id", saleId);
  if (error) throw new Error("The answers were saved but the sale summary could not be updated. Please retry.");
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
    assertEditable(submission.status, director);
    const requested = parseSubmitStatus(data.values["status"]);
    if (requested === "Completed" && !director) {
      throw new Error("Only the Director can mark a form as Completed.");
    }
    const s0 = await server();
    const isWS = s0.needsDirectorWitness(submission.form_type);
    if (isWS && requested === "Completed") {
      throw new Error("The Written Statement is completed when the Director and witness sign.");
    }
    if (submission.form_type === "identification" && requested === "In Review (Offsite)") {
      throw new Error("Identification Checks are not signed by the customer. Submit with \"In Review\".");
    }
    if (requested === "In Review (Offsite)") {
      data.values["customer_email"] = assertCustomerEmail(data.values["customer_email"]);
    }
    const status = requested;
    data.values = prepareHomeCost(submission.form_type, withoutRetiredAnswers(submission.form_type, await lockPark(submission, data.values)));
    validateFormWrite(getForm(submission.form_type), data.values, { mode: "rep", isDirector: director }, "submit", (submission.data ?? {}) as Record<string, unknown>);
    if (isWS) {
      const { getStatementTemplate } = await import("@/lib/statement.server");
      data.values["statement_version"] = (await getStatementTemplate()).version;
    }
    const signedOnSite = isWS && status === "In Review";
    const { error: submitError } = await db
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
    if (submitError) throw new Error("The form could not be submitted. Please retry.");
    await syncSale(submission.sale_id, data.values, submission.form_type);

    const s = await server();
    if (status === "Completed") {
      await s.addAudit({
        submissionId: data.submissionId,
        actorId: context.userId,
        actorLabel: String(context.claims["email"] ?? ""),
        action: "Form submitted",
        fromStatus: submission.status,
        toStatus: status,
      });
      await s.runCompletion(data.submissionId);
      return { status };
    }
    const built = await s.buildAndStorePdf(data.submissionId);
    // Drive copy, audit and the next email are independent once the PDF exists – run together.
    const sendNext = () =>
      status === "In Review (Offsite)"
        ? s.sendOffsiteCustomerEmail(data.submissionId)
        : isWS
          ? s.sendDirectorWitnessEmail(data.submissionId)
          : s.needsConstruction(submission.form_type) && !submission.construction_signed_at
            ? s.sendConstructionEmail(data.submissionId)
            : s.sendReviewRequiredEmail(data.submissionId);
    await Promise.all([
      s.publishInReview(data.submissionId, built.bytes),
      s.addAudit({
        submissionId: data.submissionId,
        actorId: context.userId,
        actorLabel: String(context.claims["email"] ?? ""),
        action: "Form submitted",
        fromStatus: submission.status,
        toStatus: status,
      }),
      sendNext(),
    ]);
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
    if (submission.form_type === "identification" && data.status === "In Review (Offsite)") {
      throw new Error("Identification Checks are not signed by the customer.");
    }
    const s = await server();
    if (data.status === "Completed" && s.needsDirectorWitness(submission.form_type)) {
      throw new Error(
        "The Written Statement is completed automatically when you and your witness sign on the Director & Witness signing page.",
      );
    }

    const { data: statusRows, error: statusError } = await db
      .from("form_submissions")
      .update({
        status: data.status,
        is_draft: data.status === "Disapproved",
        disapproval_note: data.status === "Disapproved" ? (data.note ?? "") : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.submissionId)
      .select("id");
    if (statusError || !statusRows?.length) throw new Error("The status could not be saved. Please retry.");

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
      await s.syncSheetForSubmission(data.submissionId);
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
    const current = await assertAccess(data.submissionId, context.userId);
    if (!canResend(data.kind, current.status, await isDirector(context.userId))) {
      throw new Error("Only the Director can resend this email.");
    }
    if (data.kind === "offsite") assertCustomerEmail(((current.data ?? {}) as Record<string, unknown>)["customer_email"]);
    const s = await server();
    if (data.kind === "review") await s.sendReviewRequiredEmail(data.submissionId);
    if (data.kind === "offsite") await s.sendOffsiteCustomerEmail(data.submissionId);
    if (data.kind === "construction") throw new Error("The Operations sign-off step has been removed – Sadie approves this form directly.");
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

export const sendTestOfEveryEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data: role } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "director")
      .maybeSingle();
    if (!role) throw new Error("Director access is required.");
    const s = await server();
    return s.sendAllTestEmails(context.userId, String(context.claims["email"] ?? ""));
  });

async function canDeleteSales(userId: string, verifiedEmail: unknown): Promise<boolean> {
  // Identity comes from verified authentication claims, never editable profiles.
  if (!(await isDirector(userId))) return false;
  const email = typeof verifiedEmail === "string" ? verifiedEmail.trim().toLowerCase() : "";
  if (email !== "sadie@ekosgroup.co.uk") return false;
  const db = await admin();
  const { data } = await db
    .from("user_permissions")
    .select("id")
    .ilike("email", email)
    .eq("permission", "can_delete_sales")
    .maybeSingle();
  return Boolean(data);
}

/** Does the signed-in user hold can_delete_sales? */
export const getMyPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({ canDeleteSales: await canDeleteSales(context.userId, context.claims["email"]) }));

/** Permanently deletes a sale + its forms, tokens, files and stored files. Never touches Drive/Sheets, sends no email. */
export const deleteSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ saleId: z.string().uuid(), confirmOrderNumber: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await canDeleteSales(context.userId, context.claims["email"]))) {
      throw new Error("You do not have permission to delete sales.");
    }
    const db = await admin();
    const { data: sale } = await db.from("sales").select("*").eq("id", data.saleId).maybeSingle();
    if (!sale) throw new Error("Sale not found");
    if (data.confirmOrderNumber.trim() !== sale.order_number) {
      throw new Error("The order number typed does not match.");
    }
    const { data: subs } = await db
      .from("form_submissions")
      .select("id, form_type, pdf_path")
      .eq("sale_id", sale.id);
    const subIds = (subs ?? []).map((s) => s.id);
    const paths: string[] = (subs ?? []).map((s) => s.pdf_path).filter((p): p is string => Boolean(p));
    if (subIds.length) {
      const { data: files } = await db.from("submission_files").select("storage_path").in("submission_id", subIds);
      paths.push(...(files ?? []).map((f) => f.storage_path));
      // Anything else stored under the submission folders (e.g. signatures)
      for (const id of subIds) {
        for (const prefix of [`submissions/${id}`, `submissions/${id}/files`]) {
          const { data: listed } = await db.storage.from("ekos-documents").list(prefix, { limit: 1000 });
          (listed ?? []).forEach((o) => o.id && paths.push(`${prefix}/${o.name}`));
        }
      }
    }
    const unique = Array.from(new Set(paths));
    if (unique.length) await db.storage.from("ekos-documents").remove(unique);
    if (subIds.length) {
      await db.from("signing_tokens").delete().in("submission_id", subIds);
      await db.from("submission_files").delete().in("submission_id", subIds);
      const { error: subErr } = await db.from("form_submissions").delete().in("id", subIds);
      if (subErr) throw new Error(subErr.message);
    }
    const { error: saleErr } = await db.from("sales").delete().eq("id", sale.id);
    if (saleErr) throw new Error(saleErr.message);

    const { data: profile } = await db.from("profiles").select("email, full_name").eq("id", context.userId).maybeSingle();
    const { FORM_TITLES } = await import("@/lib/forms/registry");
    const forms = (subs ?? []).map((s) => FORM_TITLES[s.form_type] ?? s.form_type);
    const { error: auditError } = await db.from("audit_log").insert({
      submission_id: null,
      actor_id: context.userId,
      actor_label: profile?.full_name || profile?.email || "",
      action: "sale_deleted",
      note: `Deleted sale ${sale.order_number} · Customer: ${sale.customer_name || "—"} · Park: ${sale.park_name || "—"} · Forms deleted: ${forms.join(", ") || "none"} · Files removed: ${unique.length}`,
    });
    if (auditError) throw new Error("The sale was deleted but its audit entry could not be recorded. Contact EKOS; do not repeat the deletion.");
    return { ok: true, orderNumber: sale.order_number };
  });
