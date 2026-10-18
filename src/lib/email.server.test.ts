import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ mode: {} as Record<string, unknown>, logs: [] as Record<string, unknown>[] }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (table: string) => {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { value: fixture.mode } }), insert: async (row: Record<string, unknown>) => { fixture.logs.push(row); return { error: null }; } };
  return q;
} } }));
import { getEmailTestMode, parseRecipients, sendEmail } from "./email.server";
beforeEach(() => { fixture.mode = {}; fixture.logs = []; vi.restoreAllMocks(); vi.stubEnv("LOVABLE_API_KEY", "fictional-key"); vi.stubEnv("RESEND_API_KEY", "fictional-key"); });
describe("central email test routing (mock provider, no emails)", () => {
  it("malformed recipients are rejected and addresses deduplicated", () => {
    expect(parseRecipients("bad@;emma.frew@breezeconnection.co.uk;EMMA.FREW@breezeconnection.co.uk")).toEqual(["emma.frew@breezeconnection.co.uk"]);
  });
  it("missing setting fails safe to approved Emma and Sadie recipients", async () => {
    expect(await getEmailTestMode()).toMatchObject({ enabled: true, recipients: ["emma.frew@breezeconnection.co.uk", "sadie@ekosgroup.co.uk"] });
  });
  it("all intended recipients and CCs are redirected centrally", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await sendEmail({ to: ["fictional@example.invalid"], cc: ["fictional-cc@example.invalid"], subject: "Fictional", html: "", template: "fixture" });
    const body = JSON.parse(String(network.mock.calls[0]?.[1]?.body));
    expect(body.to).toEqual(["emma.frew@breezeconnection.co.uk", "sadie@ekosgroup.co.uk"]);
    expect(body.cc).toBeUndefined();
    expect(fixture.logs[0]).toMatchObject({ test_mode: true, intended_to: ["fictional@example.invalid"], cc_addresses: [] });
  });
  it("provider rejection is not reported as a successful send", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("fixture failure", { status: 503 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await sendEmail({ to: ["fictional@example.invalid"], subject: "Fictional", html: "", template: "fixture" })).ok).toBe(false);
    expect(fixture.logs[0]?.["status"]).toBe("failed");
  });
});