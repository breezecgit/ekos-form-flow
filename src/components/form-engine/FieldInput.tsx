import { STATEMENT_V1, classifyStatementLine } from "@/lib/forms/written-statement-text";
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
import { SUBSUB_HEADINGS, isRequired } from "@/lib/forms/types";
import type { ContentBlock, OptionDef } from "@/lib/forms/types";
import { CHOICE_IMAGE_SRC } from "./choice-images";
import { ChevronDown, Minus, Paperclip, Plus, X } from "lucide-react";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { uploadFile } from "@/lib/ekos.functions";
import type { UploadedFile } from "@/lib/forms/types";

interface Props {
  field: FieldDef;
  values: FormValues;
  ctx: RenderContext;
  error?: string | undefined;
  disabled?: boolean | undefined;
  parkLinks: Record<string, string>;
  onChange: (key: string, value: unknown) => void;
  /** Keys locked because they arrived already set (e.g. park carried from the sale). */
  lockedKeys?: Set<string> | undefined;
}

export function FieldInput({
  field,
  values,
  ctx,
  error,
  disabled,
  parkLinks,
  onChange,
  lockedKeys,
}: Props) {
  const value = values[field.key];
  const set = (v: unknown) => onChange(field.key, v);
  const lockedPark =
    Boolean(field.lockIfSet) &&
    String(value ?? "").trim() !== "" &&
    (lockedKeys ? lockedKeys.has(field.key) : true);
  if (lockedPark) disabled = true;

  if (field.type === "static") {
    return <StaticContent field={field} templates={ctx.templates} />;
  }

  if (field.type === "links") {
    return (
      <ul className="space-y-4">
        {(field.links ?? []).map((l) => {
          const url = l.parkKey ? parkLinks[l.parkKey] : l.url;
          return (
            <li key={l.label}>
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[15px] font-semibold text-foreground underline underline-offset-2 hover:text-gold"
                >
                  {l.label}
                </a>
              ) : (
                <span className="text-[15px] font-semibold text-foreground">
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
    <label className={`ekos-label ${labelTone(field.key)}`} htmlFor={field.key}>
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
          className="ekos-input"
          value={String(value ?? "")}
          disabled={disabled}
          placeholder={field.placeholder}
          onChange={(e) => set(e.target.value)}
          rows={4}
        />
      );
      break;
    case "money":
      control = (
        <div className="flex items-stretch">
          <span className="flex items-center rounded-l-[7px] border border-r-0 border-ekos-field-border bg-ekos-addon px-4 text-[16px] text-ekos-field-text">
            £
          </span>
          <Input
            id={field.key}
            className="ekos-input rounded-l-none"
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
          <SelectTrigger id={field.key} className="ekos-input h-auto w-full">
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
              className="ekos-input w-full justify-between font-normal hover:bg-card"
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
    case "radio": {
      const options = field.options ?? [];
      const withImages = options.some((o) => o.image);
      const radio = (o: OptionDef) => (
        <label key={o.value} className="flex cursor-pointer items-center gap-2 text-[14px] font-medium text-ekos-ink">
          <input
            type="radio"
            name={field.key}
            value={o.value}
            disabled={disabled}
            checked={value === o.value}
            onChange={() => set(o.value)}
            className="h-3.5 w-3.5 accent-[var(--brand)]"
          />
          {o.label ?? o.value}
        </label>
      );
      control = withImages ? (
        <div className="flex flex-wrap gap-4">
          {options.map((o) => (
            <div key={o.value} className="w-[200px] max-w-[45%]">
              <button
                type="button"
                disabled={disabled}
                onClick={() => set(o.value)}
                aria-label={o.label ?? o.value}
                className={`block aspect-square w-full overflow-hidden rounded-[4px] border ${
                  value === o.value ? "border-gold ring-2 ring-gold" : "border-ekos-field-border"
                } bg-card`}
              >
                {o.image && o.image !== "blank" && (
                  <img
                    src={CHOICE_IMAGE_SRC[o.image]}
                    alt={o.label ?? o.value}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
              </button>
              <div className="mt-2">{radio(o)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">{options.map(radio)}</div>
      );
      break;
    }
    case "checkbox":
      return (
        <div>
          {field.help && (
            <p className="ekos-label mb-2">
              {field.help}
              <span className="ml-1 text-destructive">*</span>
            </p>
          )}
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              id={field.key}
              checked={value === true}
              disabled={disabled}
              onChange={(e) => set(e.target.checked)}
              className="mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--brand)]"
            />
            <span className="text-[14px] font-medium leading-relaxed text-ekos-ink">
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
    case "file":
      control = (
        <FileControl
          fieldKey={field.key}
          value={Array.isArray(value) ? (value as UploadedFile[]) : []}
          submissionId={ctx.submissionId}
          disabled={disabled ?? false}
          onChange={set}
        />
      );
      break;
    case "date":
      control = (
        <Input
          id={field.key}
          className="ekos-input"
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
          className="ekos-input"
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
      {field.help && <p className="mb-2 text-[13px] text-ekos-field-text">{field.help}</p>}
      {control}
      {lockedPark && (
        <p className="mt-1 text-xs text-muted-foreground">Carried over from this sale – cannot be changed.</p>
      )}
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function StaticContent({
  field,
  templates,
}: {
  field: FieldDef;
  templates?: Record<string, string> | undefined;
}) {
  if (field.templateKey) {
    const body = templates?.[field.templateKey] ?? STATEMENT_V1[field.templateKey] ?? "";
    return (
      <div className="space-y-1.5">
        {body.split("\n").map((line, i) => {
          const style = classifyStatementLine(line);
          if (style === "title")
            return (
              <p key={i} className="pt-2 text-center font-heading text-lg font-bold text-brand">
                {line}
              </p>
            );
          if (style === "heading")
            return (
              <p key={i} className="pt-2 font-heading font-semibold text-brand">
                {line}
              </p>
            );
          return (
            <p key={i} className="text-sm leading-relaxed">
              {line}
            </p>
          );
        })}
      </div>
    );
  }
  return <Blocks blocks={field.content ?? []} />;
}

function Blocks({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => {
        if (b.kind === "heading")
          return (
            <h2 key={i} className="ekos-step-heading">
              {b.text}
            </h2>
          );
        if (b.kind === "subheading")
          return SUBSUB_HEADINGS.has(b.text) ? (
            <h4 key={i} className="ekos-subsubheading">
              {b.text}
            </h4>
          ) : (
            <h3 key={i} className="ekos-subheading">
              {b.text}
            </h3>
          );
        if (b.kind === "bullets")
          return (
            <ul
              key={i}
              className="list-disc space-y-1.5 pl-6 text-[15px] font-medium leading-[1.7] text-ekos-slate marker:text-[0.7em]"
            >
              {b.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          );
        if (b.kind === "accordion") return <AccordionRow key={i} title={b.title} blocks={b.blocks} />;
        if (b.kind === "note")
          return (
            <p key={i} className="text-[15px] font-medium leading-[1.7] text-ekos-slate">
              {b.text}
            </p>
          );
        return (
          <p key={i} className="text-[15px] font-medium leading-[1.7] text-ekos-slate">
            {b.text}
          </p>
        );
      })}
    </div>
  );
}

/** Collapsible "+" row, closed by default (Fluent Forms accordion). */
function AccordionRow({ title, blocks }: { title: string; blocks: ContentBlock[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-ekos-divider">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between py-3 text-left font-heading text-[15px] font-semibold text-ekos-slate"
      >
        {title}
        {open ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      </button>
      {open && (
        <div className="pb-4">
          <Blocks blocks={blocks} />
        </div>
      )}
    </div>
  );
}

/** Label colours measured on the live signature steps. */
function labelTone(key: string): string {
  if (key === "rep_name" || key === "rep_signature" || key === "rep_sign_date") return "text-brand";
  if (key.startsWith("customer_one_") && /(name|signature|date)$/.test(key)) return "text-ekos-customer-gold";
  if (key.startsWith("customer_two_") && /(name|signature|date)$/.test(key)) return "text-foreground-black";
  return "";
}

function FileControl({
  fieldKey,
  value,
  submissionId,
  disabled,
  onChange,
}: {
  fieldKey: string;
  value: UploadedFile[];
  submissionId?: string | undefined;
  disabled: boolean;
  onChange: (v: UploadedFile[]) => void;
}) {
  const uploadFn = useServerFn(uploadFile);
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length || !submissionId) return;
    setBusy(true);
    try {
      const added: UploadedFile[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 15 * 1024 * 1024) {
          toast.error(`${file.name} is larger than 15MB.`);
          continue;
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(r.error);
          r.readAsDataURL(file);
        });
        const res = await uploadFn({
          data: {
            submissionId,
            fieldKey,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            base64: dataUrl.split(",")[1] ?? "",
          },
        });
        added.push(res);
      }
      onChange([...value, ...added]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {value.map((f) => (
        <div key={f.id} className="flex items-center justify-between rounded-md border bg-secondary px-3 py-2 text-sm">
          <span className="flex items-center gap-2 truncate">
            <Paperclip className="h-4 w-4 shrink-0" /> {f.name}
          </span>
          {!disabled && (
            <button
              type="button"
              aria-label={`Remove ${f.name}`}
              onClick={() => onChange(value.filter((x) => x.id !== f.id))}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      <input
        id={fieldKey}
        type="file"
        accept="image/png,image/jpeg,application/pdf"
        multiple
        disabled={disabled || busy || !submissionId}
        onChange={(e) => {
          void onFiles(e.target.files);
          e.target.value = "";
        }}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-4 file:py-2 file:font-semibold file:text-brand-foreground"
      />
      <p className="text-xs text-muted-foreground">
        {busy ? "Uploading…" : "Photo (JPG/PNG) or PDF, up to 15MB. On an iPad you can take a photo."}
      </p>
    </div>
  );
}
