import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { FORM_ORDER } from "@/lib/forms/registry";
import { createDriveFolder, driveFileLink, driveFolderLink, uploadPdfToDrive } from "@/lib/drive.server";

type Settings = Record<string, Record<string, unknown>>;

async function settingsMap(): Promise<Settings> {
  const { data } = await supabaseAdmin.from("app_settings").select("key, value");
  const out: Settings = {};
  for (const row of data ?? []) out[row.key] = (row.value ?? {}) as Record<string, unknown>;
  return out;
}

/** Form names exactly as used in the live EKOS emails. */
export const EMAIL_FORM_NAME: Record<string, string> = {
  reservation: "Reservation Form",
  identification: "Identification Checks",
  new_home_order: "New Home Order Form",
  unit_sale_agreement: "Unit Sale Agreement & Welcome Pack",
  written_statement: "Written Statement",
};

export function emailFormName(formType: string) {
  return EMAIL_FORM_NAME[formType] ?? formType;
}

/** Recipient lookups: rep email (Settings > Sales people) + park inbox (Settings > Parks). */
export async function contactsFor(salesPerson: string, parkName: string) {
  const s = await settingsMap();
  const n = s["notifications"] ?? {};
  const [{ data: rep }, { data: park }] = await Promise.all([
    supabaseAdmin.from("sales_people").select("email").eq("name", salesPerson || "-").maybeSingle(),
    supabaseAdmin.from("parks").select("inbox_email").eq("name", parkName || "-").maybeSingle(),
  ]);
  return {
    repEmail: rep?.email ?? "",
    parkInbox: park?.inbox_email ?? "",
    sadie: String(n["director_email"] ?? "") || "sadie@ekosgroup.co.uk",
    sales: String(n["sales_email"] ?? "") || "sales@ekosgroup.co.uk",
    construction: String(n["construction_email"] ?? "") || "ilker.burcin@ltmanagement.com",
  };
}

// ----------------------------------------------------------- Google Drive ---

export interface DriveFolders {
  base?: string; // "Customer Name - Park - DD-MM-YYYY"
  folders?: Record<string, string>; // formType -> sub-folder id
  latest?: Record<string, string>; // formType -> latest pdf file id
  ws_signed?: string; // Written Statement Sadie & witness pdf id
  created?: string; // DD-MM-YYYY
}

function ddmmyyyy(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

async function loadSale(saleId: string) {
  const { data } = await supabaseAdmin.from("sales").select("*").eq("id", saleId).maybeSingle();
  return data;
}

async function saveFolders(saleId: string, df: DriveFolders) {
  await supabaseAdmin.from("sales").update({ drive_folders: df as never }).eq("id", saleId);
}

/** First submission for a customer: create the 5 per-form sub-folders. */
export async function ensureSaleFolders(saleId: string): Promise<DriveFolders> {
  const sale = await loadSale(saleId);
  if (!sale) return {};
  const df = (sale.drive_folders ?? {}) as DriveFolders;
  if (!df.base) {
    df.created = ddmmyyyy();
    df.base = `${sale.customer_name || "Customer"} - ${sale.park_name || "Park"} - ${df.created}`;
  }
  df.folders = df.folders ?? {};
  const s = await settingsMap();
  const gd = s["google_drive"] ?? {};
  let changed = false;
  for (const ft of FORM_ORDER) {
    if (df.folders[ft]) continue;
    const parent = String(gd[ft] ?? "");
    const id = await createDriveFolder(df.base, parent);
    if (id) {
      df.folders[ft] = id;
      changed = true;
    }
  }
  if (changed || !(sale.drive_folders as DriveFolders)?.base) await saveFolders(saleId, df);
  return df;
}

/**
 * Saves a PDF stage to the form's customer sub-folder.
 * suffix e.g. "In Review", "Completed", "Completed - Merged", "Sadie Signature & Witness - Completed".
 */
export async function saveStageToDrive(opts: {
  saleId: string;
  submissionId: string;
  formType: string;
  suffix: string;
  bytes: Uint8Array;
  latest?: boolean;
}): Promise<string | null> {
  const df = await ensureSaleFolders(opts.saleId);
  const folder = df.folders?.[opts.formType] ?? "";
  if (!folder) return null;
  const id = await uploadPdfToDrive(`${df.base} - ${opts.suffix}.pdf`, folder, opts.bytes);
  if (!id) return null;
  const fresh = ((await loadSale(opts.saleId))?.drive_folders ?? df) as DriveFolders;
  if (opts.latest !== false) {
    fresh.latest = { ...(fresh.latest ?? {}), [opts.formType]: id };
    await supabaseAdmin.from("form_submissions").update({ drive_file_id: id }).eq("id", opts.submissionId);
  }
  if (opts.suffix.startsWith("Sadie Signature & Witness")) fresh.ws_signed = id;
  await saveFolders(opts.saleId, fresh);
  return id;
}

// ---------------------------------------------------------- Google Sheets ---

const SHEETS = "https://connector-gateway.lovable.dev/google_sheets/v4";

async function sheetsFetch(path: string, init: RequestInit = {}) {
  const lovableKey = process.env["LOVABLE_API_KEY"]!;
  const key = process.env["GOOGLE_SHEETS_API_KEY"]!;
  const res = await fetch(`${SHEETS}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": key,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Google Sheets request failed [${res.status}]: ${await res.text()}`);
  return res.json();
}

/** Mirror one customer row (looked up by email in column D) into the EKOS tracker sheet. */
export async function syncTrackerSheet(saleId: string): Promise<{ ok: boolean; skipped?: string }> {
  try {
    const s = await settingsMap();
    const gs = s["google_sheets"] ?? {};
    if (String(gs["enabled"]) !== "true") return { ok: false, skipped: "Sync is switched off in Settings." };
    const spreadsheetId = String(gs["spreadsheet_id"] ?? "");
    if (!spreadsheetId || !process.env["GOOGLE_SHEETS_API_KEY"] || !process.env["LOVABLE_API_KEY"]) {
      return { ok: false, skipped: "Google Sheets not configured." };
    }
    const sale = await loadSale(saleId);
    if (!sale?.customer_email) return { ok: false, skipped: "No customer email." };
    const df = (sale.drive_folders ?? {}) as DriveFolders;
    const { data: subs } = await supabaseAdmin
      .from("form_submissions")
      .select("form_type, status, is_draft, drive_file_id")
      .eq("sale_id", saleId);
    const byType = new Map((subs ?? []).map((r) => [r.form_type, r]));

    const meta = (await sheetsFetch(`/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`)) as {
      sheets: { properties: { title: string } }[];
    };
    const title = meta.sheets[0]?.properties.title ?? "Sheet1";
    const q = `'${title.replace(/'/g, "''")}'`;
    const col = (await sheetsFetch(`/spreadsheets/${spreadsheetId}/values/${encodeURI(q)}!A:D`)) as {
      values?: string[][];
    };
    const rows = col.values ?? [];
    const email = sale.customer_email.trim().toLowerCase();
    const idx = rows.findIndex((r) => (r[3] ?? "").trim().toLowerCase() === email);

    const today = ddmmyyyy();
    const created = idx >= 0 ? (rows[idx]![0] ?? df.created ?? today) : (df.created ?? today);
    const status = (ft: string) => {
      const r = byType.get(ft);
      if (!r || r.is_draft) return "";
      return r.status === "Completed" ? "Completed" : "In Review";
    };
    const latest = (ft: string) => driveFileLink(df.latest?.[ft] ?? byType.get(ft)?.drive_file_id ?? "");
    const mainFolder = driveFolderLink(String(s["google_drive"]?.["folder_id"] ?? ""));
    // Escape user-typed text so the sheet never treats it as a formula.
    const cellText = (v: unknown) => { const t = String(v ?? ""); return /^[=+\-@\t\r]/.test(t) ? `'${t}` : t; };
    const row = [
      created,
      today,
      cellText(sale.customer_name),
      cellText(sale.customer_email),
      cellText(sale.customer_phone),
      sale.order_number,
      mainFolder,
      ...FORM_ORDER.map((ft) => df.folders?.[ft] ?? ""),
      ...FORM_ORDER.map(status),
      cellText(sale.sales_person),
      cellText(sale.park_name),
      ...FORM_ORDER.map(latest),
      driveFileLink(df.ws_signed ?? ""),
    ];

    if (idx >= 0) {
      const r = idx + 1;
      await sheetsFetch(
        `/spreadsheets/${spreadsheetId}/values/${encodeURI(q)}!A${r}:Y${r}?valueInputOption=USER_ENTERED`,
        { method: "PUT", body: JSON.stringify({ values: [row] }) },
      );
    } else {
      await sheetsFetch(
        `/spreadsheets/${spreadsheetId}/values/${encodeURI(q)}!A:Y:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        { method: "POST", body: JSON.stringify({ values: [row] }) },
      );
    }
    return { ok: true };
  } catch (e) {
    console.error("Tracker sheet sync failed:", e);
    return { ok: false, skipped: e instanceof Error ? e.message : String(e) };
  }
}
