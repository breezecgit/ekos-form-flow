import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ director: true, writes: [] as unknown[], writeError: false }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  let validate: ((data: unknown) => unknown) | undefined;
  const builder = { middleware: () => builder, inputValidator: (fn: (data: unknown) => unknown) => { validate = fn; return builder; }, handler: (fn: (input: unknown) => unknown) => (input: { data: unknown }) => fn({ data: validate?.(input.data), context: { userId: "fictional-director", claims: { email: "unverified@example.invalid" } } }) };
  return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (table: string) => {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: fixture.director ? { role: "director" } : null }), update: (value: unknown) => { fixture.writes.push(value); return q; }, upsert: (value: unknown) => { fixture.writes.push(value); return q; }, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === "sales_people" ? [] : null, error: fixture.writeError ? { message: "fictional failure" } : null }).then(resolve) };
  return q;
} } }));
import { saveSettings } from "./settings.functions";
const request = { parks: [], salesPeople: [], notifications: { sales_email: "", director_email: "", construction_email: "" }, driveFolderId: "", emailTestMode: { enabled: false, recipient: "emma.frew@breezeconnection.co.uk" } };
beforeEach(() => { fixture.director = true; fixture.writes = []; fixture.writeError = false; });
describe("settings action release safeguard", () => {
  it("a failed settings write never reports success", async () => {
    fixture.writeError = true;
    await expect(saveSettings({ data: { ...request, emailTestMode: { ...request.emailTestMode, enabled: true } } })).rejects.toThrow("could not be saved");
    expect(fixture.writes).toHaveLength(1);
  });
  it("an authenticated Director cannot disable email test mode before owner verification", async () => {
    await expect(saveSettings({ data: request })).rejects.toThrow("must stay ON");
    expect(fixture.writes).toEqual([]);
  });
  it("a rep cannot change email test settings", async () => {
    fixture.director = false;
    await expect(saveSettings({ data: request })).rejects.toThrow("Director access");
    expect(fixture.writes).toEqual([]);
  });
});