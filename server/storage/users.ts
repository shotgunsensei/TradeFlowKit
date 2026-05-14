import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  userRecoveryCodes,
  normalizeEmail,
  type User,
  type InsertUser,
  type UserRecoveryCode,
} from "@shared/schema";

export class DuplicateEmailError extends Error {
  email: string;
  constructor(email: string) {
    super(`DUPLICATE_EMAIL: another account already uses ${email}`);
    this.name = "DuplicateEmailError";
    this.email = email;
  }
}

function isUniqueEmailViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; constraint?: string; message?: string };
  if (e.code !== "23505") return false;
  const ref = `${e.constraint || ""} ${e.message || ""}`;
  return ref.includes("users_email_unique_idx");
}

export const usersStorage = {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  },

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(sql`lower(${users.username}) = lower(${username})`);
    return user;
  },

  async getUserByOperatorosUserId(operatorosUserId: string): Promise<User | undefined> {
    if (!operatorosUserId) return undefined;
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.operatorosUserId, operatorosUserId))
      .limit(1);
    return user;
  },

  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalized = normalizeEmail(email);
    if (!normalized) return undefined;
    const matches = await db
      .select()
      .from(users)
      .where(sql`lower(trim(${users.email})) = ${normalized}`)
      .limit(2);
    if (matches.length > 1) {
      throw new Error(`AMBIGUOUS_EMAIL: multiple users share email ${normalized}`);
    }
    return matches[0];
  },

  async createUser(data: InsertUser): Promise<User> {
    const normalized = data.email == null ? data.email : normalizeEmail(data.email);
    try {
      const [user] = await db
        .insert(users)
        .values({ ...data, email: normalized as InsertUser["email"] })
        .returning();
      return user;
    } catch (err) {
      if (isUniqueEmailViolation(err)) {
        throw new DuplicateEmailError(normalizeEmail(data.email));
      }
      throw err;
    }
  },

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const next: Partial<User> = { ...data };
    if (Object.prototype.hasOwnProperty.call(data, "email")) {
      next.email = data.email == null ? data.email : normalizeEmail(data.email);
    }
    try {
      const [user] = await db.update(users).set(next).where(eq(users.id, id)).returning();
      return user;
    } catch (err) {
      if (isUniqueEmailViolation(err)) {
        throw new DuplicateEmailError(normalizeEmail(next.email as string | null | undefined));
      }
      throw err;
    }
  },

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.username));
  },

  async setUserTotpSecret(userId: string, secret: string): Promise<void> {
    await db.update(users).set({ totpSecret: secret, totpEnabledAt: null }).where(eq(users.id, userId));
  },

  async enableUserTotp(userId: string): Promise<void> {
    await db.update(users).set({ totpEnabledAt: new Date() }).where(eq(users.id, userId));
  },

  async disableUserTotp(userId: string): Promise<void> {
    await db.update(users).set({ totpSecret: null, totpEnabledAt: null }).where(eq(users.id, userId));
    await db.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, userId));
  },

  async replaceRecoveryCodes(userId: string, hashes: string[]): Promise<void> {
    await db.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, userId));
    if (hashes.length > 0) {
      await db.insert(userRecoveryCodes).values(hashes.map(codeHash => ({ userId, codeHash })));
    }
  },

  async getActiveRecoveryCodes(userId: string): Promise<UserRecoveryCode[]> {
    return db.select().from(userRecoveryCodes)
      .where(and(eq(userRecoveryCodes.userId, userId), sql`${userRecoveryCodes.usedAt} IS NULL`));
  },

  async markRecoveryCodeUsed(id: string): Promise<void> {
    await db.update(userRecoveryCodes).set({ usedAt: new Date() }).where(eq(userRecoveryCodes.id, id));
  },
};
