/** Shared value formatting used identically by the web form and the PDF. */

export function parseMoney(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^tbc$/i.test(s)) return null;
  const n = Number(s.replace(/[£,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Display a price as £299,995 (or the literal text, e.g. TBC). */
export function formatMoney(raw: unknown): string {
  if (raw === null || raw === undefined || String(raw).trim() === "") return "";
  const s = String(raw).trim();
  if (/^tbc$/i.test(s)) return "TBC";
  const n = parseMoney(s);
  if (n === null) return s;
  const abs = Math.abs(n).toLocaleString("en-GB", { maximumFractionDigits: 2 });
  return (n < 0 ? "-£" : "£") + abs;
}

/** dd/mm/yyyy for display and PDF. */
export function formatDate(raw: unknown): string {
  if (!raw) return "";
  const s = String(raw).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

/** Short date dd/mm/yy — strips any time part from timestamps. */
export function shortDate(raw: unknown): string {
  if (!raw) return "";
  const s = String(raw ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m?.[1] && m[2] && m[3]) return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
  return s;
}

export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "Form Name_Park_Customer Name_Order Number.pdf" */
export function pdfFileName(
  formTitle: string,
  park: string,
  customer: string,
  orderNumber: string,
): string {
  return `${[formTitle, park, customer, orderNumber].map(safePart).join("_")}.pdf`;
}

/** "Customer Name - Park Name - Order Number.pdf" */
export function driveFileName(
  park: string,
  customer: string,
  orderNumber: string,
): string {
  return `${safePart(customer)} - ${safePart(park)} - ${safePart(orderNumber)}.pdf`;
}

function safePart(v: string): string {
  return (v || "").replace(/[\\/:*?"<>|]/g, "-").trim() || "Unknown";
}
