import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifySsoToken } from "../server/sso/verifier";
import type { SsoConfig } from "../server/env";

const config: SsoConfig = {
  secret: "test-secret-do-not-use-in-prod",
  operatorosBaseUrl: "https://operatoros.example.com",
  appEnv: "production",
  moduleSlug: "tradeflowkit",
};

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function sign(payload: object, secret: string = config.secret): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest();
  return `${header}.${body}.${b64url(sig)}`;
}

const baseClaims = () => ({
  iss: config.operatorosBaseUrl,
  aud: config.moduleSlug,
  module_slug: config.moduleSlug,
  env: config.appEnv,
  jti: "jti-123",
  email: "alice@example.com",
  exp: Math.floor(Date.now() / 1000) + 60,
  iat: Math.floor(Date.now() / 1000),
});

describe("verifySsoToken", () => {
  it("accepts a valid token", () => {
    const token = sign(baseClaims());
    const result = verifySsoToken(token, config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.email).toBe("alice@example.com");
      expect(result.claims.jti).toBe("jti-123");
    }
  });

  it("rejects missing token", () => {
    const result = verifySsoToken(undefined, config);
    expect(result).toEqual({ ok: false, reason: "missing_token" });
  });

  it("rejects malformed token (wrong segment count)", () => {
    const result = verifySsoToken("not.a.real.token", config);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed");
  });

  it("rejects unsupported alg", () => {
    const header = b64url(JSON.stringify({ alg: "none", typ: "JWT" }));
    const body = b64url(JSON.stringify(baseClaims()));
    const token = `${header}.${body}.`;
    const result = verifySsoToken(token, config);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_alg");
  });

  it("rejects bad signature", () => {
    const token = sign(baseClaims(), "wrong-secret");
    const result = verifySsoToken(token, config);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_signature");
  });

  it("rejects bad iss", () => {
    const token = sign({ ...baseClaims(), iss: "https://evil.example.com" });
    const result = verifySsoToken(token, config);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_iss");
  });

  it("rejects bad aud", () => {
    const token = sign({ ...baseClaims(), aud: "techdeck" });
    const result = verifySsoToken(token, config);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_aud");
  });

  it("rejects bad module_slug", () => {
    const token = sign({ ...baseClaims(), module_slug: "techdeck" });
    const result = verifySsoToken(token, config);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_module_slug");
  });

  it("rejects bad env", () => {
    const token = sign({ ...baseClaims(), env: "staging" });
    const result = verifySsoToken(token, config);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_env");
  });

  it("rejects expired token", () => {
    const token = sign({ ...baseClaims(), exp: Math.floor(Date.now() / 1000) - 5 });
    const result = verifySsoToken(token, config);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("rejects token without jti", () => {
    const claims = baseClaims();
    delete (claims as any).jti;
    const token = sign(claims);
    const result = verifySsoToken(token, config);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_jti");
  });

  it("rejects token without email", () => {
    const claims = baseClaims();
    delete (claims as any).email;
    const token = sign(claims);
    const result = verifySsoToken(token, config);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_email");
  });
});
