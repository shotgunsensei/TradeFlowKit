import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const SSO_VARS = [
  "MODULE_SSO_SECRET",
  "OPERATOROS_BASE_URL",
  "OPERATOROS_SSO_AUDIENCE",
  "OPERATOROS_SSO_ENV",
  "OPERATOROS_API_URL",
  "MODULE_SLUG",
  "APP_ENV",
];

let originalEnv: Record<string, string | undefined> = {};

beforeEach(async () => {
  originalEnv = {};
  for (const k of [...SSO_VARS, "NODE_ENV"]) originalEnv[k] = process.env[k];
  for (const k of SSO_VARS) delete process.env[k];
  // Reset the cached env between tests.
  const envMod = await import("../server/env");
  (envMod as any)._env = null;
});

afterEach(() => {
  for (const [k, v] of Object.entries(originalEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

async function loadFresh() {
  // env.ts caches via module-level state; force a fresh module instance.
  vi.resetModules();
  return await import("../server/env");
}

describe("assertSsoConfigForProduction", () => {
  it("does nothing in development even with no SSO env vars", async () => {
    process.env.NODE_ENV = "development";
    const { assertSsoConfigForProduction } = await loadFresh();
    expect(() => assertSsoConfigForProduction()).not.toThrow();
  });

  it("throws in production when MODULE_SSO_SECRET is missing", async () => {
    process.env.NODE_ENV = "production";
    process.env.OPERATOROS_BASE_URL = "https://operatoros.example.com";
    process.env.OPERATOROS_SSO_AUDIENCE = "tradeflowkit";
    process.env.OPERATOROS_SSO_ENV = "prod";
    process.env.SESSION_SECRET = "x".repeat(40);
    const { assertSsoConfigForProduction } = await loadFresh();
    expect(() => assertSsoConfigForProduction()).toThrow(/MODULE_SSO_SECRET/);
  });

  it("throws in production when OPERATOROS_BASE_URL is missing", async () => {
    process.env.NODE_ENV = "production";
    process.env.MODULE_SSO_SECRET = "x".repeat(40);
    process.env.OPERATOROS_SSO_AUDIENCE = "tradeflowkit";
    process.env.OPERATOROS_SSO_ENV = "prod";
    process.env.SESSION_SECRET = "x".repeat(40);
    const { assertSsoConfigForProduction } = await loadFresh();
    expect(() => assertSsoConfigForProduction()).toThrow(/OPERATOROS_BASE_URL/);
  });

  it("throws in production when audience is missing (no canonical or legacy)", async () => {
    process.env.NODE_ENV = "production";
    process.env.MODULE_SSO_SECRET = "x".repeat(40);
    process.env.OPERATOROS_BASE_URL = "https://operatoros.example.com";
    process.env.OPERATOROS_SSO_ENV = "prod";
    process.env.SESSION_SECRET = "x".repeat(40);
    const { assertSsoConfigForProduction } = await loadFresh();
    expect(() => assertSsoConfigForProduction()).toThrow(/OPERATOROS_SSO_AUDIENCE/);
  });

  it("accepts legacy MODULE_SLUG in place of OPERATOROS_SSO_AUDIENCE", async () => {
    process.env.NODE_ENV = "production";
    process.env.MODULE_SSO_SECRET = "x".repeat(40);
    process.env.OPERATOROS_BASE_URL = "https://operatoros.example.com";
    process.env.MODULE_SLUG = "tradeflowkit";
    process.env.OPERATOROS_SSO_ENV = "prod";
    process.env.SESSION_SECRET = "x".repeat(40);
    const { assertSsoConfigForProduction } = await loadFresh();
    expect(() => assertSsoConfigForProduction()).not.toThrow();
  });

  it("throws when MODULE_SSO_SECRET is too short", async () => {
    process.env.NODE_ENV = "production";
    process.env.MODULE_SSO_SECRET = "tooshort";
    process.env.OPERATOROS_BASE_URL = "https://operatoros.example.com";
    process.env.OPERATOROS_SSO_AUDIENCE = "tradeflowkit";
    process.env.OPERATOROS_SSO_ENV = "prod";
    process.env.SESSION_SECRET = "x".repeat(40);
    const { assertSsoConfigForProduction } = await loadFresh();
    expect(() => assertSsoConfigForProduction()).toThrow(/at least 16 characters/);
  });

  it("does not throw when all canonical SSO env vars are present in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.MODULE_SSO_SECRET = "x".repeat(40);
    process.env.OPERATOROS_BASE_URL = "https://operatoros.example.com";
    process.env.OPERATOROS_SSO_AUDIENCE = "tradeflowkit";
    process.env.OPERATOROS_SSO_ENV = "prod";
    process.env.SESSION_SECRET = "x".repeat(40);
    const { assertSsoConfigForProduction } = await loadFresh();
    expect(() => assertSsoConfigForProduction()).not.toThrow();
  });
});
