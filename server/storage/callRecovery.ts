import { eq, and, desc, sql, inArray, count } from "drizzle-orm";
import { db } from "../db";
import {
  orgs,
  missedCalls,
  aiMessages,
  callRecoverySubscriptions,
  type CallRecoveryPlan,
  type Org,
  type MissedCall,
  type AiMessage,
  type CallRecoverySubscription,
} from "@shared/schema";

export const callRecoveryStorage = {
  async createMissedCall(orgId: string, data: { callerPhone: string; callerName?: string; twilioCallSid?: string }): Promise<MissedCall> {
    const [mc] = await db.insert(missedCalls).values({
      orgId,
      callerPhone: data.callerPhone,
      callerName: data.callerName || null,
      twilioCallSid: data.twilioCallSid || null,
    }).returning();
    return mc;
  },

  async getMissedCall(id: string): Promise<MissedCall | undefined> {
    const [mc] = await db.select().from(missedCalls).where(eq(missedCalls.id, id));
    return mc;
  },

  async getMissedCallByPhone(orgId: string, phone: string): Promise<MissedCall | undefined> {
    const activeStatuses: ("new" | "in_progress")[] = ["new", "in_progress"];
    const [mc] = await db.select().from(missedCalls)
      .where(and(
        eq(missedCalls.orgId, orgId),
        eq(missedCalls.callerPhone, phone),
        inArray(missedCalls.status, activeStatuses)
      ))
      .orderBy(desc(missedCalls.createdAt));
    return mc;
  },

  async getMissedCalls(orgId: string, limit = 50, offset = 0): Promise<MissedCall[]> {
    return db.select().from(missedCalls)
      .where(eq(missedCalls.orgId, orgId))
      .orderBy(desc(missedCalls.createdAt))
      .limit(limit)
      .offset(offset);
  },

  async updateMissedCall(id: string, data: Partial<MissedCall>): Promise<MissedCall | undefined> {
    const [mc] = await db.update(missedCalls).set(data).where(eq(missedCalls.id, id)).returning();
    return mc;
  },

  async getMissedCallCount(orgId: string, since: Date): Promise<number> {
    const [result] = await db.select({ c: count() }).from(missedCalls)
      .where(and(
        eq(missedCalls.orgId, orgId),
        sql`${missedCalls.createdAt} >= ${since}`
      ));
    return result.c;
  },

  async createAiMessage(missedCallId: string, role: "system" | "assistant" | "user", content: string): Promise<AiMessage> {
    const [msg] = await db.insert(aiMessages).values({
      missedCallId,
      role,
      content,
    }).returning();
    return msg;
  },

  async getAiMessages(missedCallId: string): Promise<AiMessage[]> {
    return db.select().from(aiMessages)
      .where(eq(aiMessages.missedCallId, missedCallId))
      .orderBy(aiMessages.createdAt);
  },

  async getOrgByCallRecoveryPhone(phone: string): Promise<Org | undefined> {
    const [org] = await db.select().from(orgs).where(eq(orgs.callRecoveryPhone, phone));
    return org;
  },

  async findMissedCallByCallerPhone(phone: string): Promise<(MissedCall & { orgId: string }) | undefined> {
    const activeStatuses: ("new" | "in_progress")[] = ["new", "in_progress"];
    const [mc] = await db.select().from(missedCalls)
      .where(and(
        eq(missedCalls.callerPhone, phone),
        inArray(missedCalls.status, activeStatuses)
      ))
      .orderBy(desc(missedCalls.createdAt));
    return mc;
  },

  async createCallRecoverySubscription(data: {
    orgId: string;
    plan: CallRecoveryPlan;
    stripeSubscriptionId?: string;
    stripeCustomerId?: string;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
  }): Promise<CallRecoverySubscription> {
    const [sub] = await db.insert(callRecoverySubscriptions).values({
      orgId: data.orgId,
      plan: data.plan,
      status: "active",
      stripeSubscriptionId: data.stripeSubscriptionId || null,
      stripeCustomerId: data.stripeCustomerId || null,
      currentPeriodStart: data.currentPeriodStart || new Date(),
      currentPeriodEnd: data.currentPeriodEnd || null,
      usageCount: 0,
    }).returning();
    return sub;
  },

  async getCallRecoverySubscription(orgId: string): Promise<CallRecoverySubscription | undefined> {
    const [sub] = await db.select().from(callRecoverySubscriptions)
      .where(and(
        eq(callRecoverySubscriptions.orgId, orgId),
        eq(callRecoverySubscriptions.status, "active")
      ))
      .orderBy(desc(callRecoverySubscriptions.createdAt));
    return sub;
  },

  async updateCallRecoverySubscription(id: string, data: Partial<CallRecoverySubscription>): Promise<CallRecoverySubscription | undefined> {
    const [sub] = await db.update(callRecoverySubscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(callRecoverySubscriptions.id, id))
      .returning();
    return sub;
  },

  async incrementCallRecoveryUsage(orgId: string): Promise<void> {
    await db.update(callRecoverySubscriptions)
      .set({ usageCount: sql`${callRecoverySubscriptions.usageCount} + 1`, updatedAt: new Date() })
      .where(and(
        eq(callRecoverySubscriptions.orgId, orgId),
        eq(callRecoverySubscriptions.status, "active")
      ));
  },
};
