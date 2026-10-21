import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { EKOS_LOGO_PNG_BASE64 } from "./logo-base64";
import { formatDate } from "@/lib/format";
import type { AmendmentChange } from "@/lib/forms/amendments";

const BRAND = rgb(0.027, 0.212, 0.18);
const GOLD = rgb(0.757, 0.561, 0.298);
const TEXT = rgb(0.12, 0.14, 0.13);
const MUTED = rgb(0.42, 0.45, 0.44);
const W = 595.28, H = 841.89, M = 48;

export interface AmendmentPdfInput {
  amendmentNumber: number;
  formName: string;
  orderNumber: string;
  park: string;
  customerName: string;
  reason: string;
  changes: AmendmentChange[];
  originalSignedDate: string;
  originalFileName: string;
  customerSignature?: { dataUrl: string; name: string; date: string } | undefined;
  directorSignature: { name: string; title: string; date: string; imageBytes?: Uint8Array | undefined };
}

export function amendmentTitle(n: number, formName: string, order: string) {
  return `Amendment ${n} to ${formName} – Order ${order}`;
}

export function remainsStatement(formName: string, signedDate: string) {
  return `All other details remain as per the original signed ${formName} dated ${formatDate(signedDate) || signedDate}.`;
}

function clean(t: string) {
  // eslint-disable-next-line no-control-regex
  return (t ?? "").replace(/\u00A0/g, " ").replace(/[^\u0000-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, "?");
}

export async function generateAmendmentPdf(i: AmendmentPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const newPage = () => { page = doc.addPage([W, H]); y = H - M; };
  const ensure = (h: number) => { if (y - h < M) newPage(); };
  const wrap = (text: string, font: PDFFont, size: number, width: number) => {
    const lines: string[] = [];
    for (const para of clean(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const t = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(t, size) > width && line) { lines.push(line); line = word; } else line = t;
      }
      lines.push(line);
    }
    return lines;
  };
  const text = (t: string, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; center?: boolean; gap?: number } = {}) => {
    const size = o.size ?? 10.5, font = o.font ?? reg;
    for (const line of wrap(t, font, size, W - 2 * M)) {
      ensure(size + 4);
      const x = o.center ? (W - font.widthOfTextAtSize(line, size)) / 2 : M;
      page.drawText(line, { x, y: y - size, size, font, color: o.color ?? TEXT });
      y -= size + 4;
    }
    y -= o.gap ?? 4;
  };

  try {
    const logo = await doc.embedPng(Uint8Array.from(atob(EKOS_LOGO_PNG_BASE64), (c) => c.charCodeAt(0)));
    const lw = 100, lh = (logo.height / logo.width) * lw;
    page.drawImage(logo, { x: (W - lw) / 2, y: y - lh, width: lw, height: lh });
    y -= lh + 14;
  } catch { /* logo optional */ }
  text(amendmentTitle(i.amendmentNumber, i.formName, i.orderNumber), { size: 17, font: bold, color: BRAND, center: true, gap: 6 });
  text(`Park: ${i.park || "-"}   |   Customer: ${i.customerName || "-"}`, { size: 10, center: true, color: GOLD, gap: 14 });

  text("Reason for amendment", { size: 12, font: bold, color: BRAND, gap: 2 });
  text(i.reason, { gap: 12 });

  text("Changes", { size: 12, font: bold, color: BRAND, gap: 4 });
  const cols = [M, M + 170, M + 335], widths = [160, 155, W - M - (M + 335)];
  const row = (cells: string[], font: PDFFont, shade = false) => {
    const wrapped = cells.map((c, k) => wrap(c, font, 9.5, widths[k]!));
    const h = Math.max(...wrapped.map((l) => l.length)) * 13 + 8;
    ensure(h);
    if (shade) page.drawRectangle({ x: M - 4, y: y - h, width: W - 2 * M + 8, height: h, color: rgb(0.94, 0.95, 0.94) });
    wrapped.forEach((lines, k) => lines.forEach((l, n) =>
      page.drawText(l, { x: cols[k]!, y: y - 14 - n * 13, size: 9.5, font, color: TEXT })));
    y -= h;
    page.drawLine({ start: { x: M - 4, y }, end: { x: W - M + 4, y }, thickness: 0.4, color: rgb(0.8, 0.82, 0.8) });
  };
  row(["Item", "Previous", "New"], bold, true);
  for (const c of i.changes) row([c.label, c.previous, c.next], reg);
  y -= 14;

  text(remainsStatement(i.formName, i.originalSignedDate), { font: bold, gap: 2 });
  text(`Original signed document: ${i.originalFileName}`, { size: 9.5, color: MUTED, gap: 16 });

  const sigBlock = async (heading: string, img: Uint8Array | null, name: string, date: string, extra?: string) => {
    ensure(140);
    text(heading, { size: 12, font: bold, color: BRAND, gap: 4 });
    if (img) {
      try {
        const png = /^\x89PNG/.test(String.fromCharCode(...img.slice(0, 4))) ? await doc.embedPng(img) : await doc.embedJpg(img);
        const w = 180, h = (png.height / png.width) * w;
        ensure(h + 6);
        page.drawImage(png, { x: M, y: y - h, width: w, height: h });
        y -= h + 6;
      } catch { text("(signature captured)", { size: 9, color: MUTED }); }
    } else text("Not signed", { color: MUTED });
    if (name) text(`Name: ${name}`, { size: 10 });
    if (extra) text(extra, { size: 9.5, color: MUTED });
    if (date) text(`Date: ${formatDate(date)}`, { size: 10, gap: 12 });
  };
  const cs = i.customerSignature;
  if (cs) {
    const b64 = cs.dataUrl.includes(",") ? cs.dataUrl.split(",")[1] ?? "" : cs.dataUrl;
    let bytes: Uint8Array | null = null;
    try { bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); } catch { bytes = null; }
    await sigBlock("Customer signature", bytes, cs.name, cs.date);
  }
  const ds = i.directorSignature;
  await sigBlock("EKOS Group – Authorised Signatory", ds.imageBytes ?? null, ds.name, ds.date, ds.title);
  return await doc.save();
}
