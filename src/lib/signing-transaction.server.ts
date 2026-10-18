/**
 * Atomic signing + durable side effects (prepared; activated only after the
 * reviewed `consume_signing_token` RPC is approved and applied).
 * The RPC locks the token and submission rows, validates state, merges values,
 * consumes the token and writes the audit entry in one transaction, and
 * enqueues idempotent jobs keyed by `<token>:<job>`.
 */
export type SigningKind = "customer_offsite" | "construction" | "director";

const MESSAGES: Record<string, string> = {
  token_invalid: "This signing link is not valid.",
  token_used: "This form has already been signed.",
  token_expired: "This signing link has expired. Please contact EKOS Group.",
  form_completed: "This form has already been completed.",
  customer_first: "The customer must sign before the Director and witness.",
};

/** Maps database exception codes to safe signer messages; anything else is generic. */
export function signingErrorMessage(raw: string | undefined | null): string {
  const code = Object.keys(MESSAGES).find((k) => (raw ?? "").includes(k));
  return code ? MESSAGES[code]! : "Your signing details could not be saved. Please contact EKOS before trying again.";
}

/** Jobs enqueued after a successful signing, by link kind. */
export function jobsFor(kind: SigningKind, opts: { directorWitness: boolean; needsConstruction: boolean; constructionSigned: boolean }): string[] {
  if (kind === "director") return ["pdf", "completion"];
  if (kind === "construction") return ["pdf", "drive", "email:review_required"];
  const next = opts.directorWitness
    ? "email:director_witness"
    : opts.needsConstruction && !opts.constructionSigned
      ? "email:construction"
      : "email:review_required";
  return ["pdf", "drive", "email:signature_complete", next];
}

type Db = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

export async function consumeSigningToken(db: Db, token: string, values: Record<string, unknown>, actorLabel: string, jobs: string[]) {
  const { data, error } = await db.rpc("consume_signing_token", { p_token: token, p_values: values, p_actor_label: actorLabel, p_jobs: jobs });
  if (error) return { ok: false as const, error: signingErrorMessage(error.message) };
  return { ok: true as const, result: data as { submission_id: string; kind: SigningKind; from_status: string } };
}

export interface Job { id: string; submission_id: string; kind: string; status: string; attempts: number }
export interface JobStore {
  claim(id: string): Promise<boolean>; // pending|failed -> running; false if already claimed/done
  finish(id: string): Promise<void>;
  fail(id: string, error: string): Promise<void>;
}
export const MAX_ATTEMPTS = 5;

/** Runs one job at most once successfully; failures stay retryable and never re-run completed work. */
export async function runJob(job: Job, store: JobStore, handlers: Record<string, (submissionId: string) => Promise<void>>) {
  if (job.status === "done" || job.attempts >= MAX_ATTEMPTS) return "skipped" as const;
  const handler = handlers[job.kind];
  if (!handler) { await store.fail(job.id, "unknown job"); return "failed" as const; }
  if (!(await store.claim(job.id))) return "skipped" as const;
  try {
    await handler(job.submission_id);
    await store.finish(job.id);
    return "done" as const;
  } catch (e) {
    await store.fail(job.id, String((e as Error).message ?? e).slice(0, 500));
    return "failed" as const;
  }
}
