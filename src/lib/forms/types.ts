/**
 * Shared form definition model.
 *
 * ONE definition per form drives BOTH the web form and the PDF, so the PDF can
 * never drift from the page. Add a field here and it appears in both.
 */

export type FormValues = Record<string, unknown>;

export interface RenderContext {
  /** 'rep' = staff filling the form, 'offsite' = customer signing page. */
  mode: "rep" | "offsite";
  isDirector: boolean;
}

export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "tel"
  | "date"
  | "money"
  | "select"
  | "multiselect"
  | "radio"
  | "checkbox"
  | "signature"
  | "file"
  | "static"
  | "links";

export interface OptionDef {
  value: string;
  label?: string;
  /** Hidden/disabled for reps — director only (e.g. "Completed"). */
  directorOnly?: boolean;
}

export type ContentBlock =
  | { kind: "heading"; text: string }
  | { kind: "subheading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "note"; text: string }
  | { kind: "bullets"; items: string[] };

export interface LinkDef {
  label: string;
  url?: string;
  /** Resolved per park from Settings when set. */
  parkKey?: "brochure_url" | "site_licence_url" | "park_rules_url";
  settingsKey?: string;
}

export interface FieldDef {
  key: string;
  label?: string;
  type: FieldType;
  options?: OptionDef[];
  placeholder?: string;
  /** Small grey helper line under the label. */
  help?: string;
  /** Defaults to true for every input field — "no empty boxes". */
  required?: boolean;
  /** Render two fields side by side. */
  half?: boolean;
  /** Date fields that default to today. */
  defaultToday?: boolean;
  /** Sub-heading rendered above this field. */
  sectionLabel?: string;
  /** Static content blocks (type: 'static'). */
  content?: ContentBlock[];
  /** Link list (type: 'links'). */
  links?: LinkDef[];
  /** Conditional visibility. Hidden fields are never required and never printed. */
  showIf?: (values: FormValues, ctx: RenderContext) => boolean;
  /** Auto-calculated value (rep may overwrite). */
  compute?: (values: FormValues) => string;
  /** Marks the customer-signature group used by the off-site signing page. */
  group?: "customerSignature";
  /** Label shown in the PDF when different from the on-screen label. */
  pdfLabel?: string;
}

export interface StepDef {
  id: string;
  heading?: string;
  fields: FieldDef[];
}

export interface FormDef {
  /** Stable key stored on the submission. */
  type: string;
  title: string;
  steps: StepDef[];
}

export const INPUT_TYPES: FieldType[] = [
  "text",
  "textarea",
  "email",
  "tel",
  "date",
  "money",
  "select",
  "multiselect",
  "radio",
  "checkbox",
  "signature",
  "file",
];

export function isInput(f: FieldDef): boolean {
  return INPUT_TYPES.includes(f.type);
}

export function isVisible(f: FieldDef, values: FormValues, ctx: RenderContext): boolean {
  return f.showIf ? !!f.showIf(values, ctx) : true;
}

export function isRequired(f: FieldDef): boolean {
  return isInput(f) && f.required !== false;
}

export function visibleFields(
  step: StepDef,
  values: FormValues,
  ctx: RenderContext,
): FieldDef[] {
  return step.fields.filter((f) => isVisible(f, values, ctx));
}

export function allFields(def: FormDef): FieldDef[] {
  return def.steps.flatMap((s) => s.fields);
}

export function findField(def: FormDef, key: string): FieldDef | undefined {
  return allFields(def).find((f) => f.key === key);
}
