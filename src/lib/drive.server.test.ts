import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ value: {} as Record<string, unknown>, error: null as null | { message: string } }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { value: fixture.value }, error: fixture.error }) };
  return q;
} } }));
import { createDriveFolder, driveWritesEnabled, uploadPdfToDrive } from "./drive.server";
beforeEach(() => { fixture.value = {}; fixture.error = null; vi.restoreAllMocks(); });
describe("Drive fail-safe write gate", () => {
  it("missing enable flag denies folder creation without contacting Drive", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    expect(await createDriveFolder("Fictional", "configured-folder")).toBeNull();
    expect(network).not.toHaveBeenCalled();
  });
  it("configured destination alone never enables PDF uploads", async () => {
    fixture.value = { folder_id: "configured-folder" };
    const network = vi.spyOn(globalThis, "fetch");
    expect(await uploadPdfToDrive("fictional.pdf", "configured-folder", new Uint8Array())).toBeNull();
    expect(network).not.toHaveBeenCalled();
  });
  it("unreadable settings fail closed", async () => {
    fixture.value = { enabled: "true" }; fixture.error = { message: "fixture failure" };
    expect(await driveWritesEnabled()).toBe(false);
  });
  it("explicit false denies writes", async () => { fixture.value = { enabled: "false" }; expect(await driveWritesEnabled()).toBe(false); });
  it("only explicit true enables the gate (no external write executed)", async () => { fixture.value = { enabled: "true" }; expect(await driveWritesEnabled()).toBe(true); });
});