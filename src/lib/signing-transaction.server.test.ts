import { describe, expect, it, vi } from "vitest";
import { consumeSigningToken, jobsFor, runJob, signingErrorMessage, type JobStore } from "./signing-transaction.server";

describe("atomic signing wrapper (mocked RPC)", () => {
  it("maps reused token to already-signed", async () => {
    const db = { rpc: async () => ({ data: null, error: { message: "token_used" } }) };
    expect(await consumeSigningToken(db, "t".repeat(12), {}, "A", [])).toEqual({ ok: false, error: "This form has already been signed." });
  });
  it("never leaks raw database errors", () => {
    expect(signingErrorMessage("relation secret_table does not exist")).not.toContain("secret_table");
  });
  it("director link cannot precede the customer", () => {
    expect(signingErrorMessage("ERROR: customer_first")).toContain("customer must sign");
  });
  it("customer signing on director-witness forms queues the director email, not construction", () => {
    expect(jobsFor("customer_offsite", { directorWitness: true, needsConstruction: true, constructionSigned: false })).toContain("email:director_witness");
  });
});

function store(claimable = true): JobStore & { calls: string[] } {
  const calls: string[] = [];
  return { calls, claim: async () => { calls.push("claim"); return claimable; }, finish: async () => { calls.push("finish"); }, fail: async (_i, e) => { calls.push(`fail:${e}`); } };
}
const job = { id: "j", submission_id: "s", kind: "pdf", status: "pending", attempts: 0 };

describe("idempotent job runner (mocked store)", () => {
  it("completed jobs are never re-run", async () => {
    const h = vi.fn(async () => {});
    expect(await runJob({ ...job, status: "done" }, store(), { pdf: h })).toBe("skipped");
    expect(h).not.toHaveBeenCalled();
  });
  it("a job already claimed by another worker is skipped", async () => {
    const h = vi.fn(async () => {});
    expect(await runJob(job, store(false), { pdf: h })).toBe("skipped");
    expect(h).not.toHaveBeenCalled();
  });
  it("failures are recorded and left retryable", async () => {
    const s = store();
    expect(await runJob(job, s, { pdf: async () => { throw new Error("boom"); } })).toBe("failed");
    expect(s.calls).toEqual(["claim", "fail:boom"]);
  });
  it("stops retrying after the attempt limit", async () => {
    expect(await runJob({ ...job, attempts: 5 }, store(), { pdf: async () => {} })).toBe("skipped");
  });
});
