import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const FROM_ADDRESS = "EKOS Group <sales@ekosgroup.co.uk>";

export interface EmailAttachment {
  filename: string;
  bytes: Uint8Array;
}

export interface SendEmailInput {
  to: string[];
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

/**
 * Sends through Resend (connector gateway). Never throws: delivery problems are
 * recorded in the email log so the tracker always shows what happened.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; error?: string | undefined }> {
  const recipients = Array.from(new Set(input.to.map((t) => (t || "").trim()).filter(Boolean)));
  if (!recipients.length) {
    await supabaseAdmin.from("email_log").insert({
      submission_id: input.submissionId ?? null,
      to_addresses: [],
      from_address: FROM_ADDRESS,
      subject: input.subject,
      template: input.template,
      status: "no_recipient",
      error: "No recipient email address – add it in Admin > Settings.",
    });
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
          from: FROM_ADDRESS,
          to: recipients,
          subject: input.subject,
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

  await supabaseAdmin.from("email_log").insert({
    submission_id: input.submissionId ?? null,
    to_addresses: recipients,
    from_address: FROM_ADDRESS,
    subject: input.subject,
    template: input.template,
    status,
    error: error ?? null,
  });

  return { ok: status === "sent", error };
}

/** Branded EKOS email shell: dark green header, gold accents. */
export function emailShell(opts: {
  logoUrl: string;
  heading: string;
  bodyHtml: string;
}): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f7f5f0;font-family:Helvetica,Arial,sans-serif;color:#11241f;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f0;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#07362E;padding:24px;text-align:center;">
          <img src="${opts.logoUrl}" alt="EKOS Group" width="150" style="display:block;margin:0 auto;max-width:150px;" />
        </td></tr>
        <tr><td style="height:4px;background:#C18F4C;"></td></tr>
        <tr><td style="padding:28px 28px 8px 28px;">
          <h1 style="margin:0 0 16px 0;font-size:20px;color:#07362E;">${opts.heading}</h1>
          ${opts.bodyHtml}
        </td></tr>
        <tr><td style="padding:20px 28px 28px 28px;color:#6b7470;font-size:12px;line-height:1.6;">
          EKOS Group &middot; sales@ekosgroup.co.uk
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function button(label: string, url: string): string {
  return `<p style="margin:18px 0;"><a href="${url}" style="background:#C18F4C;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;display:inline-block;font-weight:bold;">${label}</a></p>`;
}
