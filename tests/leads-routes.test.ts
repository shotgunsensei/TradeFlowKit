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
  let appTech: ReturnType<typeof buildApp>;
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
    const techUser = await helperModule.createTestUser("_lead_tech");
    await storage.createMembership(orgA.id, techUser.id, "tech");
    trackUser(techUser.id);
    appTech = buildApp(leadsRouter, orgA.id, techUser.id);
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

  it("returns org-scoped module readiness without exposing provider secrets", async () => {
    const originalSendgridKey = process.env.SENDGRID_API_KEY;
    const originalSendgridFrom = process.env.SENDGRID_FROM_EMAIL;
    process.env.SENDGRID_API_KEY = "sg-super-secret-test-key";
    process.env.SENDGRID_FROM_EMAIL = "sender@example.com";

    try {
      await storage.upsertLeadSettings(orgA.id, {
        tradeTemplateKey: "hvac",
        serviceArea: "Test service area",
        leadSources: ["Website Form"],
        followUpEnabled: true,
        autoRespond: true,
        dryRun: true,
        defaultSmsTemplate: "Hi {name}, we received your {service} request. Reply STOP to opt out.",
        defaultEmailSubject: "Thanks for contacting {business}",
        defaultEmailTemplate: "Hi {name}, we received your request.",
        smsComplianceFooter: "Reply STOP to opt out.",
      });
      await storage.createLeadCaptureForm(orgA.id, {
        name: "Module Status Form",
        sourceLabel: "Website Form",
        isEnabled: true,
      });
      const demoLead = await storage.createLead(orgA.id, {
        name: "Demo Module Lead",
        source: "website_form",
        status: "new",
        urgency: "emergency",
        phone: "555-0777",
        serviceType: "No cooling",
        score: 91,
        metadata: { demoLeadSeed: true },
      } as any, userA.id);
      await storage.createLeadFollowupTask(orgA.id, demoLead.id, {
        stepNumber: 1,
        channel: "email",
        dueAt: hoursFromNow(2),
        status: "pending",
        messageTemplate: "Follow up",
        lastAttemptAt: null,
        completedAt: null,
        error: null,
      });
      await storage.createLeadActivity(orgA.id, demoLead.id, {
        type: "message",
        channel: "email",
        direction: "outbound",
        subject: "Dry-run email",
        body: "Prepared only",
        status: "dry_run",
        metadata: { mode: "dry-run", provider: "sendgrid", recipient: "lead@example.com" },
        createdBy: userA.id,
      });

      const own = await request(appA).get("/api/leads/module-status");
      expect(own.status).toBe(200);
      expect(own.body.enabled).toBe(true);
      expect(own.body.module.moduleKey).toBe("lead_conversion_center");
      expect(own.body.activeTradeTemplate.name).toBe("HVAC");
      expect(own.body.publicFormsConfigured).toBe(true);
      expect(own.body.leadSourcesConfigured).toBe(true);
      expect(own.body.demoDataPresent).toBe(true);
      expect(own.body.hotLeads).toBeGreaterThanOrEqual(1);
      expect(own.body.usageSummary.followupsScheduled).toBeGreaterThanOrEqual(1);
      expect(own.body.usageSummary.messagesDryRun).toBeGreaterThanOrEqual(1);

      const serialized = JSON.stringify(own.body);
      expect(serialized).not.toContain("sg-super-secret-test-key");

      const other = await request(appB).get("/api/leads/module-status");
      expect(other.status).toBe(200);
      expect(other.body.totalLeads).toBeLessThan(own.body.totalLeads);
      expect(JSON.stringify(other.body)).not.toContain(demoLead.id);
    } finally {
      if (originalSendgridKey === undefined) delete process.env.SENDGRID_API_KEY;
      else process.env.SENDGRID_API_KEY = originalSendgridKey;
      if (originalSendgridFrom === undefined) delete process.env.SENDGRID_FROM_EMAIL;
      else process.env.SENDGRID_FROM_EMAIL = originalSendgridFrom;
    }
  });

  it("returns production readiness and blocks unsafe live-mode activation", async () => {
    const originalSendgridKey = process.env.SENDGRID_API_KEY;
    const originalSendgridFrom = process.env.SENDGRID_FROM_EMAIL;
    process.env.SENDGRID_API_KEY = "sg-hidden-production-readiness-secret";
    process.env.SENDGRID_FROM_EMAIL = "sender@example.com";

    try {
      await storage.upsertLeadSettings(orgB.id, {
        tradeTemplateKey: "plumbing",
        serviceArea: "Route test service area",
        leadSources: ["Website Form"],
        autoRespond: true,
        followUpEnabled: true,
        dryRun: true,
        smsEnabled: true,
        emailEnabled: true,
        defaultSmsTemplate: "Hi {name}, we received your {service} request. Reply STOP to opt out.",
        defaultEmailSubject: "Thanks for contacting {business}",
        defaultEmailTemplate: "Hi {name}, we received your request.",
        smsComplianceFooter: "Reply STOP to opt out.",
      });
      await storage.createLeadCaptureForm(orgB.id, {
        name: "Production Readiness Form",
        sourceLabel: "Website Form",
        isEnabled: true,
      });

      const readiness = await request(appB).get("/api/leads/production-readiness");
      expect(readiness.status).toBe(200);
      expect(readiness.body.messagingStatus.dryRun).toBe(true);
      expect(readiness.body.providerStatus.emailConfigured).toBe(true);
      expect(readiness.body.providerStatus.fromEmailConfigured).toBe(true);
      expect(readiness.body.providerStatus).not.toHaveProperty("sendgridApiKey");
      expect(JSON.stringify(readiness.body)).not.toContain("sg-hidden-production-readiness-secret");

      const missingConfirmation = await request(appB)
        .patch("/api/leads/settings")
        .send({
          settings: {
            autoRespond: true,
            followUpEnabled: true,
            hotLeadThreshold: 75,
            dryRun: false,
            smsEnabled: true,
            emailEnabled: true,
            defaultSmsTemplate: "Hi {name}, we received your {service} request. Reply STOP to opt out.",
            defaultEmailSubject: "Thanks for contacting {business}",
            defaultEmailTemplate: "Hi {name}, we received your request.",
            smsComplianceFooter: "Reply STOP to opt out.",
            tradeTemplateKey: "plumbing",
            serviceArea: "Route test service area",
            leadSources: ["Website Form"],
          },
        });
      expect(missingConfirmation.status).toBe(400);
      expect(missingConfirmation.body.error).toBe("live_confirmation_required");

      const blocked = await request(appB)
        .patch("/api/leads/settings")
        .send({
          liveConfirmationPhrase: "ENABLE LIVE LEADS",
          settings: {
            autoRespond: true,
            followUpEnabled: true,
            hotLeadThreshold: 75,
            dryRun: false,
            smsEnabled: true,
            emailEnabled: true,
            defaultSmsTemplate: "Hi {name}, we received your {service} request. Reply STOP to opt out.",
            defaultEmailSubject: "Thanks for contacting {business}",
            defaultEmailTemplate: "Hi {name}, we received your request.",
            smsComplianceFooter: "Reply STOP to opt out.",
            tradeTemplateKey: "plumbing",
            serviceArea: "Route test service area",
            leadSources: ["Website Form"],
          },
        });
      expect(blocked.status).toBe(400);
      expect(blocked.body.error).toBe("production_readiness_blocked");
      expect(blocked.body.readiness.canGoLive).toBe(false);

      const otherOrgReadiness = await request(appA).get("/api/leads/production-readiness");
      expect(otherOrgReadiness.status).toBe(200);
      expect(JSON.stringify(otherOrgReadiness.body)).not.toContain("Production Readiness Form");
    } finally {
      if (originalSendgridKey === undefined) delete process.env.SENDGRID_API_KEY;
      else process.env.SENDGRID_API_KEY = originalSendgridKey;
      if (originalSendgridFrom === undefined) delete process.env.SENDGRID_FROM_EMAIL;
      else process.env.SENDGRID_FROM_EMAIL = originalSendgridFrom;
    }
  });

  it("returns secret-free org-scoped operational health", async () => {
    const beforeA = await request(appA).get("/api/leads/health");
    const beforeB = await request(appB).get("/api/leads/health");
    expect(beforeA.status).toBe(200);
    expect(beforeB.status).toBe(200);

    const lead = await storage.createLead(orgA.id, {
      name: "Health Check Lead",
      source: "manual",
      status: "new",
      urgency: "normal",
    }, userA.id);
    await storage.createLeadActivity(orgA.id, lead.id, {
      type: "message",
      channel: "email",
      direction: "outbound",
      subject: "Provider error",
      body: "Safe body",
      status: "error",
      error: "Safe provider failure",
      metadata: { mode: "error", provider: "sendgrid" },
      createdBy: userA.id,
    });

    const healthA = await request(appA).get("/api/leads/health");
    const healthB = await request(appB).get("/api/leads/health");
    expect(healthA.status).toBe(200);
    expect(healthA.body.tablesReachable).toEqual({
      leads: true,
      settings: true,
      followups: true,
      leadSources: true,
    });
    expect(healthA.body.failedMessageCount).toBe(beforeA.body.failedMessageCount + 1);
    expect(healthB.body.failedMessageCount).toBe(beforeB.body.failedMessageCount);
    expect(healthA.body.followUpWorker).toEqual(expect.objectContaining({
      started: expect.any(Boolean),
      running: expect.any(Boolean),
    }));
    expect(JSON.stringify(healthA.body)).not.toMatch(/api[_-]?key|auth[_-]?token|password|secret/i);
  });

  it("requires owner or admin role for org-wide lead configuration", async () => {
    const captureForm = await storage.createLeadCaptureForm(orgA.id, {
      name: "Permission Test Form",
      sourceLabel: "Permission Test",
      isEnabled: true,
    });
    const settings = await request(appTech)
      .patch("/api/leads/settings")
      .send({ autoRespond: false });
    const template = await request(appTech)
      .post("/api/leads/settings/apply-template")
      .send({ tradeTemplateKey: "hvac" });
    const testMessage = await request(appTech)
      .post("/api/leads/test-message")
      .send({
        channel: "email",
        to: "staff@example.com",
        template: "Test",
        confirm: true,
      });
    const formUpdate = await request(appTech)
      .patch(`/api/leads/capture-form/${captureForm.id}`)
      .send({ isEnabled: false });

    expect(settings.status).toBe(403);
    expect(settings.body.error).toBe("insufficient_permissions");
    expect(template.status).toBe(403);
    expect(testMessage.status).toBe(403);
    expect(formUpdate.status).toBe(403);

    const ordinaryLead = await request(appTech).post("/api/leads").send({
      name: "Technician Created Lead",
      phone: "555-0199",
      source: "manual",
      status: "new",
      urgency: "normal",
    });
    expect(ordinaryLead.status).toBe(200);
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

  it("accepts generic webhook adapter submissions into org-scoped internal leads", async () => {
    const form = await storage.createLeadCaptureForm(orgA.id, {
      name: "Webhook Intake",
      sourceLabel: "Webhook Intake",
      isEnabled: true,
      successMessage: "Received.",
    });

    const captured = await request(appA)
      .post(`/api/public/lead-source/${form.publicToken}/genericJson`)
      .send({
        name: "Webhook Lead",
        phone: "555-0888",
        email: "webhook@example.com",
        serviceType: "No cooling",
        description: "AC stopped today.",
        consentToSms: true,
      });

    expect(captured.status).toBe(200);
    expect(captured.body).toEqual({ ok: true, message: "Received." });

    const orgALeads = await request(appA).get("/api/leads");
    const created = orgALeads.body.find((lead: any) => lead.email === "webhook@example.com");
    expect(created).toBeTruthy();
    expect(created.orgId).toBe(orgA.id);

    const crossOrgRead = await request(appB).get(`/api/leads/${created.id}`);
    expect(crossOrgRead.status).toBe(404);

    const events = await request(appA).get("/api/leads/source-events");
    expect(events.status).toBe(200);
    expect(events.body.some((event: any) => event.adapterKey === "genericJson" && event.status === "success" && event.leadId === created.id)).toBe(true);
  });

  it("deduplicates adapter replays that include a stable external id", async () => {
    const form = await storage.createLeadCaptureForm(orgA.id, {
      name: "Replay Intake",
      sourceLabel: "Replay Intake",
      isEnabled: true,
      successMessage: "Received.",
    });
    const payload = {
      sourceId: "external-lead-123",
      name: "Replay Protected Lead",
      email: "replay-protected@example.com",
      serviceType: "HVAC repair",
    };

    const first = await request(appA)
      .post(`/api/public/lead-source/${form.publicToken}/genericJson`)
      .send(payload);
    const second = await request(appA)
      .post(`/api/public/lead-source/${form.publicToken}/genericJson`)
      .send(payload);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const leads = await request(appA).get("/api/leads");
    expect(leads.body.filter((lead: any) => lead.email === payload.email)).toHaveLength(1);
  });

  it("rejects oversized public lead payloads", async () => {
    const form = await storage.createLeadCaptureForm(orgA.id, {
      name: "Payload Limit Intake",
      sourceLabel: "Payload Limit",
      isEnabled: true,
    });

    const response = await request(appA)
      .post(`/api/public/lead-source/${form.publicToken}/genericJson`)
      .send({
        name: "Oversized Lead",
        email: "oversized@example.com",
        description: "x".repeat(70 * 1024),
      });

    expect(response.status).toBe(413);
    expect(response.body.error).toBe("payload_too_large");
  });

  it("rejects public intake when the tenant lacks the lead module entitlement", async () => {
    const disabledOrg = await storage.createOrg({
      name: "Lead Module Disabled",
      slug: `lead-disabled-${Date.now()}`,
      plan: "free",
    });
    trackOrg(disabledOrg.id);
    const form = await storage.createLeadCaptureForm(disabledOrg.id, {
      name: "Disabled Module Intake",
      sourceLabel: "Disabled",
      isEnabled: true,
    });

    const response = await request(appA)
      .post(`/api/public/lead-source/${form.publicToken}/genericJson`)
      .send({ name: "Blocked Lead", email: "blocked@example.com" });

    expect(response.status).toBe(404);
  });

  it("rejects invalid tokens, disabled sources, and malformed adapter payloads", async () => {
    const invalidToken = await request(appA)
      .post("/api/public/lead-source/not-a-real-token/genericJson")
      .send({ name: "No Token", phone: "555-0000" });
    expect(invalidToken.status).toBe(404);

    const disabledForm = await storage.createLeadCaptureForm(orgA.id, {
      name: "Disabled Webhook",
      sourceLabel: "Disabled",
      isEnabled: false,
      successMessage: "Received.",
    });
    const disabled = await request(appA)
      .post(`/api/public/lead-source/${disabledForm.publicToken}/genericJson`)
      .send({ name: "Disabled", phone: "555-0001" });
    expect(disabled.status).toBe(404);

    const form = await storage.createLeadCaptureForm(orgA.id, {
      name: "Malformed Webhook",
      sourceLabel: "Malformed",
      isEnabled: true,
      successMessage: "Received.",
    });
    const malformed = await request(appA)
      .post(`/api/public/lead-source/${form.publicToken}/genericJson`)
      .send({ phone: "555-0002" });
    expect(malformed.status).toBe(400);
    expect(malformed.body.error).toMatch(/Name is required/);
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
