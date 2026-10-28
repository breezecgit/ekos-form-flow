import type { FormValues } from "./types";
import { withoutRetiredTopup } from "./retired-topup";

/** Form-specific retirement; never alter another form's acceptance answers. */
export function withoutRetiredAnswers(formType: string, values: FormValues): FormValues {
  const normalized = withoutRetiredTopup(formType, values);
  if (formType !== "written_statement" ||
      !["accept_terms", "accept_extras", "party_customer_name"].some((key) => Object.prototype.hasOwnProperty.call(normalized, key))) return normalized;
  const next = { ...normalized };
  delete next["accept_terms"];
  delete next["accept_extras"];
  delete next["party_customer_name"];
  return next;
}