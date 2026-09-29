import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const SALES_ADDRESS = "sales@ekosgroup.co.uk";
/** Customer-facing emails. */
export const FROM_CUSTOMER = `EKOS Group <${SALES_ADDRESS}>`;
/** Internal (staff / construction) emails. */
export const FROM_INTERNAL = `EKOS <${SALES_ADDRESS}>`;
/** Back-compat alias. */
export const FROM_ADDRESS = FROM_CUSTOMER;

export interface EmailAttachment {
  filename: string;
  bytes: Uint8Array;
}

export interface SendEmailInput {
  to: string[];
  cc?: string[];
  from?: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  template: string;
  submissionId?: string | null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function clean(list: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list ?? []) {
    const t = (raw || "").trim();
    if (!t || !t.includes("@")) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/**
 * Sends through Resend (connector gateway). Never throws: delivery problems are
 * recorded in the email log (with recipients, CC and body) so it is always testable.
 */
export const DEFAULT_TEST_RECIPIENT = "emma.frew@breezeconnection.co.uk";

/** Test mode is ON unless the setting explicitly says "false" (fail-safe). */
export async function getEmailTestMode(): Promise<{ enabled: boolean; recipient: string }> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "email_test_mode")
    .maybeSingle();
  const v = (data?.value ?? {}) as Record<string, unknown>;
  const recipient = String(v["recipient"] ?? "").trim();
  return {
    enabled: String(v["enabled"] ?? "true") !== "false",
    recipient: recipient.includes("@") ? recipient : DEFAULT_TEST_RECIPIENT,
  };
}

export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; error?: string | undefined }> {
  const from = input.from ?? FROM_CUSTOMER;
  const intendedTo = clean(input.to);
  const toKeys = new Set(intendedTo.map((t) => t.toLowerCase()));
  const intendedCc = clean(input.cc).filter((c) => !toKeys.has(c.toLowerCase()));

  const testMode = await getEmailTestMode();
  const to = testMode.enabled ? [testMode.recipient] : intendedTo;
  const cc = testMode.enabled ? [] : intendedCc;
  const subject = testMode.enabled
    ? `[TEST → To: ${intendedTo.join(", ") || "(none)"}; CC: ${intendedCc.join(", ") || "(none)"}] ${input.subject}`
    : input.subject;

  const links = Array.from(new Set(Array.from(input.html.matchAll(/href="([^"]+)"/g), (m) => m[1]!.replace(/&amp;/g, "&"))));
  const log = (status: string, error: string | null) =>
    supabaseAdmin.from("email_log").insert({
      submission_id: input.submissionId ?? null,
      to_addresses: to,
      cc_addresses: cc,
      intended_to: intendedTo,
      intended_cc: intendedCc,
      test_mode: testMode.enabled,
      from_address: from,
      subject,
      template: input.template,
      html: input.html,
      links,
      status,
      error,
    });

  if (!intendedTo.length) {
    await log("no_recipient", "No recipient email address – check Admin > Settings.");
    return { ok: false, error: "No recipients" };
  }

  const lovableKey = process.env["LOVABLE_API_KEY"];
  const resendKey = process.env["RESEND_API_KEY"];
  let status = "sent";
  let error: string | undefined;

  if (!resendKey || !lovableKey) {
    status = "not_configured";
    error = "Resend is not connected yet – email recorded but not delivered.";
  } else {
    try {
      const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": resendKey,
        },
        body: JSON.stringify({
          from,
          to,
          ...(cc.length ? { cc } : {}),
          subject,
          html: input.html,
          attachments: (input.attachments ?? []).map((a) => ({
            filename: a.filename,
            content: toBase64(a.bytes),
          })),
        }),
      });
      if (!res.ok) {
        status = "failed";
        error = `Resend request failed [${res.status}]: ${await res.text()}`;
        console.error(error);
      }
    } catch (e) {
      status = "failed";
      error = e instanceof Error ? e.message : String(e);
      console.error("Email send failed:", error);
    }
  }

  await log(status, error ?? null);
  return { ok: status === "sent", error };
}

// ------------------------------------------------------- branded template ---

const GOLD = "#d2a065";
const GREEN = "#1e3932";
const TOP_LOGO = "https://ekosgroup.co.uk/wp-content/uploads/2026/01/Untitled-design-3.png";
const BOTTOM_IMG = "https://ekosgroup.co.uk/wp-content/uploads/2026/01/Untitled-500-x-250-px.png";

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const p = (html: string) =>
  `<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#ffffff;">${html}</p>`;

export const h3 = (text: string) =>
  `<p style="margin:22px 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:${GOLD};">${text}</p>`;

export const goldBox = (text: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;"><tr><td style="border:2px solid ${GOLD};padding:16px 18px;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:bold;color:#ffffff;line-height:1.5;">${text}</td></tr></table>`;

export function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px 0;"><tr><td style="background:${GOLD};border-radius:4px;"><a href="${url}" style="display:inline-block;padding:12px 26px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:${GREEN};text-decoration:none;">${label}</a></td></tr></table>`;
}

export function outlineButton(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px 0;"><tr><td style="border:2px solid ${GOLD};border-radius:4px;"><a href="${url}" style="display:inline-block;padding:10px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:${GOLD};text-decoration:none;">${label}</a></td></tr></table>`;
}

export function detailsTable(rows: [string, unknown][]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;width:100%;border-collapse:collapse;">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 10px;border:1px solid ${GOLD};font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:${GOLD};width:30%;">${esc(k)}</td><td style="padding:8px 10px;border:1px solid ${GOLD};font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#ffffff;">${esc(v)}</td></tr>`,
    )
    .join("")}</table>`;
}

/** Shared EKOS branded email (600px, #1e3932, gold accents). */
export function emailShell(opts: { heading: string; bodyHtml: string; logoUrl?: string }): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ea;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:${GREEN};">
<tr><td align="center" style="padding:28px 24px 8px 24px;"><img src="${TOP_LOGO}" alt="EKOS Homes" width="150" style="display:block;width:150px;max-width:150px;border:0;" /></td></tr>
<tr><td style="padding:16px 36px 8px 36px;">
<h1 style="margin:0 0 20px 0;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:normal;font-size:28px;line-height:1.3;color:${GOLD};">${opts.heading}</h1>
${opts.bodyHtml}
<p style="margin:26px 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#ffffff;">Best regards,</p>
<p style="margin:0 0 28px 0;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:18px;color:${GOLD};">EKOS Homes Team</p>
</td></tr>
<tr><td style="padding:0;"><img src="${BOTTOM_IMG}" alt="" width="600" style="display:block;width:100%;max-width:600px;border:0;" /></td></tr>
</table></td></tr></table></body></html>`;
}
