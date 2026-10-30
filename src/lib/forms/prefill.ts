import type { FormDef } from "./types";
import { prepareHomeCost } from "./home-cost";

type SaleLike = { park_name: string; customer_name: string; customer_email: string; customer_phone: string; sales_person: string };
type EarlierRow = { form_type: string; data: unknown; is_draft?: boolean | null; submitted_at?: string | null; updated_at?: string | null; created_at?: string | null };

const isBlankValue = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
const stamp = (r: EarlierRow) => Date.parse(r.submitted_at ?? r.updated_at ?? r.created_at ?? "") || 0;

/** Earlier rows in apply order: drafts only fill gaps, then submitted forms oldest→newest so the latest submitted value wins. */
export function orderEarlierRows<T extends EarlierRow>(others: T[]): T[] {
  const drafts = others.filter((r) => r.is_draft).sort((a, b) => stamp(a) - stamp(b));
  const submitted = others.filter((r) => !r.is_draft).sort((a, b) => stamp(a) - stamp(b));
  return [...drafts, ...submitted];
}

/**
 * Re-sync an open later-form draft: empty boxes take the latest value, and boxes still holding a
 * value that an older earlier form supplied (stale carry-over) move to the latest value. Anything
 * else the user typed is kept.
 */
export function refreshDraftFromPrefill(current: Record<string, unknown>, prefill: Record<string, unknown>, others: EarlierRow[]): { data: Record<string, unknown>; changed: boolean } {
  const cur = { ...current };
  let changed = false;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const [k, v] of Object.entries(prefill)) {
    const c = cur[k];
    if (same(c, v)) continue;
    const stale = !isBlankValue(c) && others.some((r) => same(((r.data ?? {}) as Record<string, unknown>)[k], c));
    if (isBlankValue(c) || stale) {
      cur[k] = v;
      changed = true;
    }
  }
  return { data: cur, changed };
}

/** Pure cross-form prefill: earlier forms of the same sale fill matching keys on a new form. */
export function prefillFromEarlierForms(def: FormDef, formType: string, sale: SaleLike, others: EarlierRow[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  // Latest submitted value wins for every carried field; drafts only fill gaps.
  for (const row of orderEarlierRows(others)) {
    for (const [k, v] of Object.entries((row.data ?? {}) as Record<string, unknown>)) if (!isBlankValue(v)) merged[k] = v;
  }

  const out: Record<string, unknown> = {};
  for (const f of def.steps.flatMap((s) => s.fields)) {
    if (["signature", "checkbox", "static", "links"].includes(f.type)) continue;
    if (f.group || f.key === "status" || f.key.startsWith("rep_")) continue;
    if (f.compute) continue; // auto-calculated boxes recalculate on load from the filled values
    const v = merged[f.key];
    if (v === undefined || v === null || v === "") continue;
    // Later stages should prompt for a confirmed date, not inherit an earlier TBC.
    // Omit the value rather than clear it so an existing saved TBC is untouched.
    if (f.key === "handover_date" && v === "TBC" && ["new_home_order", "unit_sale_agreement"].includes(formType)) continue;
    if ((f.type === "select" || f.type === "radio") && !(f.options ?? []).some((o) => o.value === v)) continue;
    if (f.type === "multiselect") {
      const allowed = new Set((f.options ?? []).map((o) => o.value));
      const list = Array.isArray(v) ? (v as string[]).filter((x) => allowed.has(x)) : [];
      if (list.length) out[f.key] = list;
      continue;
    }
    out[f.key] = v;
  }
  if (sale.park_name) out["park_name"] = sale.park_name;
  for (const k of ["customer_name", "customer_email", "customer_phone", "sales_person"] as const) {
    if (!out[k] && sale[k]) out[k] = sale[k];
  }
  // Second customer name carries over (Reservation stores it as customer_two_name).
  const secondName = merged["customer_two_name"] || merged["customer_two_id_name"];
  if (secondName) {
    const fields = def.steps.flatMap((s) => s.fields);
    for (const k of ["customer_two_id_name", "customer_two_name"]) {
      if (!out[k] && fields.some((f) => f.key === k)) out[k] = secondName;
    }
    if (!out["second_customer"] && fields.some((f) => f.key === "second_customer")) out["second_customer"] = "Yes";
  }
  if (formType === "written_statement") {
    if (sale.park_name) out["park_name_confirm"] = sale.park_name;
    if (!out["party_customer_name"]) out["party_customer_name"] = out["customer_name"] || sale.customer_name || undefined;
    if (!out["party_customer_name"]) delete out["party_customer_name"];
  }
  return prepareHomeCost(formType, out);
}
