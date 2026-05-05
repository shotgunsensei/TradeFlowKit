import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().optional(),
  MODULE_SSO_SECRET: z.string().optional(),
  OPERATOROS_BASE_URL: z.string().url().optional(),
  APP_ENV: z.string().optional(),
  MODULE_SLUG: z.string().optional(),
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
  operatorosBaseUrl: string;
  appEnv: string;
  moduleSlug: string;
}

export function getSsoConfig(): SsoConfig | null {
  const env = getEnv();
  if (!env.MODULE_SSO_SECRET || !env.OPERATOROS_BASE_URL) {
    return null;
  }
  return {
    secret: env.MODULE_SSO_SECRET,
    operatorosBaseUrl: env.OPERATOROS_BASE_URL.replace(/\/+$/, ""),
    appEnv: env.APP_ENV || env.NODE_ENV,
    moduleSlug: env.MODULE_SLUG || "tradeflowkit",
  };
}
