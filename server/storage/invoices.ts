import { eq, and, desc, sql, inArray, lt, isNull, isNotNull } from "drizzle-orm";
import { db } from "../db";
import {
  orgs,
  customers,
  quotes,
  quoteItems,
  invoices,
  invoiceItems,
  type Invoice,
  type InvoiceItem,
  type Customer,
  type Org,
} from "@shared/schema";
import type { QuoteItemInput } from "./quotes";

export interface InvoiceInput {
  customerId?: string | null;
  jobId?: string | null;
  status?: string;
  taxRate?: string;
  discount?: string;
  notes?: string | null;
  dueDate?: string | Date | null;
  paidAt?: Date | null;
  paidViaStripe?: boolean;
  stripePaymentIntentId?: string | null;
  items?: QuoteItemInput[];
  [key: string]: unknown;
}

export const invoicesStorage = {
  async getInvoices(orgId: string): Promise<(Invoice & { customerName?: string; total?: number })[]> {
    const allInvoices = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), isNull(invoices.deletedAt)))
      .orderBy(desc(invoices.createdAt));

    const results = [];
    for (const inv of allInvoices) {
      let customerName: string | undefined;
      if (inv.customerId) {
        const [c] = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, inv.customerId));
        customerName = c?.name;
      }
      const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id));
      const subtotal = items.reduce((sum, it) => sum + Number(it.qty) * Number(it.unitPrice), 0);
      const tax = subtotal * (Number(inv.taxRate) / 100);
      const total = subtotal + tax - Number(inv.discount);
      results.push({ ...inv, customerName, total });
    }
    return results;
  },

  async getInvoice(orgId: string, id: string): Promise<(Invoice & { items?: InvoiceItem[]; customerName?: string; customer?: Customer }) | undefined> {
    const [inv] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.id, id), isNull(invoices.deletedAt)));
    if (!inv) return undefined;

    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id));
    let customerName: string | undefined;
    let customer: Customer | undefined;
    if (inv.customerId) {
      const [c] = await db.select().from(customers).where(eq(customers.id, inv.customerId));
      customerName = c?.name;
      customer = c;
    }
    return { ...inv, items, customerName, customer };
  },

  async getInvoiceByStripePaymentIntentId(paymentIntentId: string): Promise<Invoice | undefined> {
    const [inv] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.stripePaymentIntentId, paymentIntentId));
    return inv;
  },

  async getInvoicePublic(id: string): Promise<(Invoice & { items?: InvoiceItem[]; customerName?: string; customer?: Customer; org?: Org }) | undefined> {
    const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, id), isNull(invoices.deletedAt)));
    if (!inv) return undefined;

    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id));
    let customerName: string | undefined;
    let customer: Customer | undefined;
    if (inv.customerId) {
      const [c] = await db.select().from(customers).where(eq(customers.id, inv.customerId));
      customerName = c?.name;
      customer = c;
    }
    const [org] = await db.select().from(orgs).where(eq(orgs.id, inv.orgId));
    return { ...inv, items, customerName, customer, org: org ?? undefined };
  },

  async getCustomerInvoices(orgId: string, customerId: string): Promise<Invoice[]> {
    return db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.customerId, customerId), isNull(invoices.deletedAt)))
      .orderBy(desc(invoices.createdAt));
  },

  async createInvoice(orgId: string, data: InvoiceInput, createdBy: string): Promise<Invoice> {
    const { items: itemsData, ...invoiceData } = data;
    const [inv] = await db
      .insert(invoices)
      .values({
        ...invoiceData,
        orgId,
        createdBy,
        status: (invoiceData.status || "draft") as "draft",
        dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : null,
      } as typeof invoices.$inferInsert)
      .returning();

    if (itemsData && itemsData.length > 0) {
      await db.insert(invoiceItems).values(
        itemsData.map((it) => ({
          orgId,
          invoiceId: inv.id,
          description: it.description,
          qty: String(it.qty),
          unitPrice: String(it.unitPrice),
        }))
      );
    }
    return inv;
  },

  async updateInvoice(orgId: string, id: string, data: Partial<InvoiceInput>): Promise<Invoice | undefined> {
    const { items: itemsData, ...invoiceData } = data;
    if (invoiceData.dueDate) {
      invoiceData.dueDate = new Date(invoiceData.dueDate);
    }
    if (invoiceData.status === "paid" && !invoiceData.paidAt) {
      invoiceData.paidAt = new Date();
    }
    const [inv] = await db
      .update(invoices)
      .set(invoiceData as Partial<typeof invoices.$inferInsert>)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)))
      .returning();
    if (!inv) return undefined;

    if (itemsData) {
      await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
      if (itemsData.length > 0) {
        await db.insert(invoiceItems).values(
          itemsData.map((it) => ({
            orgId,
            invoiceId: id,
            description: it.description,
            qty: String(it.qty),
            unitPrice: String(it.unitPrice),
          }))
        );
      }
    }
    return inv;
  },

  async deleteInvoice(orgId: string, id: string): Promise<void> {
    await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
    await db.delete(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)));
  },

  async getInvoicesDueForRecurring(now: Date): Promise<Invoice[]> {
    return db
      .select()
      .from(invoices)
      .where(and(
        sql`${invoices.recurringInterval} IS NOT NULL`,
        sql`${invoices.nextRunAt} IS NOT NULL`,
        lt(invoices.nextRunAt, now),
      ));
  },

  async generateInvoiceFromTemplate(templateId: string): Promise<Invoice | undefined> {
    const [template] = await db.select().from(invoices).where(eq(invoices.id, templateId));
    if (!template || !template.recurringInterval) return undefined;

    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, templateId));

    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const [newInv] = await db
      .insert(invoices)
      .values({
        orgId: template.orgId,
        customerId: template.customerId,
        jobId: null,
        status: "draft",
        taxRate: template.taxRate,
        discount: template.discount,
        dueDate,
        notes: template.notes,
        parentInvoiceId: template.id,
        createdBy: template.createdBy,
      })
      .returning();

    if (items.length > 0) {
      await db.insert(invoiceItems).values(
        items.map((it) => ({
          orgId: template.orgId,
          invoiceId: newInv.id,
          description: it.description,
          qty: it.qty,
          unitPrice: it.unitPrice,
        }))
      );
    }

    const { advanceRecurringDate } = await import("@shared/schema");
    const nextRun = advanceRecurringDate(template.nextRunAt || new Date(), template.recurringInterval as any);
    await db
      .update(invoices)
      .set({ nextRunAt: nextRun })
      .where(eq(invoices.id, templateId));

    return newInv;
  },

  async convertQuoteToInvoice(orgId: string, quoteId: string, createdBy: string): Promise<Invoice | undefined> {
    const [q] = await db
      .select()
      .from(quotes)
      .where(and(eq(quotes.orgId, orgId), eq(quotes.id, quoteId)));
    if (!q) return undefined;

    const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, quoteId));

    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const [newInv] = await db
      .insert(invoices)
      .values({
        orgId,
        customerId: q.customerId,
        jobId: q.jobId,
        status: "draft",
        taxRate: q.taxRate,
        discount: q.discount,
        dueDate,
        notes: q.notes,
        createdBy,
      })
      .returning();

    if (items.length > 0) {
      await db.insert(invoiceItems).values(
        items.map((it) => ({
          orgId,
          invoiceId: newInv.id,
          description: it.description,
          qty: it.qty,
          unitPrice: it.unitPrice,
        }))
      );
    }

    return newInv;
  },

  async bulkDeleteInvoices(orgId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .update(invoices)
      .set({ deletedAt: new Date() })
      .where(and(eq(invoices.orgId, orgId), inArray(invoices.id, ids), isNull(invoices.deletedAt)))
      .returning({ id: invoices.id });
    return result.length;
  },

  async bulkRestoreInvoices(orgId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .update(invoices)
      .set({ deletedAt: null })
      .where(and(eq(invoices.orgId, orgId), inArray(invoices.id, ids), isNotNull(invoices.deletedAt)))
      .returning({ id: invoices.id });
    return result.length;
  },

  async getDeletedInvoices(orgId: string): Promise<(Invoice & { customerName?: string; total?: number })[]> {
    const rows = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), isNotNull(invoices.deletedAt)))
      .orderBy(desc(invoices.deletedAt));
    const results = [];
    for (const inv of rows) {
      let customerName: string | undefined;
      if (inv.customerId) {
        const [c] = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, inv.customerId));
        customerName = c?.name;
      }
      const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id));
      const subtotal = items.reduce((sum, it) => sum + Number(it.qty) * Number(it.unitPrice), 0);
      const tax = subtotal * (Number(inv.taxRate) / 100);
      const total = subtotal + tax - Number(inv.discount);
      results.push({ ...inv, customerName, total });
    }
    return results;
  },

  async hardDeleteInvoice(orgId: string, id: string): Promise<boolean> {
    const [existing] = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.id, id), isNotNull(invoices.deletedAt)));
    if (!existing) return false;
    await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
    const result = await db
      .delete(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.id, id), isNotNull(invoices.deletedAt)))
      .returning({ id: invoices.id });
    return result.length > 0;
  },

  async purgeSoftDeletedInvoices(cutoff: Date): Promise<number> {
    const due = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(isNotNull(invoices.deletedAt), lt(invoices.deletedAt, cutoff)));
    if (due.length === 0) return 0;
    const ids = due.map((r) => r.id);

    // invoice_items has ON DELETE CASCADE, but delete explicitly for clarity
    // (and to keep the cascade logic in one obvious place).
    await db.delete(invoiceItems).where(inArray(invoiceItems.invoiceId, ids));

    // Detach recurring children pointing at a soft-deleted template.
    await db.update(invoices).set({ parentInvoiceId: null }).where(inArray(invoices.parentInvoiceId, ids));

    const result = await db
      .delete(invoices)
      .where(inArray(invoices.id, ids))
      .returning({ id: invoices.id });
    return result.length;
  },

  async bulkMarkInvoicesPaid(orgId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const now = new Date();
    const result = await db
      .update(invoices)
      .set({ status: "paid" as any, paidAt: now })
      .where(and(
        eq(invoices.orgId, orgId),
        inArray(invoices.id, ids),
        sql`${invoices.status} != 'paid'`
      ))
      .returning({ id: invoices.id });
    return result.length;
  },
};
