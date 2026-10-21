/** Amendment statuses that show the "Amendment in progress" tag. */
export const OPEN_AMENDMENT_STATUSES = ["Awaiting customer signature", "Awaiting approval"] as const;

export function isAmendmentOpen(status: string): boolean {
  return (OPEN_AMENDMENT_STATUSES as readonly string[]).includes(status);
}
