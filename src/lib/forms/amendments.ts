import type { FieldDef, FormDef, FormValues, RenderContext, UploadedFile } from "./types";
import { isVisible } from "./types";
import { formatDate, formatMoney } from "@/lib/format";
import { HOME_COST_MODE, hasHomeCost } from "./home-cost";

/** Client-safe amendment rules shared by the amend screen, server actions and tests. */
export const AMENDMENT_STATUS = {
  awaitingCustomer: "Awaiting customer signature",
  awaitingApproval: "Awaiting approval",
  completed: "Completed",
  cancelled: "Cancelled",
} as const;
export const OPEN_AMENDMENT_STATUSES: string[] = [AMENDMENT_STATUS.awaitingCustomer, AMENDMENT_STATUS.awaitingApproval];

export interface AmendmentChange {
  key: string;
  label: string;
  previous: string;
  next: string;
}

const WORKFLOW_KEYS = new Set(["status_guide", "status"]);
const CTX: RenderContext = { mode: "director", isDirector: true };

/** Fields that can appear in a change list: answers only, never signatures, hints or workflow status. */
export function amendableFields(def: FormDef): FieldDef[] {
  const fields = def.steps.flatMap((s) => s.fields);
  const signatureMeta = new Set<string>();
  for (const f of fields) {
    if (f.type !== "signature") continue;
    const base = f.key.replace(/_signature$/, "");
    for (const k of [`${base}_name`, `${base}_date`, `${base}_sign_date`]) signatureMeta.add(k);
  }
  return fields.filter((f) =>
    !["signature", "static", "links"].includes(f.type) &&
    !f.group &&
    !WORKFLOW_KEYS.has(f.key) &&
    !signatureMeta.has(f.key));
}

function norm(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) {
    return JSON.stringify(v.map((x) => (x && typeof x === "object" ? (x as UploadedFile).path ?? JSON.stringify(x) : String(x))));
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v).trim();
}

export function amendmentDisplayValue(f: FieldDef, v: unknown): string {
  if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) return "—";
  if (f.type === "money") return formatMoney(v);
  if (f.type === "date") return formatDate(v);
  if (f.type === "checkbox") return v === true ? "Yes" : "No";
  if (f.type === "file") return Array.isArray(v) ? (v as UploadedFile[]).map((x) => x?.name ?? "file").join(", ") : "—";
  const label = (x: unknown) => f.options?.find((o) => o.value === x)?.label ?? String(x);
  if (Array.isArray(v)) return v.map(label).join(", ");
  return label(v);
}

/**
 * Auto-calculated totals follow their inputs unless staff typed a different figure into the total itself.
 * A total that was manual on the signed form (not equal to its formula) stays manual.
 */
export function applyKnockOnTotals(def: FormDef, before: FormValues, after: FormValues): FormValues {
  const out: FormValues = { ...after };
  const compute = def.steps.flatMap((s) => s.fields).filter((f) => f.compute);
  for (let pass = 0; pass < 2; pass++) {
    for (const f of compute) {
      if (norm(after[f.key]) !== norm(before[f.key])) continue; // edited directly in this amendment
      if (f.key === "cost_new_home" && hasHomeCost(def.type)) {
        if (out[HOME_COST_MODE] === "manual") continue;
      } else {
        const wasAuto = norm(before[f.key]) === "" || norm(before[f.key]) === norm(f.compute!(before));
        if (!wasAuto) continue;
      }
      out[f.key] = f.compute!(out);
    }
  }
  return out;
}

/** Field-by-field differences (label, previous, new) including knock-on totals. */
export function buildChangeList(def: FormDef, before: FormValues, after: FormValues): AmendmentChange[] {
  const changes: AmendmentChange[] = [];
  for (const f of amendableFields(def)) {
    if (!isVisible(f, before, CTX) && !isVisible(f, after, CTX)) continue;
    if (norm(before[f.key]) === norm(after[f.key])) continue;
    changes.push({
      key: f.key,
      label: f.pdfLabel ?? f.label ?? f.sectionLabel ?? f.key,
      previous: amendmentDisplayValue(f, before[f.key]),
      next: amendmentDisplayValue(f, after[f.key]),
    });
  }
  return changes;
}

export const NO_CHANGES_MESSAGE = "Nothing has changed from the signed form. Change at least one answer before saving an amendment.";

/** Applies knock-on totals, builds the change list and blocks an empty amendment. */
export function prepareAmendment(def: FormDef, before: FormValues, edited: FormValues) {
  const after = applyKnockOnTotals(def, before, edited);
  const changes = buildChangeList(def, before, after);
  if (!changes.length) throw new Error(NO_CHANGES_MESSAGE);
  return { after, changes };
}
