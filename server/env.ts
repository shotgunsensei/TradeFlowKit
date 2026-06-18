import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().optional(),
  MODULE_SSO_SECRET: z.string().optional(),
  OPERATOROS_BASE_URL: z.string().url().optional(),
  OPERATOROS_API_URL: z.string().url().optional(),
  OPERATOROS_SSO_AUDIENCE: z.string().optional(),
  OPERATOROS_SSO_ENV: z.enum(["prod", "staging", "dev"]).optional(),
  OPERATOROS_SERVICE_TOKEN: z.string().optional(),
  // Legacy aliases (kept for backward compatibility with existing deployments).
  APP_ENV: z.string().optional(),
  MODULE_SLUG: z.string().optional(),
  SOFT_DELETE_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `  ${e.path.join(".")}: ${e.message}`).join("\n");
    throw new Error(`Environment validation failed:\n${errors}`);
  }
  const env = result.data;
  if (env.NODE_ENV === "production" && !env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set in production");
  }
  _env = env;
  return _env;
}

export function getSessionSecret(): string {
  const env = getEnv();
  return env.SESSION_SECRET || "tradeflow-dev-secret-change-me-in-production";
}

export interface SsoConfig {
  secret: string;
  /** Expected `iss` claim. */
  operatorosBaseUrl: string;
  /** Expected `env` claim — `prod` | `staging` | `dev`. */
  ssoEnv: "prod" | "staging" | "dev";
  /** Expected `aud` and `module_slug` claims. */
  audience: string;
  /**
   * API base to POST `/modules/sso/consume` against. Per the canonical
   * contract this is `https://operatoros.net/api` (the hub's front door
   * rewrites `/api/:path*` to internal Fastify routes). Defaults to
   * `OPERATOROS_BASE_URL` when `OPERATOROS_API_URL` is unset.
   */
  apiUrl: string;
}

/**
 * Translate the legacy `APP_ENV` value into the canonical `OPERATOROS_SSO_ENV`
 * vocabulary. Only used as a backward-compatibility bridge — `NODE_ENV` is NOT
 * a fallback (the canonical contract requires an explicit per-deployment value).
 */
function translateLegacyAppEnv(value: string | undefined): "prod" | "staging" | "dev" | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === "prod" || v === "production") return "prod";
  if (v === "staging" || v === "stage") return "staging";
  if (v === "dev" || v === "development") return "dev";
  return null;
}

/**
 * Resolve the SSO configuration from env. Returns `null` if the required
 * vars are missing, so callers can render a friendly "not configured" page
 * in development without breaking startup. In production, callers should
 * have already enforced the secret at boot via `assertSsoConfigForProduction`.
 */
export function getSsoConfig(): SsoConfig | null {
  const env = getEnv();
  if (!env.MODULE_SSO_SECRET || !env.OPERATOROS_BASE_URL) {
    return null;
  }

  const audience = env.OPERATOROS_SSO_AUDIENCE || env.MODULE_SLUG;
  if (!audience) return null;

  const ssoEnv =
    (env.OPERATOROS_SSO_ENV as "prod" | "staging" | "dev" | undefined) ||
    translateLegacyAppEnv(env.APP_ENV);
  if (!ssoEnv) return null;

  const baseUrl = env.OPERATOROS_BASE_URL.replace(/\/+$/, "");
  const apiUrl = (env.OPERATOROS_API_URL || env.OPERATOROS_BASE_URL).replace(/\/+$/, "");

  return {
    secret: env.MODULE_SSO_SECRET,
    operatorosBaseUrl: baseUrl,
    ssoEnv,
    audience: audience.toLowerCase(),
    apiUrl,
  };
}

/** Minimum length for MODULE_SSO_SECRET per the canonical contract. */
export const MODULE_SSO_SECRET_MIN_LENGTH = 16;

/**
 * Enforce the canonical contract's "fail startup loudly" rule in production.
 * In dev/test, missing SSO config is allowed — `/sso` will return a clean
 * 503 "not configured" page and the rest of the app keeps working.
 */
export function assertSsoConfigForProduction(): void {
  const env = getEnv();
  if (env.NODE_ENV !== "production") return;

  // Presence checks first, with names that point at the canonical var the
  // operator should set. Legacy aliases (MODULE_SLUG, APP_ENV) still satisfy
  // the presence requirement.
  const missing: string[] = [];
  if (!env.MODULE_SSO_SECRET) missing.push("MODULE_SSO_SECRET");
  if (!env.OPERATOROS_BASE_URL) missing.push("OPERATOROS_BASE_URL");
  if (!env.OPERATOROS_SSO_AUDIENCE && !env.MODULE_SLUG) {
    missing.push("OPERATOROS_SSO_AUDIENCE");
  }
  if (!env.OPERATOROS_SSO_ENV && !env.APP_ENV) {
    missing.push("OPERATOROS_SSO_ENV");
  }
  if (missing.length > 0) {
    throw new Error(
      `OperatorOS SSO contract requires the following env vars in production: ${missing.join(", ")}`
    );
  }

  if (env.MODULE_SSO_SECRET!.length < MODULE_SSO_SECRET_MIN_LENGTH) {
    throw new Error(
      `MODULE_SSO_SECRET must be at least ${MODULE_SSO_SECRET_MIN_LENGTH} characters (OperatorOS SSO contract)`
    );
  }

  // Semantic validity check: the effective config must actually resolve. This
  // catches cases where presence checks pass but a legacy value can't be
  // translated to a valid canonical value (e.g. APP_ENV=staging-blue).
  const config = getSsoConfig();
  if (!config) {
    throw new Error(
      "OperatorOS SSO contract: env vars are present but could not be resolved into a valid SsoConfig (check OPERATOROS_SSO_ENV is one of prod|staging|dev — APP_ENV legacy fallback only translates production|staging|development)"
    );
  }
}
