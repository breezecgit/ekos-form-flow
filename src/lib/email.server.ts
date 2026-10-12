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
export const DEFAULT_TEST_RECIPIENT = "emma.frew@breezeconnection.co.uk, eilidh@breezeconnection.co.uk";
export function parseRecipients(raw: string): string[] {
  return Array.from(new Set(raw.split(/[,;\s]+/).map((x) => x.trim()).filter((x) => x.includes("@"))));
}

/** Test mode is ON unless the setting explicitly says "false" (fail-safe). */
export async function getEmailTestMode(): Promise<{ enabled: boolean; recipient: string; recipients: string[] }> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "email_test_mode")
    .maybeSingle();
  const v = (data?.value ?? {}) as Record<string, unknown>;
  const recipient = String(v["recipient"] ?? "").trim();
  let recipients = parseRecipients(recipient);
  if (!recipients.length) recipients = parseRecipients(DEFAULT_TEST_RECIPIENT);
  return {
    enabled: String(v["enabled"] ?? "true") !== "false",
    recipient: recipients.join(", "),
    recipients,
  };
}

/** Verified Resend subdomain used as the sender while test mode is on. */
export const TEST_SENDER_ADDRESS = "sales@forms.ekosgroup.co.uk";

export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; error?: string | undefined }> {
  const intendedTo = clean(input.to);
  const toKeys = new Set(intendedTo.map((t) => t.toLowerCase()));
  const intendedCc = clean(input.cc).filter((c) => !toKeys.has(c.toLowerCase()));

  const testMode = await getEmailTestMode();
  const baseFrom = input.from ?? FROM_CUSTOMER;
  // Production sender is unchanged; test sends use the verified forms. subdomain.
  const from = testMode.enabled ? baseFrom.replace(SALES_ADDRESS, TEST_SENDER_ADDRESS) : baseFrom;
  const to = testMode.enabled ? testMode.recipients : intendedTo;
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
  `<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#f3efe6;">${html}</p>`;

export const h3 = (text: string) =>
  `<p style="margin:26px 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${GOLD};">${text}</p>`;

export const goldBox = (text: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0;"><tr><td style="background:#26443b;border-left:4px solid ${GOLD};border-radius:0 6px 6px 0;padding:16px 20px;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:bold;color:#ffffff;line-height:1.5;">${text}</td></tr></table>`;

export function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 20px 0;"><tr><td style="background:${GOLD};border-radius:30px;"><a href="${url}" style="display:inline-block;padding:13px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;letter-spacing:0.5px;color:${GREEN};text-decoration:none;">${label}</a></td></tr></table>`;
}

export function outlineButton(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 20px 0;"><tr><td style="border:1px solid ${GOLD};border-radius:30px;"><a href="${url}" style="display:inline-block;padding:11px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;letter-spacing:0.5px;color:${GOLD};text-decoration:none;">${label}</a></td></tr></table>`;
}

export function detailsTable(rows: [string, unknown][]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0;width:100%;border-collapse:collapse;background:#26443b;border-radius:6px;">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:10px 14px;border-bottom:1px solid #33544a;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;letter-spacing:0.5px;color:${GOLD};width:34%;">${esc(k)}</td><td style="padding:10px 14px;border-bottom:1px solid #33544a;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#f3efe6;">${esc(v)}</td></tr>`,
    )
    .join("")}</table>`;
}

/** Shared EKOS branded email (600px, #1e3932, gold accents). */
export function emailShell(opts: { heading: string; bodyHtml: string; logoUrl?: string }): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ea;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:32px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:${GREEN};border-radius:10px;overflow:hidden;">
<tr><td style="padding:0;height:4px;background:${GOLD};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center" style="padding:34px 24px 6px 24px;"><img src="${TOP_LOGO}" alt="EKOS Homes" width="140" style="display:block;width:140px;max-width:140px;border:0;" /></td></tr>
<tr><td align="center" style="padding:0 40px 10px 40px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="width:60px;height:1px;background:${GOLD};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
<tr><td style="padding:18px 40px 8px 40px;">
<h1 style="margin:0 0 22px 0;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:normal;font-size:30px;line-height:1.3;color:${GOLD};">${opts.heading}</h1>
${opts.bodyHtml}
<p style="margin:28px 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#f3efe6;">Best regards,</p>
<p style="margin:0 0 30px 0;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:18px;color:${GOLD};">EKOS Homes Team</p>
</td></tr>
<tr><td style="padding:0;"><img src="${BOTTOM_IMG}" alt="" width="600" style="display:block;width:100%;max-width:600px;border:0;" /></td></tr>
<tr><td align="center" style="padding:22px 40px 26px 40px;border-top:1px solid #33544a;">
<p style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${GOLD};letter-spacing:1px;"><a href="mailto:sales@ekosgroup.co.uk" style="color:${GOLD};text-decoration:none;">sales@ekosgroup.co.uk</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="https://ekosgroup.co.uk" style="color:${GOLD};text-decoration:none;">ekosgroup.co.uk</a></p>
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#8fa89d;">This email was sent by EKOS Homes about your new home purchase. Please do not reply to this automated message.</p>
</td></tr>
</table></td></tr></table></body></html>`;
}
