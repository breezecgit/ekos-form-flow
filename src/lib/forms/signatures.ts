import type { FieldDef, FormDef, FormValues, RenderContext } from "./types";
import { isVisible } from "./types";
import { FORM_ORDER } from "./registry";

/** Client-safe signature rules shared by amendments, disapproval and sale/form deletion. */

const allFields = (def: FormDef): FieldDef[] => def.steps.flatMap((s) => s.fields);

/** Date boxes that belong to a signature (customer_one_signature → customer_one_date, rep_signature → rep_sign_date). */
function signatureDateKeys(sigKey: string): string[] {
  const base = sigKey.replace(/_signature$/, "");
  return [`${base}_date`, `${base}_sign_date`];
}

/** Every signature box on the form plus its date box. */
export function signatureKeys(def: FormDef, onlyCustomer = false): string[] {
  const keys = new Set(allFields(def).map((f) => f.key));
  const out: string[] = [];
  for (const f of allFields(def)) {
    if (f.type !== "signature") continue;
    if (onlyCustomer && f.group !== "customerSignature") continue;
    out.push(f.key);
    for (const d of signatureDateKeys(f.key)) if (keys.has(d)) out.push(d);
  }
  return out;
}

/** Disapproval: everyone (customer, rep, witnesses, Director) must sign again. Names and answers stay. */
export function clearAllSignatures(def: FormDef, values: FormValues): FormValues {
  const out: FormValues = { ...values };
  for (const k of signatureKeys(def)) out[k] = "";
  return out;
}

/** Amend screen: the customer's earlier signatures are taken off so a live amendment is signed afresh. */
export function clearCustomerSignatures(def: FormDef, values: FormValues): FormValues {
  const out: FormValues = { ...values };
  for (const k of signatureKeys(def, true)) out[k] = "";
  return out;
}

export type AmendmentSigningRoute = "none" | "live" | "offsite";

/** "Customer Signing Live" (status In Review) signs on this device; otherwise the customer is emailed. */
export function amendmentSigningRoute(formType: string, values: FormValues): AmendmentSigningRoute {
  if (formType === "identification") return "none";
  return values["status"] === "In Review" ? "live" : "offsite";
}

const REP: RenderContext = { mode: "rep", isDirector: true };

/**
 * Builds the signature part of an amendment. Live: the visible customer signatures must all be new
 * and are kept. Otherwise every signature box keeps the original signed value.
 */
export function amendmentSignatures(def: FormDef, before: FormValues, edited: FormValues, route: AmendmentSigningRoute): FormValues {
  const out: FormValues = { ...edited };
  const customerKeys = new Set(signatureKeys(def, true));
  for (const k of signatureKeys(def)) {
    if (route === "live" && customerKeys.has(k)) continue;
    out[k] = before[k] ?? "";
  }
  if (route !== "live") out["status"] = before["status"] ?? out["status"];
  if (route === "live") {
    const sigs = allFields(def).filter((f) => f.type === "signature" && f.group === "customerSignature" && isVisible(f, out, REP));
    if (!sigs.length) throw new Error("There is no customer signature box on this form to sign live.");
    for (const f of sigs) {
      const v = String(out[f.key] ?? "");
      if (!v.startsWith("data:image/")) throw new Error(`Please ask the customer to sign "${f.label ?? f.key}" before saving.`);
      if (v === String(before[f.key] ?? "")) throw new Error(`"${f.label ?? f.key}" must be signed again for this amendment.`);
    }
  }
  return out;
}

/** The first visible customer signature, recorded on the amendment record and its PDF. */
export function firstCustomerSignature(def: FormDef, values: FormValues): { signature: string; name: string } | null {
  for (const f of allFields(def)) {
    if (f.type !== "signature" || f.group !== "customerSignature" || !isVisible(f, values, REP)) continue;
    const v = String(values[f.key] ?? "");
    if (!v) continue;
    const base = f.key.replace(/_signature$/, "");
    return { signature: v, name: String(values[`${base}_name`] ?? values["customer_name"] ?? "") };
  }
  return null;
}

/** Deleting some forms: warn when a later form of the sale, filled in from a ticked one, is being kept. */
export function deletionWarnings(existing: string[], ticked: string[]): string[] {
  const order = FORM_ORDER as readonly string[];
  const keep = existing.filter((f) => !ticked.includes(f));
  const out: string[] = [];
  for (const t of ticked) {
    const later = keep.filter((k) => order.indexOf(k) > order.indexOf(t));
    if (later.length) out.push(`${t}:${later.join(",")}`);
  }
  return out;
}
