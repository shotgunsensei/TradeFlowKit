import type { SsoConfig } from "../env";

/**
 * Successful consume payload from the OperatorOS hub — per the canonical
 * Child-App SSO contract, this is the userinfo response (there is no separate
 * userinfo endpoint). All identity, role, and entitlement data we use comes
 * from this body.
 */
export interface SsoConsumeUser {
  id: string;
  email: string;
  name: string;
  /** Platform role: typically `"user"` or `"super_admin"`. */
  role: string;
}

export interface SsoConsumePayload {
  ok: true;
  user: SsoConsumeUser;
  moduleSlug: string;
  planSlug: "starter" | "pro" | "elite" | null;
  organizationId: string | null;
  env: "prod" | "staging" | "dev";
  jti: string;
  issuer: string;
  accessSource: "plan" | "addon" | "override";
}

/**
 * Outcome of POST {OPERATOROS_API_URL}/modules/sso/consume.
 *
 * The hub returns either 200 with `SsoConsumePayload`, or a 4xx/5xx with
 * `{ "code": "<STRING>" }`. We forward the upstream `code` verbatim on
 * non-success so the route can redirect back to the hub with that code in
 * `launchError`. 5xx / network errors fail closed with
 * `sso_consume_unavailable` per the contract.
 */
export type SsoConsumeOutcome =
  | { ok: true; payload: SsoConsumePayload }
  | { ok: false; unavailable: true; httpStatus?: number }
  | { ok: false; unavailable: false; apiCode: string | undefined; httpStatus: number };

const CONSUME_TIMEOUT_MS = 5000;

async function safeReadJsonCode(response: Response): Promise<string | undefined> {
  try {
    const body = await response.json();
    if (body && typeof body === "object" && typeof (body as { code?: unknown }).code === "string") {
      return (body as { code: string }).code;
    }
  } catch {
    // ignore — body may be empty or non-JSON.
  }
  return undefined;
}

function isConsumePayload(v: unknown): v is SsoConsumePayload {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (o.ok !== true) return false;
  const u = o.user as Record<string, unknown> | undefined;
  if (!u || typeof u !== "object") return false;
  if (typeof u.email !== "string" || !u.email.trim()) return false;
  if (typeof u.id !== "string" || !u.id) return false;
  return true;
}

export async function consumeSsoToken(
  jti: string,
  aud: string,
  env: "prod" | "staging" | "dev",
  config: SsoConfig
): Promise<SsoConsumeOutcome> {
  // Per the canonical contract the consume path is `/modules/sso/consume`
  // relative to `OPERATOROS_API_URL` (e.g. `https://operatoros.net/api`).
  // The hub's front door rewrites `/api/:path*` to its internal Fastify routes.
  // This endpoint is intentionally unauthenticated — the single-use `jti` is
  // the auth. Do NOT add a bearer header.
  const url = `${config.apiUrl}/modules/sso/consume`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONSUME_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jti, aud, env }),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timeoutId);
    return { ok: false, unavailable: true };
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 200) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // 200 with unparseable body → treat as unavailable; never spend a token twice.
      return { ok: false, unavailable: true, httpStatus: 200 };
    }
    if (!isConsumePayload(body)) {
      return { ok: false, unavailable: true, httpStatus: 200 };
    }
    return { ok: true, payload: body };
  }

  // 5xx → fail closed.
  if (response.status >= 500) {
    return { ok: false, unavailable: true, httpStatus: response.status };
  }

  // 4xx → forward the upstream `code` string.
  const apiCode = await safeReadJsonCode(response);
  return { ok: false, unavailable: false, apiCode, httpStatus: response.status };
}
