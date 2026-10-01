import { FORM_ORDER } from "@/lib/forms/registry";

type Sub = { sale_id: string; form_type: string; status: string };

/**
 * A sale's stage is the first of the 5 forms (from where the sale started)
 * that is not yet Completed. Review/signing steps within a form don't count
 * as separate stages. Returns "Completed" when every form is done.
 */
export function saleStage(saleId: string, subs: Sub[]): string | null {
  const mine = subs.filter((s) => s.sale_id === saleId);
  if (mine.length === 0) return null;
  const idx = mine.map((s) => FORM_ORDER.indexOf(s.form_type as never)).filter((i) => i >= 0);
  if (idx.length === 0) return null;
  const start = Math.min(...idx);
  for (const f of FORM_ORDER.slice(start)) {
    if (!mine.some((s) => s.form_type === f && s.status === "Completed")) return f;
  }
  return "Completed";
}
