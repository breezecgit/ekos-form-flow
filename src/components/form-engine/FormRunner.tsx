import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldInput } from "./FieldInput";
import { MANDATORY_HELPER } from "@/lib/forms/registry";
import type { FormDef, FormValues, RenderContext } from "@/lib/forms/types";
import { isVisible } from "@/lib/forms/types";
import { validateAll, validateStep, firstStepWithError, type Errors } from "@/lib/forms/validate";
import { todayISO } from "@/lib/format";
import { toast } from "sonner";

interface Props {
  def: FormDef;
  ctx: RenderContext;
  initialValues: FormValues;
  parkLinks: Record<string, string>;
  orderNumber?: string;
  /** Restrict rendering to the customer-signature group (off-site page). */
  onlyCustomerSignature?: boolean;
  submitLabel?: string;
  onSaveDraft?: (values: FormValues) => Promise<void>;
  onSubmit: (values: FormValues) => Promise<void>;
  headerExtra?: React.ReactNode;
}

export function FormRunner({
  def,
  ctx,
  initialValues,
  parkLinks,
  orderNumber,
  onlyCustomerSignature,
  submitLabel = "Submit Form",
  onSaveDraft,
  onSubmit,
  headerExtra,
}: Props) {
  const steps = useMemo(() => {
    if (!onlyCustomerSignature) return def.steps;
    return [
      {
        id: "customer-signature",
        heading: undefined,
        fields: def.steps
          .flatMap((s) => s.fields)
          .filter((f) => f.group === "customerSignature"),
      },
    ];
  }, [def, onlyCustomerSignature]);

  const [values, setValues] = useState<FormValues>(() => withDefaults(def, initialValues));
  const [touchedKeys, setTouchedKeys] = useState<Set<string>>(new Set());
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const total = steps.length;
  const percent = Math.round(((step + 1) / total) * 100);
  const current = steps[step];

  const setValue = (key: string, value: unknown) => {
    setTouchedKeys((prev) => new Set(prev).add(key));
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      // Auto-calculated fields refresh until the rep overwrites them.
      for (const f of def.steps.flatMap((s) => s.fields)) {
        if (f.compute && !touchedKeys.has(f.key) && f.key !== key) {
          const computed = f.compute(next);
          if (computed !== "") next[f.key] = computed;
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
      : validateStep(def, step, values, ctx);
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
      if (!onlyCustomerSignature) setStep(firstStepWithError(def, allErrors));
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
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm sm:p-10">
        <h1 className="ekos-title text-3xl sm:text-4xl">{def.title}</h1>
        {orderNumber && (
          <p className="mt-2 text-center text-sm font-semibold text-gold">
            Order Number {orderNumber}
          </p>
        )}
        <p className="mt-3 text-center text-sm text-muted-foreground">{MANDATORY_HELPER}</p>
        {headerExtra}

        {total > 1 && (
          <div className="mt-6">
            <p className="mb-2 text-sm font-semibold text-brand">
              Step {step + 1} of {total} – {percent}%
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-brand transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        )}

        {current.heading && (
          <h2 className="ekos-title mt-8 text-2xl">{current.heading}</h2>
        )}

        <div className="mt-8 space-y-6">
          {renderFields(stepFields, values, ctx, errors, parkLinks, setValue, busy)}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
          <div>
            {onSaveDraft && (
              <Button type="button" variant="resume" disabled={busy} onClick={handleSave}>
                Save &amp; Resume
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            {step > 0 && (
              <Button type="button" variant="outline" disabled={busy} onClick={goPrev}>
                Previous
              </Button>
            )}
            {!isLast ? (
              <Button type="button" variant="gold" disabled={busy} onClick={goNext}>
                Next
              </Button>
            ) : (
              <Button type="button" variant="gold" disabled={busy} onClick={handleSubmit}>
                {busy ? "Please wait…" : submitLabel}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function renderFields(
  fields: ReturnType<typeof Array.prototype.filter> extends never ? never : FormDef["steps"][number]["fields"],
  values: FormValues,
  ctx: RenderContext,
  errors: Errors,
  parkLinks: Record<string, string>,
  setValue: (k: string, v: unknown) => void,
  busy: boolean,
) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const next = fields[i + 1];
    if (f.sectionLabel) {
      out.push(
        <h3 key={`${f.key}-section`} className="font-heading text-xl font-semibold text-brand">
          {f.sectionLabel}
        </h3>,
      );
    }
    if (f.half && next?.half) {
      out.push(
        <div key={f.key} className="grid gap-6 sm:grid-cols-2">
          <FieldInput
            field={f}
            values={values}
            ctx={ctx}
            error={errors[f.key]}
            parkLinks={parkLinks}
            onChange={setValue}
            disabled={busy}
          />
          <FieldInput
            field={next}
            values={values}
            ctx={ctx}
            error={errors[next.key]}
            parkLinks={parkLinks}
            onChange={setValue}
            disabled={busy}
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
        error={errors[f.key]}
        parkLinks={parkLinks}
        onChange={setValue}
        disabled={busy}
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
    if (!isVisible(f, values, ctx)) continue;
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

function withDefaults(def: FormDef, initial: FormValues): FormValues {
  const values: FormValues = { ...initial };
  for (const f of def.steps.flatMap((s) => s.fields)) {
    if (values[f.key] !== undefined && values[f.key] !== "") continue;
    if (f.defaultToday) values[f.key] = todayISO();
    else if (f.type === "multiselect" && values[f.key] === undefined) values[f.key] = [];
  }
  return values;
}
