import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { storage } from "../server/storage";
import { setupOrg, trackOrg, trackUser, cleanupAll } from "./helpers";
import { pool } from "../server/db";

describe("Storage org-scoping (multi-tenant isolation)", () => {
  let orgA: any, orgB: any, userA: any, userB: any;

  beforeAll(async () => {
    const a = await setupOrg("small_business");
    const b = await setupOrg("small_business");
    orgA = a.org;
    userA = a.user;
    orgB = b.org;
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

  it("getCustomers does not leak across orgs", async () => {
    const cA = await storage.createCustomer(orgA.id, { name: "Alice A", phone: "111" } as any);
    const cB = await storage.createCustomer(orgB.id, { name: "Bob B", phone: "222" } as any);

    const aList = await storage.getCustomers(orgA.id);
    const bList = await storage.getCustomers(orgB.id);

    expect(aList.find((c) => c.id === cA.id)).toBeTruthy();
    expect(aList.find((c) => c.id === cB.id)).toBeUndefined();
    expect(bList.find((c) => c.id === cB.id)).toBeTruthy();
    expect(bList.find((c) => c.id === cA.id)).toBeUndefined();
  });

  it("getCustomer returns undefined for cross-org access", async () => {
    const c = await storage.createCustomer(orgA.id, { name: "C", phone: "" } as any);
    const fromB = await storage.getCustomer(orgB.id, c.id);
    expect(fromB).toBeUndefined();
    const fromA = await storage.getCustomer(orgA.id, c.id);
    expect(fromA?.id).toBe(c.id);
  });

  it("updateCustomer cannot mutate another org's row", async () => {
    const c = await storage.createCustomer(orgA.id, { name: "Original", phone: "" } as any);
    const result = await storage.updateCustomer(orgB.id, c.id, { name: "Hijacked" } as any);
    expect(result).toBeUndefined();
    const fresh = await storage.getCustomer(orgA.id, c.id);
    expect(fresh?.name).toBe("Original");
  });

  it("deleteCustomer cannot delete another org's row", async () => {
    const c = await storage.createCustomer(orgA.id, { name: "Persist", phone: "" } as any);
    await storage.deleteCustomer(orgB.id, c.id);
    const stillThere = await storage.getCustomer(orgA.id, c.id);
    expect(stillThere?.id).toBe(c.id);
  });

  it("getJobs and updateJob are org-scoped", async () => {
    const cust = await storage.createCustomer(orgA.id, { name: "JobCust", phone: "" } as any);
    const job = await storage.createJob(
      orgA.id,
      { title: "Fix sink", customerId: cust.id, status: "lead" } as any,
      userA.id,
    );
    const bJobs = await storage.getJobs(orgB.id);
    expect(bJobs.find((j) => j.id === job.id)).toBeUndefined();

    const hijack = await storage.updateJob(orgB.id, job.id, { title: "Hijacked" } as any);
    expect(hijack).toBeUndefined();
    const fresh = await storage.getJob(orgA.id, job.id);
    expect(fresh?.title).toBe("Fix sink");
  });

  it("getQuotes and getInvoices are org-scoped", async () => {
    const cust = await storage.createCustomer(orgA.id, { name: "QC", phone: "" } as any);
    const q = await storage.createQuote(
      orgA.id,
      { customerId: cust.id, taxRate: "0", discount: "0", status: "draft", items: [{ description: "x", qty: 1, unitPrice: 10 }] },
      userA.id,
    );
    const inv = await storage.createInvoice(
      orgA.id,
      { customerId: cust.id, taxRate: "0", discount: "0", status: "draft", items: [{ description: "x", qty: 1, unitPrice: 10 }] },
      userA.id,
    );

    const bQuotes = await storage.getQuotes(orgB.id);
    const bInvoices = await storage.getInvoices(orgB.id);
    expect(bQuotes.find((x) => x.id === q.id)).toBeUndefined();
    expect(bInvoices.find((x) => x.id === inv.id)).toBeUndefined();

    expect(await storage.getQuote(orgB.id, q.id)).toBeUndefined();
    expect(await storage.getInvoice(orgB.id, inv.id)).toBeUndefined();
  });

  it("memberships are org-scoped", async () => {
    const memsA = await storage.getOrgMemberships(orgA.id);
    const memsB = await storage.getOrgMemberships(orgB.id);
    expect(memsA.every((m) => m.orgId === orgA.id)).toBe(true);
    expect(memsB.every((m) => m.orgId === orgB.id)).toBe(true);
    expect(memsA.find((m) => m.userId === userB.id)).toBeUndefined();
    expect(memsB.find((m) => m.userId === userA.id)).toBeUndefined();
  });
});
