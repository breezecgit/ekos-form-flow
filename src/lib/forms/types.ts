/**
 * Shared form definition model.
 *
 * ONE definition per form drives BOTH the web form and the PDF, so the PDF can
 * never drift from the page. Add a field here and it appears in both.
 */

export type FormValues = Record<string, unknown>;

export interface RenderContext {
  /** 'rep' = staff filling the form, 'offsite' = customer signing page. */
  mode: "rep" | "offsite" | "construction" | "director";
  /** Needed for file uploads on the staff form. */
  submissionId?: string;
  isDirector: boolean;
  /** Versioned legal wording (Written Statement) keyed by templateKey. */
  templates?: Record<string, string>;
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
  /** Photo tile shown above the radio (key into the choice-image set; "blank" = empty tile). */
  image?: "brick_composite" | "composite" | "brick_metal" | "up_over" | "blank";
}

export type ContentBlock =
  | { kind: "heading"; text: string }
  | { kind: "subheading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "note"; text: string }
  | { kind: "bullets"; items: string[] }
  /** Collapsible "+" row on the page (closed by default); printed expanded in the PDF. */
  | { kind: "accordion"; title: string; blocks: ContentBlock[] };

/** Smaller sub-sub headings (Futura 16px bold) – everything else is a 20px sub-heading. */
export const SUBSUB_HEADINGS = new Set([
  "Choosing my Steps and Handrails",
  "Decking",
  "Omar Extras",
  "Upgrading my Steps",
  "Shed Base and Electrics",
  "Decking Base Extension",
]);

export interface LinkDef {
  label: string;
  url?: string;
  /** Resolved per park from Settings when set. */
  parkKey?: "brochure_url" | "site_licence_url" | "park_rules_url" | "welcome_pack_url";
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
  /** Pre-selected value for new forms. */
  defaultValue?: string;
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
  group?: "customerSignature" | "constructionSignature" | "directorSignature";
  /** Static text pulled from the versioned statement template. */
  templateKey?: string;
  /** Grouped PDF layout: print this field in the final signatures section. */
  pdfSection?: "signatures";
  /** Never printed in the PDF (on-screen instructions only). */
  pdfHide?: boolean;
  /** Read-only once it has a value (park carried over from the sale). */
  lockIfSet?: boolean;
  /** Park Details column (Settings) that autofills this field when the park is chosen. */
  parkField?: string;
  /** Label shown in the PDF when different from the on-screen label. */
  pdfLabel?: string;
}

export interface UploadedFile {
  id: string;
  name: string;
  path: string;
  mime: string;
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
  /** Title on the off-site customer signing page. */
  signingTitle?: string;
  /** Director & witness signing page title. */
  directorSigningTitle?: string;
  /** "grouped" = statement text first, then answers + attachments, then all signatures. */
  pdfLayout?: "grouped";
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
