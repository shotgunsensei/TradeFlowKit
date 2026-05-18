import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { consumeSsoToken } from "../server/sso/consume";
import type { SsoConfig } from "../server/env";

const config: SsoConfig = {
  secret: "test-secret",
  operatorosBaseUrl: "https://operatoros.example.com",
  apiUrl: "https://operatoros.example.com/api",
  audience: "tradeflowkit",
  ssoEnv: "prod",
};

const fetchMock = vi.fn();
const originalFetch = global.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    user: {
      id: "u-1",
      email: "alice@example.com",
      name: "Alice",
      role: "user",
    },
    moduleSlug: "tradeflowkit",
    planSlug: "starter",
    organizationId: null,
    env: "prod",
    jti: "jti-abc",
    issuer: "https://operatoros.example.com",
    accessSource: "plan",
    ...overrides,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  // @ts-expect-error - override global fetch
  global.fetch = fetchMock;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("consumeSsoToken", () => {
  it("posts {jti, aud, env} to {apiUrl}/modules/sso/consume with no auth header", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, validPayload()));
    const r = await consumeSsoToken("jti-abc", "tradeflowkit", "prod", config);
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://operatoros.example.com/api/modules/sso/consume");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ jti: "jti-abc", aud: "tradeflowkit", env: "prod" });
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
    expect((init.headers as Record<string, string>)["x-module-slug"]).toBeUndefined();
  });

  it("returns the user payload on 200", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, validPayload({ planSlug: "pro" })));
    const r = await consumeSsoToken("j", "tradeflowkit", "prod", config);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.user.email).toBe("alice@example.com");
      expect(r.payload.user.role).toBe("user");
      expect(r.payload.planSlug).toBe("pro");
      expect(r.payload.organizationId).toBeNull();
    }
  });

  it("treats unparseable 200 body as unavailable (never spends a token twice)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("not-json", { status: 200, headers: { "content-type": "text/plain" } })
    );
    const r = await consumeSsoToken("j", "tradeflowkit", "prod", config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.unavailable).toBe(true);
  });

  it("treats 200 with wrong shape as unavailable", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { not: "valid" }));
    const r = await consumeSsoToken("j", "tradeflowkit", "prod", config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.unavailable).toBe(true);
  });

  it("forwards TOKEN_EXPIRED as apiCode on 410", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(410, { code: "TOKEN_EXPIRED" }));
    const r = await consumeSsoToken("j", "tradeflowkit", "prod", config);
    expect(r.ok).toBe(false);
    if (!r.ok && !r.unavailable) {
      expect(r.apiCode).toBe("TOKEN_EXPIRED");
      expect(r.httpStatus).toBe(410);
    }
  });

  it("forwards AUDIENCE_MISMATCH as apiCode on 400", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { code: "AUDIENCE_MISMATCH" }));
    const r = await consumeSsoToken("j", "tradeflowkit", "prod", config);
    expect(r.ok).toBe(false);
    if (!r.ok && !r.unavailable) expect(r.apiCode).toBe("AUDIENCE_MISMATCH");
  });

  it("forwards ENV_MISMATCH as apiCode on 400", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { code: "ENV_MISMATCH" }));
    const r = await consumeSsoToken("j", "tradeflowkit", "prod", config);
    expect(r.ok).toBe(false);
    if (!r.ok && !r.unavailable) expect(r.apiCode).toBe("ENV_MISMATCH");
  });

  it("forwards TOKEN_REPLAYED as apiCode on 409", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { code: "TOKEN_REPLAYED" }));
    const r = await consumeSsoToken("j", "tradeflowkit", "prod", config);
    expect(r.ok).toBe(false);
    if (!r.ok && !r.unavailable) expect(r.apiCode).toBe("TOKEN_REPLAYED");
  });

  it("returns apiCode=undefined when 4xx body has no code", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));
    const r = await consumeSsoToken("j", "tradeflowkit", "prod", config);
    expect(r.ok).toBe(false);
    if (!r.ok && !r.unavailable) expect(r.apiCode).toBeUndefined();
  });

  it("marks 5xx as unavailable (fail closed)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const r = await consumeSsoToken("j", "tradeflowkit", "prod", config);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.unavailable).toBe(true);
      if (r.unavailable) expect(r.httpStatus).toBe(503);
    }
  });

  it("marks network errors as unavailable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const r = await consumeSsoToken("j", "tradeflowkit", "prod", config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.unavailable).toBe(true);
  });
});
