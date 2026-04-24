import { storage } from "./storage";
import { sendSMS, isTwilioConfigured } from "./twilioClient";

const WORKER_INTERVAL_MS = 30 * 60 * 1000;

async function processInvoiceReminders() {
  try {
    const orgsWithAutomations = await storage.getAllOrgsWithAutomations();

    for (const automation of orgsWithAutomations) {
      if (!automation.invoiceReminder) continue;

      const org = automation.org;
      const plan = org.plan;
      if (plan !== "small_business" && plan !== "enterprise") continue;

      const invoices = await storage.getInvoices(org.id);
      const sentInvoices = invoices.filter(inv => inv.status === "sent" && inv.dueDate);

      for (const invoice of sentInvoices) {
        if (!invoice.dueDate) continue;

        const dueDate = new Date(invoice.dueDate);
        const now = new Date();
        if (dueDate >= now) continue;

        const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

        const reminderDays = automation.invoiceReminderDays || [3, 7, 14];
        const shouldRemind = reminderDays.includes(daysOverdue);
        if (!shouldRemind) continue;

        const windowStart = new Date(now.getTime() - 23 * 60 * 60 * 1000);
        const recentLog = await storage.getRecentReminderLog(org.id, "invoice", invoice.id, windowStart);
        if (recentLog) continue;

        if (!invoice.customerId) continue;
        const customer = await storage.getCustomer(org.id, invoice.customerId);
        if (!customer?.phone) continue;

        const orgPhone = org.phone || "";
        const twilioConfigured = await isTwilioConfigured();

        const message = `Hi ${customer.name}, this is a reminder from ${org.name} that invoice #${invoice.id.slice(-6).toUpperCase()} is ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue. Please contact us to arrange payment. Reply STOP to opt out.`;

        let sent = false;
        if (twilioConfigured) {
          sent = await sendSMS(customer.phone, orgPhone, message);
        } else {
          console.log(`[ReminderWorker] Would send invoice reminder to ${customer.phone}: ${message}`);
          sent = true;
        }

        if (sent) {
          await storage.createReminderLog({
            orgId: org.id,
            targetType: "invoice",
            targetId: invoice.id,
            phoneNumber: customer.phone,
            message,
          });
          console.log(`[ReminderWorker] Invoice reminder sent to ${customer.phone} for invoice ${invoice.id} (${daysOverdue} days overdue)`);
        }
      }
    }
  } catch (err: any) {
    console.error("[ReminderWorker] Error processing invoice reminders:", err.message);
  }
}

async function processQuoteFollowUps() {
  try {
    const orgsWithAutomations = await storage.getAllOrgsWithAutomations();

    for (const automation of orgsWithAutomations) {
      if (!automation.quoteFollowUp) continue;

      const org = automation.org;
      const plan = org.plan;
      if (plan !== "small_business" && plan !== "enterprise") continue;

      const quotes = await storage.getQuotes(org.id);
      const sentQuotes = quotes.filter(q => q.status === "sent" && q.sentAt);

      for (const quote of sentQuotes) {
        const sentAt = new Date(quote.sentAt!);
        const now = new Date();

        const daysSinceSent = Math.floor((now.getTime() - sentAt.getTime()) / (1000 * 60 * 60 * 24));

        const followUpDays = automation.quoteFollowUpDays || [3, 5, 7];
        const shouldFollowUp = followUpDays.includes(daysSinceSent);
        if (!shouldFollowUp) continue;

        const windowStart = new Date(now.getTime() - 23 * 60 * 60 * 1000);
        const recentLog = await storage.getRecentReminderLog(org.id, "quote", quote.id, windowStart);
        if (recentLog) continue;

        if (!quote.customerId) continue;
        const customer = await storage.getCustomer(org.id, quote.customerId);
        if (!customer?.phone) continue;

        const orgPhone = org.phone || "";
        const twilioConfigured = await isTwilioConfigured();

        const message = `Hi ${customer.name}, this is a follow-up from ${org.name} about the quote we sent ${daysSinceSent} day${daysSinceSent !== 1 ? "s" : ""} ago. Have you had a chance to review it? We'd love to hear from you. Reply STOP to opt out.`;

        let sent = false;
        if (twilioConfigured) {
          sent = await sendSMS(customer.phone, orgPhone, message);
        } else {
          console.log(`[ReminderWorker] Would send quote follow-up to ${customer.phone}: ${message}`);
          sent = true;
        }

        if (sent) {
          await storage.createReminderLog({
            orgId: org.id,
            targetType: "quote",
            targetId: quote.id,
            phoneNumber: customer.phone,
            message,
          });
          console.log(`[ReminderWorker] Quote follow-up sent to ${customer.phone} for quote ${quote.id} (${daysSinceSent} days since sent)`);
        }
      }
    }
  } catch (err: any) {
    console.error("[ReminderWorker] Error processing quote follow-ups:", err.message);
  }
}

async function runReminderWorker() {
  console.log("[ReminderWorker] Running reminder checks...");
  await processInvoiceReminders();
  await processQuoteFollowUps();
  console.log("[ReminderWorker] Reminder checks complete.");
}

export function startReminderWorker() {
  runReminderWorker().catch(err => console.error("[ReminderWorker] Initial run error:", err.message));
  const interval = setInterval(() => {
    runReminderWorker().catch(err => console.error("[ReminderWorker] Error:", err.message));
  }, WORKER_INTERVAL_MS);

  console.log(`[ReminderWorker] Started. Runs every ${WORKER_INTERVAL_MS / 60000} minutes.`);
  return interval;
}
