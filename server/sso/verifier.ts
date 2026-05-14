import crypto from "crypto";
import type { SsoConfig } from "../env";

/**
 * Canonical reject codes from the OperatorOS Child-App SSO Integration
 * contract. These are the exact strings child apps must surface.
 */
export type SsoRejectCode =
  | "missing_token"
  | "bad_request"
  | "signature_invalid"
  | "issuer_mismatch"
  | "audience_mismatch"
  | "env_mismatch"
  | "expired"
  | "clock_skew"
  | "consume_failed"
  | "sso_consume_unavailable";

export type SsoVerifyFailureReason = Exclude<
  SsoRejectCode,
  "consume_failed" | "sso_consume_unavailable"
>;

export interface SsoTokenClaims {
  iss: string;
  aud: string;
  module_slug: string;
  env: string;
  jti: string;
  email: string;
  exp: number;
  iat: number;
  /** JWT subject — UUID for the OperatorOS user. */
  sub: string;
  /** Duplicate of `sub` per the canonical contract. */
  user_id: string;
  role?: string;
  plan_slug?: string | null;
  organization_id?: string | null;
  name?: string;
}

export type SsoVerifyResult =
  | { ok: true; claims: SsoTokenClaims }
  | { ok: false; reason: SsoVerifyFailureReason };

/** Tokens older than this many seconds are rejected as `expired`. */
export const TOKEN_MAX_AGE_SECONDS = 90;
/** `iat` is allowed this many seconds in the future before rejecting as `clock_skew`. */
export const CLOCK_SKEW_SECONDS = 5;

function base64UrlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** RFC 4122 UUID (any version, lowercase or uppercase). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

export function verifySsoToken(
  token: string | undefined,
  config: SsoConfig,
  now: number = Math.floor(Date.now() / 1000)
): SsoVerifyResult {
  if (!token || typeof token !== "string") {
    return { ok: false, reason: "missing_token" };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, reason: "bad_request" };
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: string; typ?: string };
  let payload: Partial<SsoTokenClaims> & Record<string, unknown>;
  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString("utf8"));
    payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "bad_request" };
  }

  // HS256 only — explicitly reject `none` and any asymmetric algorithm.
  if (header.alg !== "HS256") {
    return { ok: false, reason: "signature_invalid" };
  }

  const expectedSig = crypto
    .createHmac("sha256", config.secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();

  let providedSig: Buffer;
  try {
    providedSig = base64UrlDecode(signatureB64);
  } catch {
    return { ok: false, reason: "signature_invalid" };
  }

  if (!timingSafeEqual(expectedSig, providedSig)) {
    return { ok: false, reason: "signature_invalid" };
  }

  if (payload.iss !== config.operatorosBaseUrl) {
    return { ok: false, reason: "issuer_mismatch" };
  }

  if (payload.aud !== config.audience) {
    return { ok: false, reason: "audience_mismatch" };
  }

  if (payload.module_slug !== config.audience) {
    return { ok: false, reason: "audience_mismatch" };
  }

  if (payload.env !== config.ssoEnv) {
    return { ok: false, reason: "env_mismatch" };
  }

  if (typeof payload.exp !== "number" || typeof payload.iat !== "number") {
    return { ok: false, reason: "bad_request" };
  }

  // iat in the future beyond clock-skew tolerance.
  if (payload.iat - now > CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: "clock_skew" };
  }

  // exp in the past (allow same-second).
  if (payload.exp <= now) {
    return { ok: false, reason: "expired" };
  }

  // Token age check: now - iat must be <= 90 seconds.
  if (now - payload.iat > TOKEN_MAX_AGE_SECONDS) {
    return { ok: false, reason: "expired" };
  }

  if (!nonEmptyString(payload.jti)) {
    return { ok: false, reason: "bad_request" };
  }

  if (!nonEmptyString(payload.email)) {
    return { ok: false, reason: "bad_request" };
  }

  // sub is mandatory per the canonical contract; user_id is the duplicate.
  // Accept either field but require at least one to identify the user, and
  // require the chosen value to be a UUID per the contract.
  const sub = nonEmptyString(payload.sub) ? payload.sub : (nonEmptyString(payload.user_id) ? payload.user_id : null);
  if (!sub || !isUuid(sub)) {
    return { ok: false, reason: "bad_request" };
  }
  if (nonEmptyString(payload.user_id) && !isUuid(payload.user_id)) {
    return { ok: false, reason: "bad_request" };
  }

  const claims: SsoTokenClaims = {
    iss: payload.iss as string,
    aud: payload.aud as string,
    module_slug: payload.module_slug as string,
    env: payload.env as string,
    jti: payload.jti as string,
    email: payload.email as string,
    exp: payload.exp,
    iat: payload.iat,
    sub,
    user_id: nonEmptyString(payload.user_id) ? payload.user_id : sub,
    role: typeof payload.role === "string" ? payload.role : undefined,
    plan_slug:
      payload.plan_slug === null
        ? null
        : typeof payload.plan_slug === "string"
        ? payload.plan_slug
        : undefined,
    organization_id:
      payload.organization_id === null
        ? null
        : typeof payload.organization_id === "string"
        ? payload.organization_id
        : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
  };

  return { ok: true, claims };
}
