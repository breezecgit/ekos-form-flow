import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ mode: {} as Record<string, unknown>, logs: [] as Record<string, unknown>[], readError: false, throws: false }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (table: string) => {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => { if (fixture.throws) throw new Error("fixture"); return { data: { value: fixture.mode }, error: fixture.readError ? { message: "fixture" } : null }; }, insert: async (row: Record<string, unknown>) => { fixture.logs.push(row); return { error: null }; } };
  return q;
} } }));
import { getEmailTestMode, parseRecipients, sendEmail } from "./email.server";
beforeEach(() => { fixture.mode = {}; fixture.logs = []; fixture.readError = false; fixture.throws = false; vi.restoreAllMocks(); vi.stubEnv("LOVABLE_API_KEY", "fictional-key"); vi.stubEnv("RESEND_API_KEY", "fictional-key"); });
describe("central email test routing (mock provider, no emails)", () => {
  it("a direct false setting cannot enable customer delivery while owner verification is pending", async () => {
    fixture.mode = { enabled: "false", recipient: "attacker@example.invalid" };
    const network = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await sendEmail({ to: ["fictional@example.invalid"], subject: "Fictional", html: "", template: "fixture" });
    expect(JSON.parse(String(network.mock.calls[0]?.[1]?.body)).to).toEqual(["emma.frew@breezeconnection.co.uk", "sadie@ekosgroup.co.uk"]);
    expect(fixture.logs[0]?.["test_mode"]).toBe(true);
  });
  it.each(["returned", "thrown"])("%s setting failure retains approved test recipients", async (failure) => {
    fixture.mode = { enabled: "false", recipient: "fictional@example.invalid" };
    fixture.readError = failure === "returned"; fixture.throws = failure === "thrown";
    expect(await getEmailTestMode()).toEqual({ enabled: true, recipient: "emma.frew@breezeconnection.co.uk, sadie@ekosgroup.co.uk", recipients: ["emma.frew@breezeconnection.co.uk", "sadie@ekosgroup.co.uk"] });
  });
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
  it("passes the completion retry key to the provider request", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await sendEmail({ to: ["emma.frew@breezeconnection.co.uk"], subject: "Fictional", html: "", template: "completion", idempotencyKey: "completion-fictional-document" });
    expect(new Headers(network.mock.calls[0]?.[1]?.headers).get("Idempotency-Key")).toBe("completion-fictional-document");
  });
});
import { testModeRecipients } from "./email.server";
describe("test-mode customer inbox", () => {
  it("delivers to Sadie's personal test inbox case-insensitively, strips others", () => {
    expect(testModeRecipients(["emma.frew@breezeconnection.co.uk"], ["Sadie.Deveraux@Hotmail.co.uk", "real@customer.com"]))
      .toEqual(["emma.frew@breezeconnection.co.uk", "Sadie.Deveraux@Hotmail.co.uk"]);
  });
});
