import { eq, and, desc, ilike, or, gte, isNull, isNotNull, inArray, lt, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "../db";
import {
  orgs,
  customers,
  jobs,
  quotes,
  quoteItems,
  invoices,
  invoiceItems,
  missedCalls,
  reviewRequests,
  type Customer,
  type InsertCustomer,
  type Job,
  type Quote,
  type Invoice,
  type Org,
} from "@shared/schema";

export const customersStorage = {
  async getCustomers(orgId: string, search?: string): Promise<Customer[]> {
    const baseWhere = and(eq(customers.orgId, orgId), isNull(customers.deletedAt));
    const where = search
      ? and(baseWhere, or(
          ilike(customers.name, `%${search}%`),
          ilike(customers.phone, `%${search}%`),
          ilike(customers.email, `%${search}%`)
        ))
      : baseWhere;
    return db
      .select()
      .from(customers)
      .where(where)
      .orderBy(desc(customers.createdAt));
  },

  async getCustomer(orgId: string, id: string): Promise<Customer | undefined> {
    const [c] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.orgId, orgId), eq(customers.id, id), isNull(customers.deletedAt)));
    return c;
  },

  async createCustomer(orgId: string, data: InsertCustomer): Promise<Customer> {
    const [c] = await db
      .insert(customers)
      .values({ ...data, orgId, portalToken: randomBytes(24).toString("hex") })
      .returning();
    return c;
  },

  async getCustomerByPortalToken(token: string): Promise<Customer | undefined> {
    const [c] = await db.select().from(customers).where(and(eq(customers.portalToken, token), isNull(customers.deletedAt)));
    return c;
  },

  async getCustomerPortalData(customerId: string) {
    const [c] = await db.select().from(customers).where(and(eq(customers.id, customerId), isNull(customers.deletedAt)));
    if (!c) return undefined;
    const [org] = await db.select().from(orgs).where(eq(orgs.id, c.orgId));

    const customerQuotes = await db
      .select()
      .from(quotes)
      .where(and(eq(quotes.orgId, c.orgId), eq(quotes.customerId, c.id)))
      .orderBy(desc(quotes.createdAt));

    const quotesWithTotals: (Quote & { total: number })[] = [];
    for (const q of customerQuotes) {
      const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, q.id));
      const subtotal = items.reduce((s, it) => s + Number(it.qty) * Number(it.unitPrice), 0);
      const tax = subtotal * (Number(q.taxRate) / 100);
      const total = subtotal + tax - Number(q.discount);
      quotesWithTotals.push({ ...q, total });
    }

    const customerInvs = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, c.orgId), eq(invoices.customerId, c.id), isNull(invoices.deletedAt)))
      .orderBy(desc(invoices.createdAt));

    const invoicesWithTotals: (Invoice & { total: number })[] = [];
    for (const inv of customerInvs) {
      const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id));
      const subtotal = items.reduce((s, it) => s + Number(it.qty) * Number(it.unitPrice), 0);
      const tax = subtotal * (Number(inv.taxRate) / 100);
      const total = subtotal + tax - Number(inv.discount);
      invoicesWithTotals.push({ ...inv, total });
    }

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const recentJobs = await db
      .select()
      .from(jobs)
      .where(and(
        eq(jobs.orgId, c.orgId),
        eq(jobs.customerId, c.id),
        isNull(jobs.deletedAt),
        gte(jobs.createdAt, ninetyDaysAgo),
      ))
      .orderBy(desc(jobs.createdAt))
      .limit(20);

    return {
      customer: c,
      org: (org ?? undefined) as Org | undefined,
      quotes: quotesWithTotals,
      invoices: invoicesWithTotals,
      recentJobs,
    };
  },

  async updateCustomer(orgId: string, id: string, data: Partial<Customer>): Promise<Customer | undefined> {
    const payload: Partial<Customer> = { ...data };
    if ("notes" in data) {
      payload.notesUpdatedAt = new Date();
    }
    const [c] = await db
      .update(customers)
      .set(payload)
      .where(and(eq(customers.orgId, orgId), eq(customers.id, id)))
      .returning();
    return c;
  },

  async deleteCustomer(orgId: string, id: string): Promise<void> {
    await db.delete(customers).where(and(eq(customers.orgId, orgId), eq(customers.id, id)));
  },

  async bulkDeleteCustomers(orgId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .update(customers)
      .set({ deletedAt: new Date() })
      .where(and(eq(customers.orgId, orgId), inArray(customers.id, ids), isNull(customers.deletedAt)))
      .returning({ id: customers.id });
    return result.length;
  },

  async bulkRestoreCustomers(orgId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .update(customers)
      .set({ deletedAt: null })
      .where(and(eq(customers.orgId, orgId), inArray(customers.id, ids), isNotNull(customers.deletedAt)))
      .returning({ id: customers.id });
    return result.length;
  },

  async getDeletedCustomers(orgId: string): Promise<Customer[]> {
    return db
      .select()
      .from(customers)
      .where(and(eq(customers.orgId, orgId), isNotNull(customers.deletedAt)))
      .orderBy(desc(customers.deletedAt));
  },

  async hardDeleteCustomer(orgId: string, id: string): Promise<boolean> {
    const [existing] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.orgId, orgId), eq(customers.id, id), isNotNull(customers.deletedAt)));
    if (!existing) return false;

    await db
      .update(jobs)
      .set({ customerId: null })
      .where(and(eq(jobs.orgId, orgId), eq(jobs.customerId, id)));
    await db
      .update(quotes)
      .set({ customerId: null })
      .where(and(eq(quotes.orgId, orgId), eq(quotes.customerId, id)));
    await db
      .update(invoices)
      .set({ customerId: null })
      .where(and(eq(invoices.orgId, orgId), eq(invoices.customerId, id)));
    await db
      .update(missedCalls)
      .set({ customerId: null })
      .where(and(eq(missedCalls.orgId, orgId), eq(missedCalls.customerId, id)));
    await db
      .update(reviewRequests)
      .set({ customerId: null })
      .where(and(eq(reviewRequests.orgId, orgId), eq(reviewRequests.customerId, id)));

    const result = await db
      .delete(customers)
      .where(and(eq(customers.orgId, orgId), eq(customers.id, id), isNotNull(customers.deletedAt)))
      .returning({ id: customers.id });
    return result.length > 0;
  },

  async purgeSoftDeletedCustomers(cutoff: Date): Promise<number> {
    const due = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(isNotNull(customers.deletedAt), lt(customers.deletedAt, cutoff)));
    if (due.length === 0) return 0;
    const ids = due.map((r) => r.id);

    // Null out FKs on dependent tables to satisfy FK constraints.
    await db.update(jobs).set({ customerId: null }).where(inArray(jobs.customerId, ids));
    await db.update(quotes).set({ customerId: null }).where(inArray(quotes.customerId, ids));
    await db.update(invoices).set({ customerId: null }).where(inArray(invoices.customerId, ids));
    await db.update(missedCalls).set({ customerId: null }).where(inArray(missedCalls.customerId, ids));
    await db.update(reviewRequests).set({ customerId: null }).where(inArray(reviewRequests.customerId, ids));

    const result = await db
      .delete(customers)
      .where(inArray(customers.id, ids))
      .returning({ id: customers.id });
    return result.length;
  },
};
