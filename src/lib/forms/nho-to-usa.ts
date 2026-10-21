import type { FormDef, FormValues } from "./types";
import { applyKnockOnTotals } from "./amendments";
import { HOME_COST_MODE } from "./home-cost";

/** Client-safe rules for carrying an approved New Home Order amendment onto the Unit Sale Agreement. */

const TOTAL_KEYS = new Set(["cost_total", "balance_on_completion", "customer_payment_required"]);
const SKIP_TYPES = new Set(["signature", "static", "links"]);

function norm(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v).trim();
}

/**
 * Applies the NHO amendment's changed answers to the Unit Sale Agreement values.
 * Calculated boxes are not copied: they recalculate from the carried answers under the
 * normal amendment override rules – unless Sadie typed a figure into that box on the NHO
 * amendment and the USA still matched the signed NHO figure.
 */
export function carryNhoChangesToUsa(usaDef: FormDef, nhoBefore: FormValues, nhoAfter: FormValues, usaCurrent: FormValues): FormValues {
  const fields = usaDef.steps.flatMap((s) => s.fields)
    .filter((f) => !SKIP_TYPES.has(f.type) && !f.group && f.key !== "status" && f.key !== "status_guide" && !f.key.startsWith("rep_"));
  const edited: FormValues = { ...usaCurrent };
  for (const f of fields) {
    if (norm(nhoBefore[f.key]) === norm(nhoAfter[f.key])) continue;
    if (f.compute) {
      if (TOTAL_KEYS.has(f.key)) continue;
      const typedOnNho = norm(nhoAfter[f.key]) !== norm(f.compute(nhoAfter));
      const usaInSync = norm(usaCurrent[f.key]) === norm(nhoBefore[f.key]);
      if (!typedOnNho || !usaInSync) continue;
      if (f.key === "cost_new_home") edited[HOME_COST_MODE] = "manual";
    }
    const v = nhoAfter[f.key];
    if (v === undefined) delete edited[f.key];
    else edited[f.key] = v;
  }
  return applyKnockOnTotals(usaDef, usaCurrent, edited);
}

export interface UsaState {
  status: string;
  is_draft: boolean;
  customer_signed_at: string | null;
  data: FormValues;
}

export type UsaPlan =
  | { action: "none"; why: "no-usa" | "no-change" | "awaiting-approval" }
  | { action: "update"; values: FormValues; resendSigningLink: boolean }
  | { action: "amend"; values: FormValues };

/** Decides what happens to the Unit Sale Agreement when an NHO amendment is approved. */
export function planUsaUpdate(usaDef: FormDef, usa: UsaState | null, nhoBefore: FormValues, nhoAfter: FormValues): UsaPlan {
  if (!usa) return { action: "none", why: "no-usa" };
  const values = carryNhoChangesToUsa(usaDef, nhoBefore, nhoAfter, usa.data ?? {});
  const changed = Object.keys({ ...values, ...usa.data }).some((k) => norm(values[k]) !== norm(usa.data?.[k]));
  if (!changed) return { action: "none", why: "no-change" };
  if (usa.status === "Completed") return { action: "amend", values };
  const awaitingCustomer = usa.status === "In Review (Offsite)" && !usa.customer_signed_at;
  const unsigned = usa.is_draft || usa.status === "Draft" || usa.status === "Disapproved" || awaitingCustomer;
  if (!unsigned) return { action: "none", why: "awaiting-approval" };
  return { action: "update", values, resendSigningLink: awaitingCustomer };
}
