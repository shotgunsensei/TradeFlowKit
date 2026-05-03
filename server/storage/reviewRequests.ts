import { eq, and, desc, gte, lt, count } from "drizzle-orm";
import { db } from "../db";
import {
  customers,
  jobs,
  reviewRequests,
  type ReviewRequest,
  type ReviewRequestWithDetails,
} from "@shared/schema";

export const reviewRequestsStorage = {
  async createReviewRequest(data: { orgId: string; jobId: string; customerId: string | null; phoneNumber: string; reviewUrl: string }): Promise<ReviewRequest> {
    const [rr] = await db.insert(reviewRequests).values({
      orgId: data.orgId,
      jobId: data.jobId,
      customerId: data.customerId,
      phoneNumber: data.phoneNumber,
      reviewUrl: data.reviewUrl,
    }).returning();
    return rr;
  },

  async getReviewRequestByJobId(orgId: string, jobId: string): Promise<ReviewRequest | undefined> {
    const [rr] = await db.select().from(reviewRequests).where(
      and(eq(reviewRequests.orgId, orgId), eq(reviewRequests.jobId, jobId))
    );
    return rr;
  },

  async getReviewRequests(orgId: string, opts: { limit: number; offset: number; sort?: "asc" | "desc"; from?: Date; to?: Date }): Promise<{ items: ReviewRequestWithDetails[]; total: number }> {
    const conditions = [eq(reviewRequests.orgId, orgId)];
    if (opts.from) conditions.push(gte(reviewRequests.sentAt, opts.from));
    if (opts.to) conditions.push(lt(reviewRequests.sentAt, opts.to));
    const whereExpr = and(...conditions);
    const orderExpr = opts.sort === "asc" ? reviewRequests.sentAt : desc(reviewRequests.sentAt);
    const rows = await db.select({
      id: reviewRequests.id,
      orgId: reviewRequests.orgId,
      jobId: reviewRequests.jobId,
      customerId: reviewRequests.customerId,
      sentAt: reviewRequests.sentAt,
      phoneNumber: reviewRequests.phoneNumber,
      reviewUrl: reviewRequests.reviewUrl,
      jobTitle: jobs.title,
      customerName: customers.name,
    })
      .from(reviewRequests)
      .leftJoin(jobs, eq(reviewRequests.jobId, jobs.id))
      .leftJoin(customers, eq(reviewRequests.customerId, customers.id))
      .where(whereExpr)
      .orderBy(orderExpr)
      .limit(opts.limit)
      .offset(opts.offset);
    const [totalRow] = await db.select({ count: count() }).from(reviewRequests).where(whereExpr);
    return { items: rows, total: totalRow?.count ?? 0 };
  },

  async getReviewRequestCountThisMonth(orgId: string): Promise<number> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const [result] = await db.select({ count: count() }).from(reviewRequests).where(
      and(
        eq(reviewRequests.orgId, orgId),
        gte(reviewRequests.sentAt, startOfMonth),
        lt(reviewRequests.sentAt, startOfNextMonth)
      )
    );
    return result?.count ?? 0;
  },
};
