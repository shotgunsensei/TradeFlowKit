import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifySsoToken, TOKEN_MAX_AGE_SECONDS, CLOCK_SKEW_SECONDS } from "../server/sso/verifier";
import type { SsoConfig } from "../server/env";

const config: SsoConfig = {
  secret: "test-secret-do-not-use-in-prod",
  operatorosBaseUrl: "https://operatoros.example.com",
  ssoEnv: "prod",
  audience: "tradeflowkit",
  apiUrl: "https://operatoros.example.com",
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

const nowSec = () => Math.floor(Date.now() / 1000);

const baseClaims = (now = nowSec()) => ({
  iss: config.operatorosBaseUrl,
  aud: config.audience,
  module_slug: config.audience,
  env: config.ssoEnv,
  jti: "jti-123",
  sub: "11111111-1111-1111-1111-111111111111",
  iat: now,
  exp: now + 60,
});

describe("verifySsoToken", () => {
  it("accepts a valid token and returns canonical claims", () => {
    const token = sign(baseClaims());
    const result = verifySsoToken(token, config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.jti).toBe("jti-123");
      expect(result.claims.aud).toBe("tradeflowkit");
      expect(result.claims.module_slug).toBe("tradeflowkit");
      expect(result.claims.env).toBe("prod");
      expect(result.claims.sub).toBe("11111111-1111-1111-1111-111111111111");
    }
  });

  it("returns no_token when token absent", () => {
    expect(verifySsoToken(undefined, config)).toEqual({ ok: false, reason: "no_token" });
  });

  it("returns bad_signature for malformed token (wrong segment count)", () => {
    const r = verifySsoToken("not.a.real.token", config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_signature");
  });

  it("returns bad_signature for unsupported alg (none)", () => {
    const header = b64url(JSON.stringify({ alg: "none", typ: "JWT" }));
    const body = b64url(JSON.stringify(baseClaims()));
    const r = verifySsoToken(`${header}.${body}.`, config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_signature");
  });

  it("returns bad_signature for bad HMAC", () => {
    const r = verifySsoToken(sign(baseClaims(), "wrong-secret"), config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_signature");
  });

  it("returns bad_issuer on wrong iss", () => {
    const r = verifySsoToken(sign({ ...baseClaims(), iss: "https://evil.example.com" }), config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_issuer");
  });

  it("returns bad_module_slug on wrong aud", () => {
    const r = verifySsoToken(sign({ ...baseClaims(), aud: "techdeck" }), config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_module_slug");
  });

  it("returns bad_module_slug on wrong module_slug", () => {
    const r = verifySsoToken(sign({ ...baseClaims(), module_slug: "techdeck" }), config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_module_slug");
  });

  it("returns env_mismatch on wrong env", () => {
    const r = verifySsoToken(sign({ ...baseClaims(), env: "staging" }), config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("env_mismatch");
  });

  it("returns token_expired when exp is in the past", () => {
    const now = nowSec();
    const r = verifySsoToken(sign({ ...baseClaims(now), exp: now - 5, iat: now - 10 }), config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("token_expired");
  });

  it("returns token_expired when token age exceeds 95s even if exp is far in the future", () => {
    const now = nowSec();
    const tooOld = now - (TOKEN_MAX_AGE_SECONDS + CLOCK_SKEW_SECONDS + 1);
    const r = verifySsoToken(sign({ ...baseClaims(now), iat: tooOld, exp: now + 3600 }), config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("token_expired");
  });

  it("accepts a token at exactly the 95s age boundary (90 + 5 skew)", () => {
    const now = nowSec();
    const atBoundary = now - (TOKEN_MAX_AGE_SECONDS + CLOCK_SKEW_SECONDS);
    const r = verifySsoToken(sign({ ...baseClaims(now), iat: atBoundary, exp: now + 60 }), config);
    expect(r.ok).toBe(true);
  });

  it("returns bad_signature when jti is missing", () => {
    const claims = baseClaims();
    delete (claims as any).jti;
    const r = verifySsoToken(sign(claims), config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_signature");
  });

  it("returns bad_signature when exp is missing", () => {
    const claims = baseClaims();
    delete (claims as any).exp;
    const r = verifySsoToken(sign(claims), config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_signature");
  });

  it("returns bad_signature when iat is missing", () => {
    const claims = baseClaims();
    delete (claims as any).iat;
    const r = verifySsoToken(sign(claims), config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_signature");
  });
});
