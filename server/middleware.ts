import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { resolveAccess, type FeatureKey } from "@shared/entitlements";
import bcrypt from "bcrypt";
import crypto from "crypto";

export const BCRYPT_ROUNDS = 12;

function isLegacyHash(hash: string): boolean {
  return /^[0-9a-f]{64}$/.test(hash);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (isLegacyHash(storedHash)) {
    const sha256 = crypto.createHash("sha256").update(password).digest("hex");
    return sha256 === storedHash;
  }
  return bcrypt.compare(password, storedHash);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).send("Unauthorized");
  }
  next();
}

export async function requireOrg(req: Request, res: Response, next: NextFunction) {
  if (!req.session.orgId) {
    return res.status(400).send("No organization selected");
  }
  // SECURITY: Hard-deny any session whose tenant snapshot revokes access. This
  // catches `tenant_inactive`, `user_disabled`, and `no_module_role` so a
  // logged-in user can't continue hitting the API after the OperatorOS hub
  // strips their access. Non-linked orgs are unaffected because resolveAccess
  // only returns these denial reasons for linked tenants.
  if (req.session.userId) {
    let org: Awaited<ReturnType<typeof storage.getOrg>> | undefined;
    let membership: Awaited<ReturnType<typeof storage.getMembership>> | undefined;
    let lookupFailed = false;
    try {
      [org, membership] = await Promise.all([
        storage.getOrg(req.session.orgId),
        storage.getMembership(req.session.orgId, req.session.userId),
      ]);
    } catch {
      lookupFailed = true;
    }
    const { isLinkedOrg } = await import("@shared/entitlements");
    // SECURITY: When the org IS known to be linked, never let a storage hiccup
    // (or a missing membership lookup) silently allow the request through —
    // respond 503 so the client retries instead of bypassing entitlement
    // enforcement. When the org is non-linked OR we couldn't read the org at
    // all (so we have no signal it's linked), fall through and let
    // downstream gates handle it. This is the narrowest fail-closed window
    // we can implement without breaking legacy non-linked flows.
    if (isLinkedOrg(org)) {
      if (lookupFailed) {
        return res.status(503).json({ error: "entitlement_lookup_failed" });
      }
      const access = resolveAccess(org!, membership ?? null);
      if (!access.allowed) {
        return res.status(403).json({
          error: "access_denied",
          reason: access.reason,
          linked: true,
        });
      }
    }
  }
  next();
}

export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).send("Unauthorized");
  }
  const user = await storage.getUser(req.session.userId);
  if (!user?.isSuperAdmin) {
    return res.status(403).send("Forbidden: Super admin access required");
  }
  next();
}

/**
 * Resolve the effective access for an org without requiring a specific user.
 * Used by limit checks that don't care about role (the org snapshot alone is
 * the authority for tenant-level limits).
 */
async function tenantOnlyAccess(orgId: string) {
  const org = await storage.getOrg(orgId);
  if (!org) return null;
  // SECURITY INVARIANT: a missing membership must NOT widen the tenant
  // entitlement. We pass a synthetic "fully allowed" stub here purely so
  // resolveAccess can return the tenant features/limits — we never use the
  // `allowed` field from this call site. Real per-user checks go through
  // requireFeature / requireOrgRole below.
  const synthetic: Parameters<typeof resolveAccess>[1] = {
    role: "owner",
    moduleRole: "module_admin",
    enabled: true,
    userEntitlementSnapshot: null,
  };
  return { org, access: resolveAccess(org, synthetic) };
}

export async function checkPlanLimit(
  orgId: string,
  resource: "customers" | "jobs" | "quotes" | "invoices"
): Promise<{ allowed: boolean; limit: number; current: number }> {
  const ctx = await tenantOnlyAccess(orgId);
  if (!ctx) return { allowed: false, limit: 0, current: 0 };
  const maxAllowed = ctx.access.limits[resource];
  if (maxAllowed === -1) return { allowed: true, limit: -1, current: 0 };
  const counts = await storage.getOrgCounts(orgId);
  const current = counts[resource];
  return { allowed: current < maxAllowed, limit: maxAllowed, current };
}

export async function checkTeamLimit(
  orgId: string
): Promise<{ allowed: boolean; limit: number; current: number; canInvite: boolean }> {
  const ctx = await tenantOnlyAccess(orgId);
  if (!ctx) return { allowed: false, limit: 0, current: 0, canInvite: false };
  const { limits } = ctx.access;
  if (!limits.canInvite) return { allowed: false, limit: limits.teamMembers, current: 0, canInvite: false };
  if (limits.teamMembers === -1) return { allowed: true, limit: -1, current: 0, canInvite: true };
  const counts = await storage.getOrgCounts(orgId);
  return {
    allowed: counts.members < limits.teamMembers,
    limit: limits.teamMembers,
    current: counts.members,
    canInvite: true,
  };
}

/**
 * Resolve the full access for the currently signed-in user on the active org.
 * Honours both the tenant entitlement snapshot and the user entitlement
 * snapshot (linked orgs) or the legacy `org.plan` model (non-linked orgs).
 */
export async function resolveRequestAccess(req: Request) {
  if (!req.session.orgId || !req.session.userId) return null;
  const [org, membership] = await Promise.all([
    storage.getOrg(req.session.orgId),
    storage.getMembership(req.session.orgId, req.session.userId),
  ]);
  if (!org) return null;
  return { org, membership: membership ?? null, access: resolveAccess(org, membership ?? null) };
}

/** Express middleware: require one of the resolved org roles. */
export function requireOrgRole(...allowedRoles: Array<"owner" | "admin" | "tech" | "viewer">) {
  return async function (req: Request, res: Response, next: NextFunction) {
    const ctx = await resolveRequestAccess(req);
    if (!ctx) return res.status(401).json({ error: "unauthorized" });
    if (!ctx.access.allowed) {
      return res.status(403).json({
        error: "access_denied",
        reason: ctx.access.reason,
        linked: ctx.access.linked,
      });
    }
    if (!allowedRoles.includes(ctx.access.effectiveRole)) {
      return res.status(403).json({
        error: "insufficient_permissions",
        message: "Owner or admin access is required for this action.",
      });
    }
    next();
  };
}

/** Express middleware: require a specific feature on the active org. */
export function requireFeature(feature: FeatureKey) {
  return async function (req: Request, res: Response, next: NextFunction) {
    const ctx = await resolveRequestAccess(req);
    if (!ctx) return res.status(401).send("Unauthorized");
    if (!ctx.access.allowed) {
      return res.status(403).json({
        error: "access_denied",
        reason: ctx.access.reason,
        linked: ctx.access.linked,
      });
    }
    if (!ctx.access.features[feature]) {
      return res.status(403).json({
        error: "feature_not_in_plan",
        feature,
        linked: ctx.access.linked,
        planSlug: ctx.access.planSlug,
      });
    }
    next();
  };
}
