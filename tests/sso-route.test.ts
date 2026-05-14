import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  process.env.MODULE_SSO_SECRET = "test-route-secret";
  process.env.OPERATOROS_BASE_URL = "https://operatoros.test";
  process.env.OPERATOROS_API_URL = "https://operatoros.test";
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
import { trackUser, cleanupAll } from "./helpers";

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
    user_id: sub,
    email: `sso-${crypto.randomBytes(4).toString("hex")}@example.com`,
    role: "user",
    plan_slug: "starter",
    organization_id: null,
    iat: now,
    exp: now + 60,
    ...overrides,
  };
};

describe("/sso route", () => {
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

  it("returns 400 missing_token (HTML) when token is missing", async () => {
    const res = await request(app).get("/sso");
    expect(res.status).toBe(400);
    expect(res.text).toContain("missing_token");
    expect(consumeSsoToken).not.toHaveBeenCalled();
  });

  it("returns JSON {code:missing_token} when Accept: application/json", async () => {
    const res = await request(app).get("/sso").set("accept", "application/json");
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual({ code: "missing_token" });
  });

  it("returns 401 signature_invalid when signature is wrong, never calls consume", async () => {
    const token = signToken(validClaims(), "wrong-secret");
    const res = await request(app).get(`/sso?token=${token}`);
    expect(res.status).toBe(401);
    expect(res.text).toContain("signature_invalid");
    expect(consumeSsoToken).not.toHaveBeenCalled();
  });

  it("returns 401 expired (HTML) on consume TOKEN_EXPIRED and creates no session/user", async () => {
    (consumeSsoToken as any).mockResolvedValue({ ok: false, reason: "expired", apiCode: "TOKEN_EXPIRED" });
    const claims = validClaims();
    const token = signToken(claims);
    const sid = `sid-expired-${Date.now()}`;
    const res = await request(app).get(`/sso?token=${token}`).set("x-test-sid", sid);
    expect(res.status).toBe(401);
    expect(res.text).toContain("expired");
    const sessions = (app as any).__sessions as Map<string, any>;
    expect(sessions.get(sid)?.userId).toBeUndefined();
  });

  it("returns 401 audience_mismatch on consume AUDIENCE_MISMATCH (JSON path)", async () => {
    (consumeSsoToken as any).mockResolvedValue({ ok: false, reason: "audience_mismatch", apiCode: "AUDIENCE_MISMATCH" });
    const claims = validClaims();
    const token = signToken(claims);
    const res = await request(app).get(`/sso?token=${token}`).set("accept", "application/json");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: "audience_mismatch" });
  });

  it("returns 401 consume_failed on TOKEN_REPLAYED and creates no session/user", async () => {
    (consumeSsoToken as any).mockResolvedValue({ ok: false, reason: "consume_failed", apiCode: "TOKEN_REPLAYED" });
    const claims = validClaims();
    const token = signToken(claims);
    const sid = `sid-replay-${Date.now()}`;
    const res = await request(app).get(`/sso?token=${token}`).set("x-test-sid", sid);
    expect(res.status).toBe(401);
    expect(res.text).toContain("consume_failed");
    const sessions = (app as any).__sessions as Map<string, any>;
    expect(sessions.get(sid)?.userId).toBeUndefined();
  });

  it("returns 502 sso_consume_unavailable on consume 5xx and creates no session/user", async () => {
    (consumeSsoToken as any).mockResolvedValue({ ok: false, reason: "sso_consume_unavailable", httpStatus: 502 });
    const claims = validClaims();
    const token = signToken(claims);
    const sid = `sid-unavail-${Date.now()}`;
    const res = await request(app).get(`/sso?token=${token}`).set("x-test-sid", sid);
    expect(res.status).toBe(502);
    expect(res.text).toContain("sso_consume_unavailable");
    const sessions = (app as any).__sessions as Map<string, any>;
    expect(sessions.get(sid)?.userId).toBeUndefined();
  });

  it("provisions a new user keyed on sub and starts a session on success (302 → /dashboard)", async () => {
    (consumeSsoToken as any).mockResolvedValue({ ok: true });
    const claims = validClaims({ name: "Alice Example" });
    const token = signToken(claims);
    const sid = `sid-success-${Date.now()}`;
    const res = await request(app).get(`/sso?token=${token}`).set("x-test-sid", sid);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/dashboard");
    const provisioned = await storage.getUserByOperatorosUserId(claims.sub);
    expect(provisioned).toBeDefined();
    expect(provisioned?.email).toBe(claims.email.toLowerCase());
    expect(provisioned?.isSsoProvisioned).toBe(true);
    expect(provisioned?.operatorosUserId).toBe(claims.sub);
    expect(provisioned?.operatorosRole).toBe("user");
    expect(provisioned?.operatorosPlanSlug).toBe("starter");
    expect(provisioned?.fullName).toBe("Alice Example");
    if (provisioned) trackUser(provisioned.id);
    const sessions = (app as any).__sessions as Map<string, any>;
    expect(sessions.get(sid)?.userId).toBe(provisioned!.id);
  });

  it("reuses the same user on a second sub-keyed launch (no duplicate)", async () => {
    (consumeSsoToken as any).mockResolvedValue({ ok: true });
    const sub = `00000000-0000-4000-8000-${crypto.randomBytes(6).toString("hex")}`;
    const email = `sub-reuse-${crypto.randomBytes(4).toString("hex")}@example.com`;
    const first = await request(app).get(`/sso?token=${signToken(validClaims({ sub, user_id: sub, email }))}`).set("x-test-sid", "sid-first");
    expect(first.status).toBe(302);
    const second = await request(app).get(`/sso?token=${signToken(validClaims({ sub, user_id: sub, email }))}`).set("x-test-sid", "sid-second");
    expect(second.status).toBe(302);
    const user = await storage.getUserByOperatorosUserId(sub);
    expect(user).toBeDefined();
    if (user) trackUser(user.id);
    const sessions = (app as any).__sessions as Map<string, any>;
    expect(sessions.get("sid-first")?.userId).toBe(user!.id);
    expect(sessions.get("sid-second")?.userId).toBe(user!.id);
  });

  it("refuses to rebind when an existing user with the same email is already bound to a different sub", async () => {
    (consumeSsoToken as any).mockResolvedValue({ ok: true });
    const baseEmail = `conflict-${crypto.randomBytes(4).toString("hex")}@example.com`;
    const originalSub = `00000000-0000-4000-8000-${crypto.randomBytes(6).toString("hex")}`;
    const existing = await storage.createUser({
      username: `pre-conflict-${crypto.randomBytes(4).toString("hex")}`,
      password: "hash-x",
      fullName: "Already Bound",
      phone: "",
      email: baseEmail,
      operatorosUserId: originalSub,
    });
    trackUser(existing.id);

    const attackerSub = `00000000-0000-4000-8000-${crypto.randomBytes(6).toString("hex")}`;
    const claims = validClaims({ sub: attackerSub, user_id: attackerSub, email: baseEmail });
    const sid = `sid-conflict-${Date.now()}`;
    const res = await request(app).get(`/sso?token=${signToken(claims)}`).set("x-test-sid", sid);
    expect(res.status).toBe(401);
    expect(res.text).toContain("consume_failed");
    const after = await storage.getUser(existing.id);
    expect(after?.operatorosUserId).toBe(originalSub);
    const sessions = (app as any).__sessions as Map<string, any>;
    expect(sessions.get(sid)?.userId).toBeUndefined();
  });

  it("allows email change for an existing user that's already bound to the same sub", async () => {
    (consumeSsoToken as any).mockResolvedValue({ ok: true });
    const sub = `00000000-0000-4000-8000-${crypto.randomBytes(6).toString("hex")}`;
    const oldEmail = `old-${crypto.randomBytes(4).toString("hex")}@example.com`;
    const newEmail = `new-${crypto.randomBytes(4).toString("hex")}@example.com`;
    const existing = await storage.createUser({
      username: `same-sub-${crypto.randomBytes(4).toString("hex")}`,
      password: "hash-x",
      fullName: "Same Sub",
      phone: "",
      email: oldEmail,
      operatorosUserId: sub,
    });
    trackUser(existing.id);

    const claims = validClaims({ sub, user_id: sub, email: newEmail });
    const sid = `sid-emailchange-${Date.now()}`;
    const res = await request(app).get(`/sso?token=${signToken(claims)}`).set("x-test-sid", sid);
    expect(res.status).toBe(302);
    const after = await storage.getUser(existing.id);
    expect(after?.email).toBe(newEmail.toLowerCase());
    expect(after?.operatorosUserId).toBe(sub);
    const sessions = (app as any).__sessions as Map<string, any>;
    expect(sessions.get(sid)?.userId).toBe(existing.id);
  });

  it("respects q-value ordering in Accept (application/json;q=1, text/html;q=0.8 -> JSON)", async () => {
    const res = await request(app)
      .get("/sso")
      .set("accept", "application/json;q=1, text/html;q=0.8");
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual({ code: "missing_token" });
  });

  it("returns HTML for the default browser Accept header (text/html;q=0.9 outranks */*)", async () => {
    const res = await request(app)
      .get("/sso")
      .set(
        "accept",
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
      );
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain("missing_token");
  });

  it("backfills sub onto an existing email-keyed user from the previous implementation", async () => {
    (consumeSsoToken as any).mockResolvedValue({ ok: true });
    const baseEmail = `legacy-${crypto.randomBytes(4).toString("hex")}@example.com`;
    const existing = await storage.createUser({
      username: `pre-${crypto.randomBytes(4).toString("hex")}`,
      password: "hash-x",
      fullName: "Legacy User",
      phone: "",
      email: baseEmail,
    } as any);
    trackUser(existing.id);
    expect(existing.operatorosUserId).toBeNull();

    const sub = `00000000-0000-4000-8000-${crypto.randomBytes(6).toString("hex")}`;
    const claims = validClaims({ sub, user_id: sub, email: baseEmail.toUpperCase() });
    const res = await request(app).get(`/sso?token=${signToken(claims)}`).set("x-test-sid", "sid-backfill");
    expect(res.status).toBe(302);
    const updated = await storage.getUser(existing.id);
    expect(updated?.operatorosUserId).toBe(sub);
    const sessions = (app as any).__sessions as Map<string, any>;
    expect(sessions.get("sid-backfill")?.userId).toBe(existing.id);
  });
});
