import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { writtenStatementForm } from "@/lib/forms/written-statement";
import { defaultStatementSections, classifyStatementLine } from "@/lib/forms/written-statement-text";
import { isVisible, type FieldDef, type FormValues } from "@/lib/forms/types";
import { formatDate, formatMoney } from "@/lib/format";
import { withoutRetiredAnswers } from "@/lib/forms/retired-answers";

const GREEN = "07362E";
const GOLD = "C18F4C";
const FONT = "Century Gothic";

const goldBorder = { style: BorderStyle.SINGLE, size: 6, color: GOLD };
const cellBorders = { top: goldBorder, bottom: goldBorder, left: goldBorder, right: goldBorder };

function valueText(f: FieldDef, values: FormValues): string {
  const v = values[f.key];
  if (v === undefined || v === null || v === "") return "";
  if (f.type === "money") return formatMoney(v);
  if (f.type === "date") return formatDate(v);
  if (f.type === "signature") return "";
  return String(v);
}

function row(label: string, value: string, tall = false) {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 40, type: WidthType.PERCENTAGE },
        borders: cellBorders,
        shading: { fill: "F4EFE6" },
        children: [
          new Paragraph({ children: [new TextRun({ text: label, bold: true, color: GREEN, font: FONT, size: 20 })] }),
        ],
      }),
      new TableCell({
        width: { size: 60, type: WidthType.PERCENTAGE },
        borders: cellBorders,
        children: [
          new Paragraph({
            spacing: tall ? { before: 500, after: 500 } : { before: 60, after: 60 },
            children: [new TextRun({ text: value, font: FONT, size: 20 })],
          }),
        ],
      }),
    ],
  });
}

function table(rows: TableRow[]) {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function heading(text: string, size = 26) {
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, color: GREEN, font: FONT, size })],
  });
}

/**
 * Word version of the Written Statement for urgent completions: same wording
 * and order as the online form, answers pre-filled, empty boxes left open.
 */
export async function buildWrittenStatementDocx(opts: {
  values: FormValues;
  templates?: Record<string, string> | null;
  orderNumber: string;
  pitchPlans?: { name: string; mime: string; bytes?: Uint8Array; url?: string }[];
}): Promise<Blob> {
  const { orderNumber } = opts;
  const values = withoutRetiredAnswers(writtenStatementForm.type, opts.values);
  const templates = opts.templates ?? defaultStatementSections(values);
  const children: (Paragraph | Table)[] = [];

  try {
    const logo = await fetch("/ekos-logo.png").then((r) => r.arrayBuffer());
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ type: "png", data: logo, transformation: { width: 104, height: 120 } })],
      }),
    );
  } catch {
    /* logo optional */
  }
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 },
      children: [new TextRun({ text: writtenStatementForm.title, bold: true, color: GREEN, font: FONT, size: 40 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 6 } },
      spacing: { after: 240 },
      children: [new TextRun({ text: `Order Number ${orderNumber}`, bold: true, color: GOLD, font: FONT, size: 22 })],
    }),
  );

  let pending: TableRow[] = [];
  const flush = () => {
    if (pending.length) children.push(table(pending), new Paragraph({ text: "" }));
    pending = [];
  };

  const fields = writtenStatementForm.steps.flatMap((step) => step.fields)
    .filter((f) => !f.pdfHide && isVisible(f, values, { mode: "director", isDirector: true }));
  const ordered = [...fields.filter((f) => f.pdfSection !== "signatures"), ...fields.filter((f) => f.pdfSection === "signatures")];
  let signaturesStarted = false;
  const ekosSigned = Boolean(values["director_signature"] && values["witness_signature"]);
    for (const f of ordered) {
      if (f.group === "directorSignature" && !ekosSigned) continue;
      if (f.pdfSection === "signatures" && !signaturesStarted) {
        flush();
        children.push(heading("Signatures", 30));
        signaturesStarted = true;
      }
      if (f.sectionLabel) {
        flush();
        children.push(heading(f.sectionLabel, 24));
      }
      if (f.type === "static") {
        flush();
        const body = f.templateKey ? (templates[f.templateKey] ?? "") : (f.content ?? []).map((b) => ("text" in b ? b.text : "")).join("\n");
        for (const line of body.split("\n")) {
          const style = classifyStatementLine(line);
          children.push(
            new Paragraph({
              alignment: style === "title" ? AlignmentType.CENTER : AlignmentType.LEFT,
              spacing: { before: style === "body" ? 40 : 160, after: 40 },
              children: [
                new TextRun({
                  text: line,
                  font: FONT,
                  bold: style !== "body",
                  color: style === "body" ? "1F2421" : GREEN,
                  size: style === "title" ? 24 : style === "heading" ? 21 : 19,
                }),
              ],
            }),
          );
        }
        continue;
      }
      if (f.type === "file") {
        flush();
        children.push(
          new Paragraph({
            spacing: { before: 120, after: 120 },
            children: [
              new TextRun({ text: `${f.label} `, bold: true, color: GREEN, font: FONT, size: 20 }),
              new TextRun({ text: `${Array.isArray(values[f.key]) ? (values[f.key] as { name: string }[]).map((file) => file.name).join(", ") : ""} (attached at the end of this document)`, italics: true, font: FONT, size: 20 }),
            ],
          }),
        );
        continue;
      }
      if (f.type === "signature") {
        flush();
        children.push(heading(f.label ?? "Signature", 20));
        const dataUrl = String(values[f.key] ?? "");
        if (dataUrl.startsWith("data:image/png;base64,")) {
          try {
            const data = Uint8Array.from(atob(dataUrl.slice("data:image/png;base64,".length)), (c) => c.charCodeAt(0));
            children.push(new Paragraph({ children: [new ImageRun({ type: "png", data, transformation: { width: 190, height: 65 } })] }));
          } catch { children.push(new Paragraph({ text: "(signature captured)" })); }
        } else {
          pending.push(row(f.label ?? "Signature", "", true));
        }
        continue;
      }
      if (f.type === "checkbox") {
        flush();
        children.push(
          new Paragraph({
            spacing: { before: 80, after: 80 },
            children: [
              new TextRun({ text: values[f.key] === true ? "☒  " : "☐  ", font: FONT, size: 22 }),
              new TextRun({ text: f.label ?? "", font: FONT, size: 20 }),
            ],
          }),
        );
        continue;
      }
      if (f.type === "radio" && f.options) {
        const v = String(values[f.key] ?? "");
        pending.push(row(f.label ?? "", f.options.map((o) => `${v === o.value ? "☒" : "☐"} ${o.value}`).join("    ")));
        continue;
      }
      pending.push(row(f.label ?? f.key, valueText(f, values), f.type === "textarea"));
  }
  flush();
  if (!ekosSigned) children.push(new Paragraph({ children: [new TextRun({ text: "To be signed by EKOS Group", font: FONT, size: 22 })] }));

  // Word supports image pages; PDF plans remain secure links rather than silently disappearing.
  for (const plan of opts.pitchPlans ?? []) {
    children.push(new Paragraph({ pageBreakBefore: true, children: [new TextRun({ text: `Attached document: ${plan.name}`, bold: true, font: FONT, color: GREEN })] }));
    if (plan.bytes && ["image/png", "image/jpeg"].includes(plan.mime)) {
      children.push(new Paragraph({ children: [new ImageRun({ type: plan.mime === "image/png" ? "png" : "jpg", data: plan.bytes, transformation: { width: 480, height: 480 } })] }));
    } else if (plan.url) {
      children.push(new Paragraph({ children: [new ExternalHyperlink({ link: plan.url, children: [new TextRun({ text: plan.name, style: "Hyperlink" })] })] }));
    }
  }

  const doc = new Document({
    creator: "EKOS Group",
    title: `${writtenStatementForm.title} – ${orderNumber}`,
    styles: { default: { document: { run: { font: FONT } } } },
    sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } }, children }],
  });
  return Packer.toBlob(doc);
}
