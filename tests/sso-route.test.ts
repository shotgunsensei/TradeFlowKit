import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  process.env.MODULE_SSO_SECRET = "test-route-secret";
  process.env.OPERATOROS_BASE_URL = "https://operatoros.test";
  process.env.APP_ENV = process.env.NODE_ENV || "development";
  process.env.MODULE_SLUG = "tradeflowkit";
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

const validClaims = () => ({
  iss: "https://operatoros.test",
  aud: "tradeflowkit",
  module_slug: "tradeflowkit",
  env: process.env.APP_ENV || "development",
  jti: `jti-${crypto.randomBytes(8).toString("hex")}`,
  email: `sso-${crypto.randomBytes(4).toString("hex")}@example.com`,
  exp: Math.floor(Date.now() / 1000) + 60,
  iat: Math.floor(Date.now() / 1000),
});

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

  it("returns 400 SSO-001 when token is missing", async () => {
    const res = await request(app).get("/sso");
    expect(res.status).toBe(400);
    expect(res.text).toContain("SSO-001");
    expect(consumeSsoToken).not.toHaveBeenCalled();
  });

  it("returns 401 SSO-004 when signature is wrong, never calls consume", async () => {
    const token = signToken(validClaims(), "wrong-secret");
    const res = await request(app).get(`/sso?token=${token}`);
    expect(res.status).toBe(401);
    expect(res.text).toContain("SSO-004");
    expect(consumeSsoToken).not.toHaveBeenCalled();
  });

  it("returns 409 SSO-012 on consume replay and creates no session/user", async () => {
    (consumeSsoToken as any).mockResolvedValue({ ok: false, reason: "replay" });
    const claims = validClaims();
    const token = signToken(claims);
    const sid = `sid-replay-${Date.now()}`;
    const res = await request(app).get(`/sso?token=${token}`).set("x-test-sid", sid);
    expect(res.status).toBe(409);
    expect(res.text).toContain("SSO-012");
    const sessions = (app as any).__sessions as Map<string, any>;
    expect(sessions.get(sid)?.userId).toBeUndefined();
    const lookedUp = await storage.getUserByEmail(claims.email);
    expect(lookedUp).toBeUndefined();
  });

  it("returns 503 SSO-016 on consume transient failure and creates no session/user", async () => {
    (consumeSsoToken as any).mockResolvedValue({ ok: false, reason: "transient" });
    const claims = validClaims();
    const token = signToken(claims);
    const sid = `sid-transient-${Date.now()}`;
    const res = await request(app).get(`/sso?token=${token}`).set("x-test-sid", sid);
    expect(res.status).toBe(503);
    expect(res.text).toContain("SSO-016");
    const sessions = (app as any).__sessions as Map<string, any>;
    expect(sessions.get(sid)?.userId).toBeUndefined();
    const lookedUp = await storage.getUserByEmail(claims.email);
    expect(lookedUp).toBeUndefined();
  });

  it("provisions a new user and starts a session on success (302 → /dashboard)", async () => {
    (consumeSsoToken as any).mockResolvedValue({ ok: true });
    const claims = { ...validClaims(), name: "Alice Example" };
    const token = signToken(claims);
    const sid = `sid-success-${Date.now()}`;
    const res = await request(app).get(`/sso?token=${token}`).set("x-test-sid", sid);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/dashboard");
    const provisioned = await storage.getUserByEmail(claims.email);
    expect(provisioned).toBeDefined();
    expect(provisioned?.email).toBe(claims.email.toLowerCase());
    expect((provisioned as any)?.isSsoProvisioned).toBe(true);
    expect(provisioned?.fullName).toBe("Alice Example");
    if (provisioned) trackUser(provisioned.id);
    const sessions = (app as any).__sessions as Map<string, any>;
    expect(sessions.get(sid)?.userId).toBe(provisioned!.id);
  });

  it("reuses an existing user (case-insensitive) and does not re-provision", async () => {
    (consumeSsoToken as any).mockResolvedValue({ ok: true });
    const baseEmail = `existing-${crypto.randomBytes(4).toString("hex")}@example.com`;
    const existing = await storage.createUser({
      username: `pre-${crypto.randomBytes(4).toString("hex")}`,
      password: "hash-x",
      fullName: "Pre Existing",
      phone: "",
      email: baseEmail,
    } as any);
    trackUser(existing.id);

    const claims = { ...validClaims(), email: baseEmail.toUpperCase() };
    const token = signToken(claims);
    const sid = `sid-reuse-${Date.now()}`;
    const res = await request(app).get(`/sso?token=${token}`).set("x-test-sid", sid);
    expect(res.status).toBe(302);
    const sessions = (app as any).__sessions as Map<string, any>;
    expect(sessions.get(sid)?.userId).toBe(existing.id);
  });
});
