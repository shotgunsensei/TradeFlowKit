import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://stub";
});

vi.mock("../server/storage", () => ({
  storage: {
    getUser: vi.fn(),
  },
}));

import express from "express";
import request from "supertest";
import operatorosRouter from "../server/routes/operatoros";

function buildApp(session: Record<string, any> = { userId: "u1", orgId: "o1" }) {
  const app = express();
  app.use((req: any, _res, next) => {
    req.session = session;
    next();
  });
  app.use(operatorosRouter);
  return app;
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(global, "fetch" as any);
});

/**
 * The canonical OperatorOS Child-App SSO contract does not include a
 * user-organizations endpoint on the hub. The local route is kept so the
 * settings picker can call it, but it always reports `unavailable` so the
 * UI falls back to manual-id entry.
 */
describe("GET /api/operatoros/organizations", () => {
  it("always returns { available:false, reason:'unavailable' } for authenticated callers", async () => {
    const res = await request(buildApp()).get("/api/operatoros/organizations");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false, reason: "unavailable" });
  });

  it("never makes an outbound fetch to the hub", async () => {
    await request(buildApp()).get("/api/operatoros/organizations");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 401 when no session userId is present", async () => {
    const res = await request(buildApp({})).get("/api/operatoros/organizations");
    expect(res.status).toBe(401);
  });

  it("returns 400 when no orgId is on the session", async () => {
    const res = await request(buildApp({ userId: "u1" })).get("/api/operatoros/organizations");
    expect(res.status).toBe(400);
  });
});
