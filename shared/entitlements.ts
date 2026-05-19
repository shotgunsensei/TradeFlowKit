import { z } from "zod";
import { PLAN_LIMITS } from "./schema";
import type { Org, Membership } from "./schema";

/**
 * Canonical feature keys understood by TradeFlowKit. The entitlement snapshot
 * persisted on `orgs` is authoritative for tenant access; the snapshot on
 * `memberships` is authoritative for per-user access. The final auth check is
 * always `tenant_has_feature AND user_has_permission`.
 *
 * SECURITY INVARIANT: never derive a tenant-level feature from a member
 * snapshot. Members can only narrow, never widen, what a tenant has paid for.
 */
export const FEATURE_KEYS = [
  "automations",
  "recurring_jobs",
  "analytics",
  "team_invites",
  "unlimited_entities",
  "call_recovery",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const TenantLimitsSchema = z
  .object({
    customers: z.number().int(),
    jobs: z.number().int(),
    quotes: z.number().int(),
    invoices: z.number().int(),
    teamMembers: z.number().int(),
  })
  .partial()
  .default({});

export const TenantFeaturesSchema = z.record(
  z.enum(FEATURE_KEYS),
  z.boolean(),
).default({});

/**
 * Snapshot stored on `orgs.entitlementSnapshot`. Refreshed by the OperatorOS
 * sync endpoint (push) and never by an SSO login. SSO logins must NOT write
 * tenant fields — only the corresponding `memberships.userEntitlementSnapshot`.
 */
export const TenantEntitlementSnapshotSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  tenantId: z.string().min(1),
  planSlug: z.string().nullable().optional(),
  subscriptionStatus: z.string().nullable().optional(),
  accessLevel: z.string().nullable().optional(),
  features: TenantFeaturesSchema,
  limits: TenantLimitsSchema,
  syncedAt: z.string().datetime().optional(),
});
export type TenantEntitlementSnapshot = z.infer<typeof TenantEntitlementSnapshotSchema>;

export const MODULE_ROLES = ["module_admin", "module_user", "viewer", "none"] as const;
export type ModuleRole = (typeof MODULE_ROLES)[number];

export const UserEntitlementSnapshotSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  operatorosUserId: z.string().min(1),
  tenantRole: z.string().nullable().optional(),
  moduleRole: z.enum(MODULE_ROLES).default("module_user"),
  enabled: z.boolean().default(true),
  permissions: z.array(z.string()).default([]),
  syncedAt: z.string().datetime().optional(),
});
export type UserEntitlementSnapshot = z.infer<typeof UserEntitlementSnapshotSchema>;

/** Live tenant subscription states that grant access. */
const ACTIVE_TENANT_STATUSES = new Set(["active", "trialing", "grace", "past_due_grace"]);

/**
 * Map an OperatorOS planSlug into a default feature/limit bundle. Used both
 * as a fallback when the hub does not supply a full feature list AND when
 * SSO logins arrive before the first push-sync.
 */
export function deriveDefaultsFromPlanSlug(
  planSlug: string | null | undefined,
): { features: Partial<Record<FeatureKey, boolean>>; limits: Partial<Record<keyof typeof PLAN_LIMITS.free, number>> } {
  switch ((planSlug ?? "").toLowerCase()) {
    case "elite":
      return {
        features: {
          automations: true,
          recurring_jobs: true,
          analytics: true,
          team_invites: true,
          unlimited_entities: true,
          call_recovery: true,
        },
        limits: { customers: -1, jobs: -1, quotes: -1, invoices: -1, teamMembers: -1 },
      };
    case "pro":
      return {
        features: {
          automations: true,
          recurring_jobs: true,
          analytics: true,
          team_invites: true,
          unlimited_entities: true,
          call_recovery: false,
        },
        limits: { customers: -1, jobs: -1, quotes: -1, invoices: -1, teamMembers: 25 },
      };
    case "starter":
      return {
        features: {
          automations: false,
          recurring_jobs: false,
          analytics: true,
          team_invites: false,
          unlimited_entities: true,
          call_recovery: false,
        },
        limits: { customers: -1, jobs: -1, quotes: -1, invoices: -1, teamMembers: 1 },
      };
    default:
      return {
        features: {
          automations: false,
          recurring_jobs: false,
          analytics: true,
          team_invites: false,
          unlimited_entities: false,
          call_recovery: false,
        },
        limits: { customers: 5, jobs: 5, quotes: 5, invoices: 5, teamMembers: 1 },
      };
  }
}

/** Map an OperatorOS moduleRole to a TradeFlowKit membership role (never owner). */
export function mapModuleRoleToMembershipRole(
  role: string | null | undefined,
): "admin" | "tech" | "viewer" {
  switch ((role ?? "").toLowerCase()) {
    case "module_admin":
    case "admin":
    case "owner":
      return "admin";
    case "viewer":
    case "readonly":
    case "read":
      return "viewer";
    default:
      return "tech";
  }
}

export type AccessSource = "operatoros" | "legacy";
export type DenyReason =
  | "not_a_member"
  | "tenant_inactive"
  | "user_disabled"
  | "no_module_role"
  | "feature_not_in_plan"
  | "plan_limit_reached";

export interface ResolvedAccess {
  source: AccessSource;
  /** True if this org is linked to an OperatorOS tenant. */
  linked: boolean;
  /** True if the user/tenant pair is allowed to launch the app at all. */
  allowed: boolean;
  reason?: DenyReason;
  planSlug: string | null;
  subscriptionStatus: string | null;
  features: Record<FeatureKey, boolean>;
  limits: { customers: number; jobs: number; quotes: number; invoices: number; teamMembers: number; canInvite: boolean };
  /** Effective TradeFlowKit role after mapping/clamping. */
  effectiveRole: "owner" | "admin" | "tech" | "viewer";
}

function legacyLimitsFor(plan: string) {
  const l = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  return { ...l };
}

function legacyFeaturesFor(plan: string): Record<FeatureKey, boolean> {
  const isSB = plan === "small_business" || plan === "enterprise";
  return {
    automations: isSB,
    recurring_jobs: isSB,
    analytics: true,
    team_invites: PLAN_LIMITS[plan]?.canInvite ?? false,
    unlimited_entities: plan !== "free",
    call_recovery: false,
  };
}

function defaultFeatureMap(): Record<FeatureKey, boolean> {
  return FEATURE_KEYS.reduce((acc, k) => {
    acc[k] = false;
    return acc;
  }, {} as Record<FeatureKey, boolean>);
}

/**
 * The single chokepoint that every plan/feature gate must consult. Returns a
 * fully-resolved access decision; callers MUST NOT poke at snapshots
 * directly.
 *
 * - Linked orgs (org.operatorosTenantId set) defer to the OperatorOS
 *   snapshots. The tenant snapshot supplies features/limits; the user
 *   snapshot supplies role/permissions; both must agree for access.
 * - Non-linked orgs fall back to the legacy `org.plan` + `PLAN_LIMITS` model.
 */
export function resolveAccess(
  org: Pick<
    Org,
    | "plan"
    | "operatorosTenantId"
    | "operatorosPlanSlug"
    | "operatorosSubscriptionStatus"
    | "operatorosAccessLevel"
    | "entitlementSnapshot"
  > | null | undefined,
  membership: Pick<Membership, "role" | "moduleRole" | "enabled" | "userEntitlementSnapshot"> | null | undefined,
): ResolvedAccess {
  if (!org) {
    return {
      source: "legacy",
      linked: false,
      allowed: false,
      reason: "not_a_member",
      planSlug: null,
      subscriptionStatus: null,
      features: defaultFeatureMap(),
      limits: { ...PLAN_LIMITS.free },
      effectiveRole: "viewer",
    };
  }

  // Linked path: OperatorOS is authoritative.
  if (org.operatorosTenantId) {
    const tenantSnap = TenantEntitlementSnapshotSchema.safeParse(org.entitlementSnapshot);
    const fallback = deriveDefaultsFromPlanSlug(org.operatorosPlanSlug);
    const features = defaultFeatureMap();
    if (tenantSnap.success) {
      for (const k of FEATURE_KEYS) {
        const v = tenantSnap.data.features?.[k];
        features[k] = v ?? fallback.features[k] ?? false;
      }
    } else {
      for (const k of FEATURE_KEYS) features[k] = fallback.features[k] ?? false;
    }

    const limitSrc = tenantSnap.success ? { ...fallback.limits, ...tenantSnap.data.limits } : fallback.limits;
    const limits = {
      customers: limitSrc.customers ?? -1,
      jobs: limitSrc.jobs ?? -1,
      quotes: limitSrc.quotes ?? -1,
      invoices: limitSrc.invoices ?? -1,
      teamMembers: limitSrc.teamMembers ?? -1,
      canInvite: features.team_invites,
    };

    const subStatus = org.operatorosSubscriptionStatus ?? null;
    const planSlug = org.operatorosPlanSlug ?? null;

    if (!membership) {
      return {
        source: "operatoros",
        linked: true,
        allowed: false,
        reason: "not_a_member",
        planSlug,
        subscriptionStatus: subStatus,
        features,
        limits,
        effectiveRole: "viewer",
      };
    }

    const userSnap = UserEntitlementSnapshotSchema.safeParse(membership.userEntitlementSnapshot);
    const moduleRole = (userSnap.success ? userSnap.data.moduleRole : (membership.moduleRole as ModuleRole | null)) ?? "module_user";
    const enabled = userSnap.success ? userSnap.data.enabled : membership.enabled !== false;

    // Tenant must be in a live state.
    if (subStatus && !ACTIVE_TENANT_STATUSES.has(subStatus.toLowerCase())) {
      return {
        source: "operatoros",
        linked: true,
        allowed: false,
        reason: "tenant_inactive",
        planSlug,
        subscriptionStatus: subStatus,
        features,
        limits,
        effectiveRole: mapModuleRoleToMembershipRole(moduleRole),
      };
    }

    if (!enabled) {
      return {
        source: "operatoros",
        linked: true,
        allowed: false,
        reason: "user_disabled",
        planSlug,
        subscriptionStatus: subStatus,
        features,
        limits,
        effectiveRole: mapModuleRoleToMembershipRole(moduleRole),
      };
    }

    if (moduleRole === "none") {
      return {
        source: "operatoros",
        linked: true,
        allowed: false,
        reason: "no_module_role",
        planSlug,
        subscriptionStatus: subStatus,
        features,
        limits,
        effectiveRole: "viewer",
      };
    }

    // Owners in the local DB keep "owner" privileges for org admin ops, but
    // for permission checks we clamp at admin (OperatorOS never mints owners).
    const localRole = membership.role;
    const mapped = mapModuleRoleToMembershipRole(moduleRole);
    const effectiveRole: ResolvedAccess["effectiveRole"] = localRole === "owner" ? "owner" : mapped;

    return {
      source: "operatoros",
      linked: true,
      allowed: true,
      planSlug,
      subscriptionStatus: subStatus,
      features,
      limits,
      effectiveRole,
    };
  }

  // Legacy path: plan-driven.
  const plan = org.plan || "free";
  const limits = { ...legacyLimitsFor(plan) };
  const features = legacyFeaturesFor(plan);
  if (!membership) {
    return {
      source: "legacy",
      linked: false,
      allowed: false,
      reason: "not_a_member",
      planSlug: plan,
      subscriptionStatus: null,
      features,
      limits,
      effectiveRole: "viewer",
    };
  }
  return {
    source: "legacy",
    linked: false,
    allowed: true,
    planSlug: plan,
    subscriptionStatus: null,
    features,
    limits,
    effectiveRole: (membership.role as ResolvedAccess["effectiveRole"]) || "tech",
  };
}

/** Convenience: does the resolved access grant a specific feature? */
export function hasFeature(access: ResolvedAccess, feature: FeatureKey): boolean {
  return access.allowed && access.features[feature] === true;
}

/**
 * Map an OperatorOS planSlug onto its TradeFlowKit legacy-plan equivalent.
 * Used by feature gates that haven't been migrated to dedicated FEATURE_KEYS
 * yet — for linked orgs the local `org.plan` is meaningless, so callers must
 * use this mapping instead of reading `org.plan` directly. Non-linked orgs
 * keep their existing `org.plan`.
 */
export function effectivePlanFor(
  org: Pick<Org, "plan" | "operatorosTenantId" | "operatorosPlanSlug">,
): string {
  if (!org.operatorosTenantId) return org.plan || "free";
  switch ((org.operatorosPlanSlug ?? "").toLowerCase()) {
    case "elite":
      return "enterprise";
    case "pro":
      return "small_business";
    case "starter":
      return "individual";
    default:
      return "free";
  }
}
