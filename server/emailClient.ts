import sgMail from "@sendgrid/mail";

let initialized = false;

function init() {
  if (initialized) return;
  const key = process.env.SENDGRID_API_KEY;
  if (!key) throw new Error("SENDGRID_API_KEY is not configured");
  sgMail.setApiKey(key);
  initialized = true;
}

export interface SendEmailParams {
  to: string;
  fromName: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  init();
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  if (!fromEmail) throw new Error("SENDGRID_FROM_EMAIL is not configured");

  await sgMail.send({
    to: params.to,
    from: { email: fromEmail, name: params.fromName },
    replyTo: params.replyTo,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
}

export interface InvoicePaymentEmailData {
  businessName: string;
  businessEmail?: string | null;
  businessLogoUrl?: string | null;
  customerName: string;
  customerEmail: string;
  invoiceNumber: string;
  totalFormatted: string;
  dueDateFormatted?: string | null;
  payUrl: string;
}

export function buildInvoicePaymentEmail(data: InvoicePaymentEmailData) {
  const subject = `Invoice ${data.invoiceNumber} from ${data.businessName} — ${data.totalFormatted}`;

  const text = [
    `Hi ${data.customerName},`,
    ``,
    `${data.businessName} has sent you invoice ${data.invoiceNumber} for ${data.totalFormatted}.`,
    data.dueDateFormatted ? `Due: ${data.dueDateFormatted}` : null,
    ``,
    `Pay online: ${data.payUrl}`,
    ``,
    `Thank you,`,
    data.businessName,
  ].filter(Boolean).join("\n");

  const safeBiz = escapeHtml(data.businessName);
  const safeCustomer = escapeHtml(data.customerName);
  const safeInv = escapeHtml(data.invoiceNumber);
  const safeTotal = escapeHtml(data.totalFormatted);
  const safeDue = data.dueDateFormatted ? escapeHtml(data.dueDateFormatted) : "";
  const safeUrl = encodeURI(data.payUrl);
  const logoBlock = data.businessLogoUrl
    ? `<img src="${escapeHtml(data.businessLogoUrl)}" alt="${safeBiz}" style="max-height:48px;max-width:200px;display:block;margin:0 auto 16px;" />`
    : `<div style="font-size:20px;font-weight:600;color:#0f172a;text-align:center;margin-bottom:16px;">${safeBiz}</div>`;

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
          <tr>
            <td style="padding:32px 32px 8px;">
              ${logoBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 0;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#0f172a;">Invoice ${safeInv}</h1>
              <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.5;">
                Hi ${safeCustomer}, ${safeBiz} has sent you a new invoice. You can pay online securely using the button below.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                    <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Amount Due</div>
                    <div style="font-size:28px;font-weight:700;color:#0f172a;margin-top:4px;">${safeTotal}</div>
                  </td>
                </tr>
                ${safeDue ? `<tr><td style="padding:14px 20px;font-size:13px;color:#475569;"><strong style="color:#0f172a;">Due date:</strong> ${safeDue}</td></tr>` : ""}
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:28px 32px 8px;">
              <a href="${safeUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 32px;border-radius:8px;">Pay Now</a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 32px 32px;">
              <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;word-break:break-all;">
                Or copy this link: <a href="${safeUrl}" style="color:#2563eb;">${safeUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#64748b;">Sent on behalf of <strong style="color:#0f172a;">${safeBiz}</strong></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
