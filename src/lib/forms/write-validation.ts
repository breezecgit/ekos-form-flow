import { z } from "zod";
import { allFields, isInput, type FieldDef, type FormDef, type FormValues, type RenderContext } from "./types";
import { validateAll, validateFields } from "./validate";
import { HOME_COST_MODE, hasHomeCost } from "./home-cost";
import { withoutRetiredAnswers } from "./retired-answers";

// Transport limits, not business limits; uploads use their separate bounded endpoint.
export const MAX_FORM_BYTES = 8_000_000;
const MAX_SIGNATURE_CHARS = 1_400_000;
const fileSchema = z.object({ id: z.string().uuid(), name: z.string().min(1).max(200), path: z.string().min(1).max(500), mime: z.enum(["image/png", "image/jpeg", "application/pdf"]) }).strict();

function invalid(f: FieldDef): never {
  throw new Error(`Please check ${f.label ?? "the form answer"}.`);
}

function checkValue(f: FieldDef, value: unknown, existingValue?: unknown) {
  if (value === undefined || value === null || value === "") return;
  if (f.type === "checkbox") { if (typeof value !== "boolean") invalid(f); return; }
  if (f.type === "file") {
    if (!Array.isArray(value) || value.length > 100 || value.some((v) => !fileSchema.safeParse(v).success)) invalid(f);
    return;
  }
  if (f.type === "multiselect") {
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || !(f.options ?? []).some((o) => o.value === v))) invalid(f);
    return;
  }
  if (typeof value !== "string") invalid(f);
  if (f.type === "signature") {
    if (value.length > MAX_SIGNATURE_CHARS || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) invalid(f);
    let bytes: string;
    try { bytes = atob(value.slice("data:image/png;base64,".length)); } catch { return invalid(f); }
    if (bytes.length < 45 || bytes.slice(0, 8) !== "\x89PNG\r\n\x1a\n" || bytes.slice(12, 16) !== "IHDR" || !bytes.includes("IDAT") || !bytes.includes("IEND")) invalid(f);
    return;
  }
  if (value.length > 100_000) invalid(f);
  if (f.type === "money" && !/^tbc$/i.test(value.trim()) && (!/^-?(?:\d+(?:,\d{3})*)(?:\.\d{1,2})?$/.test(value.replace(/^£\s*/, "")) || !Number.isFinite(Number(value.replace(/^£\s*/, "").replace(/,/g, ""))))) invalid(f);
  if (f.type === "email" && !z.string().trim().email().max(255).safeParse(value).success) invalid(f);
  if (f.type === "date") {
    if (f.allowTbc && value === "TBC") return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(f);
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) invalid(f);
  }
  // A value that is no longer offered (e.g. a retired sales person) is still
  // valid while it stays unchanged from the previously saved answer.
  if ((f.type === "radio" || f.type === "select") && !(f.options ?? []).some((o) => o.value === value) && value !== existingValue) invalid(f);
}

export function checkPayloadSize(values: FormValues) {
  let text: string;
  try { text = JSON.stringify(values); } catch { throw new Error("The form could not be read."); }
  if (new TextEncoder().encode(text).length > MAX_FORM_BYTES) throw new Error("The form is too large to save. Please contact EKOS.");
}

/** Drafts allow missing values; submission uses the same visible required rules as the webpage. */
export function validateFormWrite(def: FormDef, values: FormValues, ctx: RenderContext, stage: "draft" | "submit", existing: FormValues = {}) {
  checkPayloadSize(values);
  values = withoutRetiredAnswers(def.type, values);
  existing = withoutRetiredAnswers(def.type, existing);
  const fields = new Map(allFields(def).filter(isInput).map((f) => [f.key, f]));
  for (const [key, value] of Object.entries(values)) {
    if (key === HOME_COST_MODE && hasHomeCost(def.type)) {
      if (value !== "auto" && value !== "manual") throw new Error("Invalid home cost calculation mode.");
      continue;
    }
    if (["order_number", "statement_version"].includes(key)) {
      if (value !== existing[key]) throw new Error("Protected form details cannot be changed.");
      continue;
    }
    // Identification submits to review without a status control.
    if (key === "status" && def.type === "identification") { if (value !== "In Review") throw new Error("That status is not allowed."); continue; }
    const f = fields.get(key);
    if (!f) throw new Error("Unexpected form details were supplied.");
    if (!ctx.isDirector && f.options?.some((option) => option.directorOnly && option.value === value) && value !== existing[key]) throw new Error("Only the Director can select that option.");
    checkValue(f, value, existing[key]);
  }
  if (stage === "submit" && Object.keys(validateAll(def, values, ctx)).length) throw new Error("Please complete every required box before submitting.");
}

/** Public signers cannot write another group's fields or alter echoed context. */
export function validateSigningWrite(def: FormDef, values: FormValues, existing: FormValues, ctx: RenderContext, group: FieldDef["group"], orderNumber: string) {
  checkPayloadSize(values);
  values = withoutRetiredAnswers(def.type, values);
  existing = withoutRetiredAnswers(def.type, existing);
  const fields = allFields(def).filter((f) => f.group === group && isInput(f));
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const patch: FormValues = {};
  const echo: FormValues = { ...existing, order_number: orderNumber };
  for (const [key, value] of Object.entries(values)) {
    const f = byKey.get(key);
    if (f) {
      if (f.showIf && !f.showIf({ ...existing, ...values }, ctx)) throw new Error("Only the visible signing details can be changed through this link.");
      checkValue(f, value, existing[key]); patch[key] = value; continue;
    }
    if (!["order_number", "customer_name", "customer_email", "park_name", "status"].includes(key) || value !== echo[key]) throw new Error("Only the signing details can be changed through this link.");
  }
  if (Object.keys(validateFields(fields, { ...existing, ...patch }, ctx)).length) throw new Error("Please complete every required signing box.");
  return patch;
}