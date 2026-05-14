import type { SsoConfig } from "../env";

/**
 * Outcome of POST /v1/modules/sso/consume per the canonical contract.
 *
 * - `consume_failed`: API returned a 4xx that maps to a generic consume
 *   rejection (`TOKEN_UNKNOWN`, `TOKEN_REPLAYED`, or any other 4xx the
 *   contract doesn't carve out).
 * - `expired`: API returned `TOKEN_EXPIRED` (HTTP 410).
 * - `audience_mismatch`: API returned `AUDIENCE_MISMATCH` (HTTP 400).
 * - `env_mismatch`: API returned `ENV_MISMATCH` (HTTP 400).
 * - `sso_consume_unavailable`: network error or 5xx — fail closed.
 */
export type SsoConsumeOutcome =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "consume_failed"
        | "expired"
        | "audience_mismatch"
        | "env_mismatch"
        | "sso_consume_unavailable";
      apiCode?: string;
      httpStatus?: number;
    };

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

export async function consumeSsoToken(
  jti: string,
  config: SsoConfig
): Promise<SsoConsumeOutcome> {
  const url = `${config.apiUrl}/v1/modules/sso/consume`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONSUME_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jti,
        aud: config.audience,
        env: config.ssoEnv,
      }),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timeoutId);
    return { ok: false, reason: "sso_consume_unavailable" };
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 200) {
    return { ok: true };
  }

  // 5xx → fail closed.
  if (response.status >= 500) {
    return { ok: false, reason: "sso_consume_unavailable", httpStatus: response.status };
  }

  // 4xx → map by JSON `code` per the canonical table.
  const apiCode = await safeReadJsonCode(response);
  switch (apiCode) {
    case "TOKEN_EXPIRED":
      return { ok: false, reason: "expired", apiCode, httpStatus: response.status };
    case "AUDIENCE_MISMATCH":
      return { ok: false, reason: "audience_mismatch", apiCode, httpStatus: response.status };
    case "ENV_MISMATCH":
      return { ok: false, reason: "env_mismatch", apiCode, httpStatus: response.status };
    case "TOKEN_UNKNOWN":
    case "TOKEN_REPLAYED":
    default:
      return { ok: false, reason: "consume_failed", apiCode, httpStatus: response.status };
  }
}
