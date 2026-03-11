import { eq, and, desc, sql, inArray, count } from "drizzle-orm";
import { db } from "./db";
import {
  users,
  orgs,
  memberships,
  inviteCodes,
  customers,
  jobs,
  jobEvents,
  quotes,
  quoteItems,
  invoices,
  invoiceItems,
  missedCalls,
  aiMessages,
  callRecoverySubscriptions,
  type User,
  type InsertUser,
  type Org,
  type InsertOrg,
  type Membership,
  type Customer,
  type InsertCustomer,
  type Job,
  type InsertJob,
  type JobEvent,
  type Quote,
  type QuoteItem,
  type Invoice,
  type InvoiceItem,
  type InviteCode,
  type MissedCall,
  type AiMessage,
  type CallRecoverySubscription,
} from "@shared/schema";
import { randomBytes } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;

  createOrg(org: InsertOrg): Promise<Org>;
  getOrg(id: string): Promise<Org | undefined>;
  updateOrg(id: string, data: Partial<Org>): Promise<Org | undefined>;
  getUserOrgs(userId: string): Promise<Org[]>;
  getAllOrgs(): Promise<Org[]>;
  deleteOrg(id: string): Promise<void>;
  getOrgByStripeCustomerId(stripeCustomerId: string): Promise<Org | undefined>;

  createMembership(orgId: string, userId: string, role: string): Promise<Membership>;
  getMembership(orgId: string, userId: string): Promise<Membership | undefined>;
  getOrgMemberships(orgId: string): Promise<Membership[]>;
  deleteMembership(orgId: string, userId: string): Promise<void>;

  createInviteCode(orgId: string, role: string, createdBy: string): Promise<InviteCode>;
  getInviteCodeByCode(code: string): Promise<InviteCode | undefined>;
  getOrgInviteCodes(orgId: string): Promise<InviteCode[]>;

  getCustomers(orgId: string): Promise<Customer[]>;
  getCustomer(orgId: string, id: string): Promise<Customer | undefined>;
  createCustomer(orgId: string, data: InsertCustomer): Promise<Customer>;
  updateCustomer(orgId: string, id: string, data: Partial<Customer>): Promise<Customer | undefined>;
  deleteCustomer(orgId: string, id: string): Promise<void>;

  getJobs(orgId: string): Promise<(Job & { customerName?: string })[]>;
  getJob(orgId: string, id: string): Promise<(Job & { customerName?: string }) | undefined>;
  getCustomerJobs(orgId: string, customerId: string): Promise<Job[]>;
  createJob(orgId: string, data: InsertJob, createdBy: string | null): Promise<Job>;
  updateJob(orgId: string, id: string, data: Partial<Job>): Promise<Job | undefined>;
  deleteJob(orgId: string, id: string): Promise<void>;

  getJobEvents(orgId: string, jobId: string): Promise<JobEvent[]>;
  createJobEvent(orgId: string, jobId: string, type: string, payload: any, createdBy: string | null): Promise<JobEvent>;

  getQuotes(orgId: string): Promise<(Quote & { customerName?: string; total?: number })[]>;
  getQuote(orgId: string, id: string): Promise<(Quote & { items?: QuoteItem[]; customerName?: string }) | undefined>;
  createQuote(orgId: string, data: any, createdBy: string): Promise<Quote>;
  updateQuote(orgId: string, id: string, data: any): Promise<Quote | undefined>;
  deleteQuote(orgId: string, id: string): Promise<void>;

  getInvoices(orgId: string): Promise<(Invoice & { customerName?: string; total?: number })[]>;
  getInvoice(orgId: string, id: string): Promise<(Invoice & { items?: InvoiceItem[]; customerName?: string }) | undefined>;
  getCustomerInvoices(orgId: string, customerId: string): Promise<Invoice[]>;
  createInvoice(orgId: string, data: any, createdBy: string): Promise<Invoice>;
  updateInvoice(orgId: string, id: string, data: any): Promise<Invoice | undefined>;
  deleteInvoice(orgId: string, id: string): Promise<void>;

  getDashboardStats(orgId: string): Promise<any>;

  getOrgCounts(orgId: string): Promise<{ customers: number; jobs: number; quotes: number; invoices: number; members: number }>;

  deleteUser(userId: string): Promise<void>;

  createMissedCall(orgId: string, data: { callerPhone: string; callerName?: string; twilioCallSid?: string }): Promise<MissedCall>;
  getMissedCall(id: string): Promise<MissedCall | undefined>;
  getMissedCallByPhone(orgId: string, phone: string): Promise<MissedCall | undefined>;
  getMissedCalls(orgId: string, limit?: number, offset?: number): Promise<MissedCall[]>;
  updateMissedCall(id: string, data: Partial<MissedCall>): Promise<MissedCall | undefined>;
  getMissedCallCount(orgId: string, since: Date): Promise<number>;

  createAiMessage(missedCallId: string, role: string, content: string): Promise<AiMessage>;
  getAiMessages(missedCallId: string): Promise<AiMessage[]>;

  getOrgByCallRecoveryPhone(phone: string): Promise<Org | undefined>;
  findMissedCallByCallerPhone(phone: string): Promise<(MissedCall & { orgId: string }) | undefined>;

  createCallRecoverySubscription(data: {
    orgId: string;
    plan: string;
    stripeSubscriptionId?: string;
    stripeCustomerId?: string;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
  }): Promise<CallRecoverySubscription>;
  getCallRecoverySubscription(orgId: string): Promise<CallRecoverySubscription | undefined>;
  updateCallRecoverySubscription(id: string, data: Partial<CallRecoverySubscription>): Promise<CallRecoverySubscription | undefined>;
  incrementCallRecoveryUsage(orgId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(data: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.username));
  }

  async createOrg(data: InsertOrg): Promise<Org> {
    const [org] = await db.insert(orgs).values(data).returning();
    return org;
  }

  async getOrg(id: string): Promise<Org | undefined> {
    const [org] = await db.select().from(orgs).where(eq(orgs.id, id));
    return org;
  }

  async updateOrg(id: string, data: Partial<Org>): Promise<Org | undefined> {
    const [org] = await db.update(orgs).set(data).where(eq(orgs.id, id)).returning();
    return org;
  }

  async getUserOrgs(userId: string): Promise<Org[]> {
    const mems = await db.select().from(memberships).where(eq(memberships.userId, userId));
    if (mems.length === 0) return [];
    const orgIds = mems.map((m) => m.orgId);
    return db.select().from(orgs).where(inArray(orgs.id, orgIds));
  }

  async getAllOrgs(): Promise<Org[]> {
    return db.select().from(orgs).orderBy(desc(orgs.createdAt));
  }

  async deleteOrg(id: string): Promise<void> {
    await db.delete(callRecoverySubscriptions).where(eq(callRecoverySubscriptions.orgId, id));
    const orgMissedCalls = await db.select({ id: missedCalls.id }).from(missedCalls).where(eq(missedCalls.orgId, id));
    for (const mc of orgMissedCalls) {
      await db.delete(aiMessages).where(eq(aiMessages.missedCallId, mc.id));
    }
    await db.delete(missedCalls).where(eq(missedCalls.orgId, id));
    await db.delete(inviteCodes).where(eq(inviteCodes.orgId, id));
    await db.delete(memberships).where(eq(memberships.orgId, id));
    await db.delete(quoteItems).where(eq(quoteItems.orgId, id));
    await db.delete(quotes).where(eq(quotes.orgId, id));
    await db.delete(invoiceItems).where(eq(invoiceItems.orgId, id));
    await db.delete(invoices).where(eq(invoices.orgId, id));
    await db.delete(jobEvents).where(eq(jobEvents.orgId, id));
    await db.delete(jobs).where(eq(jobs.orgId, id));
    await db.delete(customers).where(eq(customers.orgId, id));
    await db.delete(orgs).where(eq(orgs.id, id));
  }

  async getOrgByStripeCustomerId(stripeCustomerId: string): Promise<Org | undefined> {
    const [org] = await db.select().from(orgs).where(eq(orgs.stripeCustomerId, stripeCustomerId));
    return org;
  }

  async deleteMembership(orgId: string, userId: string): Promise<void> {
    await db.delete(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
  }

  async createMembership(orgId: string, userId: string, role: string): Promise<Membership> {
    const [mem] = await db
      .insert(memberships)
      .values({ orgId, userId, role: role as any })
      .returning();
    return mem;
  }

  async getMembership(orgId: string, userId: string): Promise<Membership | undefined> {
    const [mem] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
    return mem;
  }

  async getOrgMemberships(orgId: string): Promise<Membership[]> {
    return db.select().from(memberships).where(eq(memberships.orgId, orgId));
  }

  async createInviteCode(orgId: string, role: string, createdBy: string): Promise<InviteCode> {
    const code = randomBytes(4).toString("hex").toUpperCase();
    const [ic] = await db
      .insert(inviteCodes)
      .values({ orgId, code, role: role as any, createdBy })
      .returning();
    return ic;
  }

  async getInviteCodeByCode(code: string): Promise<InviteCode | undefined> {
    const [ic] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code.toUpperCase()));
    return ic;
  }

  async getOrgInviteCodes(orgId: string): Promise<InviteCode[]> {
    return db
      .select()
      .from(inviteCodes)
      .where(eq(inviteCodes.orgId, orgId))
      .orderBy(desc(inviteCodes.createdAt));
  }

  async getCustomers(orgId: string): Promise<Customer[]> {
    return db
      .select()
      .from(customers)
      .where(eq(customers.orgId, orgId))
      .orderBy(desc(customers.createdAt));
  }

  async getCustomer(orgId: string, id: string): Promise<Customer | undefined> {
    const [c] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.orgId, orgId), eq(customers.id, id)));
    return c;
  }

  async createCustomer(orgId: string, data: InsertCustomer): Promise<Customer> {
    const [c] = await db.insert(customers).values({ ...data, orgId }).returning();
    return c;
  }

  async updateCustomer(orgId: string, id: string, data: Partial<Customer>): Promise<Customer | undefined> {
    const [c] = await db
      .update(customers)
      .set(data)
      .where(and(eq(customers.orgId, orgId), eq(customers.id, id)))
      .returning();
    return c;
  }

  async deleteCustomer(orgId: string, id: string): Promise<void> {
    await db.delete(customers).where(and(eq(customers.orgId, orgId), eq(customers.id, id)));
  }

  async getJobs(orgId: string): Promise<(Job & { customerName?: string })[]> {
    const allJobs = await db
      .select()
      .from(jobs)
      .where(eq(jobs.orgId, orgId))
      .orderBy(desc(jobs.createdAt));

    const customerIds = [...new Set(allJobs.filter((j) => j.customerId).map((j) => j.customerId!))];
    let customerMap: Record<string, string> = {};
    if (customerIds.length > 0) {
      const custs = await db
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(inArray(customers.id, customerIds));
      customerMap = Object.fromEntries(custs.map((c) => [c.id, c.name]));
    }

    return allJobs.map((j) => ({
      ...j,
      customerName: j.customerId ? customerMap[j.customerId] : undefined,
    }));
  }

  async getJob(orgId: string, id: string): Promise<(Job & { customerName?: string }) | undefined> {
    const [j] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.orgId, orgId), eq(jobs.id, id)));
    if (!j) return undefined;

    let customerName: string | undefined;
    if (j.customerId) {
      const [c] = await db
        .select({ name: customers.name })
        .from(customers)
        .where(eq(customers.id, j.customerId));
      customerName = c?.name;
    }
    return { ...j, customerName };
  }

  async getCustomerJobs(orgId: string, customerId: string): Promise<Job[]> {
    return db
      .select()
      .from(jobs)
      .where(and(eq(jobs.orgId, orgId), eq(jobs.customerId, customerId)))
      .orderBy(desc(jobs.createdAt));
  }

  async createJob(orgId: string, data: InsertJob, createdBy: string | null): Promise<Job> {
    const [j] = await db
      .insert(jobs)
      .values({ ...data, orgId, createdBy })
      .returning();
    await this.createJobEvent(orgId, j.id, "created", {}, createdBy);
    return j;
  }

  async updateJob(orgId: string, id: string, data: Partial<Job>): Promise<Job | undefined> {
    const existing = await this.getJob(orgId, id);
    if (!existing) return undefined;

    const [j] = await db
      .update(jobs)
      .set(data)
      .where(and(eq(jobs.orgId, orgId), eq(jobs.id, id)))
      .returning();

    if (data.status && data.status !== existing.status) {
      await this.createJobEvent(orgId, id, "status_change", {
        from: existing.status,
        to: data.status,
      }, "");
    }
    return j;
  }

  async deleteJob(orgId: string, id: string): Promise<void> {
    await db.delete(jobEvents).where(and(eq(jobEvents.orgId, orgId), eq(jobEvents.jobId, id)));
    await db.delete(jobs).where(and(eq(jobs.orgId, orgId), eq(jobs.id, id)));
  }

  async getJobEvents(orgId: string, jobId: string): Promise<JobEvent[]> {
    return db
      .select()
      .from(jobEvents)
      .where(and(eq(jobEvents.orgId, orgId), eq(jobEvents.jobId, jobId)))
      .orderBy(desc(jobEvents.createdAt));
  }

  async createJobEvent(orgId: string, jobId: string, type: string, payload: any, createdBy: string | null): Promise<JobEvent> {
    const [e] = await db
      .insert(jobEvents)
      .values({ orgId, jobId, type, payload, createdBy: createdBy || null })
      .returning();
    return e;
  }

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
  }

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
  }

  async createQuote(orgId: string, data: any, createdBy: string): Promise<Quote> {
    const { items: itemsData, ...quoteData } = data;
    const [q] = await db
      .insert(quotes)
      .values({ ...quoteData, orgId, createdBy, status: quoteData.status || "draft" })
      .returning();

    if (itemsData && itemsData.length > 0) {
      await db.insert(quoteItems).values(
        itemsData.map((it: any) => ({
          orgId,
          quoteId: q.id,
          description: it.description,
          qty: String(it.qty),
          unitPrice: String(it.unitPrice),
        }))
      );
    }
    return q;
  }

  async updateQuote(orgId: string, id: string, data: any): Promise<Quote | undefined> {
    const { items: itemsData, ...quoteData } = data;
    const [q] = await db
      .update(quotes)
      .set(quoteData)
      .where(and(eq(quotes.orgId, orgId), eq(quotes.id, id)))
      .returning();
    if (!q) return undefined;

    if (itemsData) {
      await db.delete(quoteItems).where(eq(quoteItems.quoteId, id));
      if (itemsData.length > 0) {
        await db.insert(quoteItems).values(
          itemsData.map((it: any) => ({
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
  }

  async deleteQuote(orgId: string, id: string): Promise<void> {
    await db.delete(quoteItems).where(eq(quoteItems.quoteId, id));
    await db.delete(quotes).where(and(eq(quotes.orgId, orgId), eq(quotes.id, id)));
  }

  async getInvoices(orgId: string): Promise<(Invoice & { customerName?: string; total?: number })[]> {
    const allInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.orgId, orgId))
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
  }

  async getInvoice(orgId: string, id: string): Promise<(Invoice & { items?: InvoiceItem[]; customerName?: string; customer?: Customer }) | undefined> {
    const [inv] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)));
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
  }

  async getCustomerInvoices(orgId: string, customerId: string): Promise<Invoice[]> {
    return db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.customerId, customerId)))
      .orderBy(desc(invoices.createdAt));
  }

  async createInvoice(orgId: string, data: any, createdBy: string): Promise<Invoice> {
    const { items: itemsData, ...invoiceData } = data;
    const [inv] = await db
      .insert(invoices)
      .values({
        ...invoiceData,
        orgId,
        createdBy,
        status: invoiceData.status || "draft",
        dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : null,
      })
      .returning();

    if (itemsData && itemsData.length > 0) {
      await db.insert(invoiceItems).values(
        itemsData.map((it: any) => ({
          orgId,
          invoiceId: inv.id,
          description: it.description,
          qty: String(it.qty),
          unitPrice: String(it.unitPrice),
        }))
      );
    }
    return inv;
  }

  async updateInvoice(orgId: string, id: string, data: any): Promise<Invoice | undefined> {
    const { items: itemsData, ...invoiceData } = data;
    if (invoiceData.dueDate) {
      invoiceData.dueDate = new Date(invoiceData.dueDate);
    }
    if (invoiceData.status === "paid" && !invoiceData.paidAt) {
      invoiceData.paidAt = new Date();
    }
    const [inv] = await db
      .update(invoices)
      .set(invoiceData)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)))
      .returning();
    if (!inv) return undefined;

    if (itemsData) {
      await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
      if (itemsData.length > 0) {
        await db.insert(invoiceItems).values(
          itemsData.map((it: any) => ({
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
  }

  async deleteInvoice(orgId: string, id: string): Promise<void> {
    await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
    await db.delete(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)));
  }

  async getDashboardStats(orgId: string): Promise<any> {
    const allCustomers = await db.select().from(customers).where(eq(customers.orgId, orgId));
    const allJobs = await db.select().from(jobs).where(eq(jobs.orgId, orgId));
    const allQuotes = await db.select().from(quotes).where(eq(quotes.orgId, orgId));
    const allInvoices = await db.select().from(invoices).where(eq(invoices.orgId, orgId));

    const jobCounts: Record<string, number> = {
      lead: 0,
      quoted: 0,
      scheduled: 0,
      in_progress: 0,
      done: 0,
      invoiced: 0,
      paid: 0,
      canceled: 0,
    };
    allJobs.forEach((j) => {
      jobCounts[j.status] = (jobCounts[j.status] || 0) + 1;
    });

    const activeStatuses = ["scheduled", "in_progress", "lead", "quoted"];
    const activeJobs = allJobs.filter((j) => activeStatuses.includes(j.status)).length;

    let revenue = 0;
    let outstanding = 0;
    for (const inv of allInvoices) {
      const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id));
      const subtotal = items.reduce((sum, it) => sum + Number(it.qty) * Number(it.unitPrice), 0);
      const tax = subtotal * (Number(inv.taxRate) / 100);
      const total = subtotal + tax - Number(inv.discount);
      if (inv.status === "paid") revenue += total;
      if (inv.status === "sent") outstanding += total;
    }

    const customerMap: Record<string, string> = {};
    allCustomers.forEach((c) => {
      customerMap[c.id] = c.name;
    });

    const recentJobs = allJobs.slice(0, 5).map((j) => ({
      ...j,
      customerName: j.customerId ? customerMap[j.customerId] : undefined,
    }));

    const recentInvoices = allInvoices.slice(0, 5).map((inv) => ({
      ...inv,
      customerName: inv.customerId ? customerMap[inv.customerId] : undefined,
    }));

    return {
      customerCount: allCustomers.length,
      jobCounts,
      totalJobs: allJobs.length,
      activeJobs,
      quoteCount: allQuotes.length,
      invoiceCount: allInvoices.length,
      revenue,
      outstanding,
      recentJobs,
      recentInvoices,
    };
  }

  async getOrgCounts(orgId: string): Promise<{ customers: number; jobs: number; quotes: number; invoices: number; members: number }> {
    const [custCount] = await db.select({ c: count() }).from(customers).where(eq(customers.orgId, orgId));
    const [jobCount] = await db.select({ c: count() }).from(jobs).where(eq(jobs.orgId, orgId));
    const [quoteCount] = await db.select({ c: count() }).from(quotes).where(eq(quotes.orgId, orgId));
    const [invoiceCount] = await db.select({ c: count() }).from(invoices).where(eq(invoices.orgId, orgId));
    const [memberCount] = await db.select({ c: count() }).from(memberships).where(eq(memberships.orgId, orgId));
    return {
      customers: custCount.c,
      jobs: jobCount.c,
      quotes: quoteCount.c,
      invoices: invoiceCount.c,
      members: memberCount.c,
    };
  }

  async deleteUser(userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const userMemberships = await tx.select().from(memberships).where(eq(memberships.userId, userId));

      for (const mem of userMemberships) {
        const orgMembers = await tx.select().from(memberships).where(eq(memberships.orgId, mem.orgId));
        const otherMembers = orgMembers.filter((m) => m.userId !== userId);

        if (otherMembers.length === 0) {
          const orgMc = await tx.select({ id: missedCalls.id }).from(missedCalls).where(eq(missedCalls.orgId, mem.orgId));
          for (const mc of orgMc) {
            await tx.delete(aiMessages).where(eq(aiMessages.missedCallId, mc.id));
          }
          await tx.delete(missedCalls).where(eq(missedCalls.orgId, mem.orgId));
          await tx.delete(inviteCodes).where(eq(inviteCodes.orgId, mem.orgId));
          await tx.delete(memberships).where(eq(memberships.orgId, mem.orgId));
          await tx.delete(quoteItems).where(eq(quoteItems.orgId, mem.orgId));
          await tx.delete(quotes).where(eq(quotes.orgId, mem.orgId));
          await tx.delete(invoiceItems).where(eq(invoiceItems.orgId, mem.orgId));
          await tx.delete(invoices).where(eq(invoices.orgId, mem.orgId));
          await tx.delete(jobEvents).where(eq(jobEvents.orgId, mem.orgId));
          await tx.delete(jobs).where(eq(jobs.orgId, mem.orgId));
          await tx.delete(customers).where(eq(customers.orgId, mem.orgId));
          await tx.delete(orgs).where(eq(orgs.id, mem.orgId));
        } else {
          await tx.delete(memberships).where(and(eq(memberships.orgId, mem.orgId), eq(memberships.userId, userId)));
        }
      }

      await tx.update(inviteCodes).set({ createdBy: null }).where(eq(inviteCodes.createdBy, userId));
      await tx.update(jobs).set({ createdBy: null }).where(eq(jobs.createdBy, userId));
      await tx.update(jobEvents).set({ createdBy: null }).where(eq(jobEvents.createdBy, userId));
      await tx.update(quotes).set({ createdBy: null }).where(eq(quotes.createdBy, userId));
      await tx.update(invoices).set({ createdBy: null }).where(eq(invoices.createdBy, userId));

      await tx.delete(users).where(eq(users.id, userId));
    });
  }

  async createMissedCall(orgId: string, data: { callerPhone: string; callerName?: string; twilioCallSid?: string }): Promise<MissedCall> {
    const [mc] = await db.insert(missedCalls).values({
      orgId,
      callerPhone: data.callerPhone,
      callerName: data.callerName || null,
      twilioCallSid: data.twilioCallSid || null,
    }).returning();
    return mc;
  }

  async getMissedCall(id: string): Promise<MissedCall | undefined> {
    const [mc] = await db.select().from(missedCalls).where(eq(missedCalls.id, id));
    return mc;
  }

  async getMissedCallByPhone(orgId: string, phone: string): Promise<MissedCall | undefined> {
    const [mc] = await db.select().from(missedCalls)
      .where(and(
        eq(missedCalls.orgId, orgId),
        eq(missedCalls.callerPhone, phone),
        inArray(missedCalls.status, ["new", "in_progress"] as any)
      ))
      .orderBy(desc(missedCalls.createdAt));
    return mc;
  }

  async getMissedCalls(orgId: string, limit = 50, offset = 0): Promise<MissedCall[]> {
    return db.select().from(missedCalls)
      .where(eq(missedCalls.orgId, orgId))
      .orderBy(desc(missedCalls.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async updateMissedCall(id: string, data: Partial<MissedCall>): Promise<MissedCall | undefined> {
    const [mc] = await db.update(missedCalls).set(data).where(eq(missedCalls.id, id)).returning();
    return mc;
  }

  async getMissedCallCount(orgId: string, since: Date): Promise<number> {
    const [result] = await db.select({ c: count() }).from(missedCalls)
      .where(and(
        eq(missedCalls.orgId, orgId),
        sql`${missedCalls.createdAt} >= ${since}`
      ));
    return result.c;
  }

  async createAiMessage(missedCallId: string, role: string, content: string): Promise<AiMessage> {
    const [msg] = await db.insert(aiMessages).values({
      missedCallId,
      role: role as any,
      content,
    }).returning();
    return msg;
  }

  async getAiMessages(missedCallId: string): Promise<AiMessage[]> {
    return db.select().from(aiMessages)
      .where(eq(aiMessages.missedCallId, missedCallId))
      .orderBy(aiMessages.createdAt);
  }

  async getOrgByCallRecoveryPhone(phone: string): Promise<Org | undefined> {
    const [org] = await db.select().from(orgs).where(eq(orgs.callRecoveryPhone, phone));
    return org;
  }

  async findMissedCallByCallerPhone(phone: string): Promise<(MissedCall & { orgId: string }) | undefined> {
    const [mc] = await db.select().from(missedCalls)
      .where(and(
        eq(missedCalls.callerPhone, phone),
        inArray(missedCalls.status, ["new", "in_progress"] as any)
      ))
      .orderBy(desc(missedCalls.createdAt));
    return mc;
  }

  async createCallRecoverySubscription(data: {
    orgId: string;
    plan: string;
    stripeSubscriptionId?: string;
    stripeCustomerId?: string;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
  }): Promise<CallRecoverySubscription> {
    const [sub] = await db.insert(callRecoverySubscriptions).values({
      orgId: data.orgId,
      plan: data.plan as any,
      status: "active",
      stripeSubscriptionId: data.stripeSubscriptionId || null,
      stripeCustomerId: data.stripeCustomerId || null,
      currentPeriodStart: data.currentPeriodStart || new Date(),
      currentPeriodEnd: data.currentPeriodEnd || null,
      usageCount: 0,
    }).returning();
    return sub;
  }

  async getCallRecoverySubscription(orgId: string): Promise<CallRecoverySubscription | undefined> {
    const [sub] = await db.select().from(callRecoverySubscriptions)
      .where(and(
        eq(callRecoverySubscriptions.orgId, orgId),
        eq(callRecoverySubscriptions.status, "active")
      ))
      .orderBy(desc(callRecoverySubscriptions.createdAt));
    return sub;
  }

  async updateCallRecoverySubscription(id: string, data: Partial<CallRecoverySubscription>): Promise<CallRecoverySubscription | undefined> {
    const [sub] = await db.update(callRecoverySubscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(callRecoverySubscriptions.id, id))
      .returning();
    return sub;
  }

  async incrementCallRecoveryUsage(orgId: string): Promise<void> {
    await db.update(callRecoverySubscriptions)
      .set({ usageCount: sql`${callRecoverySubscriptions.usageCount} + 1`, updatedAt: new Date() })
      .where(and(
        eq(callRecoverySubscriptions.orgId, orgId),
        eq(callRecoverySubscriptions.status, "active")
      ));
  }
}

export const storage = new DatabaseStorage();
