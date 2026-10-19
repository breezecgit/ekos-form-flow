/** Client-safe names and immutable-source checks; never use customer text as a key. */
export const DRIVE_BACKUP_ROOT = "14Df5SRJ1B_EfowB22LfO82piSDl88zr_";
export const KNOWN_TEST_ORDERS = new Set(["EKOS-00065", "EKOS-00068", "EKOS-00070", "EKOS-00071", "EKOS-00074", "EKOS-00075"]);

export function automaticTestSale(customerName: string): boolean {
  return /test|fictional|claude/i.test(customerName);
}

export function activeTestDestination(row: { test_folder_id?: string | null; test_expires_at?: string | null }, now = Date.now()): boolean {
  return Boolean(row.test_folder_id && row.test_expires_at && Date.parse(row.test_expires_at) > now);
}

export function backupSourceAllowed(submissionId: string, source: string): boolean {
  if (!/^[0-9a-f-]{36}$/i.test(submissionId) || source.includes("..") || source.includes("\\")) return false;
  return source.startsWith(`submissions/${submissionId}/files/`) ||
    /^backup-versions\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/i.test(source) && source.startsWith(`backup-versions/${submissionId}/`);
}

export function backupFileName(formTitle: string, order: string, original: string, versionId: string, createdAt: string, kind: "pdf" | "attachment"): string {
  const clean = (s: string) => s.replace(/[\r\n\x00/\\]/g, "-").trim();
  const timestamp = new Date(createdAt).toISOString().replace(/[:.]/g, "-");
  return kind === "pdf"
    ? `${clean(formTitle)} – ${clean(order)} – ${timestamp} – ${versionId}.pdf`
    : `${clean(formTitle)} – ${clean(order)} – ${clean(original)} – ${versionId}`;
}

export function nextBackupRetry(attempts: number, now = Date.now()): string {
  return new Date(now + Math.min(24 * 60, 2 ** Math.min(attempts, 10)) * 60_000).toISOString();
}

export async function nonBlockingBackup(work: () => Promise<unknown>, log: () => void): Promise<void> {
  try { await work(); } catch { log(); }
}