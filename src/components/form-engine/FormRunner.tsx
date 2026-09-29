import { useMemo, useState } from "react";
import { FieldInput } from "./FieldInput";
import { MANDATORY_HELPER, SIGNING_HELPER } from "@/lib/forms/registry";
import type { FieldDef, FormDef, FormValues, RenderContext } from "@/lib/forms/types";
import { SUBSUB_HEADINGS, isVisible } from "@/lib/forms/types";
import { validateAll, validateFields, type Errors } from "@/lib/forms/validate";
import { todayISO } from "@/lib/format";
import { toast } from "sonner";

interface Props {
  def: FormDef;
  ctx: RenderContext;
  initialValues: FormValues;
  parkLinks: Record<string, string>;
  /** Park Details rows (Settings) used for park autofill. */
  parks?: Array<Record<string, unknown>>;
  orderNumber?: string;
  /** Restrict rendering to one signature group (customer / construction pages). */
  onlyGroup?: "customerSignature" | "constructionSignature" | "directorSignature";
  submitLabel?: string;
  title?: string;
  onSaveDraft?: (values: FormValues) => Promise<void>;
  onSubmit: (values: FormValues) => Promise<void>;
  headerExtra?: React.ReactNode;
}

export function FormRunner({
  def,
  ctx,
  initialValues,
  parkLinks,
  parks = [],
  orderNumber,
  onlyGroup,
  submitLabel = "Submit Form",
  title,
  onSaveDraft,
  onSubmit,
  headerExtra,
}: Props) {
  const steps = useMemo(() => {
    if (!onlyGroup) {
      // Construction sign-off is its own page, never part of the staff form.
      return def.steps.filter(
        (s) =>
          !s.fields.every(
            (f) => f.group === "constructionSignature" || f.group === "directorSignature",
          ),
      );
    }
    return [
      {
        id: onlyGroup,
        heading: undefined,
        fields: def.steps.flatMap((s) => s.fields).filter((f) => f.group === onlyGroup),
      },
    ];
  }, [def, onlyGroup]);
  const onlyCustomerSignature = Boolean(onlyGroup);

  const [values, setValues] = useState<FormValues>(() => withDefaults(def, fillFromPark(def, initialValues, parks, false)));
  // Park is locked only when it was already set when the form opened (carried from the sale),
  // so a rep can still correct their own first choice on this form.
  const [lockedKeys] = useState<Set<string>>(() => {
    const out = new Set<string>();
    for (const f of def.steps.flatMap((s) => s.fields)) {
      if (f.lockIfSet && String(initialValues[f.key] ?? "").trim() !== "") out.add(f.key);
    }
    return out;
  });
  const [touchedKeys, setTouchedKeys] = useState<Set<string>>(new Set());
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const total = steps.length;
  // Fluent Forms truncates: 1/6 → 16%, 1/7 → 14%.
  const percent = Math.floor(((step + 1) / total) * 100);
  const current = steps[step] ?? steps[0]!;

  const setValue = (key: string, value: unknown) => {
    const computeFields = def.steps.flatMap((s) => s.fields).filter((f) => f.compute);
    const isComputed = computeFields.some((f) => f.key === key);
    // Overwriting an auto-calculated box stops it updating; clearing it resumes auto-calculation.
    const overridden = new Set(touchedKeys);
    if (isComputed) {
      if (String(value ?? "").trim() === "") overridden.delete(key);
      else overridden.add(key);
      setTouchedKeys(overridden);
    }
    setValues((prev) => {
      let next: FormValues = { ...prev, [key]: value };
      // Choosing a park autofills its details (rep can still overwrite).
      if (key === "park_name" || key === "park_name_confirm") {
        next = fillFromPark(def, next, parks, true, String(value ?? ""));
      }
      // Two passes so totals pick up freshly computed inputs.
      for (let pass = 0; pass < 2; pass++) {
        for (const f of computeFields) {
          if (overridden.has(f.key)) continue;
          if (f.key === key && String(value ?? "").trim() !== "") continue;
          next[f.key] = f.compute!(next);
        }
      }
      return next;
    });
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const stepFields = current.fields.filter((f) => isVisible(f, values, ctx));

  const goNext = () => {
    const stepErrors = onlyCustomerSignature
      ? {}
      : validateFields(current.fields, values, ctx);
    if (Object.keys(stepErrors).length) {
      setErrors(stepErrors);
      toast.error("Please complete every box on this step.");
      return;
    }
    setErrors({});
    setStep((s) => Math.min(s + 1, total - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goPrev = () => {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSave = async () => {
    if (!onSaveDraft) return;
    setBusy(true);
    try {
      await onSaveDraft(values);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    const allErrors = onlyCustomerSignature
      ? validateCustomerGroup(current.fields, values, ctx)
      : validateAll(def, values, ctx);
    if (Object.keys(allErrors).length) {
      setErrors(allErrors);
      if (!onlyCustomerSignature) {
        const idx = steps.findIndex((s) => s.fields.some((f) => allErrors[f.key]));
        setStep(idx < 0 ? 0 : idx);
      }
      toast.error("Some boxes still need completing before this form can be submitted.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setBusy(true);
    try {
      await onSubmit(values);
    } finally {
      setBusy(false);
    }
  };

  const isLast = step === total - 1;

  return (
    <div className="mx-auto w-full max-w-[1140px] px-4 py-10">
      <h2 className="ekos-form-title">{title ?? def.title}</h2>
      {orderNumber && (
        <p className="mt-2 text-center text-sm font-semibold text-gold">Order Number {orderNumber}</p>
      )}
      <p className="mt-3 text-center text-sm text-ekos-field-text">
        {onSaveDraft ? MANDATORY_HELPER : SIGNING_HELPER}
      </p>
      {headerExtra}

      {total > 1 && (
        <div className="mt-8">
          <p className="mb-2 font-heading text-[14.4px] font-bold text-brand">
            Step {step + 1} of {total} - Step {step + 1}
          </p>
          <div
            className="h-[21px] w-full overflow-hidden rounded-[4px] bg-ekos-track"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="flex h-full items-center justify-end rounded-l-[4px] bg-brand pr-2 text-[12px] leading-none text-brand-foreground transition-all"
              style={{ width: `${percent}%` }}
            >
              {percent}%
            </div>
          </div>
        </div>
      )}

      {current.heading && <h2 className="ekos-step-heading mt-10">{current.heading}</h2>}

      <div className="mt-8 space-y-6">
        {renderFields(stepFields, values, ctx, errors, parkLinks, setValue, busy, lockedKeys)}
      </div>

      <div className="mt-10 space-y-4">
        {onSaveDraft && (
          <div className="flex justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={handleSave}
              className="ekos-btn rounded-[7px] px-5 py-2 disabled:opacity-50"
            >
              Save &amp; Resume
            </button>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <div>
            {step > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={goPrev}
                className="ekos-btn px-[30px] py-[15px] disabled:opacity-50"
              >
                Previous
              </button>
            )}
          </div>
          <div>
            {!isLast ? (
              <button
                type="button"
                disabled={busy}
                onClick={goNext}
                className="ekos-btn px-[30px] py-[15px] disabled:opacity-50"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={handleSubmit}
                className="ekos-btn px-[25px] py-3 disabled:opacity-50"
              >
                {busy ? "Please wait…" : submitLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function renderFields(
  fields: FieldDef[],

  values: FormValues,
  ctx: RenderContext,
  errors: Errors,
  parkLinks: Record<string, string>,
  setValue: (k: string, v: unknown) => void,
  busy: boolean,
  lockedKeys: Set<string>,
) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i]!;
    const next = fields[i + 1];
    if (f.sectionLabel) {
      out.push(
        SUBSUB_HEADINGS.has(f.sectionLabel) ? (
          <h4 key={`${f.key}-section`} className="ekos-subsubheading">
            {f.sectionLabel}
          </h4>
        ) : (
          <h3 key={`${f.key}-section`} className="ekos-subheading">
            {f.sectionLabel}
          </h3>
        ),
      );
    }
    if (f.half && next?.half) {
      out.push(
        <div key={f.key} className="grid gap-6 sm:grid-cols-2">
          <FieldInput
            field={f}
            values={values}
            ctx={ctx}
            error={errors[f.key] ?? ""}
            parkLinks={parkLinks}
            onChange={setValue}
            disabled={busy}
            lockedKeys={lockedKeys}
          />
          <FieldInput
            field={next}
            values={values}
            ctx={ctx}
            error={errors[next.key] ?? ""}
            parkLinks={parkLinks}
            onChange={setValue}
            disabled={busy}
            lockedKeys={lockedKeys}
          />
        </div>,
      );
      i++;
      continue;
    }
    out.push(
      <FieldInput
        key={f.key}
        field={f}
        values={values}
        ctx={ctx}
        error={errors[f.key] ?? ""}
        parkLinks={parkLinks}
        onChange={setValue}
        disabled={busy}
            lockedKeys={lockedKeys}
      />,
    );
  }
  return out;
}

function validateCustomerGroup(
  fields: FormDef["steps"][number]["fields"],
  values: FormValues,
  ctx: RenderContext,
): Errors {
  const errors: Errors = {};
  for (const f of fields) {
    if (!isVisible(f, values, ctx) || f.type === "static" || f.type === "links") continue;
    const v = values[f.key];
    const empty =
      f.type === "checkbox"
        ? v !== true
        : v === undefined || v === null || String(v).trim() === "";
    if (empty) {
      errors[f.key] =
        f.type === "checkbox"
          ? "You must tick this box before signing."
          : f.type === "signature"
            ? "A signature is required."
            : "This box is required.";
    }
  }
  return errors;
}

function fillFromPark(
  def: FormDef,
  values: FormValues,
  parks: Array<Record<string, unknown>>,
  overwrite: boolean,
  parkName?: string,
): FormValues {
  const name = parkName ?? String(values["park_name"] ?? values["park_name_confirm"] ?? "");
  const park = parks.find((p) => p["name"] === name);
  if (!park) return values;
  const out: FormValues = { ...values };
  for (const f of def.steps.flatMap((s) => s.fields)) {
    if (!f.parkField) continue;
    const v = String(park[f.parkField] ?? "");
    const cur = out[f.key];
    if (overwrite || cur === undefined || cur === null || String(cur).trim() === "") {
      if (v || overwrite) out[f.key] = v;
    }
  }
  return out;
}

function withDefaults(def: FormDef, initial: FormValues): FormValues {
  const values: FormValues = { ...initial };
  for (const f of def.steps.flatMap((s) => s.fields)) {
    if (values[f.key] !== undefined && values[f.key] !== "") continue;
    if (f.defaultToday) values[f.key] = todayISO();
    else if (f.defaultValue) values[f.key] = f.defaultValue;
    else if (f.type === "multiselect" && values[f.key] === undefined) values[f.key] = [];
  }
  return values;
}
