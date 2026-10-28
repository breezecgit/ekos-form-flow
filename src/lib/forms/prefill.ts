import type { FormDef } from "./types";
import { prepareHomeCost } from "./home-cost";

type SaleLike = { park_name: string; customer_name: string; customer_email: string; customer_phone: string; sales_person: string };
type EarlierRow = { form_type: string; data: unknown; is_draft?: boolean | null };

/** Pure cross-form prefill: earlier forms of the same sale fill matching keys on a new form. */
export function prefillFromEarlierForms(def: FormDef, formType: string, sale: SaleLike, others: EarlierRow[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  const isBlank = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
  // Reservation Form answers win; other earlier forms only fill gaps.
  const reservation = others.find((r) => r.form_type === "reservation");
  // Submitted forms win over drafts; the Reservation Form wins over everything.
  const rest = others.filter((r) => r !== reservation) as Array<(typeof others)[number] & { is_draft?: boolean }>;
  const ordered = [...rest.filter((r) => r.is_draft), ...rest.filter((r) => !r.is_draft)];
  for (const row of [...ordered, ...(reservation ? [reservation] : [])]) {
    for (const [k, v] of Object.entries((row.data ?? {}) as Record<string, unknown>)) if (!isBlank(v)) merged[k] = v;
  }

  const out: Record<string, unknown> = {};
  for (const f of def.steps.flatMap((s) => s.fields)) {
    if (["signature", "checkbox", "static", "links"].includes(f.type)) continue;
    if (f.group || f.key === "status" || f.key.startsWith("rep_")) continue;
    if (f.compute) continue; // auto-calculated boxes recalculate on load from the filled values
    const v = merged[f.key];
    if (v === undefined || v === null || v === "") continue;
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
