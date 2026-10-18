import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ director: true, writes: [] as unknown[], writeError: false }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  let validate: ((data: unknown) => unknown) | undefined;
  const builder = { middleware: () => builder, inputValidator: (fn: (data: unknown) => unknown) => { validate = fn; return builder; }, handler: (fn: (input: unknown) => unknown) => (input: { data: unknown }) => fn({ data: validate?.(input.data), context: { userId: "fictional-director", claims: { email: "unverified@example.invalid" } } }) };
  return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { auth: { admin: { getUserById: async () => ({ data: { user: authFixture.user }, error: null }) } }, from: (table: string) => {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: fixture.director ? { role: "director" } : null }), update: (value: unknown) => { fixture.writes.push(value); return q; }, upsert: (value: unknown) => { fixture.writes.push(value); return q; }, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === "sales_people" ? [] : null, error: fixture.writeError ? { message: "fictional failure" } : null }).then(resolve) };
  return q;
} } }));
const authFixture = vi.hoisted(() => ({ user: { email: "sadie@ekosgroup.co.uk", email_confirmed_at: "2026-10-01" } as { email: string; email_confirmed_at: string | null } }));
import { saveSettings } from "./settings.functions";
const request = { parks: [], salesPeople: [], notifications: { sales_email: "", director_email: "", construction_email: "" }, driveFolderId: "", emailTestMode: { enabled: false, recipient: "emma.frew@breezeconnection.co.uk" } };
beforeEach(() => { fixture.director = true; fixture.writes = []; fixture.writeError = false; });
describe("settings action release safeguard", () => {
  it("a non-owner Director cannot switch email test mode off", async () => {
    authFixture.user = { email: "sadie@ekosgroup.co.uk", email_confirmed_at: "2026-10-01" };
    await expect(saveSettings({ data: request })).rejects.toThrow("Only the verified owner"); expect(fixture.writes).toEqual([]);
  });
  it("the owner's email without a confirmed sign-in is not accepted", async () => {
    authFixture.user = { email: "emma.frew@breezeconnection.co.uk", email_confirmed_at: null };
    await expect(saveSettings({ data: request })).rejects.toThrow("Only the verified owner");
  });
  it("even the verified owner cannot switch sending off before go-live approval", async () => {
    authFixture.user = { email: "Emma.Frew@breezeconnection.co.uk", email_confirmed_at: "2026-10-01" };
    await expect(saveSettings({ data: request })).rejects.toThrow("until go-live approval"); expect(fixture.writes).toEqual([]);
  });
  it("a failed settings write never reports success", async () => {
    fixture.writeError = true;
    await expect(saveSettings({ data: { ...request, emailTestMode: { ...request.emailTestMode, enabled: true } } })).rejects.toThrow("could not be saved");
    expect(fixture.writes).toHaveLength(1);
  });
  it("a rep cannot change email test settings", async () => {
    fixture.director = false;
    await expect(saveSettings({ data: request })).rejects.toThrow("Director access");
    expect(fixture.writes).toEqual([]);
  });
});