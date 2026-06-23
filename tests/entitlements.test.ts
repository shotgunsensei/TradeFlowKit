import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { storage } from "../server/storage";
import { setupOrg, trackOrg, trackUser, cleanupAll } from "./helpers";
import { pool } from "../server/db";
import {
  resolveAccess,
  deriveDefaultsFromPlanSlug,
  mapModuleRoleToMembershipRole,
  hasFeature,
  tenantHasFeature,
  type FeatureKey,
} from "@shared/entitlements";

describe("resolveAccess — chokepoint", () => {
  it("legacy org without operatorosTenantId uses PLAN_LIMITS", () => {
    const a = resolveAccess(
      { plan: "free", operatorosTenantId: null } as any,
      { role: "owner", moduleRole: null, enabled: true, userEntitlementSnapshot: null } as any,
    );
    expect(a.source).toBe("legacy");
    expect(a.linked).toBe(false);
    expect(a.allowed).toBe(true);
    expect(a.features.automations).toBe(false);
    expect(a.features.analytics).toBe(true);
    expect(a.limits.customers).toBe(5);
  });

  it("legacy small_business org grants automations + recurring", () => {
    const a = resolveAccess(
      { plan: "small_business", operatorosTenantId: null } as any,
      { role: "owner", moduleRole: null, enabled: true, userEntitlementSnapshot: null } as any,
    );
    expect(a.features.automations).toBe(true);
    expect(a.features.recurring_jobs).toBe(true);
  });

  it("linked org defers to tenant snapshot; user snapshot can only narrow", () => {
    const org = {
      plan: "free",
      operatorosTenantId: "tnt_1",
      operatorosPlanSlug: "pro",
      operatorosSubscriptionStatus: "active",
      operatorosAccessLevel: null,
      entitlementSnapshot: {
        schemaVersion: 1,
        tenantId: "tnt_1",
        planSlug: "pro",
        subscriptionStatus: "active",
        accessLevel: null,
        features: { automations: true, recurring_jobs: true, analytics: true, team_invites: true, unlimited_entities: true, call_recovery: false },
        limits: { customers: -1, jobs: -1, quotes: -1, invoices: -1, teamMembers: 25 },
      },
    } as any;
    const mem = {
      role: "admin",
      moduleRole: "module_user",
      enabled: true,
      userEntitlementSnapshot: {
        schemaVersion: 1,
        operatorosUserId: "u1",
        moduleRole: "module_user",
        enabled: true,
        permissions: [],
      },
    } as any;
    const a = resolveAccess(org, mem);
    expect(a.source).toBe("operatoros");
    expect(a.linked).toBe(true);
    expect(a.allowed).toBe(true);
    expect(a.features.automations).toBe(true);
    expect(a.limits.teamMembers).toBe(25);
    expect(a.effectiveRole).toBe("tech"); // module_user clamps to tech
  });

  it("SECURITY: linked org with empty tenant snapshot does NOT inherit features from user snapshot", () => {
    const org = {
      plan: "free",
      operatorosTenantId: "tnt_2",
      operatorosPlanSlug: null,
      operatorosSubscriptionStatus: "active",
      entitlementSnapshot: null,
    } as any;
    const evilMem = {
      role: "admin",
      moduleRole: "module_admin",
      enabled: true,
      userEntitlementSnapshot: {
        schemaVersion: 1,
        operatorosUserId: "u1",
        moduleRole: "module_admin",
        enabled: true,
        permissions: ["*"],
      },
    } as any;
    const a = resolveAccess(org, evilMem);
    expect(a.linked).toBe(true);
    // null planSlug falls back to defaults => automations off
    expect(a.features.automations).toBe(false);
    expect(a.features.recurring_jobs).toBe(false);
  });

  it("linked org with inactive subscription denies access", () => {
    const org = {
      plan: "free",
      operatorosTenantId: "tnt_3",
      operatorosPlanSlug: "pro",
      operatorosSubscriptionStatus: "canceled",
      entitlementSnapshot: null,
    } as any;
    const mem = { role: "admin", moduleRole: "module_admin", enabled: true, userEntitlementSnapshot: null } as any;
    const a = resolveAccess(org, mem);
    expect(a.allowed).toBe(false);
    expect(a.reason).toBe("tenant_inactive");
  });

  it("disabled user is denied even on an active tenant", () => {
    const org = {
      plan: "free",
      operatorosTenantId: "tnt_4",
      operatorosPlanSlug: "pro",
      operatorosSubscriptionStatus: "active",
      entitlementSnapshot: null,
    } as any;
    const mem = { role: "tech", moduleRole: "module_user", enabled: false, userEntitlementSnapshot: null } as any;
    const a = resolveAccess(org, mem);
    expect(a.allowed).toBe(false);
    expect(a.reason).toBe("user_disabled");
  });

  it("SECURITY: linked org + active tenant + null snapshot + null moduleRole → DENIED (fail-closed)", () => {
    const org = {
      plan: "free",
      operatorosTenantId: "tnt_fc1",
      operatorosPlanSlug: "pro",
      operatorosSubscriptionStatus: "active",
      entitlementSnapshot: null,
    } as any;
    // membership exists but no explicit module entitlement has been pushed yet
    const mem = { role: "tech", moduleRole: null, enabled: true, userEntitlementSnapshot: null } as any;
    const a = resolveAccess(org, mem);
    expect(a.allowed).toBe(false);
    expect(a.reason).toBe("no_module_role");
  });

  it("SECURITY: linked org + active tenant + invalid snapshot + null moduleRole → DENIED", () => {
    const org = {
      plan: "free",
      operatorosTenantId: "tnt_fc2",
      operatorosPlanSlug: "pro",
      operatorosSubscriptionStatus: "active",
      entitlementSnapshot: null,
    } as any;
    const mem = {
      role: "tech",
      moduleRole: null,
      enabled: true,
      userEntitlementSnapshot: { garbage: true },
    } as any;
    const a = resolveAccess(org, mem);
    expect(a.allowed).toBe(false);
    expect(a.reason).toBe("no_module_role");
  });

  it("SECURITY: linked org + active tenant + explicit module_user (no snapshot) → ALLOWED", () => {
    const org = {
      plan: "free",
      operatorosTenantId: "tnt_fc3",
      operatorosPlanSlug: "pro",
      operatorosSubscriptionStatus: "active",
      entitlementSnapshot: null,
    } as any;
    const mem = { role: "tech", moduleRole: "module_user", enabled: true, userEntitlementSnapshot: null } as any;
    const a = resolveAccess(org, mem);
    expect(a.allowed).toBe(true);
  });

  it("local 'owner' role is preserved; OperatorOS never demotes owners", () => {
    const org = { plan: "free", operatorosTenantId: "tnt_5", operatorosPlanSlug: "starter", operatorosSubscriptionStatus: "active", entitlementSnapshot: null } as any;
    const mem = { role: "owner", moduleRole: "viewer", enabled: true, userEntitlementSnapshot: null } as any;
    const a = resolveAccess(org, mem);
    expect(a.effectiveRole).toBe("owner");
  });
});

describe("feature gates — linked + non-linked paths", () => {
  const adminMem = {
    role: "owner",
    moduleRole: "module_admin",
    enabled: true,
    userEntitlementSnapshot: null,
  } as any;

  function legacyOrg(plan: string) {
    return { plan, operatorosTenantId: null, operatorosOrganizationId: null } as any;
  }

  function linkedOrg(planSlug: string | null, features?: Partial<Record<FeatureKey, boolean>>) {
    return {
      plan: "free",
      operatorosTenantId: "tnt_x",
      operatorosPlanSlug: planSlug,
      operatorosSubscriptionStatus: "active",
      operatorosAccessLevel: null,
      entitlementSnapshot: features
        ? {
            schemaVersion: 1,
            tenantId: "tnt_x",
            planSlug,
            subscriptionStatus: "active",
            accessLevel: null,
            features,
            limits: {},
          }
        : null,
    } as any;
  }

  const gates: Array<{
    feature: FeatureKey;
    legacyAllow: string;
    legacyDeny: string;
    linkedAllow: string;
    linkedDeny: string;
  }> = [
    { feature: "recurring_invoices", legacyAllow: "small_business", legacyDeny: "individual", linkedAllow: "pro", linkedDeny: "starter" },
    { feature: "accounting_export", legacyAllow: "small_business", legacyDeny: "individual", linkedAllow: "pro", linkedDeny: "starter" },
    { feature: "audit_log", legacyAllow: "enterprise", legacyDeny: "small_business", linkedAllow: "elite", linkedDeny: "pro" },
    { feature: "review_requests", legacyAllow: "individual", legacyDeny: "free", linkedAllow: "starter", linkedDeny: "free" },
    { feature: "customer_portal", legacyAllow: "individual", legacyDeny: "free", linkedAllow: "starter", linkedDeny: "free" },
    { feature: "stripe_connect", legacyAllow: "individual", legacyDeny: "free", linkedAllow: "starter", linkedDeny: "free" },
    { feature: "lead_conversion_center", legacyAllow: "small_business", legacyDeny: "individual", linkedAllow: "pro", linkedDeny: "starter" },
  ];

  for (const g of gates) {
    it(`${g.feature}: legacy ${g.legacyAllow} grants, ${g.legacyDeny} denies`, () => {
      const allow = resolveAccess(legacyOrg(g.legacyAllow), adminMem);
      const deny = resolveAccess(legacyOrg(g.legacyDeny), adminMem);
      expect(hasFeature(allow, g.feature)).toBe(true);
      expect(hasFeature(deny, g.feature)).toBe(false);
    });

    it(`${g.feature}: linked ${g.linkedAllow} grants, ${g.linkedDeny} denies (snapshot-driven)`, () => {
      const allowOrg = linkedOrg(g.linkedAllow, deriveDefaultsFromPlanSlug(g.linkedAllow).features);
      const denyOrg = linkedOrg(g.linkedDeny, deriveDefaultsFromPlanSlug(g.linkedDeny).features);
      expect(hasFeature(resolveAccess(allowOrg, adminMem), g.feature)).toBe(true);
      expect(hasFeature(resolveAccess(denyOrg, adminMem), g.feature)).toBe(false);
    });

    it(`${g.feature}: linked org without snapshot falls back to plan-slug defaults`, () => {
      const allowOrg = linkedOrg(g.linkedAllow);
      const denyOrg = linkedOrg(g.linkedDeny);
      expect(hasFeature(resolveAccess(allowOrg, adminMem), g.feature)).toBe(
        deriveDefaultsFromPlanSlug(g.linkedAllow).features[g.feature] === true,
      );
      expect(hasFeature(resolveAccess(denyOrg, adminMem), g.feature)).toBe(
        deriveDefaultsFromPlanSlug(g.linkedDeny).features[g.feature] === true,
      );
    });
  }

  it("tenantHasFeature: legacy non-linked org reads from legacyFeaturesFor", () => {
    expect(tenantHasFeature(legacyOrg("individual"), "customer_portal")).toBe(true);
    expect(tenantHasFeature(legacyOrg("free"), "customer_portal")).toBe(false);
  });

  it("tenantHasFeature: linked org reads from snapshot then plan-slug defaults", () => {
    const snapOrg = linkedOrg("pro", { customer_portal: true });
    expect(tenantHasFeature(snapOrg, "customer_portal")).toBe(true);

    const snapOff = linkedOrg("pro", { customer_portal: false });
    expect(tenantHasFeature(snapOff, "customer_portal")).toBe(false);

    // No snapshot → falls back to plan-slug defaults
    expect(tenantHasFeature(linkedOrg("starter"), "customer_portal")).toBe(true);
    expect(tenantHasFeature(linkedOrg(null), "customer_portal")).toBe(false);
  });

  it("tenantHasFeature: hub-revoked accessLevel denies even if feature bit is set", () => {
    const revoked = {
      ...linkedOrg("elite", deriveDefaultsFromPlanSlug("elite").features),
      operatorosAccessLevel: "revoked",
    } as any;
    expect(tenantHasFeature(revoked, "customer_portal")).toBe(false);
  });

  it("hasFeature is false when access.allowed is false even if the bit is set", () => {
    const org = linkedOrg("elite", deriveDefaultsFromPlanSlug("elite").features);
    // tenant_inactive — disabled membership
    const disabledMem = { role: "tech", moduleRole: "module_user", enabled: false, userEntitlementSnapshot: null } as any;
    const access = resolveAccess(org, disabledMem);
    expect(access.allowed).toBe(false);
    expect(hasFeature(access, "stripe_connect")).toBe(false);
  });
});

describe("deriveDefaultsFromPlanSlug", () => {
  it("elite → all features + unlimited", () => {
    const d = deriveDefaultsFromPlanSlug("elite");
    expect(d.features.automations).toBe(true);
    expect(d.features.call_recovery).toBe(true);
    expect(d.limits.teamMembers).toBe(-1);
  });
  it("pro → no call_recovery, capped seats", () => {
    const d = deriveDefaultsFromPlanSlug("pro");
    expect(d.features.automations).toBe(true);
    expect(d.features.call_recovery).toBe(false);
    expect(d.features.lead_conversion_center).toBe(true);
    expect(d.limits.teamMembers).toBe(25);
  });
  it("starter → analytics only", () => {
    const d = deriveDefaultsFromPlanSlug("starter");
    expect(d.features.automations).toBe(false);
    expect(d.features.analytics).toBe(true);
  });
  it("unknown/null → free defaults", () => {
    const d = deriveDefaultsFromPlanSlug(null);
    expect(d.features.automations).toBe(false);
    expect(d.limits.customers).toBe(5);
  });
});

describe("mapModuleRoleToMembershipRole", () => {
  it("module_admin → admin", () => {
    expect(mapModuleRoleToMembershipRole("module_admin")).toBe("admin");
  });
  it("viewer → viewer", () => {
    expect(mapModuleRoleToMembershipRole("viewer")).toBe("viewer");
  });
  it("module_user → tech", () => {
    expect(mapModuleRoleToMembershipRole("module_user")).toBe("tech");
  });
  it("unknown → tech (safe default)", () => {
    expect(mapModuleRoleToMembershipRole("zoozle")).toBe("tech");
  });
});

describe("POST /api/operatoros/entitlements/sync", () => {
  let app: express.Express;

  beforeAll(async () => {
    process.env.OPERATOROS_SERVICE_TOKEN = "test-token-secret";
    // Re-import so env zod re-parses
    vi.resetModules();
    const entRouter = (await import("../server/routes/entitlements")).default;
    app = express();
    app.use(express.json());
    app.use(entRouter);
  });

  afterAll(async () => {
    await cleanupAll();
    delete process.env.OPERATOROS_SERVICE_TOKEN;
    await pool.end();
  });

  it("503 when token not configured", async () => {
    delete process.env.OPERATOROS_SERVICE_TOKEN;
    vi.resetModules();
    const router2 = (await import("../server/routes/entitlements")).default;
    const a2 = express();
    a2.use(express.json());
    a2.use(router2);
    const res = await request(a2).post("/api/operatoros/entitlements/sync").send({ tenantId: "x" });
    expect(res.status).toBe(503);
    process.env.OPERATOROS_SERVICE_TOKEN = "test-token-secret";
  });

  it("401 on bad token", async () => {
    const res = await request(app)
      .post("/api/operatoros/entitlements/sync")
      .set("Authorization", "Bearer wrong")
      .send({ tenantId: "x" });
    expect(res.status).toBe(401);
  });

  it("404 when tenant is not linked", async () => {
    const res = await request(app)
      .post("/api/operatoros/entitlements/sync")
      .set("Authorization", "Bearer test-token-secret")
      .send({ tenantId: "no-such-tenant" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("tenant_not_linked");
  });

  it("per-feature override GRANTS a feature the plan-slug default denies", async () => {
    const { org, user } = await setupOrg("free");
    trackOrg(org.id);
    trackUser(user.id);
    const tenantId = "tnt_ovgrant_" + org.id.slice(0, 6);
    await storage.updateOrg(org.id, { operatorosTenantId: tenantId } as any);

    // `pro` plan default DENIES call_recovery — verify that baseline first.
    expect(deriveDefaultsFromPlanSlug("pro").features.call_recovery).toBe(false);

    // Push a sync that flips only call_recovery to true, leaving everything
    // else to plan defaults.
    const res = await request(app)
      .post("/api/operatoros/entitlements/sync")
      .set("Authorization", "Bearer test-token-secret")
      .send({
        tenantId,
        planSlug: "pro",
        subscriptionStatus: "active",
        features: { call_recovery: true },
      });
    expect(res.status).toBe(200);
    expect(res.body.snapshot.features.call_recovery).toBe(true);

    const fresh = await storage.getOrg(org.id);
    expect(tenantHasFeature(fresh as any, "call_recovery")).toBe(true);
    // Other plan-default features still resolve correctly through the merge.
    expect(tenantHasFeature(fresh as any, "automations")).toBe(true);
    expect(tenantHasFeature(fresh as any, "audit_log")).toBe(false);

    // Same answer through the membership-aware chokepoint.
    const mem = await storage.getMembership(org.id, user.id);
    const access = resolveAccess(fresh as any, {
      ...(mem as any),
      moduleRole: "module_admin",
      enabled: true,
      userEntitlementSnapshot: null,
    });
    expect(hasFeature(access, "call_recovery")).toBe(true);
  });

  it("per-feature override REVOKES a feature the plan-slug default grants", async () => {
    const { org, user } = await setupOrg("free");
    trackOrg(org.id);
    trackUser(user.id);
    const tenantId = "tnt_ovdeny_" + org.id.slice(0, 6);
    await storage.updateOrg(org.id, { operatorosTenantId: tenantId } as any);

    // `elite` plan default GRANTS accounting_export — verify baseline.
    expect(deriveDefaultsFromPlanSlug("elite").features.accounting_export).toBe(true);

    const res = await request(app)
      .post("/api/operatoros/entitlements/sync")
      .set("Authorization", "Bearer test-token-secret")
      .send({
        tenantId,
        planSlug: "elite",
        subscriptionStatus: "active",
        features: { accounting_export: false },
      });
    expect(res.status).toBe(200);
    expect(res.body.snapshot.features.accounting_export).toBe(false);
    // Sibling elite-default bits remain intact (revoke did NOT clobber them).
    expect(res.body.snapshot.features.call_recovery).toBe(true);

    const fresh = await storage.getOrg(org.id);
    expect(tenantHasFeature(fresh as any, "accounting_export")).toBe(false);
    expect(tenantHasFeature(fresh as any, "call_recovery")).toBe(true);
  });

  it("partial sync preserves a prior override across a tenant-fields-only call that omits features", async () => {
    const { org, user } = await setupOrg("free");
    trackOrg(org.id);
    trackUser(user.id);
    const tenantId = "tnt_ovkeep_" + org.id.slice(0, 6);
    await storage.updateOrg(org.id, { operatorosTenantId: tenantId } as any);

    // 1) Push an override that flips call_recovery on for a pro tenant.
    await request(app)
      .post("/api/operatoros/entitlements/sync")
      .set("Authorization", "Bearer test-token-secret")
      .send({
        tenantId,
        planSlug: "pro",
        subscriptionStatus: "active",
        features: { call_recovery: true },
      })
      .expect(200);

    // 2) Now push a follow-up that updates only subscriptionStatus.
    const res2 = await request(app)
      .post("/api/operatoros/entitlements/sync")
      .set("Authorization", "Bearer test-token-secret")
      .send({ tenantId, subscriptionStatus: "trialing" });
    expect(res2.status).toBe(200);
    expect(res2.body.snapshot.subscriptionStatus).toBe("trialing");
    // Override survives the partial update.
    expect(res2.body.snapshot.features.call_recovery).toBe(true);

    const fresh = await storage.getOrg(org.id);
    expect(tenantHasFeature(fresh as any, "call_recovery")).toBe(true);
  });

  it("syncs tenant features + limits and writes snapshot", async () => {
    const { org, user } = await setupOrg("free");
    trackOrg(org.id);
    trackUser(user.id);
    const tenantId = "tnt_test_" + org.id.slice(0, 6);
    await storage.updateOrg(org.id, { operatorosTenantId: tenantId } as any);

    const res = await request(app)
      .post("/api/operatoros/entitlements/sync")
      .set("Authorization", "Bearer test-token-secret")
      .send({
        tenantId,
        planSlug: "pro",
        subscriptionStatus: "active",
        features: { automations: true, recurring_jobs: true, analytics: true, team_invites: true, unlimited_entities: true, call_recovery: false },
      });
    expect(res.status).toBe(200);
    expect(res.body.snapshot.planSlug).toBe("pro");

    const fresh = await storage.getOrg(org.id);
    expect((fresh as any).operatorosPlanSlug).toBe("pro");
    expect((fresh as any).entitlementSnapshot.features.automations).toBe(true);
  });
});
