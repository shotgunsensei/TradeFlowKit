import { eq, and, desc, gte, inArray, or } from "drizzle-orm";
import { db } from "../db";
import {
  orgs,
  quotes,
  invoices,
  orgAutomations,
  reminderLog,
  type OrgAutomations,
  type Org,
  type ReminderLog,
} from "@shared/schema";

async function getOrgAutomationsInternal(orgId: string): Promise<OrgAutomations | undefined> {
  const [row] = await db.select().from(orgAutomations).where(eq(orgAutomations.orgId, orgId));
  return row;
}

export const automationsStorage = {
  getOrgAutomations: getOrgAutomationsInternal,

  async upsertOrgAutomations(orgId: string, data: Partial<OrgAutomations>): Promise<OrgAutomations> {
    const existing = await getOrgAutomationsInternal(orgId);
    if (existing) {
      const [row] = await db.update(orgAutomations)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(orgAutomations.orgId, orgId))
        .returning();
      return row;
    } else {
      const [row] = await db.insert(orgAutomations)
        .values({ orgId, ...data })
        .returning();
      return row;
    }
  },

  async createReminderLog(data: { orgId: string; targetType: string; targetId: string; phoneNumber: string; message: string; status?: string; error?: string }): Promise<ReminderLog> {
    const [row] = await db.insert(reminderLog).values({
      orgId: data.orgId,
      targetType: data.targetType,
      targetId: data.targetId,
      phoneNumber: data.phoneNumber,
      message: data.message,
      status: data.status || "sent",
      error: data.error || null,
    }).returning();
    return row;
  },

  async getReminderLogs(orgId: string, targetType?: string, targetId?: string): Promise<ReminderLog[]> {
    const conditions = [eq(reminderLog.orgId, orgId)];
    if (targetType) conditions.push(eq(reminderLog.targetType, targetType));
    if (targetId) conditions.push(eq(reminderLog.targetId, targetId));
    return db.select().from(reminderLog)
      .where(and(...conditions))
      .orderBy(desc(reminderLog.sentAt));
  },

  async getCustomerReminderLogs(orgId: string, customerId: string): Promise<ReminderLog[]> {
    const customerQuoteIds = await db.select({ id: quotes.id })
      .from(quotes)
      .where(and(eq(quotes.orgId, orgId), eq(quotes.customerId, customerId)));
    const customerInvoiceIds = await db.select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.customerId, customerId)));

    const quoteIds = customerQuoteIds.map(r => r.id);
    const invoiceIds = customerInvoiceIds.map(r => r.id);

    if (quoteIds.length === 0 && invoiceIds.length === 0) return [];

    const orClauses = [];
    if (quoteIds.length > 0) {
      orClauses.push(and(eq(reminderLog.targetType, "quote"), inArray(reminderLog.targetId, quoteIds)));
    }
    if (invoiceIds.length > 0) {
      orClauses.push(and(eq(reminderLog.targetType, "invoice"), inArray(reminderLog.targetId, invoiceIds)));
    }

    return db.select().from(reminderLog)
      .where(and(eq(reminderLog.orgId, orgId), or(...orClauses)))
      .orderBy(desc(reminderLog.sentAt));
  },

  async getRecentReminderLog(orgId: string, targetType: string, targetId: string, since: Date): Promise<ReminderLog | undefined> {
    const [row] = await db.select().from(reminderLog)
      .where(and(
        eq(reminderLog.orgId, orgId),
        eq(reminderLog.targetType, targetType),
        eq(reminderLog.targetId, targetId),
        gte(reminderLog.sentAt, since)
      ))
      .orderBy(desc(reminderLog.sentAt))
      .limit(1);
    return row;
  },

  async getAllOrgsWithAutomations(): Promise<(OrgAutomations & { org: Org })[]> {
    const rows = await db.select()
      .from(orgAutomations)
      .innerJoin(orgs, eq(orgAutomations.orgId, orgs.id));
    return rows.map(r => ({ ...r.org_automations, org: r.orgs }));
  },
};
