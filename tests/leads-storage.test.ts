import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { completeRecovery } from "../server/callRecoveryAI";
import { ensureLeadForMissedCall } from "../server/callRecoveryLeadBridge";
import { storage } from "../server/storage";
import { pool } from "../server/db";
import { cleanupAll, setupOrg, trackOrg, trackUser } from "./helpers";

describe("Leads storage", () => {
  let orgA: any;
  let orgB: any;
  let userA: any;
  let userB: any;

  beforeAll(async () => {
    const a = await setupOrg("small_business");
    const b = await setupOrg("small_business");
    orgA = a.org;
    orgB = b.org;
    userA = a.user;
    userB = b.user;
    trackOrg(orgA.id);
    trackOrg(orgB.id);
    trackUser(userA.id);
    trackUser(userB.id);
  });

  afterAll(async () => {
    await cleanupAll();
    await pool.end();
  });

  it("keeps lead reads org-scoped", async () => {
    const leadA = await storage.createLead(orgA.id, {
      name: "Alice Lead",
      phone: "555-100-1000",
      source: "manual",
      status: "new",
      urgency: "normal",
    } as any, userA.id);
    const leadB = await storage.createLead(orgB.id, {
      name: "Bob Lead",
      phone: "555-200-2000",
      source: "manual",
      status: "new",
      urgency: "normal",
    } as any, userB.id);

    const aList = await storage.getLeads(orgA.id);
    const bList = await storage.getLeads(orgB.id);

    expect(aList.find((l) => l.id === leadA.id)).toBeTruthy();
    expect(aList.find((l) => l.id === leadB.id)).toBeUndefined();
    expect(bList.find((l) => l.id === leadB.id)).toBeTruthy();
    expect(await storage.getLead(orgB.id, leadA.id)).toBeUndefined();
  });

  it("does not update a lead from another org", async () => {
    const lead = await storage.createLead(orgA.id, {
      name: "Scoped Lead",
      source: "manual",
      status: "new",
      urgency: "normal",
    } as any, userA.id);

    const result = await storage.updateLead(orgB.id, lead.id, { name: "Hijacked" } as any);
    const fresh = await storage.getLead(orgA.id, lead.id);

    expect(result).toBeUndefined();
    expect(fresh?.name).toBe("Scoped Lead");
  });

  it("converts a lead to a customer and job lead", async () => {
    const lead = await storage.createLead(orgA.id, {
      name: "Convert Me",
      phone: "555-333-4444",
      email: "convert@example.com",
      address: "1 Work St",
      source: "manual",
      status: "qualified",
      serviceType: "Panel replacement",
      description: "Customer needs panel replacement",
      urgency: "urgent",
      score: 82,
    } as any, userA.id);

    const result = await storage.convertLeadToCustomerAndJob(orgA.id, lead.id, { createdBy: userA.id });

    expect(result.lead.status).toBe("converted");
    expect(result.lead.customerId).toBe(result.customer.id);
    expect(result.lead.jobId).toBe(result.job.id);
    expect(result.job.status).toBe("lead");
    expect(result.job.customerId).toBe(result.customer.id);

    const activities = await storage.getLeadActivities(orgA.id, lead.id);
    expect(activities.find((a) => a.type === "conversion")).toBeTruthy();
  });

  it("prevents duplicate leads for the same missed call", async () => {
    const missedCall = await storage.createMissedCall(orgA.id, {
      callerPhone: "555-444-5555",
      twilioCallSid: `test-${Date.now()}`,
    });

    const first = await ensureLeadForMissedCall(missedCall);
    const second = await ensureLeadForMissedCall(missedCall);

    expect(second.id).toBe(first.id);
    const linked = await storage.getLeadByMissedCall(orgA.id, missedCall.id);
    expect(linked?.id).toBe(first.id);

    const leads = await storage.getLeads(orgA.id, { source: "missed_call" });
    expect(leads.filter((lead) => lead.missedCallId === missedCall.id)).toHaveLength(1);
  });

  it("links missed-call recovery conversion to one converted lead without duplicate jobs", async () => {
    const missedCall = await storage.createMissedCall(orgA.id, {
      callerPhone: "555-777-8888",
      callerName: "Recovery Caller",
      twilioCallSid: `test-${Date.now()}-conversion`,
    });

    await ensureLeadForMissedCall(missedCall);

    const first = await completeRecovery(missedCall.id, "Water heater repair", "22 Main St", "soon");
    const second = await completeRecovery(missedCall.id, "Water heater repair", "22 Main St", "soon");

    expect(second).toEqual(first);

    const recovered = await storage.getMissedCall(missedCall.id);
    expect(recovered?.customerId).toBe(first.customerId);
    expect(recovered?.jobId).toBe(first.jobId);

    const linked = await storage.getLeadByMissedCall(orgA.id, missedCall.id);
    expect(linked?.status).toBe("converted");
    expect(linked?.customerId).toBe(first.customerId);
    expect(linked?.jobId).toBe(first.jobId);

    const activities = await storage.getLeadActivities(orgA.id, linked!.id);
    const conversionActivities = activities.filter((activity) => activity.type === "conversion");
    expect(conversionActivities).toHaveLength(1);
  });
});
