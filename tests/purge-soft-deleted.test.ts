import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { storage } from "../server/storage";
import { db, pool } from "../server/db";
import {
  customers,
  jobs,
  jobEvents,
  quotes,
  invoices,
  invoiceItems,
  missedCalls,
  reviewRequests,
} from "@shared/schema";
import { setupOrg, trackOrg, trackUser, cleanupAll } from "./helpers";

const HOUR = 60 * 60 * 1000;

describe("Soft-deleted purge cascade", () => {
  let org: any, user: any;

  beforeAll(async () => {
    const s = await setupOrg("small_business");
    org = s.org;
    user = s.user;
    trackOrg(org.id);
    trackUser(user.id);
  });

  afterAll(async () => {
    await cleanupAll();
    await pool.end();
  });

  async function softDelete(table: any, id: string, when: Date = new Date()) {
    await db.update(table).set({ deletedAt: when }).where(eq(table.id, id));
  }

  describe("purgeSoftDeletedJobs", () => {
    it("removes old jobs, keeps new ones, cascades dependents and nulls FKs", async () => {
      const cust = await storage.createCustomer(org.id, { name: "J Cust", phone: "" } as any);

      const oldJob = await storage.createJob(
        org.id,
        { title: "Old Job", customerId: cust.id, status: "lead" } as any,
        user.id,
      );
      const newJob = await storage.createJob(
        org.id,
        { title: "New Job", customerId: cust.id, status: "lead" } as any,
        user.id,
      );
      const parentJob = await storage.createJob(
        org.id,
        { title: "Parent", customerId: cust.id, status: "lead", isRecurring: true } as any,
        user.id,
      );
      const childJob = await storage.createJob(
        org.id,
        { title: "Child", customerId: cust.id, status: "lead", parentJobId: parentJob.id } as any,
        user.id,
      );

      // job_events dependent rows (one for old, one for new)
      await storage.createJobEvent(org.id, oldJob.id, "note", { msg: "old" }, user.id);
      await storage.createJobEvent(org.id, newJob.id, "note", { msg: "new" }, user.id);

      // review_requests dependent rows
      const [rrOld] = await db.insert(reviewRequests).values({
        orgId: org.id, jobId: oldJob.id, customerId: cust.id, phoneNumber: "1", reviewUrl: "x",
      }).returning();
      const [rrNew] = await db.insert(reviewRequests).values({
        orgId: org.id, jobId: newJob.id, customerId: cust.id, phoneNumber: "2", reviewUrl: "y",
      }).returning();

      // quotes / invoices referencing old job (FKs must get nulled)
      const q = await storage.createQuote(
        org.id,
        { customerId: cust.id, jobId: oldJob.id, taxRate: "0", discount: "0", status: "draft",
          items: [{ description: "i", qty: 1, unitPrice: 10 }] } as any,
        user.id,
      );
      const inv = await storage.createInvoice(
        org.id,
        { customerId: cust.id, jobId: oldJob.id, taxRate: "0", discount: "0", status: "draft",
          items: [{ description: "i", qty: 1, unitPrice: 10 }] } as any,
        user.id,
      );

      // missed_calls referencing old job
      const [mc] = await db.insert(missedCalls).values({
        orgId: org.id, callerPhone: "555", jobId: oldJob.id, customerId: cust.id,
      }).returning();

      // Soft-delete: backdated for old/parent, recent for new
      const old = new Date(Date.now() - 48 * HOUR);
      await softDelete(jobs, oldJob.id, old);
      await softDelete(jobs, parentJob.id, old);
      await softDelete(jobs, newJob.id, new Date());

      const cutoff = new Date(Date.now() - HOUR); // 1h ago
      const purged = await storage.purgeSoftDeletedJobs(cutoff);
      expect(purged).toBe(2); // oldJob + parentJob

      // Old + parent gone
      const remainingJobs = await db.select({ id: jobs.id }).from(jobs)
        .where(inArray(jobs.id, [oldJob.id, parentJob.id, newJob.id, childJob.id]));
      const remIds = remainingJobs.map((r) => r.id);
      expect(remIds).not.toContain(oldJob.id);
      expect(remIds).not.toContain(parentJob.id);
      expect(remIds).toContain(newJob.id);
      expect(remIds).toContain(childJob.id);

      // Dependent rows for old job: gone
      const remEvents = await db.select().from(jobEvents).where(eq(jobEvents.jobId, oldJob.id));
      expect(remEvents.length).toBe(0);
      const remRrOld = await db.select().from(reviewRequests).where(eq(reviewRequests.id, rrOld.id));
      expect(remRrOld.length).toBe(0);

      // New job's dependents still present
      const newEvents = await db.select().from(jobEvents).where(eq(jobEvents.jobId, newJob.id));
      expect(newEvents.length).toBeGreaterThan(0);
      const remRrNew = await db.select().from(reviewRequests).where(eq(reviewRequests.id, rrNew.id));
      expect(remRrNew.length).toBe(1);

      // FKs nulled on quotes/invoices/missed_calls
      const [freshQ] = await db.select().from(quotes).where(eq(quotes.id, q.id));
      expect(freshQ.jobId).toBeNull();
      const [freshInv] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
      expect(freshInv.jobId).toBeNull();
      const [freshMc] = await db.select().from(missedCalls).where(eq(missedCalls.id, mc.id));
      expect(freshMc.jobId).toBeNull();

      // Child job's parentJobId nulled
      const [freshChild] = await db.select().from(jobs).where(eq(jobs.id, childJob.id));
      expect(freshChild.parentJobId).toBeNull();
    });
  });

  describe("purgeSoftDeletedInvoices", () => {
    it("removes old invoices, keeps new ones, deletes invoice_items, nulls parent_invoice_id", async () => {
      const cust = await storage.createCustomer(org.id, { name: "I Cust", phone: "" } as any);

      const oldInv = await storage.createInvoice(
        org.id,
        { customerId: cust.id, taxRate: "0", discount: "0", status: "draft",
          items: [{ description: "a", qty: 1, unitPrice: 5 }, { description: "b", qty: 2, unitPrice: 7 }] } as any,
        user.id,
      );
      const newInv = await storage.createInvoice(
        org.id,
        { customerId: cust.id, taxRate: "0", discount: "0", status: "draft",
          items: [{ description: "c", qty: 1, unitPrice: 9 }] } as any,
        user.id,
      );
      // Child invoice referencing oldInv as recurring parent
      const [childInv] = await db.insert(invoices).values({
        orgId: org.id, customerId: cust.id, status: "draft", parentInvoiceId: oldInv.id,
      }).returning();

      await softDelete(invoices, oldInv.id, new Date(Date.now() - 48 * HOUR));
      await softDelete(invoices, newInv.id, new Date());

      const cutoff = new Date(Date.now() - HOUR);
      const purged = await storage.purgeSoftDeletedInvoices(cutoff);
      expect(purged).toBe(1);

      const remOld = await db.select().from(invoices).where(eq(invoices.id, oldInv.id));
      expect(remOld.length).toBe(0);
      const remNew = await db.select().from(invoices).where(eq(invoices.id, newInv.id));
      expect(remNew.length).toBe(1);

      // invoice_items for old gone, for new intact
      const oldItems = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, oldInv.id));
      expect(oldItems.length).toBe(0);
      const newItems = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, newInv.id));
      expect(newItems.length).toBe(1);

      // Child invoice's parent FK nulled
      const [freshChild] = await db.select().from(invoices).where(eq(invoices.id, childInv.id));
      expect(freshChild.parentInvoiceId).toBeNull();
    });
  });

  describe("purgeSoftDeletedCustomers", () => {
    it("removes old customers, keeps new ones, nulls FKs on jobs/quotes/invoices/missed_calls/review_requests", async () => {
      const oldCust = await storage.createCustomer(org.id, { name: "Old C", phone: "" } as any);
      const newCust = await storage.createCustomer(org.id, { name: "New C", phone: "" } as any);

      const jb = await storage.createJob(
        org.id,
        { title: "Refd", customerId: oldCust.id, status: "lead" } as any,
        user.id,
      );
      const q = await storage.createQuote(
        org.id,
        { customerId: oldCust.id, taxRate: "0", discount: "0", status: "draft",
          items: [{ description: "x", qty: 1, unitPrice: 1 }] } as any,
        user.id,
      );
      const inv = await storage.createInvoice(
        org.id,
        { customerId: oldCust.id, taxRate: "0", discount: "0", status: "draft",
          items: [{ description: "x", qty: 1, unitPrice: 1 }] } as any,
        user.id,
      );
      const [mc] = await db.insert(missedCalls).values({
        orgId: org.id, callerPhone: "777", customerId: oldCust.id,
      }).returning();
      const [rr] = await db.insert(reviewRequests).values({
        orgId: org.id, jobId: jb.id, customerId: oldCust.id, phoneNumber: "1", reviewUrl: "u",
      }).returning();

      await softDelete(customers, oldCust.id, new Date(Date.now() - 48 * HOUR));
      await softDelete(customers, newCust.id, new Date());

      const cutoff = new Date(Date.now() - HOUR);
      const purged = await storage.purgeSoftDeletedCustomers(cutoff);
      expect(purged).toBe(1);

      const remOld = await db.select().from(customers).where(eq(customers.id, oldCust.id));
      expect(remOld.length).toBe(0);
      const remNew = await db.select().from(customers).where(eq(customers.id, newCust.id));
      expect(remNew.length).toBe(1);

      // FKs nulled
      const [freshJob] = await db.select().from(jobs).where(eq(jobs.id, jb.id));
      expect(freshJob.customerId).toBeNull();
      const [freshQ] = await db.select().from(quotes).where(eq(quotes.id, q.id));
      expect(freshQ.customerId).toBeNull();
      const [freshInv] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
      expect(freshInv.customerId).toBeNull();
      const [freshMc] = await db.select().from(missedCalls).where(eq(missedCalls.id, mc.id));
      expect(freshMc.customerId).toBeNull();
      const [freshRr] = await db.select().from(reviewRequests).where(eq(reviewRequests.id, rr.id));
      expect(freshRr.customerId).toBeNull();
    });
  });
});
