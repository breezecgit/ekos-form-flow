import { beforeEach, expect, it, vi } from "vitest";
import { STATEMENT_V1, STATEMENT_V2 } from "./forms/written-statement-text";
const state = vi.hoisted(() => ({ version: undefined as number | undefined }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => {
  const q = { select: () => q, order: () => q, limit: () => q,
    eq: (key: string, value: unknown) => { if (key === "version") state.version = Number(value); return q; },
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: state.version === 99 ? [] : [{ version: state.version ?? 2, sections: {} }], error: null }).then(resolve) };
  return q;
} } }));
import { getStatementTemplate } from "./statement.server";
beforeEach(() => { state.version = undefined; });
it("new submissions receive version 2", async () => { expect(await getStatementTemplate()).toEqual({ version: 2, sections: STATEMENT_V2 }); });
it("version-one pins retain the original wording", async () => { expect(await getStatementTemplate(1)).toEqual({ version: 1, sections: STATEMENT_V1 }); });
it("a missing pin never silently switches to current wording", async () => { await expect(getStatementTemplate(99)).rejects.toThrow("version"); });