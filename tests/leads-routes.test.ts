import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";

const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

function buildApp(leadsRouter: any, orgId: string, userId: string) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = { orgId, userId };
    next();
  });
  app.use(leadsRouter);
  return app;
}

function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

describeWithDb("Lead routes", () => {
  let storage: any;
  let pool: any;
  let cleanupAll: () => Promise<void>;
  let trackOrg: (id: string) => void;
  let trackUser: (id: string) => void;
  let appA: ReturnType<typeof buildApp>;
  let appB: ReturnType<typeof buildApp>;
  let orgA: any;
  let orgB: any;
  let userA: any;
  let userB: any;

  beforeAll(async () => {
    const storageModule = await import("../server/storage");
    const dbModule = await import("../server/db");
    const helperModule = await import("./helpers");
    const leadsRouter = (await import("../server/routes/leads")).default;

    storage = storageModule.storage;
    pool = dbModule.pool;
    cleanupAll = helperModule.cleanupAll;
    trackOrg = helperModule.trackOrg;
    trackUser = helperModule.trackUser;

    const a = await helperModule.setupOrg("small_business");
    const b = await helperModule.setupOrg("small_business");
    orgA = a.org;
    orgB = b.org;
    userA = a.user;
    userB = b.user;
    trackOrg(orgA.id);
    trackOrg(orgB.id);
    trackUser(userA.id);
    trackUser(userB.id);
    appA = buildApp(leadsRouter, orgA.id, userA.id);
    appB = buildApp(leadsRouter, orgB.id, userB.id);
  });

  afterAll(async () => {
    if (cleanupAll) await cleanupAll();
    if (pool) await pool.end();
  });

  it("creates an org-scoped lead and blocks cross-org reads", async () => {
    const created = await request(appA)
      .post("/api/leads")
      .send({
        name: "Route Lead",
        phone: "555-0100",
        email: "route@example.com",
        source: "manual",
        status: "new",
        urgency: "normal",
        serviceType: "HVAC repair",
      });

    expect(created.status).toBe(200);
    expect(created.body.orgId).toBe(orgA.id);

    const ownRead = await request(appA).get(`/api/leads/${created.body.id}`);
    expect(ownRead.status).toBe(200);
    expect(ownRead.body.id).toBe(created.body.id);

    const crossOrgRead = await request(appB).get(`/api/leads/${created.body.id}`);
    expect(crossOrgRead.status).toBe(404);
  });

  it("counts stats and operator dashboard buckets", async () => {
    const hot = await request(appA).post("/api/leads").send({
      name: "Emergency No Cooling",
      phone: "555-0101",
      source: "website_form",
      status: "new",
      urgency: "emergency",
      serviceType: "Emergency HVAC no cooling",
      description: "No cooling, elderly parent at home, needs same day repair",
      nextFollowUpAt: hoursFromNow(1).toISOString(),
    });
    expect(hot.status).toBe(200);

    const overdue = await request(appA).post("/api/leads").send({
      name: "Overdue Plumbing",
      phone: "555-0102",
      source: "manual",
      status: "follow_up",
      urgency: "urgent",
      serviceType: "Plumbing leak",
      description: "Asked for a callback yesterday",
      nextFollowUpAt: hoursFromNow(-2).toISOString(),
    });
    expect(overdue.status).toBe(200);

    const stats = await request(appA).get("/api/leads/stats");
    expect(stats.status).toBe(200);
    expect(stats.body.newLeads).toBeGreaterThanOrEqual(1);
    expect(stats.body.hotLeads).toBeGreaterThanOrEqual(1);
    expect(stats.body.needsFollowUp).toBeGreaterThanOrEqual(1);

    const dashboard = await request(appA).get("/api/leads/operator-dashboard");
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.hotLeads.some((lead: any) => lead.id === hot.body.id)).toBe(true);
    expect(dashboard.body.needsContact.some((lead: any) => lead.id === hot.body.id)).toBe(true);
    expect(dashboard.body.followUpsDueToday.some((lead: any) => lead.id === hot.body.id)).toBe(true);
    expect(dashboard.body.overdueFollowUps.some((lead: any) => lead.id === overdue.body.id)).toBe(true);
  });

  it("stamps lastContactedAt when status moves into contacted pipeline stages", async () => {
    const created = await request(appA).post("/api/leads").send({
      name: "Contact Stamp",
      source: "manual",
      status: "new",
      urgency: "normal",
    });
    expect(created.status).toBe(200);
    expect(created.body.lastContactedAt).toBeNull();

    const patched = await request(appA)
      .patch(`/api/leads/${created.body.id}`)
      .send({ status: "contacted" });
    expect(patched.status).toBe(200);
    expect(patched.body.lastContactedAt).toBeTruthy();
  });

  it("returns follow-up tasks and keeps task reads org-scoped", async () => {
    const lead = await storage.createLead(orgA.id, {
      name: "Followup Route",
      source: "manual",
      status: "follow_up",
      urgency: "normal",
    }, userA.id);

    await storage.createLeadFollowupTask(orgA.id, lead.id, {
      stepNumber: 1,
      channel: "sms",
      dueAt: hoursFromNow(-1),
      status: "pending",
      messageTemplate: "Follow up",
      lastAttemptAt: null,
      completedAt: null,
      error: null,
    });
    await storage.createLeadFollowupTask(orgA.id, lead.id, {
      stepNumber: 2,
      channel: "email",
      dueAt: hoursFromNow(-2),
      status: "completed",
      messageTemplate: "Completed",
      lastAttemptAt: hoursFromNow(-2),
      completedAt: hoursFromNow(-1),
      error: null,
    });
    await storage.createLeadFollowupTask(orgA.id, lead.id, {
      stepNumber: 3,
      channel: "sms",
      dueAt: hoursFromNow(-3),
      status: "failed",
      messageTemplate: "Failed",
      lastAttemptAt: hoursFromNow(-3),
      completedAt: null,
      error: "Demo failure",
    });

    const own = await request(appA).get(`/api/leads/${lead.id}/followups`);
    expect(own.status).toBe(200);
    expect(own.body.map((task: any) => task.status).sort()).toEqual(["completed", "failed", "pending"]);

    const crossOrg = await request(appB).get(`/api/leads/${lead.id}/followups`);
    expect(crossOrg.status).toBe(404);
  });

  it("records dry-run SMS/email activities without sending outbound messages", async () => {
    const created = await request(appA).post("/api/leads").send({
      name: "Dry Run Lead",
      phone: "555-0103",
      email: "dryrun@example.com",
      source: "manual",
      status: "qualified",
      urgency: "normal",
      serviceType: "Dry run service",
      consentToSms: true,
    });
    expect(created.status).toBe(200);

    const sms = await request(appA).post(`/api/leads/${created.body.id}/send-sms`).send({});
    const email = await request(appA).post(`/api/leads/${created.body.id}/send-email`).send({});
    expect(sms.status).toBe(200);
    expect(email.status).toBe(200);
    expect(sms.body.dryRun).toBe(true);
    expect(email.body.dryRun).toBe(true);

    const activities = await request(appA).get(`/api/leads/${created.body.id}/activities`);
    expect(activities.status).toBe(200);
    const messages = activities.body.filter((activity: any) => activity.type === "message");
    expect(messages).toHaveLength(2);
    expect(messages.every((activity: any) => activity.status === "dry_run")).toBe(true);
    expect(messages.every((activity: any) => activity.metadata?.dryRun === true)).toBe(true);
  });

  it("converts a qualified lead to a customer and job lead", async () => {
    const created = await request(appA).post("/api/leads").send({
      name: "Convert Route",
      phone: "555-0104",
      email: "convert-route@example.com",
      source: "manual",
      status: "qualified",
      urgency: "urgent",
      serviceType: "Panel upgrade",
      description: "Ready to book",
    });
    expect(created.status).toBe(200);

    const converted = await request(appA).post(`/api/leads/${created.body.id}/convert`).send({});
    expect(converted.status).toBe(200);
    expect(converted.body.lead.status).toBe("converted");
    expect(converted.body.lead.customerId).toBe(converted.body.customer.id);
    expect(converted.body.lead.jobId).toBe(converted.body.job.id);
    expect(converted.body.job.status).toBe("lead");
  });
});
