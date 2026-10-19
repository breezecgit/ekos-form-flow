import { createClient } from "@supabase/supabase-js";
import { DRIVE_BACKUP_ROOT, backupSourceAllowed, backupFileName, nextBackupRetry, nonBlockingBackup, automaticTestSale, activeTestDestination } from "./drive-backup-rules";
import { getForm } from "./forms/registry";
import { getRequest } from "@tanstack/react-start/server";

/** Untyped client for reviewed tables until the approved migration generates types. */
export function backupDb() {
  const url = process.env["SUPABASE_URL"], key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Backup configuration unavailable");
  return createClient(url, key, { auth: { persistSession: false }, global: { fetch: (input, init) => {
    const h = new Headers(init?.headers); h.set("apikey", key);
    if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
    return fetch(input, { ...init, headers: h, signal: init?.signal ?? AbortSignal.timeout(5_000) });
  } } });
}

export async function backupEnabled(db = backupDb()): Promise<boolean> {
  const { data, error } = await db.from("app_settings").select("value").eq("key", "drive_backup").maybeSingle();
  return !error && data?.value?.enabled === true && data.value.root_folder_id === DRIVE_BACKUP_ROOT;
}

export async function snapshotPdf(submissionId: string, bytes: Uint8Array, fileName: string) {
  await nonBlockingBackup(async () => {
    const db = backupDb();
    const sub = await db.from("form_submissions").select("sale_id").eq("id", submissionId).single();
    if (sub.error || !(await saleDestination(db, sub.data.sale_id))) return;
    const id = crypto.randomUUID(), path = `backup-versions/${submissionId}/${id}.pdf`;
    const { error } = await db.storage.from("ekos-documents").upload(path, bytes, { contentType: "application/pdf" });
    if (error) throw error;
    const write = await db.from("drive_backup_versions").insert({ id, submission_id: submissionId, source_path: path, file_name: fileName });
    if (write.error) throw write.error; // Staged bytes retained for Director reconciliation.
    wakeDriveBackups();
  }, () => console.error("Drive backup snapshot failed; app PDF remains available", { submissionId }));
}

/** Nitro's Cloudflare adapter attaches waitUntil to the original Request. */
export function backgroundBackup(work: () => Promise<unknown>): void {
  const run = () => work().catch(() => console.error("Background Drive backup unavailable; scheduled retry remains armed"));
  try {
    const request = getRequest() as Request & { waitUntil?: (promise: Promise<unknown>) => void };
    if (request.waitUntil) { request.waitUntil(run()); return; }
    // Local Vite has no execution lifetime limit; never rely on this in production.
    if (process.env["NODE_ENV"] === "development") { void run(); return; }
  } catch { /* No request context: rely on durable journal and schedule. */ }
  console.info("Drive immediate attempt deferred to schedule");
}

export function wakeDriveBackups(): void { backgroundBackup(() => processBackupBatch()); }

async function saleDestination(db: ReturnType<typeof backupDb>, saleId: string): Promise<string | null> {
  const [classification, sale] = await Promise.all([
    db.from("drive_backup_sales").select("*").eq("sale_id", saleId).maybeSingle(),
    db.from("sales").select("customer_name").eq("id", saleId).single(),
  ]);
  if (classification.error || sale.error || classification.data?.classification !== "live") return null;
  if (activeTestDestination(classification.data)) return classification.data.test_folder_id;
  // Expired scopes must never fall back to production.
  if (classification.data.test_folder_id || automaticTestSale(sale.data.customer_name ?? "")) return null;
  return await backupEnabled(db) ? DRIVE_BACKUP_ROOT : null;
}

async function driveRequest(path: string, init: RequestInit = {}) {
  const key = process.env["GOOGLE_DRIVE_API_KEY"], appKey = process.env["LOVABLE_API_KEY"];
  if (!key || !appKey) throw new Error("Drive connection unavailable");
  const h = new Headers(init.headers);
  h.set("Authorization", `Bearer ${appKey}`); h.set("X-Connection-Api-Key", key);
  const r = await fetch(`https://connector-gateway.lovable.dev/google_drive/${path}`, { ...init, headers: h, signal: AbortSignal.timeout(8_000) });
  if (!r.ok) {
    const detail = await r.text();
    console.error("Drive backup provider failure", { status: r.status, detail });
    throw new Error(`Drive backup failed (${r.status})`);
  }
  return r;
}

const queryText = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
async function reserveId(): Promise<string> {
  const r = await (await driveRequest("drive/v3/files/generateIds?count=1&space=drive&type=files")).json();
  if (!r.ids?.[0]) throw new Error("Drive ID allocation failed");
  return r.ids[0];
}

/** Called only under the durable single-worker lease. IDs persist BEFORE external writes. */
async function folder(db: ReturnType<typeof backupDb>, key: string, parent: string, name: string): Promise<string> {
  let { data: row, error } = await db.from("drive_backup_folders").select("*").eq("folder_key", key).maybeSingle();
  if (error) throw error;
  if (!row) {
    const q = `'${queryText(parent)}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and name='${queryText(name)}'`;
    const found = await (await driveRequest(`drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`)).json();
    if ((found.files?.length ?? 0) > 1) throw new Error("Multiple matching folders need Director review");
    const driveId = found.files?.[0]?.id ?? await reserveId();
    const saved = await db.from("drive_backup_folders").insert({ folder_key: key, parent_id: parent, drive_id: driveId }).select().single();
    if (saved.error) throw saved.error;
    row = saved.data;
  }
  if (!row || row.parent_id !== parent) throw new Error("Folder destination mismatch");
  // Stable app properties distinguish an existing folder from a reserved ID.
  const q = `appProperties has { key='ekosBackupKey' and value='${queryText(key)}' } and '${queryText(parent)}' in parents and trashed=false`;
  const found = await (await driveRequest(`drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`)).json();
  if (found.files?.some((f: { id: string }) => f.id === row.drive_id)) return row.drive_id;
  // Name match includes folders adopted from an earlier run.
  const nameQuery = `'${queryText(parent)}' in parents and trashed=false and name='${queryText(name)}'`;
  const existing = await (await driveRequest(`drive/v3/files?q=${encodeURIComponent(nameQuery)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`)).json();
  if (existing.files?.some((f: { id: string }) => f.id === row.drive_id)) return row.drive_id;
  await driveRequest("drive/v3/files?supportsAllDrives=true", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    id: row.drive_id, name, mimeType: "application/vnd.google-apps.folder", parents: [parent], appProperties: { ekosBackupKey: key },
  }) });
  return row.drive_id;
}

export async function processBackupBatch() {
  const db = backupDb();
  const owner = crypto.randomUUID();
  const lock = await db.rpc("drive_backup_claim", { p_owner: owner });
  if (lock.error) throw lock.error;
  if (!lock.data) return { skipped: true, processed: 0 };
  let processed = 0;
  const deadline = Date.now() + 90_000;
  try {
    // Bounded drain; four-minute lease remains longer than the invocation budget.
    for (let count = 0; count < 8 && Date.now() < deadline; count++) {
    const claim = await db.rpc("drive_backup_claim_job", { p_owner: owner });
    if (claim.error) throw claim.error;
    const job = claim.data?.[0];
    if (!job) break;
    try {
      const sub = await db.from("form_submissions").select("*").eq("id", job.submission_id).single();
      if (sub.error) throw sub.error;
      const sale = await db.from("sales").select("*").eq("id", sub.data.sale_id).single();
      if (sale.error) throw sale.error;
      // Uploads can arrive before the first draft has recorded park/customer.
      // Keep them queued rather than creating an Unknown Park/wrong sale folder.
      if (!sale.data.park_name || !sale.data.customer_name) {
        const defer = await db.from("drive_backup_jobs").update({ status: "pending", next_attempt_at: new Date(Date.now() + 60_000).toISOString(), lease_until: null }).eq("id", job.id);
        if (defer.error) throw defer.error;
        continue;
      }
      const root = await saleDestination(db, sale.data.id);
      if (!root) throw new Error("Test sale or disabled destination excluded");
      if (root !== DRIVE_BACKUP_ROOT) {
        const metadata = await (await driveRequest(`drive/v3/files/${encodeURIComponent(root)}?fields=name,parents,mimeType,trashed`)).json();
        if (metadata.name !== "_TEST – delete" || metadata.trashed || metadata.mimeType !== "application/vnd.google-apps.folder" || !metadata.parents?.includes(DRIVE_BACKUP_ROOT)) throw new Error("Synthetic destination refused");
      }
      if (!backupSourceAllowed(job.submission_id, job.source_path)) throw new Error("Backup source scope refused");
      const park = await folder(db, `${root}:park:${sale.data.park_name}`, root, sale.data.park_name || "Unknown Park");
      const dest = await folder(db, `${root}:sale:${sale.data.id}`, park, `${sale.data.order_number} – ${sale.data.customer_name}`);
      let driveId = job.drive_file_id;
      if (!driveId) {
        driveId = await reserveId();
        const saved = await db.from("drive_backup_jobs").update({ drive_file_id: driveId }).eq("id", job.id);
        if (saved.error) throw saved.error;
      }
      const q = `appProperties has { key='ekosBackupJob' and value='${job.id}' } and '${queryText(dest)}' in parents and trashed=false`;
      const existing = await (await driveRequest(`drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`)).json();
      if (!existing.files?.some((f: { id: string }) => f.id === driveId)) {
        const stored = await db.storage.from("ekos-documents").download(job.source_path);
        if (stored.error || !stored.data) throw new Error("Backup source unavailable");
        const bytes = new Uint8Array(await stored.data.arrayBuffer());
        const boundary = `ekos-${job.id}`;
        const name = backupFileName(getForm(sub.data.form_type).title, sale.data.order_number, job.file_name, job.id, job.created_at, job.kind);
        const head = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ id: driveId, name, parents: [dest], appProperties: { ekosBackupJob: job.id } })}\r\n--${boundary}\r\nContent-Type: ${stored.data.type || "application/octet-stream"}\r\n\r\n`);
        const tail = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
        const body = new Uint8Array(head.length + bytes.length + tail.length); body.set(head); body.set(bytes, head.length); body.set(tail, head.length + bytes.length);
        if (await saleDestination(db, sale.data.id) !== root) throw new Error("Backup permission changed");
        await driveRequest("upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body });
      }
      const saved = await db.from("drive_backup_jobs").update({ status: "done", error: null, finished_at: new Date().toISOString(), lease_until: null }).eq("id", job.id);
      if (saved.error) throw saved.error;
      processed++;
    } catch (error) {
      const saved = await db.from("drive_backup_jobs").update({ status: "failed", error: "Drive backup failed – retry", next_attempt_at: nextBackupRetry(job.attempts), lease_until: null }).eq("id", job.id);
      if (saved.error) throw saved.error;
      console.error("Drive backup job failed", { jobId: job.id, reason: error instanceof Error ? error.message : "Unknown failure" });
    }
    }
    return { processed };
  } finally {
    await db.from("drive_backup_worker").update({ owner: null, lease_until: null }).eq("owner", owner);
  }
}

/** Repairs durable app objects whose enqueue failed. Explicitly scoped by Director. */
export async function reconcileBackup(submissionId: string) {
  const db = backupDb();
  if (!(await backupEnabled(db))) throw new Error("Drive backups are not enabled.");
  const files = await db.from("submission_files").select("storage_path,file_name").eq("submission_id", submissionId);
  if (files.error) throw files.error;
  for (const file of files.data) {
    if (!backupSourceAllowed(submissionId, file.storage_path)) continue;
    const queued = await db.from("drive_backup_jobs").upsert({ submission_id: submissionId, source_path: file.storage_path, file_name: file.file_name, kind: "attachment" }, { onConflict: "source_path", ignoreDuplicates: true });
    if (queued.error) throw queued.error;
  }
  // Includes staged versions whose metadata insert failed; never read other sales.
  const staged = await db.storage.from("ekos-documents").list(`backup-versions/${submissionId}`, { limit: 1000 });
  if (staged.error) throw staged.error;
  for (const file of staged.data) {
    const path = `backup-versions/${submissionId}/${file.name}`;
    if (!backupSourceAllowed(submissionId, path)) continue;
    const id = file.name.slice(0, -4);
    const version = await db.from("drive_backup_versions").upsert({ id, submission_id: submissionId, source_path: path, file_name: "Recovered PDF version.pdf" }, { onConflict: "id", ignoreDuplicates: true });
    if (version.error) throw version.error;
    const job = await db.from("drive_backup_jobs").upsert({ submission_id: submissionId, source_path: path, file_name: "Recovered PDF version.pdf", kind: "pdf" }, { onConflict: "source_path", ignoreDuplicates: true });
    if (job.error) throw job.error;
  }
}