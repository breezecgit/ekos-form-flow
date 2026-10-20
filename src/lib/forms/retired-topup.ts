import type { FormValues } from "./types";
import { computeBalanceOnCompletion, computeCustomerPayment } from "./new-home-order";

/** Retire legacy Topup answers without touching unrelated forms or manual totals. */
export function withoutRetiredTopup(formType: string, values: FormValues): FormValues {
  if (!["new_home_order", "unit_sale_agreement"].includes(formType) ||
      !Object.prototype.hasOwnProperty.call(values, "customer_topup")) return values;
  const next = { ...values };
  delete next["customer_topup"];
  if (values["sales_route"] === "QMP Assisted Move") {
    next["balance_on_completion"] = computeBalanceOnCompletion(next);
    next["customer_payment_required"] = computeCustomerPayment(next);
  }
  return next;
}