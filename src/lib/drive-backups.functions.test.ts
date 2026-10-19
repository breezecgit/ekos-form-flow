import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ director: false, db: vi.fn(), worker: vi.fn(), enabled: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  let validator: ((d: unknown) => unknown) | undefined;
  const b = { middleware: () => b, inputValidator: (v: (d: unknown) => unknown) => { validator = v; return b; },
    handler: (h: (d: unknown) => unknown) => (input?: { data: unknown }) => h({ data: validator ? validator(input?.data) : input?.data, context: { userId: "fictional-rep" } }) };
  return b;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: f.director ? { role: "director" } : null }) };
  return q;
} } }));
vi.mock("./drive-backups.server", () => ({ backupDb: f.db, backupEnabled: f.enabled, processBackupBatch: f.worker, reconcileBackup: vi.fn() }));
import { getDriveBackupStatus, retryDriveBackup, enqueueDriveBackfill, runDriveBackupWorker } from "./drive-backups.functions";
beforeEach(() => { vi.clearAllMocks(); f.director = false; f.enabled.mockResolvedValue(false); });
const data = { submissionId: "00000000-0000-4000-8000-000000000074" };
it.each([getDriveBackupStatus, retryDriveBackup])("rep cannot read backup details or queue a retry", async fn => {
  await expect(fn({ data })).rejects.toThrow("Director access"); expect(f.db).not.toHaveBeenCalled();
});
it("rep cannot run the backup processor", async () => {
  await expect(runDriveBackupWorker()).rejects.toThrow("Director access"); expect(f.worker).not.toHaveBeenCalled();
});
it("Director cannot backfill known test sale EKOS-00074", async () => {
  f.director = true;
  await expect(enqueueDriveBackfill({ data: { orderNumbers: ["EKOS-00074"], confirmLiveSales: true } })).rejects.toThrow("test sales");
  expect(f.db).not.toHaveBeenCalled();
});
it("Director cannot start copying while the new Drive gate is OFF", async () => {
  f.director = true;
  await expect(retryDriveBackup({ data })).rejects.toThrow("not enabled"); expect(f.worker).not.toHaveBeenCalled();
});