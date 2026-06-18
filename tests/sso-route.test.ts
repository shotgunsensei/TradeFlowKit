import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  process.env.MODULE_SSO_SECRET = "test-route-secret";
  process.env.OPERATOROS_BASE_URL = "https://operatoros.test";
  process.env.OPERATOROS_API_URL = "https://operatoros.test/api";
  process.env.OPERATOROS_SSO_AUDIENCE = "tradeflowkit";
  process.env.OPERATOROS_SSO_ENV = "dev";
});

vi.mock("../server/sso/consume", () => ({
  consumeSsoToken: vi.fn(),
}));

import express from "express";
import request from "supertest";
import crypto from "crypto";
import ssoRouter from "../server/routes/sso";
import { consumeSsoToken } from "../server/sso/consume";
import { storage } from "../server/storage";
import { pool } from "../server/db";
import { trackUser, trackOrg, cleanupAll } from "./helpers";

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function signToken(payload: object, secret = "test-route-secret"): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest();
  return `${header}.${body}.${b64url(sig)}`;
}

function buildApp() {
  const app = express();
  const sessionStore = new Map<string, any>();
  let counter = 0;
  app.use((req: any, _res, next) => {
    const id = req.headers["x-test-sid"] || `sid-${++counter}`;
    if (!sessionStore.has(id as string)) sessionStore.set(id as string, {});
    req.session = sessionStore.get(id as string);
    req.session.save = (cb: (err?: any) => void) => cb();
    next();
  });
  app.use(ssoRouter);
  (app as any).__sessions = sessionStore;
  return app;
}

const validClaims = (overrides: Record<string, any> = {}) => {
  const now = Math.floor(Date.now() / 1000);
  const sub = overrides.sub ?? `00000000-0000-4000-8000-${crypto.randomBytes(6).toString("hex")}`;
  return {
    iss: "https://operatoros.test",
    aud: "tradeflowkit",
    module_slug: "tradeflowkit",
    env: "dev",
    jti: `jti-${crypto.randomBytes(8).toString("hex")}`,
    sub,
    iat: now,
    exp: now + 60,
    ...overrides,
  };
};

function consumeOk(overrides: Record<string, any> = {}) {
  return {
    ok: true as const,
    payload: {
      ok: true as const,
      user: {
        id: overrides.userId ?? `u-${crypto.randomBytes(6).toString("hex")}`,
        email: overrides.email ?? `sso-${crypto.randomBytes(4).toString("hex")}@example.com`,
        name: overrides.name ?? "SSO User",
        role: overrides.role ?? "user",
      },
      moduleSlug: "tradeflowkit",
      planSlug: overrides.planSlug ?? "starter",
      organizationId: overrides.organizationId ?? null,
      env: "dev" as const,
      jti: overrides.jti ?? `jti-${crypto.randomBytes(6).toString("hex")}`,
      issuer: "https://operatoros.test",
      accessSource: "plan" as const,
    },
  };
}

describe("/sso route — OperatorOS canonical contract", () => {
  let app: ReturnType<typeof buildApp>;

  beforeAll(() => {
    app = buildApp();
  });

  afterAll(async () => {
    await cleanupAll();
    await pool.end();
  });

  beforeEach(() => {
    (consumeSsoToken as any).mockReset();
  });

  it("redirects to hub with launchError=no_token when token is missing", async () => {
    const res = await request(app).get("/sso");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://operatoros.test/?launchError=no_token");
    expect(consumeSsoToken).not.toHaveBeenCalled();
  });

  it("redirects to hub with launchError=bad_signature on signature mismatch, never calls consume", async () => {
    const token = signToken(validClaims(), "wrong-secret");
    const res = await request(app).get(`/sso?token=${token}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://operatoros.test/?launchError=bad_signature");
    expect(consumeSsoToken).not.toHaveBeenCalled();
  });

  it("redirects to hub with launchError=bad_module_slug on aud mismatch", async () => {
    const token = signToken(validClaims({ aud: "techdeck", module_slug: "techdeck" }));
    const res = await request(app).get(`/sso?token=${token}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://operatoros.test/?launchError=bad_module_slug");
    expect(consumeSsoToken).not.toHaveBeenCalled();
  });

  it("redirects to hub with launchError=env_mismatch on env mismatch", async () => {
    const token = signToken(validClaims({ env: "prod" }));
    const res = await request(app).get(`/sso?token=${token}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://operatoros.test/?launchError=env_mismatch");
  });

  it("forwards consume apiCode verbatim as launchError (TOKEN_EXPIRED)", async () => {
    (consumeSsoToken as any).mockResolvedValue({
      ok: false,
      unavailable: false,
      apiCode: "TOKEN_EXPIRED",
      httpStatus: 410,
    });
    const claims = validClaims();
    const sid = `sid-expired-${Date.now()}`;
    const res = await request(app).get(`/sso?token=${signToken(claims)}`).set("x-test-sid", sid);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://operatoros.test/?launchError=TOKEN_EXPIRED");
    const sessions = (app as any).__sessions as Map<string, any>;
    expect(sessions.get(sid)?.userId).toBeUndefined();
  });

  it("redirects with launchError=consume_failed when consume 4xx has no code", async () => {
    (consumeSsoToken as any).mockResolvedValue({
      ok: false,
      unavailable: false,
      apiCode: undefined,
      httpStatus: 400,
    });
    const res = await request(app).get(`/sso?token=${signToken(validClaims())}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://operatoros.test/?launchError=consume_failed");
  });

  it("returns 502 sso_consume_unavailable on consume 5xx and creates no session", async () => {
    (consumeSsoToken as any).mockResolvedValue({ ok: false, unavailable: true, httpStatus: 503 });
    const sid = `sid-unavail-${Date.now()}`;
    const res = await request(app).get(`/sso?token=${signToken(validClaims())}`).set("x-test-sid", sid);
    expect(res.status).toBe(502);
    expect(res.text).toBe("sso_consume_unavailable");
    const sessions = (app as any).__sessions as Map<string, any>;
    expect(sessions.get(sid)?.userId).toBeUndefined();
  });

  it("provisions a new user keyed on EMAIL and starts a session (302 → /dashboard)", async () => {
    const email = `new-${crypto.randomBytes(4).toString("hex")}@example.com`;
    const userId = `op-${crypto.randomBytes(6).toString("hex")}`;
    (consumeSsoToken as any).mockResolvedValue(consumeOk({ email, userId, name: "Alice Example" }));
    const sid = `sid-success-${Date.now()}`;
    const res = await request(app).get(`/sso?token=${signToken(validClaims())}`).set("x-test-sid", sid);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/dashboard");
    const provisioned = await storage.getUserByEmail(email);
    expect(provisioned).toBeDefined();
    expect(provisioned?.email).toBe(email);
    expect(provisioned?.isSsoProvisioned).toBe(true);
    expect(provisioned?.operatorosUserId).toBe(userId);
    expect(provisioned?.operatorosRole).toBe("user");
    expect(provisioned?.operatorosPlanSlug).toBe("starter");
    expect(provisioned?.fullName).toBe("Alice Example");
    if (provisioned) trackUser(provisioned.id);
    const sessions = (app as any).__sessions as Map<string, any>;
    expect(sessions.get(sid)?.userId).toBe(provisioned!.id);
  });

  it("reuses the same user (by email) on a second launch", async () => {
    const email = `reuse-${crypto.randomBytes(4).toString("hex")}@example.com`;
    const userId = `op-${crypto.randomBytes(6).toString("hex")}`;
    (consumeSsoToken as any).mockResolvedValue(consumeOk({ email, userId }));
    const first = await request(app).get(`/sso?token=${signToken(validClaims())}`).set("x-test-sid", "sid-first");
    expect(first.status).toBe(302);
    const second = await request(app).get(`/sso?token=${signToken(validClaims())}`).set("x-test-sid", "sid-second");
    expect(second.status).toBe(302);
    const user = await storage.getUserByEmail(email);
    expect(user).toBeDefined();
    if (user) trackUser(user.id);
    const sessions = (app as any).__sessions as Map<string, any>;
    expect(sessions.get("sid-first")?.userId).toBe(user!.id);
    expect(sessions.get("sid-second")?.userId).toBe(user!.id);
  });

  it("attaches operatorosUserId to a legacy user found by email", async () => {
    const email = `legacy-${crypto.randomBytes(4).toString("hex")}@example.com`;
    const existing = await storage.createUser({
      username: `legacy-${crypto.randomBytes(4).toString("hex")}`,
      password: "hash-x",
      fullName: "Legacy User",
      phone: "",
      email,
    } as any);
    trackUser(existing.id);
    expect(existing.operatorosUserId).toBeNull();

    const userId = `op-${crypto.randomBytes(6).toString("hex")}`;
    (consumeSsoToken as any).mockResolvedValue(consumeOk({ email, userId }));
    const sid = `sid-backfill-${Date.now()}`;
    const res = await request(app).get(`/sso?token=${signToken(validClaims())}`).set("x-test-sid", sid);
    expect(res.status).toBe(302);
    const updated = await storage.getUser(existing.id);
    expect(updated?.operatorosUserId).toBe(userId);
    const sessions = (app as any).__sessions as Map<string, any>;
    expect(sessions.get(sid)?.userId).toBe(existing.id);
  });

  it("promotes a provisioned user to isSuperAdmin when role=super_admin", async () => {
    const email = `super-${crypto.randomBytes(4).toString("hex")}@example.com`;
    (consumeSsoToken as any).mockResolvedValue(consumeOk({ email, role: "super_admin" }));
    const res = await request(app).get(`/sso?token=${signToken(validClaims())}`).set("x-test-sid", `sid-promote-${Date.now()}`);
    expect(res.status).toBe(302);
    const user = await storage.getUserByEmail(email);
    expect(user).toBeDefined();
    expect(user?.isSuperAdmin).toBe(true);
    expect(user?.operatorosRole).toBe("super_admin");
    if (user) trackUser(user.id);
  });

  it("revokes isSuperAdmin on the next launch when OperatorOS role drops to user", async () => {
    const email = `demote-${crypto.randomBytes(4).toString("hex")}@example.com`;
    (consumeSsoToken as any).mockResolvedValue(consumeOk({ email, role: "super_admin" }));
    const first = await request(app).get(`/sso?token=${signToken(validClaims())}`).set("x-test-sid", "sid-demote-1");
    expect(first.status).toBe(302);
    const promoted = await storage.getUserByEmail(email);
    expect(promoted?.isSuperAdmin).toBe(true);
    if (promoted) trackUser(promoted.id);

    (consumeSsoToken as any).mockResolvedValue(consumeOk({ email, role: "user" }));
    const second = await request(app).get(`/sso?token=${signToken(validClaims())}`).set("x-test-sid", "sid-demote-2");
    expect(second.status).toBe(302);
    const after = await storage.getUserByEmail(email);
    expect(after?.isSuperAdmin).toBe(false);
    expect(after?.operatorosRole).toBe("user");
  });

  it("auto-joins user to an existing linked org when consume payload carries an organizationId", async () => {
    const operatorosOrgId = `00000000-0000-4000-8000-${crypto.randomBytes(6).toString("hex")}`;
    const org = await storage.createOrg({
      name: `Linked Org ${crypto.randomBytes(3).toString("hex")}`,
      slug: `linked-${crypto.randomBytes(4).toString("hex")}`,
      operatorosOrganizationId: operatorosOrgId,
    } as any);
    trackOrg(org.id);

    const email = `autojoin-${crypto.randomBytes(4).toString("hex")}@example.com`;
    (consumeSsoToken as any).mockResolvedValue(
      consumeOk({ email, organizationId: operatorosOrgId, role: "admin" })
    );
    const sid = `sid-autojoin-${Date.now()}`;
    const res = await request(app).get(`/sso?token=${signToken(validClaims())}`).set("x-test-sid", sid);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/dashboard?sso=joined");

    const user = await storage.getUserByEmail(email);
    expect(user).toBeDefined();
    if (user) trackUser(user.id);

    const membership = await storage.getMembership(org.id, user!.id);
    expect(membership?.role).toBe("admin");

    const sessions = (app as any).__sessions as Map<string, any>;
    expect(sessions.get(sid)?.orgId).toBe(org.id);
  });

  it("auto-provisions a new TradeFlowKit org for a brand-new OperatorOS tenant", async () => {
    const operatorosOrgId = `00000000-0000-4000-8000-${crypto.randomBytes(6).toString("hex")}`;
    const email = `autoprov-${crypto.randomBytes(4).toString("hex")}@example.com`;
    (consumeSsoToken as any).mockResolvedValue(
      consumeOk({ email, organizationId: operatorosOrgId, name: "Pat Provisioner" })
    );
    const sid = `sid-autoprov-${Date.now()}`;
    const res = await request(app).get(`/sso?token=${signToken(validClaims())}`).set("x-test-sid", sid);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/dashboard?sso=provisioned");

    const user = await storage.getUserByEmail(email);
    expect(user).toBeDefined();
    if (user) trackUser(user.id);

    const linked = await storage.getOrgByOperatorosOrganizationId(operatorosOrgId);
    expect(linked).toBeDefined();
    if (linked) trackOrg(linked.id);

    const membership = await storage.getMembership(linked!.id, user!.id);
    expect(membership?.role).toBe("owner");
  });

  it("does NOT leave a session userId when an auto-join storage call throws", async () => {
    const operatorosOrgId = `00000000-0000-4000-8000-${crypto.randomBytes(6).toString("hex")}`;
    const org = await storage.createOrg({
      name: `Throw Linked ${crypto.randomBytes(3).toString("hex")}`,
      slug: `throw-${crypto.randomBytes(4).toString("hex")}`,
      operatorosOrganizationId: operatorosOrgId,
    } as any);
    trackOrg(org.id);

    const email = `throwfail-${crypto.randomBytes(4).toString("hex")}@example.com`;
    (consumeSsoToken as any).mockResolvedValue(
      consumeOk({ email, organizationId: operatorosOrgId })
    );

    const auditSpy = vi
      .spyOn(storage, "recordAudit")
      .mockRejectedValueOnce(new Error("simulated db failure"));

    const sid = `sid-fail-${Date.now()}`;
    const res = await request(app).get(`/sso?token=${signToken(validClaims())}`).set("x-test-sid", sid);
    expect(res.status).toBe(500);

    const sessions = (app as any).__sessions as Map<string, any>;
    expect(sessions.get(sid)?.userId).toBeUndefined();
    expect(sessions.get(sid)?.orgId).toBeUndefined();

    const user = await storage.getUserByEmail(email);
    if (user) trackUser(user.id);

    auditSpy.mockRestore();
  });

  it("SECURITY: SSO tenant snapshot bootstrap only writes the launch org, never sibling linked orgs", async () => {
    // User belongs to TWO linked orgs. They launch from orgA (with planSlug=pro).
    // orgB (an unrelated linked tenant) must NOT receive a bootstrapped snapshot.
    const opOrgAId = `00000000-0000-4000-8000-${crypto.randomBytes(6).toString("hex")}`;
    const opOrgBId = `00000000-0000-4000-8000-${crypto.randomBytes(6).toString("hex")}`;
    const orgA = await storage.createOrg({
      name: `Launch Org ${crypto.randomBytes(3).toString("hex")}`,
      slug: `launch-${crypto.randomBytes(4).toString("hex")}`,
      operatorosOrganizationId: opOrgAId,
    } as any);
    const orgB = await storage.createOrg({
      name: `Sibling Org ${crypto.randomBytes(3).toString("hex")}`,
      slug: `sibling-${crypto.randomBytes(4).toString("hex")}`,
      operatorosOrganizationId: opOrgBId,
    } as any);
    trackOrg(orgA.id);
    trackOrg(orgB.id);

    const email = `multiorg-${crypto.randomBytes(4).toString("hex")}@example.com`;
    // First launch creates user + auto-joins orgA.
    (consumeSsoToken as any).mockResolvedValue(
      consumeOk({ email, organizationId: opOrgAId, role: "admin", planSlug: "starter" })
    );
    await request(app).get(`/sso?token=${signToken(validClaims())}`).set("x-test-sid", `sid-mo-1-${Date.now()}`);
    const user = await storage.getUserByEmail(email);
    if (user) trackUser(user.id);
    // Manually add user to orgB so they're a member of both linked orgs.
    await storage.createMembership(orgB.id, user!.id, "admin");

    // Now launch from orgA with a richer plan; orgB must remain untouched.
    (consumeSsoToken as any).mockResolvedValue(
      consumeOk({ email, organizationId: opOrgAId, role: "admin", planSlug: "pro" })
    );
    const res = await request(app)
      .get(`/sso?token=${signToken(validClaims())}`)
      .set("x-test-sid", `sid-mo-2-${Date.now()}`);
    expect(res.status).toBe(302);

    const orgAAfter = await storage.getOrg(orgA.id);
    const orgBAfter = await storage.getOrg(orgB.id);
    // orgA may now carry a bootstrap snapshot keyed to pro.
    expect((orgAAfter as any)?.entitlementSnapshot).toBeTruthy();
    // orgB must NOT have been touched by the launch context of orgA.
    expect((orgBAfter as any)?.entitlementSnapshot ?? null).toBeNull();
    expect((orgBAfter as any)?.operatorosPlanSlug ?? null).toBeNull();
  });

  it("SECURITY: SSO membership bootstrap does NOT seed moduleRole/enabled for sibling linked orgs", async () => {
    // User belongs to two linked orgs. Launching from orgA must NOT write
    // any moduleRole/enabled to the membership in orgB.
    const opOrgAId = `00000000-0000-4000-8000-${crypto.randomBytes(6).toString("hex")}`;
    const opOrgBId = `00000000-0000-4000-8000-${crypto.randomBytes(6).toString("hex")}`;
    const orgA = await storage.createOrg({
      name: `Mem Launch ${crypto.randomBytes(3).toString("hex")}`,
      slug: `memlaunch-${crypto.randomBytes(4).toString("hex")}`,
      operatorosOrganizationId: opOrgAId,
    } as any);
    const orgB = await storage.createOrg({
      name: `Mem Sibling ${crypto.randomBytes(3).toString("hex")}`,
      slug: `memsibling-${crypto.randomBytes(4).toString("hex")}`,
      operatorosOrganizationId: opOrgBId,
    } as any);
    trackOrg(orgA.id);
    trackOrg(orgB.id);

    const email = `memiso-${crypto.randomBytes(4).toString("hex")}@example.com`;
    // First launch into orgA — auto-joins and bootstraps orgA membership.
    (consumeSsoToken as any).mockResolvedValue(
      consumeOk({ email, organizationId: opOrgAId, role: "admin" })
    );
    await request(app).get(`/sso?token=${signToken(validClaims())}`).set("x-test-sid", `sid-memiso-1-${Date.now()}`);
    const user = await storage.getUserByEmail(email);
    if (user) trackUser(user.id);

    // Manually add user to orgB as viewer with no snapshot, no moduleRole.
    await storage.createMembership(orgB.id, user!.id, "viewer");

    // Launch again from orgA with role=admin.
    (consumeSsoToken as any).mockResolvedValue(
      consumeOk({ email, organizationId: opOrgAId, role: "admin" })
    );
    await request(app).get(`/sso?token=${signToken(validClaims())}`).set("x-test-sid", `sid-memiso-2-${Date.now()}`);

    const memA = await storage.getMembership(orgA.id, user!.id);
    const memB = await storage.getMembership(orgB.id, user!.id);
    // orgA membership was the launch context — moduleRole MUST be set.
    expect(memA?.moduleRole).toBeTruthy();
    // orgB membership is a sibling — moduleRole/enabled MUST NOT be set
    // from orgA's launch payload. role stays "viewer", no snapshot.
    expect(memB?.role).toBe("viewer");
    expect(memB?.moduleRole ?? null).toBeNull();
    expect(memB?.userEntitlementSnapshot ?? null).toBeNull();
  });

  it("redirects to plain /dashboard when there is no organizationId on the consume payload", async () => {
    const email = `plain-${crypto.randomBytes(4).toString("hex")}@example.com`;
    (consumeSsoToken as any).mockResolvedValue(consumeOk({ email }));
    const res = await request(app)
      .get(`/sso?token=${signToken(validClaims())}`)
      .set("x-test-sid", `sid-plain-${Date.now()}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/dashboard");
    const user = await storage.getUserByEmail(email);
    if (user) trackUser(user.id);
  });
});
