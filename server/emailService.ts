import sgMail, { type MailDataRequired } from "@sendgrid/mail";

let initialized = false;

function init() {
  if (initialized) return;
  const key = process.env.SENDGRID_API_KEY;
  if (!key) throw new Error("SENDGRID_API_KEY is not configured");
  sgMail.setApiKey(key);
  initialized = true;
}

export function isEmailConfigured(): boolean {
  return !!process.env.SENDGRID_API_KEY && !!process.env.SENDGRID_FROM_EMAIL;
}

interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachmentBuffer: Buffer;
  attachmentFilename: string;
  fromName?: string;
  replyTo?: string;
}

export async function sendDocumentEmail(params: SendEmailParams): Promise<void> {
  init();
  const fromEmail = process.env.SENDGRID_FROM_EMAIL!;
  const msg: MailDataRequired = {
    to: params.to,
    from: params.fromName
      ? { email: fromEmail, name: params.fromName }
      : fromEmail,
    subject: params.subject,
    text: params.text,
    html: params.html,
    attachments: [
      {
        content: params.attachmentBuffer.toString("base64"),
        filename: params.attachmentFilename,
        type: "application/pdf",
        disposition: "attachment",
      },
    ],
  };
  if (params.replyTo) msg.replyTo = params.replyTo;
  await sgMail.send(msg);
}

interface BuildEmailContentParams {
  recipientName: string;
  orgName: string;
  documentType: "quote" | "invoice";
  documentNumber: string;
  total: string;
  dueOrExpiry?: { label: string; value: string };
  customMessage?: string;
  publicLink?: string;
}

export function buildEmailContent(p: BuildEmailContentParams): { text: string; html: string } {
  const greeting = `Dear ${p.recipientName},`;
  const intro =
    p.customMessage?.trim() ||
    `Please find attached ${p.documentType === "quote" ? "your quote" : "your invoice"} #${p.documentNumber} from ${p.orgName}.`;
  const totalLine = `Total: ${p.total}`;
  const dueLine = p.dueOrExpiry ? `${p.dueOrExpiry.label}: ${p.dueOrExpiry.value}` : "";
  const linkLine = p.publicLink
    ? p.documentType === "quote"
      ? `View online: ${p.publicLink}`
      : `Pay online: ${p.publicLink}`
    : "";
  const closing = `Thank you for your business.\n\n${p.orgName}`;

  const text = [greeting, "", intro, "", totalLine, dueLine, "", linkLine, "", closing]
    .filter((l) => l !== undefined)
    .join("\n");

  const safe = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;background:#f5f5f5;padding:24px;margin:0;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;border:1px solid #e5e7eb;">
    <p style="margin:0 0 16px 0;font-size:15px;">${safe(greeting)}</p>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#374151;white-space:pre-wrap;">${safe(intro)}</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;border:1px solid #e5e7eb;border-radius:6px;">
      <tr>
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;">${p.documentType === "quote" ? "Quote" : "Invoice"} #</td>
        <td style="padding:12px 16px;text-align:right;font-weight:600;font-size:13px;">${safe(p.documentNumber)}</td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;">Total</td>
        <td style="padding:12px 16px;text-align:right;font-weight:700;font-size:15px;color:#111827;">${safe(p.total)}</td>
      </tr>
      ${p.dueOrExpiry
        ? `<tr><td style="padding:12px 16px;color:#6b7280;font-size:13px;">${safe(p.dueOrExpiry.label)}</td><td style="padding:12px 16px;text-align:right;font-size:13px;">${safe(p.dueOrExpiry.value)}</td></tr>`
        : ""}
    </table>
    ${p.publicLink
      ? `<p style="margin:24px 0;text-align:center;"><a href="${safe(p.publicLink)}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">${p.documentType === "quote" ? "View Quote" : "Pay Invoice"}</a></p>`
      : ""}
    <p style="margin:16px 0 0 0;font-size:13px;color:#6b7280;">A PDF copy is attached for your records.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="margin:0;font-size:13px;color:#374151;">Thank you for your business.</p>
    <p style="margin:4px 0 0 0;font-size:13px;font-weight:600;color:#111827;">${safe(p.orgName)}</p>
  </div>
</body></html>`;

  return { text, html };
}
