/**
 * Pure permission rules shared by the server actions, kept separate so they
 * can be unit-tested without a database.
 */
import { z } from "zod";

export const SUBMIT_STATUSES = ["In Review", "In Review (Offsite)", "Completed"] as const;
export type SubmitStatus = (typeof SUBMIT_STATUSES)[number];

/** Only these statuses may be requested on submit; everything else is refused. */
export function parseSubmitStatus(raw: unknown): SubmitStatus {
  const v = String(raw ?? "In Review");
  if (!(SUBMIT_STATUSES as readonly string[]).includes(v)) throw new Error("That status is not allowed.");
  return v as SubmitStatus;
}

/** Completed forms are locked: only the Director may change them. */
export function assertEditable(status: string, isDirector: boolean) {
  if (status === "Completed" && !isDirector) {
    throw new Error("This form is completed and can only be changed by the Director.");
  }
  if (!isDirector && status !== "Draft" && status !== "Disapproved") {
    throw new Error("This submitted form is read-only. Please ask the Director for corrections.");
  }
}

/** Submitted forms remain read-only for reps; the Director can open the editor. */
export function canOpenFormEditor(status: string, isDraft: boolean, isDirector: boolean): boolean {
  if (status === "Completed") return isDirector;
  return isDirector || isDraft || status === "Disapproved";
}

const emailSchema = z.string().trim().email().max(255);

/** Off-site signing needs exactly one valid customer email address. */
export function assertCustomerEmail(raw: unknown): string {
  const r = emailSchema.safeParse(raw);
  if (!r.success) throw new Error("Please enter one valid customer email address before sending for off-site signing.");
  return r.data;
}

export type ResendKind = "review" | "offsite" | "completion" | "construction" | "director";

/** Which resend buttons a non-director may use, given the form's current status. */
export function canResend(kind: ResendKind, status: string, isDirector: boolean): boolean {
  if (isDirector) return true;
  if (kind === "review") return status === "In Review" || status === "In Review (Offsite)";
  if (kind === "offsite") return status === "In Review (Offsite)";
  return false;
}

/** The single verified owner allowed to switch email test mode off (confirmed by the administrator). */
export const EMAIL_TEST_MODE_OWNER = "emma.frew@breezeconnection.co.uk";

/** Owner identity comes from the confirmed sign-in record, never from editable profile fields. */
export function isVerifiedOwner(user: { email?: string | null; email_confirmed_at?: string | null } | null | undefined): boolean {
  return Boolean(user?.email_confirmed_at) && (user?.email ?? "").trim().toLowerCase() === EMAIL_TEST_MODE_OWNER;
}
