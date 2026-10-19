import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { KNOWN_TEST_ORDERS } from "./drive-backup-rules";

async function director(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "director").maybeSingle();
  if (error || !data) throw new Error("Director access is required.");
  return supabaseAdmin;
}

const submissionInput = z.object({ submissionId: z.string().uuid() });
export const getDriveBackupStatus = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => submissionInput.parse(d)).handler(async ({ data, context }) => {
    await director(context.userId);
    const { backupDb, backupEnabled, reconcileBackup } = await import("./drive-backups.server");
    const db = backupDb();
    if (!(await backupEnabled(db))) return { enabled: false, pending: 0, failed: 0, done: 0, unavailable: false };
    const jobs = await db.from("drive_backup_jobs").select("status").eq("submission_id", data.submissionId);
    if (jobs.error) return { enabled: true, pending: 0, failed: 0, done: 0, unavailable: true };
    return { enabled: true, pending: jobs.data.filter(j => j.status === "pending" || j.status === "running").length,
      failed: jobs.data.filter(j => j.status === "failed").length, done: jobs.data.filter(j => j.status === "done").length, unavailable: false };
  });

export const retryDriveBackup = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => submissionInput.parse(d)).handler(async ({ data, context }) => {
    await director(context.userId);
    const { backupDb, backupEnabled, reconcileBackup } = await import("./drive-backups.server");
    const db = backupDb();
    if (!(await backupEnabled(db))) throw new Error("Drive backups are not enabled.");
    await reconcileBackup(data.submissionId);
    const write = await db.from("drive_backup_jobs").update({ status: "pending", next_attempt_at: new Date().toISOString() }).eq("submission_id", data.submissionId).eq("status", "failed");
    if (write.error) throw new Error("The backup retry could not be queued.");
    return { queued: true };
  });

const ordersInput = z.object({ orderNumbers: z.array(z.string().regex(/^EKOS-\d{5}$/)).min(1).max(50) });
export const previewDriveBackfill = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => ordersInput.parse(d)).handler(async ({ data, context }) => {
    const db = await director(context.userId);
    const sales = await db.from("sales").select("id,order_number,park_name,customer_name").in("order_number", data.orderNumbers);
    if (sales.error) throw new Error("Backfill preview could not be read.");
    return (sales.data ?? []).map(s => ({ ...s, excluded: KNOWN_TEST_ORDERS.has(s.order_number) }));
  });

/** Only an explicitly reviewed live-order allowlist can be backfilled. */
export const enqueueDriveBackfill = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => ordersInput.extend({ confirmLiveSales: z.literal(true) }).parse(d)).handler(async ({ data, context }) => {
    await director(context.userId);
    if (data.orderNumbers.some(n => KNOWN_TEST_ORDERS.has(n))) throw new Error("Known test sales cannot be backfilled.");
    const { backupDb, backupEnabled } = await import("./drive-backups.server");
    const db = backupDb();
    if (!(await backupEnabled(db))) throw new Error("Drive backups are not enabled.");
    const sales = await db.from("sales").select("id,order_number").in("order_number", data.orderNumbers);
    if (sales.error || sales.data?.length !== new Set(data.orderNumbers).size) throw new Error("Every live order must exist and be reviewed.");
    let queued = 0;
    for (const sale of sales.data) {
      const classification = await db.from("drive_backup_sales").upsert({ sale_id: sale.id, classification: "live", confirmed_by: context.userId });
      if (classification.error) throw new Error("Live-sale confirmation could not be recorded.");
      const subs = await db.from("form_submissions").select("id,pdf_path,form_type").eq("sale_id", sale.id);
      if (subs.error) throw new Error("Backfill forms could not be read.");
      for (const sub of subs.data) {
        if (sub.pdf_path) {
          // Backfill snapshots the existing object, never regenerates historical answers.
          if (!sub.pdf_path.startsWith(`submissions/${sub.id}/`) || sub.pdf_path.includes("..")) throw new Error("PDF source scope refused.");
          const versionId = sub.id; // Stable backfill ID, distinct from generated-version UUIDs.
          const source = `backup-versions/${sub.id}/${versionId}.pdf`;
          const existing = await db.from("drive_backup_versions").select("id").eq("id", versionId).maybeSingle();
          if (existing.error) throw new Error("Backfill checkpoint unavailable.");
          if (!existing.data) {
            const download = await db.storage.from("ekos-documents").download(sub.pdf_path);
            if (download.error || !download.data) throw new Error("Existing PDF unavailable.");
            const upload = await db.storage.from("ekos-documents").upload(source, download.data, { contentType: "application/pdf", upsert: false });
            if (upload.error && !/already exists|duplicate/i.test(upload.error.message)) throw new Error("Backfill snapshot could not be stored.");
            const write = await db.from("drive_backup_versions").insert({ id: versionId, submission_id: sub.id, source_path: source, file_name: `${sub.form_type}.pdf` });
            if (write.error) throw new Error("Backfill snapshot could not be queued.");
          }
        }
        const files = await db.from("submission_files").select("storage_path,file_name").eq("submission_id", sub.id);
        if (files.error) throw new Error("Backfill attachments unavailable.");
        for (const f of files.data) {
          if (!f.storage_path.startsWith(`submissions/${sub.id}/files/`) || f.storage_path.includes("..")) throw new Error("Attachment source scope refused.");
          const write = await db.from("drive_backup_jobs").upsert({ submission_id: sub.id, source_path: f.storage_path, file_name: f.file_name, kind: "attachment" }, { onConflict: "source_path", ignoreDuplicates: true });
          if (write.error) throw new Error("Attachment backup could not be queued.");
        }
        queued++;
      }
    }
    return { queued };
  });

export const runDriveBackupWorker = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await director(context.userId);
    const { processBackupBatch } = await import("./drive-backups.server");
    return processBackupBatch();
  });