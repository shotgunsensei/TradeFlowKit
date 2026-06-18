import { errMsg } from "./errors";
import { storage } from "./storage";
import { sendSMS, isTwilioConfigured } from "./twilioClient";
import { recordDryRunEmailActivity, recordDryRunSmsActivity, renderLeadTemplate } from "./leadMessaging";
import { logger as rootLogger } from "./logger";

const log = rootLogger.child({ component: "reminder-worker" });

const WORKER_INTERVAL_MS = 30 * 60 * 1000;
const DEDUPE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

async function sendReminderSafely(opts: {
  orgId: string;
  targetType: "invoice" | "quote";
  targetId: string;
  toPhone: string;
  fromPhone: string;
  message: string;
  twilioConfigured: boolean;
}): Promise<void> {
  const { orgId, targetType, targetId, toPhone, fromPhone, message, twilioConfigured } = opts;
  try {
    if (twilioConfigured) {
      const ok = await sendSMS(toPhone, fromPhone, message);
      if (!ok) {
        await storage.createReminderLog({
          orgId,
          targetType,
          targetId,
          phoneNumber: toPhone,
          message,
          status: "failed",
          error: "Twilio sendSMS returned false",
        });
        log.warn({ orgId, targetType, targetId, toPhone }, "Reminder send failed (Twilio returned false)");
        return;
      }
    } else {
      log.info({ orgId, targetType, targetId, toPhone }, "Twilio not configured — would send reminder");
    }
    await storage.createReminderLog({
      orgId,
      targetType,
      targetId,
      phoneNumber: toPhone,
      message,
      status: "sent",
    });
    log.info({ orgId, targetType, targetId, toPhone }, "Reminder sent");
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    try {
      await storage.createReminderLog({
        orgId,
        targetType,
        targetId,
        phoneNumber: toPhone,
        message,
        status: "failed",
        error: errMsg,
      });
    } catch (logErr: any) {
      log.error({ err: logErr.message, orgId, targetType, targetId }, "Failed to write reminder failure log row");
    }
    log.error({ err: errMsg, orgId, targetType, targetId, toPhone }, "Reminder send threw");
  }
}

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

        // Skip if a sent or failed log row exists in the last hour for this key
        const windowStart = new Date(now.getTime() - DEDUPE_WINDOW_MS);
        const recentLog = await storage.getRecentReminderLog(org.id, "invoice", invoice.id, windowStart);
        if (recentLog && (recentLog.status === "sent" || recentLog.status === "failed")) continue;

        if (!invoice.customerId) continue;
        const customer = await storage.getCustomer(org.id, invoice.customerId);
        if (!customer?.phone) continue;
        if (customer.smsOptOut) {
          log.info({ orgId: org.id, customerId: customer.id }, "Skipping invoice reminder — SMS opt-out");
          continue;
        }

        const orgPhone = org.phone || "";
        const twilioConfigured = await isTwilioConfigured();

        const message = `Hi ${customer.name}, this is a reminder from ${org.name} that invoice #${invoice.id.slice(-6).toUpperCase()} is ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue. Please contact us to arrange payment. Reply STOP to opt out.`;

        await sendReminderSafely({
          orgId: org.id,
          targetType: "invoice",
          targetId: invoice.id,
          toPhone: customer.phone,
          fromPhone: orgPhone,
          message,
          twilioConfigured,
        });
      }
    }
  } catch (err) {
    log.error({ err, msg: errMsg(err) }, "Error processing invoice reminders");
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

        const windowStart = new Date(now.getTime() - DEDUPE_WINDOW_MS);
        const recentLog = await storage.getRecentReminderLog(org.id, "quote", quote.id, windowStart);
        if (recentLog && (recentLog.status === "sent" || recentLog.status === "failed")) continue;

        if (!quote.customerId) continue;
        const customer = await storage.getCustomer(org.id, quote.customerId);
        if (!customer?.phone) continue;
        if (customer.smsOptOut) {
          log.info({ orgId: org.id, customerId: customer.id }, "Skipping quote follow-up — SMS opt-out");
          continue;
        }

        const orgPhone = org.phone || "";
        const twilioConfigured = await isTwilioConfigured();

        const message = `Hi ${customer.name}, this is a follow-up from ${org.name} about the quote we sent ${daysSinceSent} day${daysSinceSent !== 1 ? "s" : ""} ago. Have you had a chance to review it? We'd love to hear from you. Reply STOP to opt out.`;

        await sendReminderSafely({
          orgId: org.id,
          targetType: "quote",
          targetId: quote.id,
          toPhone: customer.phone,
          fromPhone: orgPhone,
          message,
          twilioConfigured,
        });
      }
    }
  } catch (err) {
    log.error({ err, msg: errMsg(err) }, "Error processing quote follow-ups");
  }
}

async function processRecurringInvoices() {
  try {
    const due = await storage.getInvoicesDueForRecurring(new Date());
    for (const template of due) {
      const org = await storage.getOrg(template.orgId);
      if (!org) continue;
      if (org.plan !== "small_business" && org.plan !== "enterprise") continue;

      try {
        const newInv = await storage.generateInvoiceFromTemplate(template.id);
        if (newInv) {
          log.info({ invoiceId: newInv.id, templateId: template.id }, "Generated recurring invoice");
        }
      } catch (err: any) {
        log.error({ err: err.message, templateId: template.id }, "Failed to generate recurring invoice");
      }
    }
  } catch (err: any) {
    log.error({ err: err.message }, "Error processing recurring invoices");
  }
}

async function processLeadFollowups() {
  try {
    const dueTasks = await storage.getDueLeadFollowupTasks(new Date(), 50);
    for (const task of dueTasks) {
      const lead = await storage.getLead(task.orgId, task.leadId);
      if (!lead || ["converted", "lost", "spam"].includes(lead.status)) {
        await storage.updateLeadFollowupTask(task.orgId, task.id, {
          status: "skipped",
          lastAttemptAt: new Date(),
          completedAt: new Date(),
          error: lead ? `Lead status is ${lead.status}` : "Lead not found",
        });
        continue;
      }

      const org = await storage.getOrg(task.orgId);
      const body = renderLeadTemplate(task.messageTemplate, lead, org);
      try {
        if (task.channel === "sms") {
          if (!lead.consentToSms || !lead.phone) {
            await storage.updateLeadFollowupTask(task.orgId, task.id, {
              status: "failed",
              lastAttemptAt: new Date(),
              error: "SMS follow-up requires consent and a phone number",
            });
            continue;
          }
          await recordDryRunSmsActivity({ orgId: task.orgId, lead, body, createdBy: null });
        } else {
          await recordDryRunEmailActivity({
            orgId: task.orgId,
            lead,
            subject: "Lead follow-up",
            body,
            createdBy: null,
          });
        }

        await storage.updateLeadFollowupTask(task.orgId, task.id, {
          status: "completed",
          lastAttemptAt: new Date(),
          completedAt: new Date(),
        });
        log.info({ orgId: task.orgId, leadId: task.leadId, taskId: task.id }, "Lead follow-up dry-run completed");
      } catch (err: any) {
        await storage.updateLeadFollowupTask(task.orgId, task.id, {
          status: "failed",
          lastAttemptAt: new Date(),
          error: err?.message || String(err),
        });
        log.error({ err: errMsg(err), orgId: task.orgId, leadId: task.leadId, taskId: task.id }, "Lead follow-up dry-run failed");
      }
    }
  } catch (err) {
    log.error({ err, msg: errMsg(err) }, "Error processing lead follow-ups");
  }
}

async function runReminderWorker() {
  log.info("Running reminder checks...");
  await processInvoiceReminders();
  await processQuoteFollowUps();
  await processRecurringInvoices();
  await processLeadFollowups();
  log.info("Reminder checks complete");
}

export function startReminderWorker() {
  runReminderWorker().catch(err => log.error({ err, msg: errMsg(err) }, "Initial run error"));
  const interval = setInterval(() => {
    runReminderWorker().catch(err => log.error({ err, msg: errMsg(err) }, "Run error"));
  }, WORKER_INTERVAL_MS);

  log.info({ intervalMinutes: WORKER_INTERVAL_MS / 60000 }, "Reminder worker started");
  return interval;
}
