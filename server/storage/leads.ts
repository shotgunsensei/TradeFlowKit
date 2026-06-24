import { randomBytes } from "crypto";
import { and, count, countDistinct, desc, eq, gte, ilike, isNotNull, isNull, lte, max, ne, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  customers,
  jobs,
  jobEvents,
  leadActivities,
  leadCaptureForms,
  leadFollowupTasks,
  leadSettings,
  leadSourceEvents,
  leads,
  type Customer,
  type InsertLeadCaptureForm,
  type InsertLeadFollowupTask,
  type InsertLeadSettings,
  type InsertLeadSourceEvent,
  type InsertLead,
  type InsertLeadActivity,
  type Job,
  type Lead,
  type LeadActivity,
  type LeadCaptureForm,
  type LeadFollowupTask,
  type LeadSettings,
  type LeadSourceEvent,
} from "@shared/schema";

export interface LeadFilters {
  status?: string;
  source?: string;
  search?: string;
  hot?: boolean;
}

export interface LeadStats {
  newLeads: number;
  hotLeads: number;
  needsFollowUp: number;
  converted: number;
  totalOpen: number;
}

export interface LeadOperationalMetrics {
  lastLeadReceivedAt: Date | null;
  lastFollowupProcessedAt: Date | null;
  failedMessageCount: number;
  activeLeadSourcesCount: number;
  pendingFollowupCount: number;
}

export const DEFAULT_LEAD_SMS_TEMPLATE = "Hi {name}, this is {business}. We received your request about {service}. What is the best time to follow up?";
export const DEFAULT_LEAD_EMAIL_SUBJECT = "Thanks for contacting {business}";
export const DEFAULT_LEAD_EMAIL_TEMPLATE = "Hi {name}, thanks for reaching out about {service}. We received your request and will follow up shortly.";

function normalizePhone(phone: string | null | undefined): string {
  return (phone || "").replace(/\D/g, "").slice(-10);
}

function normalizeEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

function conversionDescription(lead: Lead): string {
  const lines = [
    lead.description?.trim() ? lead.description.trim() : null,
    "",
    `Source: ${lead.source}${lead.sourceDetail ? ` (${lead.sourceDetail})` : ""}`,
    `Urgency: ${lead.urgency || "normal"}`,
    lead.address ? `Address: ${lead.address}` : null,
    lead.phone ? `Phone: ${lead.phone}` : null,
    lead.email ? `Email: ${lead.email}` : null,
    `Lead score: ${lead.score}`,
    lead.aiSummary ? `AI summary: ${lead.aiSummary}` : null,
  ];
  return lines.filter((line) => line !== null).join("\n");
}

async function findMatchingCustomer(orgId: string, lead: Lead): Promise<Customer | undefined> {
  const phone = normalizePhone(lead.phone);
  const email = normalizeEmail(lead.email);
  const orgCustomers = await db
    .select()
    .from(customers)
    .where(and(eq(customers.orgId, orgId), isNull(customers.deletedAt)));

  return orgCustomers.find((c) => {
    const phoneMatches = phone.length >= 7 && normalizePhone(c.phone) === phone;
    const emailMatches = !!email && normalizeEmail(c.email) === email;
    return phoneMatches || emailMatches;
  });
}

export const leadsStorage = {
  async getLeads(orgId: string, filters: LeadFilters = {}): Promise<Lead[]> {
    const conditions = [eq(leads.orgId, orgId), isNull(leads.deletedAt)];
    if (filters.status) conditions.push(eq(leads.status, filters.status));
    if (filters.source) conditions.push(eq(leads.source, filters.source));
    if (filters.hot) conditions.push(gte(leads.score, 75));
    if (filters.search?.trim()) {
      const q = `%${filters.search.trim()}%`;
      conditions.push(or(
        ilike(leads.name, q),
        ilike(leads.phone, q),
        ilike(leads.email, q),
        ilike(leads.serviceType, q),
        ilike(leads.description, q),
      )!);
    }

    return db.select().from(leads).where(and(...conditions)).orderBy(desc(leads.createdAt));
  },

  async getLead(orgId: string, id: string): Promise<Lead | undefined> {
    const [lead] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.orgId, orgId), eq(leads.id, id), isNull(leads.deletedAt)));
    return lead;
  },

  async getLeadByMissedCall(orgId: string, missedCallId: string): Promise<Lead | undefined> {
    const [lead] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.orgId, orgId), eq(leads.missedCallId, missedCallId), isNull(leads.deletedAt)));
    return lead;
  },

  async createLead(orgId: string, data: InsertLead & { score?: number; scoreBreakdown?: unknown }, createdBy?: string | null): Promise<Lead> {
    const [lead] = await db
      .insert(leads)
      .values({
        ...data,
        orgId,
        createdBy: createdBy || data.createdBy || null,
        consentAt: data.consentToSms && !data.consentAt ? new Date() : data.consentAt || null,
        estimatedValue: data.estimatedValue == null || data.estimatedValue === "" ? null : String(data.estimatedValue),
      } as typeof leads.$inferInsert)
      .returning();
    return lead;
  },

  async updateLead(orgId: string, id: string, data: Partial<Lead>): Promise<Lead | undefined> {
    const payload = { ...data, updatedAt: new Date() } as Partial<typeof leads.$inferInsert>;
    if ("estimatedValue" in payload && (payload.estimatedValue == null || payload.estimatedValue === "")) {
      payload.estimatedValue = null;
    } else if ("estimatedValue" in payload && payload.estimatedValue != null) {
      payload.estimatedValue = String(payload.estimatedValue);
    }

    const [lead] = await db
      .update(leads)
      .set(payload)
      .where(and(eq(leads.orgId, orgId), eq(leads.id, id), isNull(leads.deletedAt)))
      .returning();
    return lead;
  },

  async softDeleteLead(orgId: string, id: string): Promise<void> {
    await db
      .update(leads)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(leads.orgId, orgId), eq(leads.id, id), isNull(leads.deletedAt)));
  },

  async getLeadActivities(orgId: string, leadId: string): Promise<LeadActivity[]> {
    return db
      .select()
      .from(leadActivities)
      .where(and(eq(leadActivities.orgId, orgId), eq(leadActivities.leadId, leadId)))
      .orderBy(desc(leadActivities.createdAt));
  },

  async createLeadActivity(orgId: string, leadId: string, data: InsertLeadActivity): Promise<LeadActivity> {
    const [activity] = await db
      .insert(leadActivities)
      .values({
        ...data,
        orgId,
        leadId,
      } as typeof leadActivities.$inferInsert)
      .returning();
    return activity;
  },

  async getLeadStats(orgId: string): Promise<LeadStats> {
    const now = new Date();
    const activeStatuses = ["converted", "lost", "spam"];
    const [newCount] = await db.select({ c: count() }).from(leads)
      .where(and(eq(leads.orgId, orgId), eq(leads.status, "new"), isNull(leads.deletedAt)));
    const [hotCount] = await db.select({ c: count() }).from(leads)
      .where(and(eq(leads.orgId, orgId), gte(leads.score, 75), isNull(leads.deletedAt), ne(leads.status, "converted")));
    const [followUpCount] = await db.select({ c: count() }).from(leads)
      .where(and(
        eq(leads.orgId, orgId),
        isNull(leads.deletedAt),
        sql`${leads.nextFollowUpAt} IS NOT NULL AND ${leads.nextFollowUpAt} <= ${now}`,
        sql`${leads.status} NOT IN ('converted','lost','spam')`,
      ));
    const [convertedCount] = await db.select({ c: count() }).from(leads)
      .where(and(eq(leads.orgId, orgId), eq(leads.status, "converted"), isNull(leads.deletedAt)));
    const [openCount] = await db.select({ c: count() }).from(leads)
      .where(and(
        eq(leads.orgId, orgId),
        isNull(leads.deletedAt),
        sql`${leads.status} NOT IN (${sql.join(activeStatuses.map((s) => sql`${s}`), sql`,`)})`,
      ));

    return {
      newLeads: newCount.c,
      hotLeads: hotCount.c,
      needsFollowUp: followUpCount.c,
      converted: convertedCount.c,
      totalOpen: openCount.c,
    };
  },

  async getLeadOperationalMetrics(orgId: string): Promise<LeadOperationalMetrics> {
    const [
      [leadRow],
      [followupRow],
      [failedMessageRow],
      [activeSourceRow],
      [pendingFollowupRow],
    ] = await Promise.all([
      db.select({ value: max(leads.createdAt) })
        .from(leads)
        .where(and(eq(leads.orgId, orgId), isNull(leads.deletedAt))),
      db.select({ value: max(leadFollowupTasks.lastAttemptAt) })
        .from(leadFollowupTasks)
        .where(eq(leadFollowupTasks.orgId, orgId)),
      db.select({ value: count() })
        .from(leadActivities)
        .where(and(
          eq(leadActivities.orgId, orgId),
          eq(leadActivities.type, "message"),
          or(
            eq(leadActivities.status, "failed"),
            eq(leadActivities.status, "error"),
            eq(leadActivities.status, "blocked"),
            isNotNull(leadActivities.error),
          ),
        )),
      db.select({ value: countDistinct(leadSourceEvents.adapterKey) })
        .from(leadSourceEvents)
        .where(and(
          eq(leadSourceEvents.orgId, orgId),
          eq(leadSourceEvents.status, "success"),
        )),
      db.select({ value: count() })
        .from(leadFollowupTasks)
        .where(and(
          eq(leadFollowupTasks.orgId, orgId),
          eq(leadFollowupTasks.status, "pending"),
        )),
    ]);

    return {
      lastLeadReceivedAt: leadRow?.value || null,
      lastFollowupProcessedAt: followupRow?.value || null,
      failedMessageCount: Number(failedMessageRow?.value || 0),
      activeLeadSourcesCount: Number(activeSourceRow?.value || 0),
      pendingFollowupCount: Number(pendingFollowupRow?.value || 0),
    };
  },

  async convertLeadToCustomerAndJob(
    orgId: string,
    leadId: string,
    options: { createdBy?: string | null } = {},
  ): Promise<{ lead: Lead; customer: Customer; job: Job }> {
    return db.transaction(async (tx) => {
      const [lead] = await tx
        .select()
        .from(leads)
        .where(and(eq(leads.orgId, orgId), eq(leads.id, leadId), isNull(leads.deletedAt)));
      if (!lead) throw new Error("Lead not found");

      let customer = await findMatchingCustomer(orgId, lead);
      if (!customer) {
        const [created] = await tx.insert(customers).values({
          orgId,
          name: lead.name,
          phone: lead.phone || "",
          email: lead.email || "",
          address: lead.address || "",
          notes: "Created from Lead Conversion Center",
          smsOptOut: false,
          portalToken: randomBytes(24).toString("hex"),
        }).returning();
        customer = created;
      }

      const [job] = await tx.insert(jobs).values({
        orgId,
        customerId: customer.id,
        title: lead.serviceType?.trim() || `Lead: ${lead.name}`,
        description: conversionDescription(lead),
        status: "lead",
        priority: lead.urgency === "emergency" || lead.urgency === "urgent" ? "urgent" : "normal",
        createdBy: options.createdBy || null,
      }).returning();

      await tx.insert(jobEvents).values({
        orgId,
        jobId: job.id,
        type: "created",
        payload: { source: "lead_conversion", leadId: lead.id },
        createdBy: options.createdBy || null,
      });

      const [updatedLead] = await tx.update(leads).set({
        customerId: customer.id,
        jobId: job.id,
        convertedAt: new Date(),
        status: "converted",
        updatedAt: new Date(),
      }).where(and(eq(leads.orgId, orgId), eq(leads.id, lead.id))).returning();

      await tx.insert(leadActivities).values({
        orgId,
        leadId: lead.id,
        type: "conversion",
        status: "converted",
        subject: "Converted to customer and job",
        body: `Created job ${job.id.slice(0, 8).toUpperCase()} for ${customer.name}.`,
        metadata: { customerId: customer.id, jobId: job.id },
        createdBy: options.createdBy || null,
      });

      return { lead: updatedLead, customer, job };
    });
  },

  async getLeadCaptureForms(orgId: string): Promise<LeadCaptureForm[]> {
    return db
      .select()
      .from(leadCaptureForms)
      .where(eq(leadCaptureForms.orgId, orgId))
      .orderBy(desc(leadCaptureForms.createdAt));
  },

  async getLeadCaptureFormByToken(publicToken: string): Promise<LeadCaptureForm | undefined> {
    const [form] = await db
      .select()
      .from(leadCaptureForms)
      .where(eq(leadCaptureForms.publicToken, publicToken));
    return form;
  },

  async createLeadCaptureForm(orgId: string, data: Partial<InsertLeadCaptureForm> = {}): Promise<LeadCaptureForm> {
    const [form] = await db
      .insert(leadCaptureForms)
      .values({
        orgId,
        name: data.name || "Website Lead Form",
        publicToken: data.publicToken || randomBytes(24).toString("hex"),
        sourceLabel: data.sourceLabel || "Website Form",
        isEnabled: data.isEnabled ?? true,
        defaultServiceType: data.defaultServiceType || null,
        successMessage: data.successMessage || "Thanks. We received your request and will follow up shortly.",
      })
      .returning();
    return form;
  },

  async updateLeadCaptureForm(orgId: string, id: string, data: Partial<LeadCaptureForm>): Promise<LeadCaptureForm | undefined> {
    const [form] = await db
      .update(leadCaptureForms)
      .set({ ...data, updatedAt: new Date() } as Partial<typeof leadCaptureForms.$inferInsert>)
      .where(and(eq(leadCaptureForms.orgId, orgId), eq(leadCaptureForms.id, id)))
      .returning();
    return form;
  },

  async ensureDefaultLeadCaptureForm(orgId: string): Promise<LeadCaptureForm> {
    const forms = await this.getLeadCaptureForms(orgId);
    if (forms[0]) return forms[0];
    return this.createLeadCaptureForm(orgId);
  },

  async getLeadSettings(orgId: string): Promise<LeadSettings | undefined> {
    const [settings] = await db
      .select()
      .from(leadSettings)
      .where(eq(leadSettings.orgId, orgId));
    return settings;
  },

  async upsertLeadSettings(orgId: string, data: Partial<InsertLeadSettings>): Promise<LeadSettings> {
    const existing = await this.getLeadSettings(orgId);
    const payload = {
      autoRespond: data.autoRespond ?? true,
      followUpEnabled: data.followUpEnabled ?? true,
      hotLeadThreshold: data.hotLeadThreshold ?? 75,
      dryRun: data.dryRun ?? true,
      smsEnabled: data.smsEnabled ?? false,
      emailEnabled: data.emailEnabled ?? false,
      defaultSmsTemplate: data.defaultSmsTemplate || null,
      defaultEmailSubject: data.defaultEmailSubject || null,
      defaultEmailTemplate: data.defaultEmailTemplate || null,
      smsComplianceFooter: data.smsComplianceFooter || "Reply STOP to opt out.",
      notificationPhone: data.notificationPhone || null,
      notificationEmail: data.notificationEmail || null,
      tradeTemplateKey: data.tradeTemplateKey || null,
      serviceArea: data.serviceArea || null,
      leadSources: Array.isArray(data.leadSources)
        ? data.leadSources.filter((source): source is string => typeof source === "string")
        : [],
    };
    if (existing) {
      const [updated] = await db
        .update(leadSettings)
        .set({ ...data, updatedAt: new Date() } as Partial<typeof leadSettings.$inferInsert>)
        .where(eq(leadSettings.orgId, orgId))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(leadSettings)
      .values({ orgId, ...payload })
      .returning();
    return created;
  },

  async createLeadFollowupTask(orgId: string, leadId: string, data: Omit<InsertLeadFollowupTask, "orgId" | "leadId">): Promise<LeadFollowupTask> {
    const [task] = await db
      .insert(leadFollowupTasks)
      .values({
        ...data,
        orgId,
        leadId,
      } as typeof leadFollowupTasks.$inferInsert)
      .returning();
    return task;
  },

  async getLeadFollowupTasks(orgId: string, leadId: string): Promise<LeadFollowupTask[]> {
    return db
      .select()
      .from(leadFollowupTasks)
      .where(and(eq(leadFollowupTasks.orgId, orgId), eq(leadFollowupTasks.leadId, leadId)))
      .orderBy(leadFollowupTasks.stepNumber);
  },

  async getDueLeadFollowupTasks(now: Date, limit = 50): Promise<LeadFollowupTask[]> {
    return db
      .select()
      .from(leadFollowupTasks)
      .where(and(eq(leadFollowupTasks.status, "pending"), lte(leadFollowupTasks.dueAt, now)))
      .orderBy(leadFollowupTasks.dueAt)
      .limit(limit);
  },

  async updateLeadFollowupTask(orgId: string, id: string, data: Partial<LeadFollowupTask>): Promise<LeadFollowupTask | undefined> {
    const [task] = await db
      .update(leadFollowupTasks)
      .set({ ...data, updatedAt: new Date() } as Partial<typeof leadFollowupTasks.$inferInsert>)
      .where(and(eq(leadFollowupTasks.orgId, orgId), eq(leadFollowupTasks.id, id)))
      .returning();
    return task;
  },

  async createLeadSourceEvent(orgId: string, data: Omit<InsertLeadSourceEvent, "orgId">): Promise<LeadSourceEvent> {
    const [event] = await db
      .insert(leadSourceEvents)
      .values({
        ...data,
        orgId,
      } as typeof leadSourceEvents.$inferInsert)
      .returning();
    return event;
  },

  async getLeadSourceEvents(orgId: string, limit = 25): Promise<LeadSourceEvent[]> {
    return db
      .select()
      .from(leadSourceEvents)
      .where(eq(leadSourceEvents.orgId, orgId))
      .orderBy(desc(leadSourceEvents.createdAt))
      .limit(limit);
  },
};
