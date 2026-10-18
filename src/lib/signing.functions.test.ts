import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  row: { token: "fictional-token", kind: "customer_offsite", submission_id: "fixture", used_at: null as string | null, expires_at: "2099-01-01T00:00:00Z" },
  submission: { form_type: "reservation", status: "In Review (Offsite)", customer_signed_at: null as string | null, construction_signed_at: null },
  error: false,
}));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  let validate: ((data: unknown) => unknown) | undefined;
  const builder = { inputValidator: (fn: (data: unknown) => unknown) => { validate = fn; return builder; }, handler: (fn: (input: unknown) => unknown) => (input: { data: unknown }) => fn({ data: validate?.(input.data) }) };
  return builder;
} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (table: string) => {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: table === "signing_tokens" ? fixture.row : fixture.submission, error: fixture.error ? { message: "fixture" } : null }) };
  return q;
} } }));
import { getSigningContext } from "./signing.functions";
beforeEach(() => { fixture.row.kind = "customer_offsite"; fixture.row.used_at = null; fixture.row.expires_at = "2099-01-01T00:00:00Z"; fixture.submission.status = "In Review (Offsite)"; fixture.submission.customer_signed_at = null; fixture.error = false; });
const read = () => getSigningContext({ data: { token: "fictional-token" } });
describe("public signing context guards (mock database)", () => {
  it("rejects malformed expiry instead of accepting an unlimited link", async () => { fixture.row.expires_at = "invalid"; expect(await read()).toMatchObject({ error: expect.stringContaining("expired") }); });
  it("rejects already-used tokens", async () => { fixture.row.used_at = "2026-10-18T00:00:00Z"; expect(await read()).toMatchObject({ error: expect.stringContaining("already been signed") }); });
  it("rejects expired tokens", async () => { fixture.row.expires_at = "2020-01-01T00:00:00Z"; expect(await read()).toMatchObject({ error: expect.stringContaining("expired") }); });
  it("rejects unknown signing kinds", async () => { fixture.row.kind = "unknown"; expect(await read()).toMatchObject({ error: expect.stringContaining("not valid") }); });
  it("rejects unused tokens for an already-signed customer", async () => { fixture.submission.customer_signed_at = "2026-10-18T00:00:00Z"; expect(await read()).toMatchObject({ error: expect.stringContaining("already been signed") }); });
  it("rejects Completed forms", async () => { fixture.submission.status = "Completed"; expect(await read()).toMatchObject({ error: expect.stringContaining("completed") }); });
  it("database read failures do not masquerade as invalid links", async () => { fixture.error = true; await expect(read()).rejects.toThrow("could not be checked"); });
});