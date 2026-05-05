import crypto from "crypto";
import type { SsoConfig } from "../env";

export type SsoVerifyFailureReason =
  | "missing_token"
  | "malformed"
  | "bad_signature"
  | "bad_alg"
  | "bad_iss"
  | "bad_aud"
  | "bad_module_slug"
  | "bad_env"
  | "expired"
  | "missing_jti"
  | "missing_email";

export interface SsoTokenClaims {
  iss: string;
  aud: string;
  module_slug: string;
  env: string;
  jti: string;
  email: string;
  exp: number;
  iat?: number;
  user_id?: string;
  name?: string;
}

export type SsoVerifyResult =
  | { ok: true; claims: SsoTokenClaims }
  | { ok: false; reason: SsoVerifyFailureReason };

function base64UrlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
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
    return { ok: false, reason: "malformed" };
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: string; typ?: string };
  let payload: Partial<SsoTokenClaims>;
  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString("utf8"));
    payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (header.alg !== "HS256") {
    return { ok: false, reason: "bad_alg" };
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
    return { ok: false, reason: "bad_iss" };
  }

  if (payload.aud !== config.moduleSlug) {
    return { ok: false, reason: "bad_aud" };
  }

  if (payload.module_slug !== config.moduleSlug) {
    return { ok: false, reason: "bad_module_slug" };
  }

  if (payload.env !== config.appEnv) {
    return { ok: false, reason: "bad_env" };
  }

  if (typeof payload.exp !== "number" || payload.exp <= now) {
    return { ok: false, reason: "expired" };
  }

  if (!payload.jti || typeof payload.jti !== "string") {
    return { ok: false, reason: "missing_jti" };
  }

  if (!payload.email || typeof payload.email !== "string") {
    return { ok: false, reason: "missing_email" };
  }

  return { ok: true, claims: payload as SsoTokenClaims };
}
