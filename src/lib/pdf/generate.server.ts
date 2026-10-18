import {
  PDFDocument,
  PDFFont,
  PDFPage,
  PDFString,
  StandardFonts,
  rgb,
} from "pdf-lib";
import { CHOICE_IMAGES_JPG_BASE64 } from "./choice-images";
import { EKOS_LOGO_PNG_BASE64 } from "./logo-base64";
import { formatDate, formatMoney } from "@/lib/format";
import type { ContentBlock, FieldDef, FormDef, FormValues, RenderContext } from "@/lib/forms/types";
import { isVisible, labelRepeatsSection } from "@/lib/forms/types";
import { STATEMENT_V1, classifyStatementLine } from "@/lib/forms/written-statement-text";

const BRAND = rgb(0.027, 0.212, 0.18); // #07362E
const GOLD = rgb(0.757, 0.561, 0.298); // #C18F4C
const TEXT = rgb(0.12, 0.14, 0.13);
const MUTED = rgb(0.42, 0.45, 0.44);
const LINK = rgb(0.1, 0.32, 0.55);

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

export interface PdfAttachment {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  label?: string;
}

export interface DirectorSignature {
  name: string;
  title: string;
  /** PNG/JPEG bytes of the stored signature image. */
  imageBytes?: Uint8Array;
  date: string;
}

export interface GeneratePdfInput {
  def: FormDef;
  values: FormValues;
  ctx: RenderContext;
  orderNumber: string;
  park: string;
  customerName: string;
  parkLinks: Record<string, string>;
  attachments?: PdfAttachment[];
  directorSignature?: DirectorSignature;
}

/** Staff workflow status never belongs in a customer-facing PDF. */
export function omitPdfField(key: string, completed: boolean): boolean {
  return ["status_guide", "status"].includes(key) ||
    (completed && ["authorised_signatory_note", "construction_note"].includes(key));
}

async function drawAttachments(w: Writer, attachments: PdfAttachment[]) {
  for (const att of attachments) {
    if (att.mimeType === "application/pdf") {
      try {
        const src = await PDFDocument.load(att.bytes);
        const pages = await w.doc.copyPages(src, src.getPageIndices());
        w.newPage();
        w.text(`Attached document: ${att.label ?? att.fileName}`, { size: 12, font: w.bold, color: BRAND });
        for (const p of pages) w.doc.addPage(p);
      } catch {
        w.text(`Attached document (could not be embedded): ${att.fileName}`, { color: MUTED });
      }
    } else {
      try {
        const img = /png/i.test(att.mimeType) ? await w.doc.embedPng(att.bytes) : await w.doc.embedJpg(att.bytes);
        w.newPage();
        w.text(`Attached document: ${att.label ?? att.fileName}`, { size: 12, font: w.bold, color: BRAND, gap: 8 });
        const scale = Math.min(CONTENT_W / img.width, (w.y - MARGIN) / img.height, 1);
        const iw = img.width * scale;
        const ih = img.height * scale;
        w.page.drawImage(img, { x: MARGIN, y: w.y - ih, width: iw, height: ih });
        w.y -= ih + 12;
      } catch {
        w.text(`Attached file: ${att.fileName}`, { color: MUTED });
      }
    }
  }
}

/** Cleans characters the standard WinAnsi fonts cannot encode. */
function clean(text: string): string {
  // Curly quotes and dashes are kept: they exist in the PDF's standard font encoding,
  // so legal wording prints exactly as written.
  return (text ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\u00D7/g, "x")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\u0000-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, "?");
}

class Writer {
  doc!: PDFDocument;
  page!: PDFPage;
  y = 0;
  regular!: PDFFont;
  bold!: PDFFont;
  headerTitle = "";
  headerMeta = "";
  /** True while the current page holds nothing but the running header. */
  fresh = false;

  async init(title: string, meta: string) {
    this.doc = await PDFDocument.create();
    this.regular = await this.doc.embedFont(StandardFonts.Helvetica);
    this.bold = await this.doc.embedFont(StandardFonts.HelveticaBold);
    this.headerTitle = title;
    this.headerMeta = meta;
    this.newPage(false);
  }

  newPage(withRunningHeader = true) {
    // Never leave a page that only carries the running header – reuse it instead.
    if (this.fresh && this.page) return;
    this.fresh = true;
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
    if (withRunningHeader) {
      this.page.drawText(clean(this.headerTitle), {
        x: MARGIN,
        y: this.y,
        size: 9,
        font: this.bold,
        color: BRAND,
      });
      const metaWidth = this.regular.widthOfTextAtSize(clean(this.headerMeta), 9);
      this.page.drawText(clean(this.headerMeta), {
        x: PAGE_W - MARGIN - metaWidth,
        y: this.y,
        size: 9,
        font: this.regular,
        color: MUTED,
      });
      this.y -= 8;
      this.page.drawLine({
        start: { x: MARGIN, y: this.y },
        end: { x: PAGE_W - MARGIN, y: this.y },
        thickness: 0.5,
        color: GOLD,
      });
      this.y -= 22;
    }
  }

  ensure(space: number) {
    if (this.y - space < MARGIN + 20) this.newPage();
  }

  wrap(text: string, font: PDFFont, size: number, width = CONTENT_W): string[] {
    const cleaned = clean(text);
    const lines: string[] = [];
    for (const paragraph of cleaned.split("\n")) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (!words.length) {
        lines.push("");
        continue;
      }
      let line = "";
      for (const w of words) {
        const candidate = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(candidate, size) > width && line) {
          lines.push(line);
          line = w;
        } else {
          line = candidate;
        }
      }
      if (line) lines.push(line);
    }
    return lines;
  }

  text(
    value: string,
    opts: {
      size?: number;
      font?: PDFFont;
      color?: ReturnType<typeof rgb>;
      indent?: number;
      gap?: number;
      align?: "left" | "center";
    } = {},
  ) {
    const size = opts.size ?? 10;
    const font = opts.font ?? this.regular;
    const color = opts.color ?? TEXT;
    const indent = opts.indent ?? 0;
    const lineHeight = size * 1.45;
    const lines = this.wrap(value, font, size, CONTENT_W - indent);
    for (const line of lines) {
      this.ensure(lineHeight);
      const w = font.widthOfTextAtSize(line, size);
      const x = opts.align === "center" ? (PAGE_W - w) / 2 : MARGIN + indent;
      this.page.drawText(line, { x, y: this.y - size, size, font, color });
      this.fresh = false;
      this.y -= lineHeight;
    }
    this.y -= opts.gap ?? 0;
  }

  link(label: string, url: string) {
    const size = 10;
    const lineHeight = size * 1.6;
    this.ensure(lineHeight);
    const text = clean(`${label}`);
    const w = this.bold.widthOfTextAtSize(text, size);
    const x = MARGIN + 12;
    const y = this.y - size;
    this.page.drawText(text, { x, y, size, font: this.bold, color: LINK });
    this.fresh = false;
    this.page.drawLine({
      start: { x, y: y - 1.5 },
      end: { x: x + w, y: y - 1.5 },
      thickness: 0.5,
      color: LINK,
    });
    const annot = this.doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, y - 2, x + w, y + size],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
    });
    this.page.node.addAnnot(this.doc.context.register(annot));
    this.y -= lineHeight;
    this.text(url, { size: 7.5, color: MUTED, indent: 12, gap: 4 });
  }

  rule() {
    this.ensure(12);
    if (this.fresh) return; // a divider alone must not create or fill a page
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_W - MARGIN, y: this.y },
      thickness: 0.5,
      color: rgb(0.85, 0.86, 0.85),
    });
    this.y -= 14;
  }
}

function fieldValueText(f: FieldDef, values: FormValues, attachedBelow = false): string {
  const v = values[f.key];
  if (v === undefined || v === null || v === "") return "-";
  if (f.type === "money") return formatMoney(v);
  if (f.type === "date") return formatDate(v);
  if (f.type === "multiselect") return Array.isArray(v) ? v.join(", ") : String(v);
  if (f.type === "select") {
    const chosen = f.options?.find((o) => o.value === v);
    return chosen?.label ?? String(v);
  }
  if (f.type === "checkbox") return v === true ? "Yes - agreed" : "No";
  if (f.type === "file") {
    const list = Array.isArray(v) ? (v as { name: string }[]) : [];
    return list.length
      ? `${list.map((x) => x.name).join(", ")} (${attachedBelow ? "attached below" : "attached at the end of this document"})`
      : "-";
  }
  return String(v);
}

function contentBlocks(w: Writer, blocks: ContentBlock[]) {
  for (const b of blocks) {
    if (b.kind === "heading") {
      w.y -= 6;
      w.text(b.text, { size: 15, font: w.bold, color: BRAND, gap: 6 });
    } else if (b.kind === "subheading") {
      w.y -= 4;
      w.text(b.text, { size: 11.5, font: w.bold, color: BRAND, gap: 3 });
    } else if (b.kind === "bullets") {
      for (const item of b.items) w.text(`\u2022  ${item}`, { indent: 10, gap: 1 });
      w.y -= 4;
    } else if (b.kind === "subbullets") {
      for (const item of b.items) w.text(`\u2022  ${item}`, { indent: 22, gap: 1 });
      w.y -= 4;
    } else if (b.kind === "accordion") {
      // Collapsible rows on the page are printed expanded so every word is in the PDF.
      w.y -= 3;
      w.text(b.title, { size: 10.5, font: w.bold, color: TEXT, gap: 3 });
      contentBlocks(w, b.blocks);
    } else if (b.kind === "note") {
      w.text(b.text, { size: 9.5, color: MUTED, gap: 6 });
    } else if (b.kind === "bold") {
      w.text(b.text, { font: w.bold, color: GOLD, gap: 6 });
    } else {
      w.text(b.text, { gap: 6 });
    }
  }
}

async function drawSignature(
  w: Writer,
  label: string,
  dataUrl: string,
  name: string,
  date: string,
) {
  w.ensure(120); // keep the label, signature and name/date together
  w.text(label, { size: 10, font: w.bold, color: BRAND, gap: 2 });
  const base64 = dataUrl.includes(",") ? (dataUrl.split(",")[1] ?? "") : dataUrl;
  try {
    const img = await w.doc.embedPng(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
    const width = 190;
    const height = (img.height / img.width) * width;
    w.ensure(height + 8);
    w.page.drawImage(img, { x: MARGIN, y: w.y - height, width, height });
    w.page.drawLine({
      start: { x: MARGIN, y: w.y - height - 2 },
      end: { x: MARGIN + width, y: w.y - height - 2 },
      thickness: 0.5,
      color: rgb(0.7, 0.72, 0.7),
    });
    w.y -= height + 10;
  } catch {
    w.text("(signature captured)", { size: 9, color: MUTED });
  }
  if (name) w.text(`Name: ${name}`, { size: 9.5, color: TEXT });
  if (date) w.text(`Date: ${formatDate(date)}`, { size: 9.5, color: TEXT });
  w.y -= 8;
}

function signatureMeta(key: string, values: FormValues) {
  const base = key.replace(/_signature$/, "");
  const name = values[`${base}_name`];
  const date = values[`${base}_date`] ?? values[`${base}_sign_date`];
  return { name: name ? String(name) : "", date: date ? String(date) : "" };
}

export async function generateFormPdf(input: GeneratePdfInput): Promise<Uint8Array> {
  const { def, values, ctx, orderNumber, park, customerName, parkLinks } = input;
  const w = new Writer();
  await w.init(def.title, `${orderNumber}  |  ${park}`);

  // --- Cover header -------------------------------------------------------
  const logoBytes = Uint8Array.from(atob(EKOS_LOGO_PNG_BASE64), (c) => c.charCodeAt(0));
  try {
    const logo = await w.doc.embedPng(logoBytes);
    const lw = 110;
    const lh = (logo.height / logo.width) * lw;
    w.page.drawImage(logo, { x: (PAGE_W - lw) / 2, y: w.y - lh, width: lw, height: lh });
    w.y -= lh + 16;
  } catch {
    w.y -= 8;
  }

  w.text(def.title, { size: 22, font: w.bold, color: BRAND, align: "center", gap: 8 });
  w.text(`Order Number: ${orderNumber}`, { size: 10.5, align: "center", color: GOLD });
  w.text(`Park: ${park || "-"}`, { size: 10.5, align: "center" });
  w.text(`Customer: ${customerName || "-"}`, { size: 10.5, align: "center", gap: 10 });
  w.rule();

  const templates = ctx.templates ?? STATEMENT_V1;
  const grouped = def.pdfLayout === "grouped";
  // Completed customer copies retain signatures, not the staff approval instructions.
  const completed = values["status"] === "Completed" || Boolean(input.directorSignature);
  const printable = (f: FieldDef) => isVisible(f, values, ctx) && !f.pdfHide &&
    !omitPdfField(f.key, completed);

  const renderField = async (f: FieldDef) => {
    if (f.sectionLabel) {
      w.y -= 4;
      w.text(f.sectionLabel, { size: 12.5, font: w.bold, color: BRAND, gap: 4 });
    }
    if (f.type === "static") {
      if (f.templateKey) {
        for (const line of (templates[f.templateKey] ?? "").split("\n")) {
          const style = classifyStatementLine(line);
          if (style === "title") {
            w.y -= 4;
            w.text(line, { size: 12.5, font: w.bold, color: BRAND, align: "center", gap: 2 });
          } else if (style === "heading") {
            w.y -= 3;
            w.text(line, { size: 10.5, font: w.bold, color: BRAND, gap: 2 });
          } else {
            w.text(line, { size: 9.5, gap: 2 });
          }
        }
        w.y -= 4;
      } else {
        contentBlocks(w, f.content ?? []);
      }
      return;
    }
    if (f.type === "links") {
      for (const l of f.links ?? []) {
        const url = l.parkKey ? parkLinks[l.parkKey] : l.url;
        if (url) w.link(l.label, url);
        else w.text(`${l.label} (link to follow)`, { font: w.bold, indent: 12, gap: 4 });
      }
      w.y -= 4;
      return;
    }
    if (f.type === "signature") {
      const dataUrl = String(values[f.key] ?? "");
      const meta = signatureMeta(f.key, values);
      if (dataUrl) {
        await drawSignature(w, f.label ?? "Signature", dataUrl, meta.name, meta.date);
      } else {
        w.text(`${f.label}: not signed`, { font: w.bold, color: MUTED, gap: 6 });
      }
      return;
    }
    if (f.type === "checkbox") {
      const ticked = values[f.key] === true;
      w.text(`${ticked ? "[X]" : "[ ]"}  ${f.label ?? ""}`, { size: 10, gap: 6 });
      return;
    }
    w.ensure(28);
    if (!labelRepeatsSection(f, "pdf")) {
      w.text(`${f.pdfLabel ?? f.label ?? f.key}`, { size: 10, font: w.bold, color: BRAND });
    }
    const chosen = f.type === "radio" ? f.options?.find((o) => o.value === values[f.key]) : undefined;
    const imgB64 = chosen?.image && chosen.image !== "blank" ? CHOICE_IMAGES_JPG_BASE64[chosen.image] : undefined;
    if (imgB64) {
      // Image-choice radio: show the chosen photo next to the answer.
      try {
        const img = await w.doc.embedJpg(Uint8Array.from(atob(imgB64), (c) => c.charCodeAt(0)));
        const ih = 90;
        const iw = (img.width / img.height) * ih;
        w.ensure(ih + 10);
        w.page.drawImage(img, { x: MARGIN, y: w.y - ih, width: iw, height: ih });
        const top = w.y;
        w.y = top - 14;
        w.text(fieldValueText(f, values, grouped), { size: 11, indent: iw + 12 });
        w.y = top - ih - 10;
        return;
      } catch {
        /* fall through to text only */
      }
    }
    w.text(fieldValueText(f, values, grouped), { size: 11, gap: 8 });
  };

  if (!grouped) {
    for (const step of def.steps) {
      const fields = step.fields.filter(printable);
      if (!fields.length) continue;
      if (step.heading) {
        w.ensure(40);
        w.y -= 6;
        w.text(step.heading, { size: 15, font: w.bold, color: BRAND, gap: 8 });
      }
      for (const f of fields) await renderField(f);
      w.rule();
    }
    await drawAttachments(w, input.attachments ?? []);
  } else {
    const all = def.steps
      .flatMap((s) => s.fields)
      .filter(printable);
    // (a) the full statement wording
    for (const f of all) if (f.type === "static" && !f.pdfSection) await renderField(f);
    // (b) customer / home entries + attachments
    w.newPage();
    w.text("Customer and Home Details", { size: 15, font: w.bold, color: BRAND, gap: 8 });
    for (const f of all) {
      if (f.type === "static" || f.type === "signature" || f.pdfSection) continue;
      await renderField(f);
    }
    await drawAttachments(w, input.attachments ?? []);
    // (c) every signature
    w.newPage();
    w.text("Signatures", { size: 15, font: w.bold, color: BRAND, gap: 8 });
    const consumed = new Set<string>();
    for (const f of all) {
      if (f.type !== "signature") continue;
      const base = f.key.replace(/_signature$/, "");
      for (const k of [`${base}_name`, `${base}_date`, `${base}_sign_date`]) consumed.add(k);
    }
    for (const f of all) {
      if (!(f.pdfSection || f.type === "signature") || consumed.has(f.key)) continue;
      await renderField(f);
    }
  }

  // --- EKOS authorised signatory block -----------------------------------
  if (input.directorSignature) {
    const ds = input.directorSignature;
    w.newPage();
    w.text("EKOS Group – Authorised Signatory", {
      size: 15,
      font: w.bold,
      color: BRAND,
      gap: 10,
    });
    w.text(
      "This order has been approved and signed by an authorised signatory of EKOS Group.",
      { gap: 12 },
    );
    if (ds.imageBytes) {
      try {
        const img = /^\x89PNG/.test(String.fromCharCode(...ds.imageBytes.slice(0, 4)))
          ? await w.doc.embedPng(ds.imageBytes)
          : await w.doc.embedJpg(ds.imageBytes);
        const width = 190;
        const height = (img.height / img.width) * width;
        w.page.drawImage(img, { x: MARGIN, y: w.y - height, width, height });
        w.y -= height + 8;
      } catch {
        /* fall through to the text block */
      }
    }
    w.page.drawLine({
      start: { x: MARGIN, y: w.y },
      end: { x: MARGIN + 200, y: w.y },
      thickness: 0.5,
      color: rgb(0.7, 0.72, 0.7),
    });
    w.y -= 14;
    w.text(ds.name, { size: 11, font: w.bold });
    w.text(ds.title, { size: 10, color: MUTED });
    w.text(`Date: ${formatDate(ds.date)}`, { size: 10 });
  }

  // Safety net: drop any trailing page that only has the running header.
  if (w.fresh && w.doc.getPageCount() > 1) w.doc.removePage(w.doc.getPageCount() - 1);
  return await w.doc.save();
}
