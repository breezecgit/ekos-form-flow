import { beforeEach, describe, expect, it, vi } from "vitest";
import { FORM_ORDER } from "./forms/registry";

const fixture = vi.hoisted(() => ({
  formType: "new_home_order",
  upload: vi.fn(),
  download: vi.fn(),
  update: vi.fn(),
  generate: vi.fn(),
  send: vi.fn(),
  drive: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      let updated = false;
      const query = {
        select: () => query,
        eq: () => query,
        update: (patch: unknown) => { updated = true; fixture.update(patch); return query; },
        maybeSingle: async () => ({ data: table === "form_submissions" ? {
          id: "00000000-0000-4000-8000-000000000074", sale_id: "fictional-sale",
          form_type: fixture.formType, order_number: "EKOS-FICTIONAL", data: {
            park_name: "Carlton Manor", customer_name: "Fictional – O’Connor / 测试", customer_email: "emma.frew@breezeconnection.co.uk",
          },
        } : null }),
        then: (resolve: (result: unknown) => unknown) => Promise.resolve({
          data: table === "app_settings" ? [] : [], error: updated ? null : null,
        }).then(resolve),
      };
      return query;
    },
    storage: { from: () => ({ upload: fixture.upload, download: fixture.download, createSignedUrl: async () => ({ data: { signedUrl: "https://example.invalid/form.pdf" } }) }) },
  },
}));
vi.mock("@/lib/pdf/generate.server", () => ({ generateFormPdf: fixture.generate }));
vi.mock("@/lib/statement.server", () => ({ templatesForSubmission: async () => null }));
vi.mock("@/lib/drive-backups.server", () => ({ snapshotPdf: vi.fn(), backgroundBackup: vi.fn() }));
vi.mock("@/lib/automations.server", () => ({
  contactsFor: async () => ({ sadie: "sadie@ekosgroup.co.uk", sales: "sales@ekosgroup.co.uk", repEmail: "rep@example.invalid", parkInbox: "park@example.invalid" }), emailFormName: (t: string) => t, saveStageToDrive: fixture.drive, syncTrackerSheet: vi.fn(),
}));
vi.mock("@/lib/email.server", async (original) => ({ ...await original<typeof import("@/lib/email.server")>(), sendEmail: fixture.send }));

import { buildAndStorePdf, runCompletion, sendCompletionEmails } from "./ekos.server";
const id = "00000000-0000-4000-8000-000000000074";
beforeEach(() => {
  vi.clearAllMocks();
  fixture.upload.mockResolvedValue({ error: null });
  fixture.generate.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  fixture.send.mockResolvedValue({ ok: true });
  fixture.drive.mockResolvedValue(null);
});

describe("completed PDF email", () => {
  it.each(FORM_ORDER)("%s sends the final PDF before optional Drive work", async (formType) => {
    fixture.formType = formType;
    fixture.drive.mockRejectedValue(new Error("Drive unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await runCompletion(id);
      expect(fixture.generate).toHaveBeenCalledOnce();
      expect(fixture.send).toHaveBeenCalledWith(expect.objectContaining({ template: "completion", attachments: [{ filename: expect.any(String), bytes: new Uint8Array([37, 80, 68, 70]) }] }));
      expect(fixture.send.mock.invocationCallOrder[0]).toBeLessThan(fixture.drive.mock.invocationCallOrder[0] ?? Infinity);
      expect(fixture.generate.mock.calls[0]?.[0].directorSignature !== undefined).toBe(formType !== "written_statement");
    } finally { log.mockRestore(); }
  });
  it("retries an email failure with the same document idempotency key", async () => {
    vi.useFakeTimers();
    fixture.send.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });
    const sending = sendCompletionEmails(id, new Uint8Array([1, 2]), "fictional.pdf");
    await vi.runAllTimersAsync(); await sending;
    expect(fixture.send).toHaveBeenCalledTimes(2);
    expect(fixture.send.mock.calls[0]?.[0].idempotencyKey).toEqual(fixture.send.mock.calls[1]?.[0].idempotencyKey);
    vi.useRealTimers();
  });
  it("never claims success after three failed completion sends", async () => {
    vi.useFakeTimers(); fixture.send.mockResolvedValue({ ok: false });
    const result = expect(sendCompletionEmails(id, new Uint8Array([1]), "fictional.pdf")).rejects.toThrow("completion email failed");
    await vi.runAllTimersAsync(); await result;
    expect(fixture.send).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});

describe("shared PDF storage keys", () => {
  it.each(FORM_ORDER)("%s stores review and director PDFs safely despite Unicode customer names", async (formType) => {
    fixture.formType = formType;
    for (const includeDirectorSignature of [false, true]) {
      const result = await buildAndStorePdf(id, { includeDirectorSignature });
      expect(result.path).toBe(`submissions/${id}/form.pdf`);
      expect(result.fileName).toContain("Fictional – O’Connor");
      expect(fixture.upload).toHaveBeenLastCalledWith(`submissions/${id}/form.pdf`,
        new Uint8Array([37, 80, 68, 70]), { contentType: "application/pdf", upsert: true });
      expect(fixture.update).toHaveBeenLastCalledWith(expect.objectContaining({ pdf_path: result.path }));
    }
  });
  it("does not link a failed PDF upload and records the provider reason", async () => {
    fixture.formType = "new_home_order";
    fixture.upload.mockResolvedValue({ error: { message: "Storage unavailable" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(buildAndStorePdf(id)).rejects.toThrow("The PDF could not be stored");
      expect(fixture.update).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith("PDF storage upload failed", { submissionId: id, message: "Storage unavailable" });
    } finally { log.mockRestore(); }
  });
});