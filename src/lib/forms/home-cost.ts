import { parseMoney } from "@/lib/format";
import { computeTotalCost } from "./reservation";
import type { FormDef, FormValues } from "./types";

export const HOME_COST_MODE = "_home_cost_mode";
export const hasHomeCost = (type: string) => ["new_home_order", "unit_sale_agreement"].includes(type);
export const computeHomeCost = computeTotalCost;

/** Unmarked saved values are ambiguous: preserve them unless pristine prefill is proven. */
export function prepareHomeCost(type: string, values: FormValues, pristinePrefill?: unknown): FormValues {
  if (!hasHomeCost(type)) return values;
  const next = { ...values };
  if (next[HOME_COST_MODE] !== "auto" && next[HOME_COST_MODE] !== "manual") {
    const blank = String(next["cost_new_home"] ?? "").trim() === "";
    const copied = parseMoney(pristinePrefill) !== null && parseMoney(pristinePrefill) === parseMoney(next["cost_new_home"]);
    next[HOME_COST_MODE] = blank || copied ? "auto" : "manual";
  }
  if (next[HOME_COST_MODE] === "auto") next["cost_new_home"] = computeHomeCost(next);
  return next;
}

/** Repair downstream automatic figures only when their old value matches the old formula. */
export function prepareHomeCostDraft(def: FormDef, values: FormValues, pristinePrefill?: unknown): FormValues {
  const next = prepareHomeCost(def.type, values, pristinePrefill);
  if (!hasHomeCost(def.type) || next[HOME_COST_MODE] !== "auto") return next;
  for (const key of ["cost_total", "balance_on_completion", "customer_payment_required"]) {
    const field = def.steps.flatMap(step => step.fields).find(f => f.key === key);
    if (!field?.compute) continue;
    const previous = values[key];
    const blank = String(previous ?? "").trim() === "";
    if (blank || parseMoney(previous) === parseMoney(field.compute(values))) next[key] = field.compute(next);
  }
  return next;
}