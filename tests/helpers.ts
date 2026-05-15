import { storage } from "../server/storage";
import type { Org, User } from "@shared/schema";
import { randomUUID } from "crypto";

export async function createTestUser(suffix = ""): Promise<User> {
  return storage.createUser({
    username: `test_${randomUUID().slice(0, 8)}${suffix}`,
    password: "test-hash",
    fullName: "Test User",
  } as any);
}

export async function createTestOrg(plan: Org["plan"] = "free"): Promise<Org> {
  const slug = `test-${randomUUID().slice(0, 12)}`;
  const org = await storage.createOrg({
    name: `Test Org ${slug}`,
    slug,
    plan,
  } as any);
  return org;
}

export async function setupOrg(plan: Org["plan"] = "free") {
  const user = await createTestUser();
  const org = await createTestOrg(plan);
  await storage.createMembership(org.id, user.id, "owner");
  return { user, org };
}

const cleanupOrgs: string[] = [];
const cleanupUsers: string[] = [];
const cleanupStripeEvents: string[] = [];

export function trackOrg(orgId: string) {
  cleanupOrgs.push(orgId);
}
export function trackUser(userId: string) {
  cleanupUsers.push(userId);
}
export function trackStripeEvent(eventId: string) {
  cleanupStripeEvents.push(eventId);
}

export async function cleanupAll() {
  for (const id of cleanupOrgs.splice(0)) {
    try {
      await storage.deleteOrg(id);
    } catch {}
  }
  for (const id of cleanupUsers.splice(0)) {
    try {
      await storage.deleteUser(id);
    } catch {}
  }
  for (const id of cleanupStripeEvents.splice(0)) {
    try {
      await storage.deleteProcessedStripeEvent(id);
    } catch {}
  }
}
