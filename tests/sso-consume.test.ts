import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { consumeSsoToken } from "../server/sso/consume";
import type { SsoConfig } from "../server/env";

const config: SsoConfig = {
  secret: "test-secret",
  operatorosBaseUrl: "https://operatoros.example.com",
  apiUrl: "https://api.operatoros.example.com",
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

beforeEach(() => {
  fetchMock.mockReset();
  // @ts-expect-error - jest-style global fetch override
  global.fetch = fetchMock;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("consumeSsoToken", () => {
  it("posts {jti, aud, env} to {apiUrl}/v1/modules/sso/consume", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const r = await consumeSsoToken("jti-abc", config);
    expect(r).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.operatoros.example.com/v1/modules/sso/consume");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ jti: "jti-abc", aud: "tradeflowkit", env: "prod" });
  });

  it("returns ok on 200", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    expect(await consumeSsoToken("j", config)).toEqual({ ok: true });
  });

  it("maps TOKEN_EXPIRED -> expired", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(410, { code: "TOKEN_EXPIRED" }));
    const r = await consumeSsoToken("j", config);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("expired");
      expect(r.apiCode).toBe("TOKEN_EXPIRED");
      expect(r.httpStatus).toBe(410);
    }
  });

  it("maps AUDIENCE_MISMATCH -> audience_mismatch", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { code: "AUDIENCE_MISMATCH" }));
    const r = await consumeSsoToken("j", config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("audience_mismatch");
  });

  it("maps ENV_MISMATCH -> env_mismatch", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { code: "ENV_MISMATCH" }));
    const r = await consumeSsoToken("j", config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("env_mismatch");
  });

  it("maps TOKEN_UNKNOWN -> consume_failed", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { code: "TOKEN_UNKNOWN" }));
    const r = await consumeSsoToken("j", config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("consume_failed");
  });

  it("maps TOKEN_REPLAYED -> consume_failed", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { code: "TOKEN_REPLAYED" }));
    const r = await consumeSsoToken("j", config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("consume_failed");
  });

  it("maps unknown 4xx code -> consume_failed", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { code: "SOMETHING_NEW" }));
    const r = await consumeSsoToken("j", config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("consume_failed");
  });

  it("maps 5xx -> sso_consume_unavailable (fail closed)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const r = await consumeSsoToken("j", config);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("sso_consume_unavailable");
      expect(r.httpStatus).toBe(503);
    }
  });

  it("maps network error -> sso_consume_unavailable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const r = await consumeSsoToken("j", config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("sso_consume_unavailable");
  });
});
