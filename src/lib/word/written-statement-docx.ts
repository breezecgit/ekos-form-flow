import {
  AlignmentType,
  BorderStyle,
  Document,
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
import { STATEMENT_V1, classifyStatementLine } from "@/lib/forms/written-statement-text";
import type { FieldDef, FormValues } from "@/lib/forms/types";
import { formatDate, formatMoney } from "@/lib/format";

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
}): Promise<Blob> {
  const { values, orderNumber } = opts;
  const templates = opts.templates ?? STATEMENT_V1;
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

  for (const step of writtenStatementForm.steps) {
    for (const f of step.fields) {
      if (f.key === "status" || f.key === "status_guide") continue;
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
              new TextRun({ text: "Pitch plan attached separately", italics: true, font: FONT, size: 20 }),
            ],
          }),
        );
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
      pending.push(row(f.label ?? f.key, valueText(f, values), f.type === "signature" || f.type === "textarea"));
    }
    flush();
  }

  const doc = new Document({
    creator: "EKOS Group",
    title: `${writtenStatementForm.title} – ${orderNumber}`,
    styles: { default: { document: { run: { font: FONT } } } },
    sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } }, children }],
  });
  return Packer.toBlob(doc);
}
