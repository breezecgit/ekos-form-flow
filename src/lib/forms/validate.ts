import type { FormDef, FormValues, RenderContext, FieldDef } from "./types";
import { isRequired, isVisible } from "./types";

export type Errors = Record<string, string>;

function isEmpty(f: FieldDef, value: unknown): boolean {
  if (f.type === "checkbox") return value !== true;
  if (f.type === "multiselect") return !Array.isArray(value) || value.length === 0;
  return value === undefined || value === null || String(value).trim() === "";
}

export function validateFields(
  fields: FieldDef[],
  values: FormValues,
  ctx: RenderContext,
): Errors {
  const errors: Errors = {};
  for (const f of fields) {
    if (!isVisible(f, values, ctx)) continue;
    if (!isRequired(f)) continue;
    if (isEmpty(f, values[f.key])) {
      errors[f.key] =
        f.type === "checkbox"
          ? "You must tick this box to continue."
          : f.type === "signature"
            ? "A signature is required."
            : "This box is required – type TBC if you're waiting on information.";
      continue;
    }
    if (f.type === "email") {
      const v = String(values[f.key]).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errors[f.key] = "Enter a valid email address.";
    }
  }
  return errors;
}

export function validateStep(
  def: FormDef,
  stepIndex: number,
  values: FormValues,
  ctx: RenderContext,
): Errors {
  return validateFields(def.steps[stepIndex]?.fields ?? [], values, ctx);
}

export function validateAll(def: FormDef, values: FormValues, ctx: RenderContext): Errors {
  return validateFields(def.steps.flatMap((s) => s.fields), values, ctx);
}

export function firstStepWithError(
  def: FormDef,
  errors: Errors,
): number {
  for (let i = 0; i < def.steps.length; i++) {
    if (def.steps[i]!.fields.some((f) => errors[f.key])) return i;
  }
  return 0;
}
