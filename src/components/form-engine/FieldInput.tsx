import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SignaturePad } from "@/components/SignaturePad";
import { TERMS_URL } from "@/lib/forms/reservation";
import type { FieldDef, FormValues, RenderContext } from "@/lib/forms/types";
import { isRequired } from "@/lib/forms/types";
import { ChevronDown } from "lucide-react";

interface Props {
  field: FieldDef;
  values: FormValues;
  ctx: RenderContext;
  error?: string | undefined;
  disabled?: boolean | undefined;
  parkLinks: Record<string, string>;
  onChange: (key: string, value: unknown) => void;
}

export function FieldInput({
  field,
  values,
  ctx,
  error,
  disabled,
  parkLinks,
  onChange,
}: Props) {
  const value = values[field.key];
  const set = (v: unknown) => onChange(field.key, v);

  if (field.type === "static") {
    return <StaticContent field={field} />;
  }

  if (field.type === "links") {
    return (
      <ul className="space-y-3">
        {(field.links ?? []).map((l) => {
          const url = l.parkKey ? parkLinks[l.parkKey] : l.url;
          return (
            <li key={l.label}>
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-brand underline underline-offset-4 hover:text-gold"
                >
                  {l.label}
                </a>
              ) : (
                <span className="font-semibold text-brand">
                  {l.label}{" "}
                  <span className="font-normal text-muted-foreground">(link to follow)</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  const label = (
    <label className="ekos-label" htmlFor={field.key}>
      {field.label}
      {isRequired(field) && <span className="ml-1 text-destructive">*</span>}
    </label>
  );

  let control: React.ReactNode = null;

  switch (field.type) {
    case "textarea":
      control = (
        <Textarea
          id={field.key}
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(e) => set(e.target.value)}
          rows={4}
        />
      );
      break;
    case "money":
      control = (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-brand">
            £
          </span>
          <Input
            id={field.key}
            className="pl-7"
            inputMode="text"
            value={String(value ?? "")}
            disabled={disabled}
            placeholder="0 or TBC"
            onChange={(e) => set(e.target.value)}
          />
        </div>
      );
      break;
    case "select":
      control = (
        <Select
          value={String(value ?? "")}
          disabled={disabled ?? false}
          onValueChange={(v) => set(v)}
        >
          <SelectTrigger id={field.key}>
            <SelectValue placeholder={field.placeholder ?? "Please select"} />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((o) => (
              <SelectItem
                key={o.value}
                value={o.value}
                disabled={Boolean(o.directorOnly) && !ctx.isDirector}
              >
                {o.label ?? o.value}
                {o.directorOnly && !ctx.isDirector ? " (Director only)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
      break;
    case "multiselect": {
      const selected: string[] = Array.isArray(value) ? (value as string[]) : [];
      control = (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              className="w-full justify-between font-normal"
            >
              <span className={selected.length ? "" : "text-muted-foreground"}>
                {selected.length ? selected.join(", ") : (field.placeholder ?? "Please select")}
              </span>
              <ChevronDown className="h-4 w-4 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-2" align="start">
            {(field.options ?? []).map((o) => {
              const checked = selected.includes(o.value);
              return (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-start gap-2 rounded-sm p-2 hover:bg-secondary"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(c) =>
                      set(
                        c
                          ? [...selected, o.value]
                          : selected.filter((s) => s !== o.value),
                      )
                    }
                  />
                  <span className="text-sm">{o.label ?? o.value}</span>
                </label>
              );
            })}
          </PopoverContent>
        </Popover>
      );
      break;
    }
    case "radio":
      control = (
        <div className="flex gap-6">
          {(field.options ?? []).map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name={field.key}
                value={o.value}
                disabled={disabled}
                checked={value === o.value}
                onChange={() => set(o.value)}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              {o.label ?? o.value}
            </label>
          ))}
        </div>
      );
      break;
    case "checkbox":
      return (
        <div>
          <label className="flex cursor-pointer items-start gap-3">
            <Checkbox
              checked={value === true}
              disabled={disabled}
              onCheckedChange={(c) => set(c === true)}
            />
            <span className="text-sm leading-relaxed text-foreground">
              {field.key === "accept_terms" ? (
                <>
                  I have read and agree to the{" "}
                  <a
                    href={TERMS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold underline underline-offset-4"
                  >
                    Terms and Conditions
                  </a>
                </>
              ) : (
                field.label
              )}
              <span className="ml-1 text-destructive">*</span>
            </span>
          </label>
          {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
        </div>
      );
    case "signature":
      control = (
        <SignaturePad
          value={typeof value === "string" ? value : ""}
          disabled={disabled ?? false}
          onChange={(v) => set(v)}
        />
      );
      break;
    case "date":
      control = (
        <Input
          id={field.key}
          type="date"
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(e) => set(e.target.value)}
        />
      );
      break;
    default:
      control = (
        <Input
          id={field.key}
          type={field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text"}
          value={String(value ?? "")}
          disabled={disabled}
          placeholder={field.placeholder}
          onChange={(e) => set(e.target.value)}
        />
      );
  }

  return (
    <div>
      {label}
      {field.help && <p className="mb-2 text-sm text-muted-foreground">{field.help}</p>}
      {control}
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function StaticContent({ field }: { field: FieldDef }) {
  return (
    <div className="space-y-4">
      {(field.content ?? []).map((b, i) => {
        if (b.kind === "heading")
          return (
            <h2 key={i} className="ekos-title text-2xl">
              {b.text}
            </h2>
          );
        if (b.kind === "subheading")
          return (
            <h3 key={i} className="font-heading text-lg font-semibold text-brand">
              {b.text}
            </h3>
          );
        if (b.kind === "bullets")
          return (
            <ul key={i} className="list-disc space-y-1 pl-6 text-sm leading-relaxed">
              {b.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          );
        if (b.kind === "note")
          return (
            <p
              key={i}
              className="rounded-md border border-border bg-secondary p-3 text-sm leading-relaxed"
            >
              {b.text}
            </p>
          );
        return (
          <p key={i} className="text-sm leading-relaxed">
            {b.text}
          </p>
        );
      })}
    </div>
  );
}
