import { eq, and, desc, inArray, isNull, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "../db";
import {
  customers,
  jobs,
  jobEvents,
  invoices,
  quotes,
  missedCalls,
  reviewRequests,
  type Job,
  type InsertJob,
  type JobEvent,
} from "@shared/schema";

type JobStatus = Job["status"];

async function getJobInternal(orgId: string, id: string): Promise<(Job & { customerName?: string }) | undefined> {
  const [j] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.orgId, orgId), eq(jobs.id, id), isNull(jobs.deletedAt)));
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

async function createJobEventInternal(
  orgId: string,
  jobId: string,
  type: string,
  payload: Record<string, unknown> | null,
  createdBy: string | null,
): Promise<JobEvent> {
  const [e] = await db
    .insert(jobEvents)
    .values({ orgId, jobId, type, payload, createdBy: createdBy || null })
    .returning();
  return e;
}

export const jobsStorage = {
  async getJobs(orgId: string, recurringOnly?: boolean): Promise<(Job & { customerName?: string })[]> {
    const whereClause = recurringOnly
      ? and(eq(jobs.orgId, orgId), eq(jobs.isRecurring, true), isNull(jobs.deletedAt))
      : and(eq(jobs.orgId, orgId), isNull(jobs.deletedAt));
    const allJobs = await db
      .select()
      .from(jobs)
      .where(whereClause)
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
  },

  getJob: getJobInternal,

  async getCustomerJobs(orgId: string, customerId: string): Promise<Job[]> {
    return db
      .select()
      .from(jobs)
      .where(and(eq(jobs.orgId, orgId), eq(jobs.customerId, customerId), isNull(jobs.deletedAt)))
      .orderBy(desc(jobs.createdAt));
  },

  async createJob(orgId: string, data: InsertJob, createdBy: string | null): Promise<Job> {
    const [j] = await db
      .insert(jobs)
      .values({ ...data, orgId, createdBy })
      .returning();
    await createJobEventInternal(orgId, j.id, "created", {}, createdBy);
    return j;
  },

  async updateJob(orgId: string, id: string, data: Partial<Job>): Promise<Job | undefined> {
    const existing = await getJobInternal(orgId, id);
    if (!existing) return undefined;

    const [j] = await db
      .update(jobs)
      .set(data)
      .where(and(eq(jobs.orgId, orgId), eq(jobs.id, id)))
      .returning();

    if (data.status && data.status !== existing.status) {
      await createJobEventInternal(orgId, id, "status_change", {
        from: existing.status,
        to: data.status,
      }, "");
    }
    return j;
  },

  async deleteJob(orgId: string, id: string): Promise<void> {
    await db.delete(jobEvents).where(and(eq(jobEvents.orgId, orgId), eq(jobEvents.jobId, id)));
    await db.delete(jobs).where(and(eq(jobs.orgId, orgId), eq(jobs.id, id)));
  },

  async getJobEvents(orgId: string, jobId: string): Promise<JobEvent[]> {
    return db
      .select()
      .from(jobEvents)
      .where(and(eq(jobEvents.orgId, orgId), eq(jobEvents.jobId, jobId)))
      .orderBy(desc(jobEvents.createdAt));
  },

  createJobEvent: createJobEventInternal,

  async bulkDeleteJobs(orgId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .update(jobs)
      .set({ deletedAt: new Date() })
      .where(and(eq(jobs.orgId, orgId), inArray(jobs.id, ids), isNull(jobs.deletedAt)))
      .returning({ id: jobs.id });
    return result.length;
  },

  async bulkRestoreJobs(orgId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .update(jobs)
      .set({ deletedAt: null })
      .where(and(eq(jobs.orgId, orgId), inArray(jobs.id, ids), isNotNull(jobs.deletedAt)))
      .returning({ id: jobs.id });
    return result.length;
  },

  async getDeletedJobs(orgId: string): Promise<(Job & { customerName?: string })[]> {
    const rows = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.orgId, orgId), isNotNull(jobs.deletedAt)))
      .orderBy(desc(jobs.deletedAt));
    const customerIds = [...new Set(rows.filter((j) => j.customerId).map((j) => j.customerId!))];
    let customerMap: Record<string, string> = {};
    if (customerIds.length > 0) {
      const custs = await db
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(inArray(customers.id, customerIds));
      customerMap = Object.fromEntries(custs.map((c) => [c.id, c.name]));
    }
    return rows.map((j) => ({
      ...j,
      customerName: j.customerId ? customerMap[j.customerId] : undefined,
    }));
  },

  async hardDeleteJob(orgId: string, id: string): Promise<boolean> {
    const [existing] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.orgId, orgId), eq(jobs.id, id), isNotNull(jobs.deletedAt)));
    if (!existing) return false;

    await db.delete(jobEvents).where(and(eq(jobEvents.orgId, orgId), eq(jobEvents.jobId, id)));
    await db
      .update(quotes)
      .set({ jobId: null })
      .where(and(eq(quotes.orgId, orgId), eq(quotes.jobId, id)));
    await db
      .update(invoices)
      .set({ jobId: null })
      .where(and(eq(invoices.orgId, orgId), eq(invoices.jobId, id)));
    await db
      .update(missedCalls)
      .set({ jobId: null })
      .where(and(eq(missedCalls.orgId, orgId), eq(missedCalls.jobId, id)));
    await db
      .update(jobs)
      .set({ parentJobId: null })
      .where(and(eq(jobs.orgId, orgId), eq(jobs.parentJobId, id)));
    await db.delete(reviewRequests).where(and(eq(reviewRequests.orgId, orgId), eq(reviewRequests.jobId, id)));

    const result = await db
      .delete(jobs)
      .where(and(eq(jobs.orgId, orgId), eq(jobs.id, id), isNotNull(jobs.deletedAt)))
      .returning({ id: jobs.id });
    return result.length > 0;
  },

  async purgeSoftDeletedJobs(cutoff: Date): Promise<number> {
    const due = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(isNotNull(jobs.deletedAt), lt(jobs.deletedAt, cutoff)));
    if (due.length === 0) return 0;
    const ids = due.map((r) => r.id);

    // Delete dependent rows that reference jobs without ON DELETE cascade.
    await db.delete(jobEvents).where(inArray(jobEvents.jobId, ids));
    await db.delete(reviewRequests).where(inArray(reviewRequests.jobId, ids));

    // Null out FKs on referencing tables.
    await db.update(quotes).set({ jobId: null }).where(inArray(quotes.jobId, ids));
    await db.update(invoices).set({ jobId: null }).where(inArray(invoices.jobId, ids));
    await db.update(missedCalls).set({ jobId: null }).where(inArray(missedCalls.jobId, ids));

    // Detach any child jobs from a soft-deleted recurring parent.
    await db.update(jobs).set({ parentJobId: null }).where(inArray(jobs.parentJobId, ids));

    const result = await db
      .delete(jobs)
      .where(inArray(jobs.id, ids))
      .returning({ id: jobs.id });
    return result.length;
  },

  async bulkUpdateJobStatus(orgId: string, ids: string[], status: string, userId: string | null): Promise<number> {
    if (ids.length === 0) return 0;
    const existing = await db
      .select({ id: jobs.id, status: jobs.status })
      .from(jobs)
      .where(and(eq(jobs.orgId, orgId), inArray(jobs.id, ids)));
    const result = await db
      .update(jobs)
      .set({ status: status as JobStatus })
      .where(and(eq(jobs.orgId, orgId), inArray(jobs.id, ids)))
      .returning({ id: jobs.id });
    for (const e of existing) {
      if (e.status !== status) {
        await createJobEventInternal(orgId, e.id, "status_change", { from: e.status, to: status, bulk: true }, userId);
      }
    }
    return result.length;
  },
};
