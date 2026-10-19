import { describe, expect, it } from "vitest";
import { backupSourceAllowed, backupFileName, nonBlockingBackup, nextBackupRetry, KNOWN_TEST_ORDERS, DRIVE_BACKUP_ROOT, automaticTestSale, activeTestDestination } from "./drive-backup-rules";
import { FORM_ORDER, getForm } from "./forms/registry";
const id = "00000000-0000-4000-8000-000000000074";
it.each(["Test Customer", "FICTIONAL customer", "Claude Customer"])("automatically excludes %s", name => expect(automaticTestSale(name)).toBe(true));
it("new ordinary customer defaults live", () => expect(automaticTestSale("Jane Smith")).toBe(false));
it("expired fictional destination cannot run", () => expect(activeTestDestination({ test_folder_id: "test-folder", test_expires_at: "2026-10-19T18:00:00Z" }, Date.parse("2026-10-19T18:01:00Z"))).toBe(false));
describe("Drive backup security and naming", () => {
  it("uses only Emma's approved backup root", () => expect(DRIVE_BACKUP_ROOT).toBe("14Df5SRJ1B_EfowB22LfO82piSDl88zr_"));
  it("accepts the same submission's uploaded attachment", () => expect(backupSourceAllowed(id, `submissions/${id}/files/id.png`)).toBe(true));
  it("refuses another submission's files and traversal", () => {
    expect(backupSourceAllowed(id, "submissions/another/files/id.png")).toBe(false);
    expect(backupSourceAllowed(id, `submissions/${id}/files/../private.png`)).toBe(false);
  });
  it("refuses mutable PDFs as backup worker sources", () => expect(backupSourceAllowed(id, `submissions/${id}/form.pdf`)).toBe(false));
  it("accepts only same-submission immutable version PDFs", () => expect(backupSourceAllowed(id, `backup-versions/${id}/${id}.pdf`)).toBe(true));
  it.each(FORM_ORDER)("%s versions keep form/order and do not overwrite", (type) => {
    const first = backupFileName(getForm(type).title, "EKOS-00074", "form.pdf", "v1", "2026-10-19T18:00:00Z", "pdf");
    const second = backupFileName(getForm(type).title, "EKOS-00074", "form.pdf", "v2", "2026-10-19T18:00:00Z", "pdf");
    expect(first).toContain(getForm(type).title); expect(first).toContain("EKOS-00074"); expect(first).not.toBe(second);
    expect(first).toBe(backupFileName(getForm(type).title, "EKOS-00074", "form.pdf", "v1", "2026-10-19T18:00:00Z", "pdf"));
  });
  it("never lets a backup failure reject form completion", async () => {
    let logged = false;
    await expect(nonBlockingBackup(async () => { throw new Error("Drive unavailable"); }, () => { logged = true; })).resolves.toBeUndefined();
    expect(logged).toBe(true);
  });
  it("uses persisted exponentially delayed retry deadlines", () => expect(nextBackupRetry(1, 0)).toBe("1970-01-01T00:02:00.000Z"));
  it("excludes Emma's known test sale from backfill", () => expect(KNOWN_TEST_ORDERS.has("EKOS-00074")).toBe(true));
});