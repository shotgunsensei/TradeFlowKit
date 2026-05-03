import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import {
  orgs,
  customers,
  quotes,
  quoteItems,
  type Quote,
  type QuoteItem,
  type Customer,
  type Org,
} from "@shared/schema";

export interface QuoteItemInput {
  description: string;
  qty: number | string;
  unitPrice: number | string;
}

export interface QuoteInput {
  customerId?: string | null;
  jobId?: string | null;
  status?: string;
  taxRate?: string;
  discount?: string;
  notes?: string | null;
  expiresAt?: string | Date | null;
  sentAt?: Date | null;
  items?: QuoteItemInput[];
  [key: string]: unknown;
}

export const quotesStorage = {
  async getQuotes(orgId: string): Promise<(Quote & { customerName?: string; total?: number })[]> {
    const allQuotes = await db
      .select()
      .from(quotes)
      .where(eq(quotes.orgId, orgId))
      .orderBy(desc(quotes.createdAt));

    const results = [];
    for (const q of allQuotes) {
      let customerName: string | undefined;
      if (q.customerId) {
        const [c] = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, q.customerId));
        customerName = c?.name;
      }
      const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, q.id));
      const subtotal = items.reduce((sum, it) => sum + Number(it.qty) * Number(it.unitPrice), 0);
      const tax = subtotal * (Number(q.taxRate) / 100);
      const total = subtotal + tax - Number(q.discount);
      results.push({ ...q, customerName, total });
    }
    return results;
  },

  async getQuote(orgId: string, id: string): Promise<(Quote & { items?: QuoteItem[]; customerName?: string; customer?: Customer }) | undefined> {
    const [q] = await db
      .select()
      .from(quotes)
      .where(and(eq(quotes.orgId, orgId), eq(quotes.id, id)));
    if (!q) return undefined;

    const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, id));
    let customerName: string | undefined;
    let customer: Customer | undefined;
    if (q.customerId) {
      const [c] = await db.select().from(customers).where(eq(customers.id, q.customerId));
      customerName = c?.name;
      customer = c;
    }
    return { ...q, items, customerName, customer };
  },

  async getQuotePublic(id: string): Promise<(Quote & { items?: QuoteItem[]; customerName?: string; customer?: Customer; org?: Org }) | undefined> {
    const [q] = await db.select().from(quotes).where(eq(quotes.id, id));
    if (!q) return undefined;
    const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, id));
    let customerName: string | undefined;
    let customer: Customer | undefined;
    if (q.customerId) {
      const [c] = await db.select().from(customers).where(eq(customers.id, q.customerId));
      customerName = c?.name;
      customer = c;
    }
    const [org] = await db.select().from(orgs).where(eq(orgs.id, q.orgId));
    return { ...q, items, customerName, customer, org: org ?? undefined };
  },

  async createQuote(orgId: string, data: QuoteInput, createdBy: string): Promise<Quote> {
    const { items: itemsData, ...quoteData } = data;
    if (quoteData.expiresAt && typeof quoteData.expiresAt === "string") {
      quoteData.expiresAt = new Date(quoteData.expiresAt);
    }
    const [q] = await db
      .insert(quotes)
      .values({ ...quoteData, orgId, createdBy, status: (quoteData.status || "draft") as "draft" } as typeof quotes.$inferInsert)
      .returning();

    if (itemsData && itemsData.length > 0) {
      await db.insert(quoteItems).values(
        itemsData.map((it) => ({
          orgId,
          quoteId: q.id,
          description: it.description,
          qty: String(it.qty),
          unitPrice: String(it.unitPrice),
        }))
      );
    }
    return q;
  },

  async updateQuote(orgId: string, id: string, data: Partial<QuoteInput>): Promise<Quote | undefined> {
    const { items: itemsData, ...quoteData } = data;
    if (quoteData.expiresAt && typeof quoteData.expiresAt === "string") {
      quoteData.expiresAt = new Date(quoteData.expiresAt);
    }
    if (quoteData.status === "sent") {
      const existing = await db.select().from(quotes).where(and(eq(quotes.orgId, orgId), eq(quotes.id, id))).limit(1);
      if (existing[0] && existing[0].status !== "sent" && !existing[0].sentAt) {
        quoteData.sentAt = new Date();
      }
    }
    const [q] = await db
      .update(quotes)
      .set(quoteData as Partial<typeof quotes.$inferInsert>)
      .where(and(eq(quotes.orgId, orgId), eq(quotes.id, id)))
      .returning();
    if (!q) return undefined;

    if (itemsData) {
      await db.delete(quoteItems).where(eq(quoteItems.quoteId, id));
      if (itemsData.length > 0) {
        await db.insert(quoteItems).values(
          itemsData.map((it) => ({
            orgId,
            quoteId: id,
            description: it.description,
            qty: String(it.qty),
            unitPrice: String(it.unitPrice),
          }))
        );
      }
    }
    return q;
  },

  async deleteQuote(orgId: string, id: string): Promise<void> {
    await db.delete(quoteItems).where(eq(quoteItems.quoteId, id));
    await db.delete(quotes).where(and(eq(quotes.orgId, orgId), eq(quotes.id, id)));
  },
};
