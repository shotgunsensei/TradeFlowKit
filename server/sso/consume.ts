import type { SsoConfig } from "../env";

export type SsoConsumeOutcome =
  | { ok: true }
  | { ok: false; reason: "replay" | "unknown" | "expired" | "mismatch" | "transient" };

const CONSUME_TIMEOUT_MS = 5000;

export async function consumeSsoToken(
  jti: string,
  config: SsoConfig
): Promise<SsoConsumeOutcome> {
  const url = `${config.operatorosBaseUrl}/v1/modules/sso/consume`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONSUME_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jti,
        aud: config.moduleSlug,
        env: config.appEnv,
      }),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timeoutId);
    return { ok: false, reason: "transient" };
  } finally {
    clearTimeout(timeoutId);
  }

  switch (response.status) {
    case 200:
      return { ok: true };
    case 400:
      return { ok: false, reason: "mismatch" };
    case 404:
      return { ok: false, reason: "unknown" };
    case 409:
      return { ok: false, reason: "replay" };
    case 410:
      return { ok: false, reason: "expired" };
    default:
      return { ok: false, reason: "transient" };
  }
}
