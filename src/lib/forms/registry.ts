import type { FormDef } from "./types";
import { reservationForm } from "./reservation";
import { identificationForm } from "./identification";
import { newHomeOrderForm } from "./new-home-order";
import { unitSaleAgreementForm } from "./unit-sale-agreement";
import { writtenStatementForm } from "./written-statement";

/** Every form in the sales pack, in the order it is completed. */
export const FORM_ORDER = [
  "reservation",
  "identification",
  "new_home_order",
  "unit_sale_agreement",
  "written_statement",
] as const;

export const FORM_TITLES: Record<string, string> = {
  reservation: "Customer Reservation Form",
  identification: "Identification Checks",
  new_home_order: "New Home Order Form",
  unit_sale_agreement: "Unit Sale Agreement & Welcome Pack",
  written_statement: "Your Written Statement",
};

const registry: Record<string, FormDef> = {
  reservation: reservationForm,
  identification: identificationForm,
  new_home_order: newHomeOrderForm,
  unit_sale_agreement: unitSaleAgreementForm,
  written_statement: writtenStatementForm,
};

export function getForm(type: string): FormDef {
  const def = registry[type];
  if (!def) throw new Error(`Unknown form type: ${type}`);
  return def;
}

export function hasForm(type: string): boolean {
  return Boolean(registry[type]);
}

export const MANDATORY_HELPER =
  "All boxes are mandatory – type TBC if you're waiting on information, or use Save & Resume to finish later.";

export const SIGNING_HELPER =
  "All boxes are mandatory – please complete every box before submitting.";
