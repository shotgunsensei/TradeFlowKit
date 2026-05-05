import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  userRecoveryCodes,
  type User,
  type InsertUser,
  type UserRecoveryCode,
} from "@shared/schema";

export const usersStorage = {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  },

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(sql`lower(${users.username}) = lower(${username})`);
    return user;
  },

  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalized = (email || "").trim().toLowerCase();
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
    const [user] = await db.insert(users).values(data).returning();
    return user;
  },

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
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
