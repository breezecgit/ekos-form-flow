import { afterEach, expect, it, vi } from "vitest";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
afterEach(() => vi.unstubAllEnvs());
it("scheduled backup rejects anonymous callers", async () => {
  vi.stubEnv("LOVABLE_CRON_SECRET", "synthetic-secret");
  expect((await authenticateCronRequest(new Request("https://example.invalid")))?.status).toBe(401);
});
it("scheduled backup rejects incorrect credentials", async () => {
  vi.stubEnv("LOVABLE_CRON_SECRET", "synthetic-secret");
  expect((await authenticateCronRequest(new Request("https://example.invalid", { headers: { authorization: "Bearer wrong" } })))?.status).toBe(401);
});
it("scheduled backup accepts managed credentials", async () => {
  vi.stubEnv("LOVABLE_CRON_SECRET", "synthetic-secret");
  expect(await authenticateCronRequest(new Request("https://example.invalid", { headers: { authorization: "Bearer synthetic-secret" } }))).toBeNull();
});