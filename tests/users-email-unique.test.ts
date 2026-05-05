import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { storage } from "../server/storage";
import { DuplicateEmailError } from "../server/storage/users";
import { trackUser, cleanupAll } from "./helpers";
import { pool } from "../server/db";
import type { InsertUser } from "@shared/schema";

function uniq(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

function buildUser(overrides: Partial<InsertUser> = {}): InsertUser {
  return {
    username: uniq("u"),
    password: "test-hash",
    fullName: "Test User",
    phone: "",
    email: "",
    ...overrides,
  };
}

describe("Users: unique email enforcement", () => {
  afterAll(async () => {
    await cleanupAll();
    await pool.end();
  });

  it("normalizes email on createUser (trim + lowercase)", async () => {
    const email = `  ${uniq("MixedCase")}@Example.COM  `;
    const u = await storage.createUser(buildUser({ email }));
    trackUser(u.id);
    expect(u.email).toBe(email.trim().toLowerCase());
  });

  it("createUser rejects a duplicate email (case + whitespace insensitive)", async () => {
    const base = `${uniq("dup")}@example.com`;
    const a = await storage.createUser(buildUser({ email: base }));
    trackUser(a.id);

    await expect(
      storage.createUser(buildUser({ email: `  ${base.toUpperCase()}  ` })),
    ).rejects.toBeInstanceOf(DuplicateEmailError);
  });

  it("normalizes email on updateUser (trim + lowercase)", async () => {
    const u = await storage.createUser(buildUser({ email: "" }));
    trackUser(u.id);
    const raw = `  ${uniq("Updated")}@Example.COM  `;
    const updated = await storage.updateUser(u.id, { email: raw });
    expect(updated?.email).toBe(raw.trim().toLowerCase());
  });

  it("updateUser rejects setting an email already used by another account", async () => {
    const taken = `${uniq("taken")}@example.com`;
    const owner = await storage.createUser(buildUser({ email: taken }));
    trackUser(owner.id);

    const other = await storage.createUser(buildUser({ email: "" }));
    trackUser(other.id);

    await expect(
      storage.updateUser(other.id, { email: taken.toUpperCase() }),
    ).rejects.toBeInstanceOf(DuplicateEmailError);
  });

  it("allows multiple users to have empty emails", async () => {
    const a = await storage.createUser(buildUser({ email: "" }));
    trackUser(a.id);
    const b = await storage.createUser(buildUser({ email: "   " }));
    trackUser(b.id);
    expect(a.id).not.toBe(b.id);
  });
});
