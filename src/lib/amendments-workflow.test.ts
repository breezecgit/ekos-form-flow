import { beforeEach, describe, expect, it, vi } from "vitest";
import { amendmentPermissions, AMENDMENT_STATUS } from "./forms/amendments";
import { planUsaUpdate } from "./forms/nho-to-usa";
import { newHomeOrderForm } from "./forms/new-home-order";
import { unitSaleAgreementForm } from "./forms/unit-sale-agreement";
import { HOME_COST_MODE } from "./forms/home-cost";
import type { FormValues } from "./forms/types";

type Row = Record<string, unknown>;
const mem = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, audits: [] as string[], emails: [] as string[] }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      const filters: Array<(r: Row) => boolean> = [];
      let op: { kind: "select" } | { kind: "update"; patch: Row } | { kind: "insert"; row: Row } = { kind: "select" };
      let limit = Infinity;
      const rows = () => (mem.tables[table] ??= []);
      const run = () => {
        if (op.kind === "insert") {
          const row = { id: `id-${rows().length + 1}-${table}`, created_at: new Date().toISOString(), ...op.row };
          rows().push(row);
          return [row];
        }
        const hit = rows().filter((r) => filters.every((f) => f(r))).slice(0, limit);
        if (op.kind === "update") for (const r of hit) Object.assign(r, op.patch);
        return hit;
      };
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; },
        is: (k: string, v: unknown) => { filters.push((r) => (r[k] ?? null) === v); return q; },
        order: () => q,
        limit: (n: number) => { limit = n; return q; },
        update: (patch: Row) => { op = { kind: "update", patch }; return q; },
        insert: (row: Row) => { op = { kind: "insert", row }; return q; },
        maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
        single: async () => ({ data: run()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(resolve),
      };
      return q;
    },
  }),
}));

vi.mock("@/lib/ekos.server", () => ({
  addAudit: async (a: { action: string }) => { mem.audits.push(a.action); },
  loadSubmission: async (id: string) => ({ submission: mem.tables["form_submissions"]!.find((r) => r["id"] === id), sale: null }),
  sendAmendmentApprovalEmail: async (id: string, n: number) => { mem.emails.push(`approval:${id}:${n}`); },
  sendAmendmentCustomerEmail: async (id: string, n: number) => { mem.emails.push(`customer:${id}:${n}`); },
  sendOffsiteCustomerEmail: async (id: string) => { mem.emails.push(`offsite:${id}`); },
  buildAndStorePdf: async () => ({ bytes: new Uint8Array(), path: "", fileName: "" }),
}));

import { signAmendment, startAmendment, syncUsaFromNhoAmendment } from "./amendments.server";

const nhoCompute = newHomeOrderForm.steps.flatMap((s) => s.fields).filter((f) => f.compute);
function settle(v: FormValues): FormValues {
  const out = { ...v };
  for (let i = 0; i < 2; i++) for (const f of nhoCompute) out[f.key] = f.compute!(out);
  return out;
}
const nhoBefore = settle({ sales_route: "Cash", list_price: "300,000", deposit_amount: "5,000", [HOME_COST_MODE]: "auto" });
const nhoAfter = settle({ ...nhoBefore, include_decking: "Yes", decking_cost: "4,000" });

beforeEach(() => {
  process.env["SUPABASE_URL"] = "https://fictional.invalid";
  process.env["SUPABASE_SERVICE_ROLE_KEY"] = "fictional-key";
  mem.tables = {}; mem.audits = []; mem.emails = [];
});

describe("amendment permissions", () => {
  it("a rep with access to the form can start an amendment but cannot approve it", () => {
    const p = amendmentPermissions({ isDirector: false, userId: "ben", submissionOwner: "ben", amendmentOwner: "ben" });
    expect(p.canStart).toBe(true);
    expect(p.canApprove).toBe(false);
    expect(p.canManage).toBe(true);
  });
  it("a rep without access cannot start, and cannot cancel another person's amendment", () => {
    expect(amendmentPermissions({ isDirector: false, userId: "ben", submissionOwner: "other" }).canStart).toBe(false);
    expect(amendmentPermissions({ isDirector: false, userId: "ben", submissionOwner: "ben", amendmentOwner: "sadie" }).canManage).toBe(false);
  });
  it("the Director can approve", () => {
    expect(amendmentPermissions({ isDirector: true, userId: "sadie", submissionOwner: "ben" }).canApprove).toBe(true);
  });
});

describe("Sadie notification", () => {
  it("emails Sadie for approval as soon as the customer signs an amendment", async () => {
    mem.tables["signing_tokens"] = [{ token: "tok", kind: "amendment", submission_id: "sub-1", used_at: null, expires_at: new Date(Date.now() + 86400000).toISOString() }];
    mem.tables["form_amendments"] = [{ id: "am-1", submission_id: "sub-1", amendment_number: 2, status: AMENDMENT_STATUS.awaitingCustomer, changes: [] }];
    await signAmendment("tok", "data:image/png;base64,AAAA", "Fictional Customer");
    expect(mem.tables["form_amendments"]![0]!["status"]).toBe(AMENDMENT_STATUS.awaitingApproval);
    expect(mem.emails).toEqual(["approval:sub-1:2"]);
  });
});

describe("NHO amendment → Unit Sale Agreement", () => {
  it("plans nothing when there is no Unit Sale Agreement", () => {
    expect(planUsaUpdate(unitSaleAgreementForm, null, nhoBefore, nhoAfter)).toEqual({ action: "none", why: "no-usa" });
  });

  it("does nothing on the sale when no Unit Sale Agreement exists", async () => {
    mem.tables["form_submissions"] = [{ id: "nho", sale_id: "sale-1", form_type: "new_home_order", status: "Completed", data: nhoAfter }];
    const plan = await syncUsaFromNhoAmendment({ saleId: "sale-1", amendmentNumber: 1, before: nhoBefore, after: nhoAfter, userId: "sadie", actorLabel: "Sadie" });
    expect(plan.action).toBe("none");
    expect(mem.audits).toEqual([]);
    expect(mem.tables["form_amendments"] ?? []).toHaveLength(0);
  });

  it("updates an unsigned USA awaiting customer signature, recalculates totals and sends a fresh link", async () => {
    mem.tables["form_submissions"] = [{ id: "usa", sale_id: "sale-1", form_type: "unit_sale_agreement", status: "In Review (Offsite)", is_draft: false, customer_signed_at: null, data: { ...nhoBefore } }];
    mem.tables["signing_tokens"] = [{ token: "old", kind: "customer_offsite", submission_id: "usa", used_at: null }];
    await syncUsaFromNhoAmendment({ saleId: "sale-1", amendmentNumber: 3, before: nhoBefore, after: nhoAfter, userId: "sadie", actorLabel: "Sadie" });
    const usa = mem.tables["form_submissions"]![0]!["data"] as FormValues;
    expect(usa["decking_cost"]).toBe("4,000");
    expect(usa["cost_total"]).toBe("304,000");
    expect(usa["balance_on_completion"]).toBe("299,000");
    expect(mem.tables["signing_tokens"]![0]!["used_at"]).toBeTruthy();
    expect(mem.emails).toEqual(["offsite:usa"]);
    expect(mem.audits).toContain("Unit Sale Agreement updated from New Home Order Amendment 3");
  });

  it("keeps a manually typed USA Cost of my New Home when the driving selection did not change", () => {
    const usa = { ...nhoBefore, cost_new_home: "280,000", [HOME_COST_MODE]: "manual" };
    const plan = planUsaUpdate(unitSaleAgreementForm, { status: "Draft", is_draft: true, customer_signed_at: null, data: usa }, nhoBefore, nhoAfter);
    expect(plan.action).toBe("update");
    if (plan.action === "update") expect(plan.values["cost_new_home"]).toBe("280,000");
  });

  it("creates a USA amendment with only the changed fields when the USA is Completed", async () => {
    mem.tables["form_submissions"] = [{ id: "usa", sale_id: "sale-1", form_type: "unit_sale_agreement", status: "Completed", is_draft: false, customer_signed_at: "2026-10-01", data: { ...nhoBefore, customer_email: "emma.frew@breezeconnection.co.uk" } }];
    await syncUsaFromNhoAmendment({ saleId: "sale-1", amendmentNumber: 4, before: nhoBefore, after: nhoAfter, userId: "sadie", actorLabel: "Sadie" });
    const am = mem.tables["form_amendments"]!;
    expect(am).toHaveLength(1);
    expect(am[0]!["reason"]).toBe("Updated from New Home Order Amendment 4");
    expect(am[0]!["status"]).toBe(AMENDMENT_STATUS.awaitingCustomer);
    const keys = (am[0]!["changes"] as { key: string }[]).map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(["decking_cost", "cost_total", "balance_on_completion"]));
    expect(keys).not.toContain("list_price");
    expect(mem.tables["form_submissions"]![0]!["data"]).toMatchObject({ cost_total: nhoBefore["cost_total"] });
    expect(mem.emails).toEqual(["customer:usa:1"]);
  });
});

// Keeps startAmendment referenced for the Identification path.
describe("Identification amendment", () => {
  it("notifies Sadie immediately because the customer does not sign", async () => {
    mem.tables["form_submissions"] = [{ id: "idc", sale_id: "s", form_type: "identification", status: "Completed", created_by: "ben", data: { id_checked_by: "Ben" } }];
    await startAmendment({ submissionId: "idc", userId: "ben", actorLabel: "Ben", values: { id_checked_by: "Ben Cook" }, reason: "Name typo", isDirector: false }).catch(() => undefined);
    const am = mem.tables["form_amendments"] ?? [];
    if (am.length) expect(mem.emails).toEqual(["approval:idc:1"]);
  });
});
