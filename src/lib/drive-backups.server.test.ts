import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ enabled: false, root: "14Df5SRJ1B_EfowB22LfO82piSDl88zr_", upload: vi.fn(), insert: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({
  from: () => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { value: { enabled: f.enabled, root_folder_id: f.root } } }), insert: f.insert };
    return q;
  }, storage: { from: () => ({ upload: f.upload }) },
}) }));
import { snapshotPdf, processBackupBatch } from "./drive-backups.server";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("SUPABASE_URL", "http://localhost"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fictional-test-key"); f.enabled = false; f.root = "14Df5SRJ1B_EfowB22LfO82piSDl88zr_"; });
it("disabled Drive backup performs no staging upload or provider write", async () => {
  await snapshotPdf("test", new Uint8Array([37,80,68,70]), "form.pdf");
  expect(f.upload).not.toHaveBeenCalled(); expect(await processBackupBatch()).toEqual({ skipped: true, processed: 0 });
});
it("wrong Drive destination fails closed even with enabled=true", async () => {
  f.enabled = true; f.root = "unapproved-root";
  await snapshotPdf("test", new Uint8Array(), "form.pdf"); expect(f.upload).not.toHaveBeenCalled();
});
it("snapshot storage failure does not reject the primary PDF save", async () => {
  f.enabled = true; f.upload.mockResolvedValue({ error: new Error("storage outage") });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try { await expect(snapshotPdf("test", new Uint8Array(), "form.pdf")).resolves.toBeUndefined(); expect(log).toHaveBeenCalled(); }
  finally { log.mockRestore(); }
});
it("two regenerations store distinct immutable keys with the original bytes", async () => {
  f.enabled = true; f.upload.mockResolvedValue({ error: null }); f.insert.mockResolvedValue({ error: null });
  const bytes = new Uint8Array([37,80,68,70]);
  await snapshotPdf("test", bytes, "form.pdf"); await snapshotPdf("test", bytes, "form.pdf");
  expect(f.upload.mock.calls[0][0]).not.toBe(f.upload.mock.calls[1][0]); expect(f.upload.mock.calls[0][1]).toBe(bytes);
});