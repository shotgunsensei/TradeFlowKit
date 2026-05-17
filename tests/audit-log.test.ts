import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import auditLogRouter from "../server/routes/auditLog";
import { storage } from "../server/storage";
import { db, pool } from "../server/db";
import { auditLog } from "@shared/schema";
import { eq } from "drizzle-orm";
import { setupOrg, trackOrg, trackUser, cleanupAll } from "./helpers";

function buildApp(orgId: string, userId: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = { orgId, userId };
    next();
  });
  app.use(auditLogRouter);
  return app;
}

async function seedAuditEntry(orgId: string, userId: string, createdAt: Date, entity = "customer") {
  await db.insert(auditLog).values({
    orgId,
    userId,
    action: "update",
    entity,
    entityId: null,
    before: null,
    after: { at: createdAt.toISOString() },
    createdAt,
  } as any);
}

describe("Audit log date-range filter", () => {
  let orgId: string;
  let userId: string;
  const day1 = new Date("2025-01-01T12:00:00.000Z");
  const day3 = new Date("2025-01-03T12:00:00.000Z");
  const day5 = new Date("2025-01-05T12:00:00.000Z");
  const day7 = new Date("2025-01-07T12:00:00.000Z");

  beforeAll(async () => {
    const { org, user } = await setupOrg("enterprise");
    trackOrg(org.id);
    trackUser(user.id);
    orgId = org.id;
    userId = user.id;
    await db.delete(auditLog).where(eq(auditLog.orgId, orgId));
    for (const d of [day1, day3, day5, day7]) {
      await seedAuditEntry(orgId, userId, d);
    }
  });

  afterAll(async () => {
    await db.delete(auditLog).where(eq(auditLog.orgId, orgId));
    await cleanupAll();
    await pool.end();
  });

  describe("storage.getAuditLog", () => {
    it("returns all entries when from/to are not provided", async () => {
      const { items, total } = await storage.getAuditLog(orgId, { limit: 100, offset: 0 });
      expect(total).toBe(4);
      expect(items).toHaveLength(4);
    });

    it("filters by from (inclusive lower bound)", async () => {
      const { items, total } = await storage.getAuditLog(orgId, { limit: 100, offset: 0, from: day3 });
      expect(total).toBe(3);
      const dates = items.map((i) => new Date(i.createdAt as any).toISOString());
      expect(dates).toEqual([day7.toISOString(), day5.toISOString(), day3.toISOString()]);
    });

    it("filters by to (inclusive upper bound)", async () => {
      const { items, total } = await storage.getAuditLog(orgId, { limit: 100, offset: 0, to: day5 });
      expect(total).toBe(3);
      const dates = items.map((i) => new Date(i.createdAt as any).toISOString()).sort();
      expect(dates).toEqual([day1.toISOString(), day3.toISOString(), day5.toISOString()]);
    });

    it("filters by from + to (inclusive on both ends)", async () => {
      const { items, total } = await storage.getAuditLog(orgId, { limit: 100, offset: 0, from: day3, to: day5 });
      expect(total).toBe(2);
      const dates = items.map((i) => new Date(i.createdAt as any).toISOString()).sort();
      expect(dates).toEqual([day3.toISOString(), day5.toISOString()]);
    });

    it("returns empty when range excludes all entries", async () => {
      const { items, total } = await storage.getAuditLog(orgId, {
        limit: 100,
        offset: 0,
        from: new Date("2025-02-01T00:00:00.000Z"),
        to: new Date("2025-02-28T00:00:00.000Z"),
      });
      expect(total).toBe(0);
      expect(items).toHaveLength(0);
    });
  });

  describe("GET /api/audit-log", () => {
    it("returns all entries when no date range is provided", async () => {
      const app = buildApp(orgId, userId);
      const res = await request(app).get("/api/audit-log");
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(4);
    });

    it("narrows results to within from/to", async () => {
      const app = buildApp(orgId, userId);
      const res = await request(app)
        .get("/api/audit-log")
        .query({ from: day3.toISOString(), to: day5.toISOString() });
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.items).toHaveLength(2);
    });

    it("returns 400 for invalid 'from'", async () => {
      const app = buildApp(orgId, userId);
      const res = await request(app).get("/api/audit-log").query({ from: "not-a-date" });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/from/i);
    });

    it("returns 400 for invalid 'to'", async () => {
      const app = buildApp(orgId, userId);
      const res = await request(app).get("/api/audit-log").query({ to: "garbage" });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/to/i);
    });

    it("returns 400 when from is after to", async () => {
      const app = buildApp(orgId, userId);
      const res = await request(app)
        .get("/api/audit-log")
        .query({ from: day7.toISOString(), to: day1.toISOString() });
      expect(res.status).toBe(400);
    });
  });
});
