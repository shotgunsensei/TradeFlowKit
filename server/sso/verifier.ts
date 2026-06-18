import crypto from "crypto";
import type { SsoConfig } from "../env";

/**
 * Reject codes from the OperatorOS Child-App SSO Integration contract.
 * These appear verbatim in the `launchError` query parameter when redirecting
 * the user back to the hub on failure.
 */
export type SsoRejectCode =
  | "no_token"
  | "bad_signature"
  | "bad_issuer"
  | "bad_module_slug"
  | "env_mismatch"
  | "token_expired"
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
  exp: number;
  iat: number;
  /** Subject — OperatorOS user id. Used for tracking only; identity is keyed on email. */
  sub?: string;
}

export type SsoVerifyResult =
  | { ok: true; claims: SsoTokenClaims }
  | { ok: false; reason: SsoVerifyFailureReason };

/**
 * Tokens older than this many seconds are rejected as `token_expired`.
 * Per the canonical contract: 90 second max age with a ±5 second clock-skew
 * tolerance — effective ceiling of 95 seconds.
 */
export const TOKEN_MAX_AGE_SECONDS = 90;
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

export function verifySsoToken(
  token: string | undefined,
  config: SsoConfig,
  now: number = Math.floor(Date.now() / 1000)
): SsoVerifyResult {
  if (!token || typeof token !== "string") {
    return { ok: false, reason: "no_token" };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, reason: "bad_signature" };
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: string; typ?: string };
  let payload: Partial<SsoTokenClaims> & Record<string, unknown>;
  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString("utf8"));
    payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "bad_signature" };
  }

  // HS256 only — explicitly reject `none` and any asymmetric algorithm.
  if (header.alg !== "HS256") {
    return { ok: false, reason: "bad_signature" };
  }

  const expectedSig = crypto
    .createHmac("sha256", config.secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();

  let providedSig: Buffer;
  try {
    providedSig = base64UrlDecode(signatureB64);
  } catch {
    return { ok: false, reason: "bad_signature" };
  }

  if (!timingSafeEqual(expectedSig, providedSig)) {
    return { ok: false, reason: "bad_signature" };
  }

  if (payload.iss !== config.operatorosBaseUrl) {
    return { ok: false, reason: "bad_issuer" };
  }

  // The spec requires both `aud` and `module_slug` to match the configured
  // audience. Either being wrong is a `bad_module_slug` from the child's POV.
  if (payload.aud !== config.audience) {
    return { ok: false, reason: "bad_module_slug" };
  }

  if (payload.module_slug !== config.audience) {
    return { ok: false, reason: "bad_module_slug" };
  }

  if (payload.env !== config.ssoEnv) {
    return { ok: false, reason: "env_mismatch" };
  }

  if (typeof payload.exp !== "number" || typeof payload.iat !== "number") {
    return { ok: false, reason: "bad_signature" };
  }

  // exp in the past (allow same-second).
  if (payload.exp <= now) {
    return { ok: false, reason: "token_expired" };
  }

  // Token age check: now - iat must be within (TOKEN_MAX_AGE_SECONDS + CLOCK_SKEW).
  // Per spec: 90s max age with ±5s skew → effective ceiling 95s.
  if (now - payload.iat > TOKEN_MAX_AGE_SECONDS + CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: "token_expired" };
  }

  if (!nonEmptyString(payload.jti)) {
    return { ok: false, reason: "bad_signature" };
  }

  const claims: SsoTokenClaims = {
    iss: payload.iss as string,
    aud: payload.aud as string,
    module_slug: payload.module_slug as string,
    env: payload.env as string,
    jti: payload.jti as string,
    exp: payload.exp,
    iat: payload.iat,
    sub: nonEmptyString(payload.sub) ? payload.sub : undefined,
  };

  return { ok: true, claims };
}
