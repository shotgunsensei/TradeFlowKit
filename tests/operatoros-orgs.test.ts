import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://stub";
});

vi.mock("../server/env", () => ({
  getSsoConfig: vi.fn(),
}));

vi.mock("../server/storage", () => ({
  storage: {
    getUser: vi.fn(),
  },
}));

import express from "express";
import request from "supertest";
import operatorosRouter from "../server/routes/operatoros";
import { getSsoConfig } from "../server/env";
import { storage } from "../server/storage";

function buildApp(session: Record<string, any> = { userId: "u1", orgId: "o1" }) {
  const app = express();
  app.use((req: any, _res, next) => {
    req.session = session;
    next();
  });
  app.use(operatorosRouter);
  return app;
}

const validSsoConfig = {
  secret: "test-secret",
  operatorosBaseUrl: "https://operatoros.test",
  ssoEnv: "dev" as const,
  audience: "tradeflowkit",
  apiUrl: "https://operatoros.test",
};

describe("GET /api/operatoros/organizations", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (getSsoConfig as any).mockReset();
    (storage.getUser as any).mockReset();
    fetchSpy = vi.spyOn(global, "fetch" as any);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns not_configured when SSO env is missing", async () => {
    (getSsoConfig as any).mockReturnValue(null);
    const res = await request(buildApp()).get("/api/operatoros/organizations");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false, reason: "not_configured" });
    expect(storage.getUser).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns not_linked when user has no operatorosUserId", async () => {
    (getSsoConfig as any).mockReturnValue(validSsoConfig);
    (storage.getUser as any).mockResolvedValue({ id: "u1", operatorosUserId: null });
    const res = await request(buildApp()).get("/api/operatoros/organizations");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false, reason: "not_linked" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns unavailable when upstream returns non-2xx", async () => {
    (getSsoConfig as any).mockReturnValue(validSsoConfig);
    (storage.getUser as any).mockResolvedValue({ id: "u1", operatorosUserId: "sub-123" });
    fetchSpy.mockResolvedValue(
      new Response("oops", { status: 503 }) as any
    );
    const res = await request(buildApp()).get("/api/operatoros/organizations");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false, reason: "unavailable" });
  });

  it("returns unavailable when fetch throws", async () => {
    (getSsoConfig as any).mockReturnValue(validSsoConfig);
    (storage.getUser as any).mockResolvedValue({ id: "u1", operatorosUserId: "sub-123" });
    fetchSpy.mockRejectedValue(new Error("network down"));
    const res = await request(buildApp()).get("/api/operatoros/organizations");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false, reason: "unavailable" });
  });

  it("returns unavailable when body has an unrecognized shape", async () => {
    (getSsoConfig as any).mockReturnValue(validSsoConfig);
    (storage.getUser as any).mockResolvedValue({ id: "u1", operatorosUserId: "sub-123" });
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ totally: "wrong" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }) as any
    );
    const res = await request(buildApp()).get("/api/operatoros/organizations");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false, reason: "unavailable" });
  });

  it("returns unavailable when body is not valid JSON", async () => {
    (getSsoConfig as any).mockReturnValue(validSsoConfig);
    (storage.getUser as any).mockResolvedValue({ id: "u1", operatorosUserId: "sub-123" });
    fetchSpy.mockResolvedValue(
      new Response("not json", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }) as any
    );
    const res = await request(buildApp()).get("/api/operatoros/organizations");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false, reason: "unavailable" });
  });

  it("returns available with parsed organizations on the happy path", async () => {
    (getSsoConfig as any).mockReturnValue(validSsoConfig);
    (storage.getUser as any).mockResolvedValue({ id: "u1", operatorosUserId: "sub-abc" });
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          organizations: [
            { id: "org_1", name: "Acme Plumbing" },
            { id: "org_2", name: "Widgets Inc" },
            { bad: "skip-me" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      ) as any
    );
    const res = await request(buildApp()).get("/api/operatoros/organizations");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      available: true,
      organizations: [
        { id: "org_1", name: "Acme Plumbing" },
        { id: "org_2", name: "Widgets Inc" },
      ],
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("https://operatoros.test/v1/modules/users/sub-abc/organizations");
    expect((init.headers as any).authorization).toBe("Bearer test-secret");
    expect((init.headers as any)["x-module-slug"]).toBe("tradeflowkit");
    expect((init.headers as any)["x-module-env"]).toBe("dev");
  });

  it("returns 401 when no session userId is present", async () => {
    const app = buildApp({});
    const res = await request(app).get("/api/operatoros/organizations");
    expect(res.status).toBe(401);
  });

  it("returns 400 when no orgId is on the session", async () => {
    const app = buildApp({ userId: "u1" });
    const res = await request(app).get("/api/operatoros/organizations");
    expect(res.status).toBe(400);
  });
});
