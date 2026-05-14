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
  user_id: "11111111-1111-1111-1111-111111111111" as string,
  email: "alice@example.com",
  role: "user",
  plan_slug: "starter",
  organization_id: "22222222-2222-2222-2222-222222222222",
  iat: now,
  exp: now + 60,
});

describe("verifySsoToken", () => {
  it("accepts a valid token and returns canonical claims", () => {
    const token = sign(baseClaims());
    const result = verifySsoToken(token, config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.email).toBe("alice@example.com");
      expect(result.claims.jti).toBe("jti-123");
      expect(result.claims.sub).toBe("11111111-1111-1111-1111-111111111111");
      expect(result.claims.user_id).toBe("11111111-1111-1111-1111-111111111111");
      expect(result.claims.role).toBe("user");
      expect(result.claims.plan_slug).toBe("starter");
      expect(result.claims.organization_id).toBe("22222222-2222-2222-2222-222222222222");
    }
  });

  it("returns missing_token when token absent", () => {
    expect(verifySsoToken(undefined, config)).toEqual({ ok: false, reason: "missing_token" });
  });

  it("returns bad_request for malformed token (wrong segment count)", () => {
    const r = verifySsoToken("not.a.real.token", config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_request");
  });

  it("returns signature_invalid for unsupported alg (none)", () => {
    const header = b64url(JSON.stringify({ alg: "none", typ: "JWT" }));
    const body = b64url(JSON.stringify(baseClaims()));
    const r = verifySsoToken(`${header}.${body}.`, config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("signature_invalid");
  });

  it("returns signature_invalid for bad HMAC", () => {
    const r = verifySsoToken(sign(baseClaims(), "wrong-secret"), config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("signature_invalid");
  });

  it("returns issuer_mismatch on wrong iss", () => {
    const r = verifySsoToken(sign({ ...baseClaims(), iss: "https://evil.example.com" }), config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("issuer_mismatch");
  });

  it("returns audience_mismatch on wrong aud", () => {
    const r = verifySsoToken(sign({ ...baseClaims(), aud: "techdeck" }), config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("audience_mismatch");
  });

  it("returns audience_mismatch on wrong module_slug", () => {
    const r = verifySsoToken(sign({ ...baseClaims(), module_slug: "techdeck" }), config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("audience_mismatch");
  });

  it("returns env_mismatch on wrong env", () => {
    const r = verifySsoToken(sign({ ...baseClaims(), env: "staging" }), config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("env_mismatch");
  });

  it("returns expired when exp is in the past", () => {
    const now = nowSec();
    const r = verifySsoToken(sign({ ...baseClaims(now), exp: now - 5, iat: now - 10 }), config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired");
  });

  it("returns expired when token age exceeds 90s even if exp is far in the future", () => {
    const now = nowSec();
    const tooOld = now - (TOKEN_MAX_AGE_SECONDS + 1);
    const r = verifySsoToken(sign({ ...baseClaims(now), iat: tooOld, exp: now + 3600 }), config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired");
  });

  it("accepts a token at exactly the 90s age boundary", () => {
    const now = nowSec();
    const r = verifySsoToken(sign({ ...baseClaims(now), iat: now - TOKEN_MAX_AGE_SECONDS, exp: now + 60 }), config);
    expect(r.ok).toBe(true);
  });

  it("returns clock_skew when iat is more than 5s in the future", () => {
    const now = nowSec();
    const future = now + CLOCK_SKEW_SECONDS + 2;
    const r = verifySsoToken(sign({ ...baseClaims(now), iat: future, exp: future + 60 }), config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("clock_skew");
  });

  it("accepts iat within 5s clock-skew window", () => {
    const now = nowSec();
    const r = verifySsoToken(sign({ ...baseClaims(now), iat: now + CLOCK_SKEW_SECONDS, exp: now + 60 }), config);
    expect(r.ok).toBe(true);
  });

  it("returns bad_request when jti is missing", () => {
    const claims = baseClaims();
    delete (claims as any).jti;
    const r = verifySsoToken(sign(claims), config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_request");
  });

  it("returns bad_request when email is missing", () => {
    const claims = baseClaims();
    delete (claims as any).email;
    const r = verifySsoToken(sign(claims), config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_request");
  });

  it("returns bad_request when sub is missing", () => {
    const claims = baseClaims();
    delete (claims as any).sub;
    delete (claims as any).user_id;
    const r = verifySsoToken(sign(claims), config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_request");
  });

  it("falls back to user_id when sub is missing but user_id is present", () => {
    const claims = baseClaims();
    delete (claims as any).sub;
    const r = verifySsoToken(sign(claims), config);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.claims.sub).toBe(claims.user_id);
  });

  it("returns bad_request for whitespace-only email", () => {
    const r = verifySsoToken(sign({ ...baseClaims(), email: "   " }), config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_request");
  });
});
