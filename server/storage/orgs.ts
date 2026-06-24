import { eq, and, desc, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "../db";
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
  reviewRequests,
  orgAutomations,
  reminderLog,
  auditLog,
  leads,
  leadActivities,
  leadCaptureForms,
  leadFollowupTasks,
  leadSourceEvents,
  leadSettings,
  type Org,
  type InsertOrg,
  type Membership,
  type InviteCode,
} from "@shared/schema";

type MembershipRole = Membership["role"];

export const orgsStorage = {
  async createOrg(data: InsertOrg): Promise<Org> {
    const [org] = await db.insert(orgs).values(data).returning();
    return org;
  },

  async getOrg(id: string): Promise<Org | undefined> {
    const [org] = await db.select().from(orgs).where(eq(orgs.id, id));
    return org;
  },

  async updateOrg(id: string, data: Partial<Org>): Promise<Org | undefined> {
    const [org] = await db.update(orgs).set(data).where(eq(orgs.id, id)).returning();
    return org;
  },

  async getUserOrgs(userId: string): Promise<Org[]> {
    const mems = await db.select().from(memberships).where(eq(memberships.userId, userId));
    if (mems.length === 0) return [];
    const orgIds = mems.map((m) => m.orgId);
    return db.select().from(orgs).where(inArray(orgs.id, orgIds));
  },

  async getAllOrgs(): Promise<Org[]> {
    return db.select().from(orgs).orderBy(desc(orgs.createdAt));
  },

  async deleteOrg(id: string): Promise<void> {
    await db.delete(callRecoverySubscriptions).where(eq(callRecoverySubscriptions.orgId, id));
    await db.delete(leadFollowupTasks).where(eq(leadFollowupTasks.orgId, id));
    await db.delete(leadActivities).where(eq(leadActivities.orgId, id));
    await db.delete(leadSourceEvents).where(eq(leadSourceEvents.orgId, id));
    await db.delete(leads).where(eq(leads.orgId, id));
    await db.delete(leadCaptureForms).where(eq(leadCaptureForms.orgId, id));
    await db.delete(leadSettings).where(eq(leadSettings.orgId, id));
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
    await db.delete(orgAutomations).where(eq(orgAutomations.orgId, id));
    await db.delete(reminderLog).where(eq(reminderLog.orgId, id));
    await db.delete(reviewRequests).where(eq(reviewRequests.orgId, id));
    await db.delete(auditLog).where(eq(auditLog.orgId, id));
    await db.delete(orgs).where(eq(orgs.id, id));
  },

  async getOrgByStripeCustomerId(stripeCustomerId: string): Promise<Org | undefined> {
    const [org] = await db.select().from(orgs).where(eq(orgs.stripeCustomerId, stripeCustomerId));
    return org;
  },

  async getOrgByOperatorosOrganizationId(operatorosOrganizationId: string): Promise<Org | undefined> {
    if (!operatorosOrganizationId) return undefined;
    const [org] = await db
      .select()
      .from(orgs)
      .where(eq(orgs.operatorosOrganizationId, operatorosOrganizationId));
    return org;
  },

  async getOrgByOperatorosTenantId(operatorosTenantId: string): Promise<Org | undefined> {
    if (!operatorosTenantId) return undefined;
    const [org] = await db
      .select()
      .from(orgs)
      .where(eq(orgs.operatorosTenantId, operatorosTenantId));
    return org;
  },

  async deleteUser(userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const userMemberships = await tx.select().from(memberships).where(eq(memberships.userId, userId));

      for (const mem of userMemberships) {
        const orgMembers = await tx.select().from(memberships).where(eq(memberships.orgId, mem.orgId));
        const otherMembers = orgMembers.filter((m) => m.userId !== userId);

        if (otherMembers.length === 0) {
          await tx.delete(leadFollowupTasks).where(eq(leadFollowupTasks.orgId, mem.orgId));
          await tx.delete(leadActivities).where(eq(leadActivities.orgId, mem.orgId));
          await tx.delete(leads).where(eq(leads.orgId, mem.orgId));
          await tx.delete(leadCaptureForms).where(eq(leadCaptureForms.orgId, mem.orgId));
          await tx.delete(leadSettings).where(eq(leadSettings.orgId, mem.orgId));
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
          await tx.delete(orgAutomations).where(eq(orgAutomations.orgId, mem.orgId));
          await tx.delete(reminderLog).where(eq(reminderLog.orgId, mem.orgId));
          await tx.delete(reviewRequests).where(eq(reviewRequests.orgId, mem.orgId));
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
      await tx.update(leads).set({ createdBy: null }).where(eq(leads.createdBy, userId));
      await tx.update(leads).set({ assignedUserId: null }).where(eq(leads.assignedUserId, userId));
      await tx.update(leadActivities).set({ createdBy: null }).where(eq(leadActivities.createdBy, userId));

      await tx.delete(users).where(eq(users.id, userId));
    });
  },
};

export const membershipsStorage = {
  async createMembership(orgId: string, userId: string, role: string): Promise<Membership> {
    const [mem] = await db
      .insert(memberships)
      .values({ orgId, userId, role: role as MembershipRole })
      .returning();
    return mem;
  },

  async getMembership(orgId: string, userId: string): Promise<Membership | undefined> {
    const [mem] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
    return mem;
  },

  async getOrgMemberships(orgId: string): Promise<Membership[]> {
    return db.select().from(memberships).where(eq(memberships.orgId, orgId));
  },

  async deleteMembership(orgId: string, userId: string): Promise<void> {
    await db.delete(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
  },

  async updateMembershipRole(orgId: string, userId: string, role: string): Promise<void> {
    await db
      .update(memberships)
      .set({ role: role as MembershipRole })
      .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
  },

  async updateMembershipEntitlements(
    orgId: string,
    userId: string,
    data: {
      operatorosUserId?: string | null;
      tenantRole?: string | null;
      moduleRole?: string | null;
      enabled?: boolean;
      userEntitlementSnapshot?: unknown;
      lastSsoLoginAt?: Date;
      role?: string;
    },
  ): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (data.operatorosUserId !== undefined) patch.operatorosUserId = data.operatorosUserId;
    if (data.tenantRole !== undefined) patch.tenantRole = data.tenantRole;
    if (data.moduleRole !== undefined) patch.moduleRole = data.moduleRole;
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.userEntitlementSnapshot !== undefined) patch.userEntitlementSnapshot = data.userEntitlementSnapshot;
    if (data.lastSsoLoginAt !== undefined) patch.lastSsoLoginAt = data.lastSsoLoginAt;
    if (data.role !== undefined) patch.role = data.role as MembershipRole;
    if (Object.keys(patch).length === 0) return;
    await db
      .update(memberships)
      .set(patch)
      .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
  },

  async createInviteCode(orgId: string, role: string, createdBy: string): Promise<InviteCode> {
    const code = randomBytes(4).toString("hex").toUpperCase();
    const [ic] = await db
      .insert(inviteCodes)
      .values({ orgId, code, role: role as MembershipRole, createdBy })
      .returning();
    return ic;
  },

  async getInviteCodeByCode(code: string): Promise<InviteCode | undefined> {
    const [ic] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code.toUpperCase()));
    return ic;
  },

  async getOrgInviteCodes(orgId: string): Promise<InviteCode[]> {
    return db
      .select()
      .from(inviteCodes)
      .where(eq(inviteCodes.orgId, orgId))
      .orderBy(desc(inviteCodes.createdAt));
  },
};
