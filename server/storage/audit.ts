import { eq, and, desc, count, gte, lte } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  auditLog,
  type AuditLogEntry,
} from "@shared/schema";

export const auditStorage = {
  async recordAudit(entry: {
    orgId: string;
    userId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    before?: any;
    after?: any;
  }): Promise<void> {
    try {
      await db.insert(auditLog).values({
        orgId: entry.orgId,
        userId: entry.userId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        before: entry.before ?? null,
        after: entry.after ?? null,
      });
    } catch (err) {
      console.error("[audit] failed to record entry:", err);
    }
  },

  async getAuditLog(orgId: string, opts: { limit: number; offset: number; entity?: string; action?: string; userId?: string; from?: Date; to?: Date }): Promise<{ items: (AuditLogEntry & { userName: string | null; userUsername: string | null })[]; total: number }> {
    const conditions = [eq(auditLog.orgId, orgId)];
    if (opts.entity) conditions.push(eq(auditLog.entity, opts.entity));
    if (opts.action) conditions.push(eq(auditLog.action, opts.action));
    if (opts.userId) conditions.push(eq(auditLog.userId, opts.userId));
    if (opts.from) conditions.push(gte(auditLog.createdAt, opts.from));
    if (opts.to) conditions.push(lte(auditLog.createdAt, opts.to));
    const whereExpr = and(...conditions);
    const rows = await db.select({
      id: auditLog.id,
      orgId: auditLog.orgId,
      userId: auditLog.userId,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      before: auditLog.before,
      after: auditLog.after,
      createdAt: auditLog.createdAt,
      userName: users.fullName,
      userUsername: users.username,
    })
      .from(auditLog)
      .leftJoin(users, eq(auditLog.userId, users.id))
      .where(whereExpr)
      .orderBy(desc(auditLog.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);
    const [totalRow] = await db.select({ count: count() }).from(auditLog).where(whereExpr);
    return { items: rows as any, total: totalRow?.count ?? 0 };
  },

  async getAuditLogForExport(orgId: string, opts: { entity?: string; action?: string; userId?: string; from?: Date; to?: Date }): Promise<(AuditLogEntry & { userName: string | null; userUsername: string | null })[]> {
    const conditions = [eq(auditLog.orgId, orgId)];
    if (opts.entity) conditions.push(eq(auditLog.entity, opts.entity));
    if (opts.action) conditions.push(eq(auditLog.action, opts.action));
    if (opts.userId) conditions.push(eq(auditLog.userId, opts.userId));
    if (opts.from) conditions.push(gte(auditLog.createdAt, opts.from));
    if (opts.to) conditions.push(lte(auditLog.createdAt, opts.to));
    const whereExpr = and(...conditions);
    const rows = await db.select({
      id: auditLog.id,
      orgId: auditLog.orgId,
      userId: auditLog.userId,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      before: auditLog.before,
      after: auditLog.after,
      createdAt: auditLog.createdAt,
      userName: users.fullName,
      userUsername: users.username,
    })
      .from(auditLog)
      .leftJoin(users, eq(auditLog.userId, users.id))
      .where(whereExpr)
      .orderBy(desc(auditLog.createdAt));
    return rows as any;
  },
};
