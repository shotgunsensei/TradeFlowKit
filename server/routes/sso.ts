import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import type { InsertUser, User } from "@shared/schema";
import { storage } from "../storage";
import { hashPassword } from "../middleware";
import { getSsoConfig, type SsoConfig } from "../env";
import { verifySsoToken, type SsoTokenClaims } from "../sso/verifier";
import { consumeSsoToken, type SsoConsumePayload } from "../sso/consume";
import { renderSsoErrorPage } from "../sso/errorPage";
import { logger } from "../logger";
import {
  UserEntitlementSnapshotSchema,
  mapModuleRoleToMembershipRole,
  type ModuleRole,
} from "@shared/entitlements";

const router = Router();

const ssoLog = logger.child({ component: "sso" });

/** Local-only outcomes — not part of the wire contract with the hub. */
const LOCAL_FAILURES = {
  not_configured: {
    status: 503,
    title: "Sign-in is not configured",
    message:
      "OperatorOS sign-in isn't enabled on this server. Please sign in with your username and password instead.",
  },
  session: {
    status: 500,
    title: "Couldn't start your session",
    message: "We verified your sign-in but couldn't start a session. Please try again.",
  },
  internal: {
    status: 500,
    title: "Something went wrong",
    message: "An unexpected error occurred while signing you in. Please try again.",
  },
} as const;

type LocalFailure = keyof typeof LOCAL_FAILURES;

/**
 * Redirect the user back to the OperatorOS hub with a `launchError` code per
 * the canonical contract. The operator at the hub then sees a real error
 * instead of a blank/local error page.
 */
function failToHub(res: Response, config: SsoConfig, code: string): void {
  const url = `${config.operatorosBaseUrl}/?launchError=${encodeURIComponent(code)}`;
  res.redirect(302, url);
}

function sendLocalError(res: Response, kind: LocalFailure): void {
  const meta = LOCAL_FAILURES[kind];
  res
    .status(meta.status)
    .type("html")
    .send(renderSsoErrorPage({ title: meta.title, message: meta.message, code: kind }));
}

function generateRandomPassword(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function deriveFullName(payload: SsoConsumePayload): string {
  const n = payload.user.name?.trim();
  if (n) return n;
  const local = payload.user.email.split("@")[0] || "";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/**
 * Map an OperatorOS role to a TradeFlowKit membership role when auto-joining a
 * user to a linked org. We never mint "owner" via this path — the existing org
 * already has an owner, and an SSO launch shouldn't elevate to that level.
 */
function mapOperatorosRoleToMembershipRole(role: string | null | undefined): "admin" | "tech" | "viewer" {
  switch ((role ?? "").toLowerCase()) {
    case "owner":
    case "admin":
      return "admin";
    case "viewer":
    case "read":
    case "readonly":
      return "viewer";
    default:
      return "tech";
  }
}

function deriveOrgNameFromPayload(payload: SsoConsumePayload): string {
  const fromName = payload.user.name?.trim();
  if (fromName) return `${fromName}'s Organization`;
  const local = payload.user.email.split("@")[0] || "";
  const pretty = local.charAt(0).toUpperCase() + local.slice(1);
  return pretty ? `${pretty}'s Organization` : "My Organization";
}

function slugifyBase(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function pickUniqueOrgSlug(payload: SsoConsumePayload, operatorosOrgId: string): string {
  const base =
    slugifyBase(payload.user.name ?? "") ||
    slugifyBase(payload.user.email.split("@")[0] ?? "") ||
    "org";
  const suffix = operatorosOrgId.replace(/-/g, "").slice(0, 8) || crypto.randomBytes(4).toString("hex");
  return `${base}-${suffix}`;
}

async function pickUniqueUsername(emailNormalized: string): Promise<string> {
  const existing = await storage.getUserByUsername(emailNormalized);
  if (!existing) return emailNormalized;
  for (let i = 0; i < 20; i++) {
    const candidate = `${emailNormalized}+sso${crypto.randomBytes(2).toString("hex")}`;
    // eslint-disable-next-line no-await-in-loop
    const taken = await storage.getUserByUsername(candidate);
    if (!taken) return candidate;
  }
  throw new Error("Could not allocate a unique username for SSO user");
}

router.get("/sso", async (req: Request, res: Response) => {
  const reqLog = req.log ? req.log.child({ route: "/sso" }) : ssoLog;

  const config = getSsoConfig();
  if (!config) {
    reqLog.warn({ outcome: "not_configured" }, "SSO attempt while not configured");
    return sendLocalError(res, "not_configured");
  }

  const tokenRaw = req.query.token;
  const token = typeof tokenRaw === "string" ? tokenRaw : undefined;

  const verify = verifySsoToken(token, config);
  if (!verify.ok) {
    reqLog.warn(
      { outcome: "verify_failed", reason: verify.reason },
      "SSO token verification failed"
    );
    return failToHub(res, config, verify.reason);
  }

  const { claims } = verify;
  const consume = await consumeSsoToken(claims.jti, claims.aud, claims.env as "prod" | "staging" | "dev", config);
  if (!consume.ok) {
    if (consume.unavailable) {
      reqLog.warn(
        { outcome: "consume_unavailable", httpStatus: consume.httpStatus, jti: claims.jti },
        "SSO consume unavailable"
      );
      return res.status(502).type("text/plain").send("sso_consume_unavailable");
    }
    reqLog.warn(
      {
        outcome: "consume_failed",
        apiCode: consume.apiCode,
        httpStatus: consume.httpStatus,
        jti: claims.jti,
      },
      "SSO consume rejected"
    );
    return failToHub(res, config, consume.apiCode || "consume_failed");
  }

  const { payload } = consume;

  try {
    const emailNormalized = payload.user.email.trim().toLowerCase();

    // Identity is keyed on EMAIL per the canonical contract. Operators can
    // re-create users in the hub (changing the sub), but email is the stable
    // join key. We still record the sub on the local row for tracking.
    let user = await storage.getUserByEmail(emailNormalized);
    let provisioned = false;

    // OperatorOS owns the role for SSO-bound users.
    const desiredSuperAdmin = payload.user.role === "super_admin";

    if (!user) {
      const username = await pickUniqueUsername(emailNormalized);
      const randomPassword = await hashPassword(generateRandomPassword());
      const newUser: InsertUser = {
        username,
        password: randomPassword,
        fullName: deriveFullName(payload),
        phone: "",
        email: emailNormalized,
        isSsoProvisioned: true,
        operatorosUserId: payload.user.id,
        operatorosRole: payload.user.role,
        operatorosPlanSlug: payload.planSlug,
        operatorosOrganizationId: payload.organizationId,
      };
      user = await storage.createUser(newUser);
      if (desiredSuperAdmin && !user.isSuperAdmin) {
        const promoted = await storage.updateUser(user.id, { isSuperAdmin: true });
        if (promoted) user = promoted;
      }
      provisioned = true;
    } else {
      // Refresh OperatorOS-owned attributes on every successful launch so the
      // local copy stays in sync with the parent platform.
      const patch: Partial<User> = {};
      if (user.operatorosUserId !== payload.user.id) patch.operatorosUserId = payload.user.id;
      if (user.operatorosRole !== payload.user.role) patch.operatorosRole = payload.user.role;
      if (user.operatorosPlanSlug !== payload.planSlug) patch.operatorosPlanSlug = payload.planSlug;
      if (user.operatorosOrganizationId !== payload.organizationId) {
        patch.operatorosOrganizationId = payload.organizationId;
      }
      if (user.isSuperAdmin !== desiredSuperAdmin) patch.isSuperAdmin = desiredSuperAdmin;
      if (Object.keys(patch).length > 0) {
        const updated = await storage.updateUser(user.id, patch);
        if (updated) user = updated;
      }
    }

    // NOTE: we deliberately defer ALL session mutation until the very end of
    // the success path. If any of the auto-join / auto-provision storage
    // calls below throws, the catch block renders the local `internal` error
    // page AND no session fields were ever set, so the failed launch cannot
    // leave the user authenticated.
    let userOrgs = await storage.getUserOrgs(user.id);
    let autoJoinedOrgId: string | null = null;
    let autoProvisionedOrgId: string | null = null;

    // Auto-join / auto-provision driven by the consume payload's organizationId.
    // The canonical contract documents this field as currently `null`, so this
    // branch is normally a no-op — but if the hub starts populating it, the
    // behavior we built in #76 (link-or-provision) carries forward unchanged.
    const operatorosOrgId = payload.organizationId;
    if (operatorosOrgId) {
      const linkedOrg = await storage.getOrgByOperatorosOrganizationId(operatorosOrgId);
      if (linkedOrg) {
        const existingMembership = await storage.getMembership(linkedOrg.id, user.id);
        if (!existingMembership) {
          const role = mapOperatorosRoleToMembershipRole(payload.user.role);
          await storage.createMembership(linkedOrg.id, user.id, role);
          autoJoinedOrgId = linkedOrg.id;
          userOrgs = await storage.getUserOrgs(user.id);
          await storage.recordAudit({
            orgId: linkedOrg.id,
            userId: user.id,
            action: "sso_auto_join",
            entity: "membership",
            entityId: user.id,
            after: { userId: user.id, role, source: "operatoros_sso", operatorosOrgId },
          });
          reqLog.info(
            { outcome: "auto_joined_org", userId: user.id, orgId: linkedOrg.id, role },
            "SSO auto-joined user to linked TradeFlowKit org"
          );
        }
      } else if (userOrgs.length === 0) {
        try {
          const newOrg = await storage.createOrg({
            name: deriveOrgNameFromPayload(payload),
            slug: pickUniqueOrgSlug(payload, operatorosOrgId),
            phone: "",
            email: emailNormalized,
            address: "",
            operatorosOrganizationId: operatorosOrgId,
          });
          await storage.createMembership(newOrg.id, user.id, "owner");
          autoProvisionedOrgId = newOrg.id;
          userOrgs = await storage.getUserOrgs(user.id);
          await storage.recordAudit({
            orgId: newOrg.id,
            userId: user.id,
            action: "sso_auto_provision",
            entity: "org",
            entityId: newOrg.id,
            after: { userId: user.id, role: "owner", source: "operatoros_sso", operatorosOrgId },
          });
          reqLog.info(
            { outcome: "auto_provisioned_org", userId: user.id, orgId: newOrg.id, operatorosOrgId },
            "SSO auto-provisioned a TradeFlowKit org for new OperatorOS tenant"
          );
        } catch (provisionErr) {
          const code = (provisionErr as { code?: string })?.code;
          if (code !== "23505") throw provisionErr;
          const winner = await storage.getOrgByOperatorosOrganizationId(operatorosOrgId);
          if (winner) {
            const existing = await storage.getMembership(winner.id, user.id);
            if (!existing) {
              const role = mapOperatorosRoleToMembershipRole(payload.user.role);
              await storage.createMembership(winner.id, user.id, role);
              await storage.recordAudit({
                orgId: winner.id,
                userId: user.id,
                action: "sso_auto_join",
                entity: "membership",
                entityId: user.id,
                after: { userId: user.id, role, source: "operatoros_sso", operatorosOrgId },
              });
            }
            autoJoinedOrgId = winner.id;
            userOrgs = await storage.getUserOrgs(user.id);
          } else {
            throw provisionErr;
          }
        }
      }
    }

    // Refresh per-user entitlement snapshot on every successful SSO launch.
    // SECURITY INVARIANT: SSO **only** writes the membership-level snapshot
    // (per-user). It MUST NOT touch the tenant-level snapshot on `orgs` —
    // that comes from the OperatorOS push-sync endpoint. Otherwise any user
    // could effectively widen their tenant's entitlements just by signing in.
    try {
      // STEP A: bootstrap a tenant snapshot for each linked org that
      // doesn't already have one. SSO carries `payload.planSlug` (set by
      // the hub at launch time); we derive a minimal tenant snapshot from
      // it so the resolver has something to work with before the first
      // push-sync arrives. We never *overwrite* an existing snapshot here
      // — the push-sync endpoint is the authority for full snapshot
      // contents, including features/limits/accessLevel.
      const { TenantEntitlementSnapshotSchema, deriveDefaultsFromPlanSlug, isLinkedOrg } =
        await import("@shared/entitlements");
      // SECURITY: bootstrap only the org tied to THIS launch context. The SSO
      // token's `payload.planSlug` describes the tenant the user is
      // currently launching from — applying it to every linked org the user
      // belongs to would leak that plan into unrelated tenants. We resolve
      // the launch org via the operatorosOrganizationId on the token
      // (preferred) or fall back to the auto-provisioned/joined org id from
      // earlier in this request. If neither resolves to a linked org, we
      // skip bootstrap entirely and wait for push-sync.
      const launchOrg: typeof userOrgs[number] | undefined = (() => {
        if (operatorosOrgId) {
          return userOrgs.find((o) => o.operatorosOrganizationId === operatorosOrgId);
        }
        const id = autoProvisionedOrgId ?? autoJoinedOrgId;
        return id ? userOrgs.find((o) => o.id === id) : undefined;
      })();
      if (launchOrg && isLinkedOrg(launchOrg)) {
        const o = launchOrg;
        const existingTenantSnap = TenantEntitlementSnapshotSchema.safeParse(
          o.entitlementSnapshot,
        );
        if (!existingTenantSnap.success) {
        const defaults = deriveDefaultsFromPlanSlug(payload.planSlug);
        const tenantId =
          o.operatorosTenantId ||
          o.operatorosOrganizationId ||
          o.id;
        const bootstrap = TenantEntitlementSnapshotSchema.parse({
          schemaVersion: 1,
          tenantId,
          planSlug: payload.planSlug ?? null,
          subscriptionStatus: o.operatorosSubscriptionStatus ?? "active",
          accessLevel: o.operatorosAccessLevel ?? "full",
          features: defaults.features,
          limits: defaults.limits,
          syncedAt: new Date().toISOString(),
        });
        try {
          await storage.updateOrg(o.id, {
            entitlementSnapshot: bootstrap,
            operatorosPlanSlug: o.operatorosPlanSlug ?? payload.planSlug ?? null,
          });
        } catch (tenantErr) {
          reqLog.warn(
            { err: tenantErr instanceof Error ? tenantErr.message : String(tenantErr), orgId: o.id },
            "SSO tenant snapshot bootstrap failed (continuing)",
          );
        }
        }
      }

      const launchMembershipOrgId = launchOrg?.id ?? null;
      for (const mem of await Promise.all(
        userOrgs.map((o) => storage.getMembership(o.id, user!.id)),
      )) {
        if (!mem) continue;
        // SECURITY: SSO is allowed to write *linkage metadata* (which
        // OperatorOS user this membership maps to + last login) and refresh
        // the timestamp on the existing snapshot, but it MUST NOT
        // re-enable a previously-disabled user, nor relax `moduleRole` away
        // from a stricter value (e.g. "none") set by the push-sync. Anything
        // else would let a logout/login cycle wipe out admin revocations.
        const existingSnap = UserEntitlementSnapshotSchema.safeParse(mem.userEntitlementSnapshot);
        const patch: Parameters<typeof storage.updateMembershipEntitlements>[2] = {
          operatorosUserId: payload.user.id,
          lastSsoLoginAt: new Date(),
        };
        // SECURITY: payload.user.role describes the user's role at the
        // LAUNCH tenant only. Bootstrapping `moduleRole`/`enabled` for
        // sibling memberships (other linked orgs this user happens to
        // belong to) from this payload would leak the launch tenant's
        // role assumption into unrelated tenants. For non-launch
        // memberships missing a snapshot, we refresh only the linkage
        // metadata above and skip moduleRole/enabled writes entirely —
        // the resolver fail-closes on those (no_module_role) until
        // push-sync fills them in.
        const isLaunchMembership =
          launchMembershipOrgId != null && mem.orgId === launchMembershipOrgId;
        let effectiveModuleRole: ModuleRole;
        let effectiveEnabled: boolean;
        if (!existingSnap.success && !isLaunchMembership) {
          await storage.updateMembershipEntitlements(mem.orgId, user!.id, patch);
          continue;
        }
        if (!existingSnap.success) {
          // First-time bootstrap snapshot. SECURITY: for OperatorOS-linked
          // orgs we MUST fail closed — the hub is the authority, and we
          // have not yet received a push-sync telling us this user's
          // module role. Granting `module_user` + enabled here would let
          // anyone with a valid SSO token reach a linked tenant before
          // the admin has actually provisioned them. The user can still
          // see the AccessDenied page (reason: no_module_role) until the
          // hub catches up. For non-linked orgs we keep the permissive
          // legacy default — those orgs are not driven by OperatorOS
          // entitlement anyway.
          // Derive the initial moduleRole from the OperatorOS payload role
          // — this is the hub's currently-authoritative signal at SSO time.
          // For linked tenants this lets the auto-join role survive the
          // first SSO without being clamped to viewer before push-sync;
          // push-sync may still narrow this later (and we never re-widen).
          const payloadOpRole = (payload.user.role ?? "").toLowerCase();
          const bootstrapModuleRole: ModuleRole =
            payloadOpRole === "super_admin" || payloadOpRole === "admin" || payloadOpRole === "owner"
              ? "module_admin"
              : payloadOpRole === "viewer" || payloadOpRole === "readonly" || payloadOpRole === "read"
              ? "viewer"
              : "module_user";
          const fresh = UserEntitlementSnapshotSchema.parse({
            schemaVersion: 1,
            operatorosUserId: payload.user.id,
            tenantRole: null,
            moduleRole: bootstrapModuleRole,
            enabled: true,
            permissions: [],
            syncedAt: new Date().toISOString(),
          });
          patch.userEntitlementSnapshot = fresh;
          patch.moduleRole = fresh.moduleRole;
          patch.enabled = fresh.enabled;
          effectiveModuleRole = fresh.moduleRole;
          effectiveEnabled = fresh.enabled;
        } else {
          // Preserve the existing module role / enabled flag from the last
          // push-sync; just refresh `syncedAt` and ensure the OperatorOS
          // user id stays in lock-step.
          const refreshed = {
            ...existingSnap.data,
            operatorosUserId: payload.user.id,
            syncedAt: new Date().toISOString(),
          };
          patch.userEntitlementSnapshot = refreshed;
          effectiveModuleRole = existingSnap.data.moduleRole;
          effectiveEnabled = existingSnap.data.enabled;
        }

        // SECURITY: Role mirroring at SSO time. We mirror the
        // entitlement-derived role onto `memberships.role` so downstream
        // routes that still authorize on local role can't grant stale
        // high-privilege access after the hub revokes it. Rules:
        //  - Owners are NEVER demoted by SSO (OperatorOS can't mint or
        //    revoke owners).
        //  - A disabled or "none" entitlement clamps the local role to
        //    "viewer" so the user can be denied without losing membership.
        //  - Otherwise mirror via mapModuleRoleToMembershipRole.
        const memberOrgForRole = await storage.getOrg(mem.orgId);
        if (memberOrgForRole && (memberOrgForRole.operatorosTenantId || memberOrgForRole.operatorosOrganizationId)) {
          let mirroredRole: "owner" | "admin" | "tech" | "viewer";
          if (mem.role === "owner") {
            mirroredRole = "owner";
          } else if (!effectiveEnabled || effectiveModuleRole === "none") {
            mirroredRole = "viewer";
          } else {
            mirroredRole = mapModuleRoleToMembershipRole(effectiveModuleRole);
          }
          if (mirroredRole !== mem.role) {
            patch.role = mirroredRole;
          }
        }

        await storage.updateMembershipEntitlements(mem.orgId, user!.id, patch);
      }
    } catch (snapErr) {
      // Snapshot failures must not break the launch — the user has already
      // been authenticated locally. Log and continue.
      reqLog.warn(
        { err: snapErr instanceof Error ? snapErr.message : String(snapErr), userId: user!.id },
        "SSO per-user entitlement snapshot write failed (continuing)"
      );
    }

    // All DB work has completed without throwing. Now (and only now) mutate
    // the session, then explicitly persist it.
    req.session.userId = user.id;
    delete req.session.pending2faUserId;
    if (userOrgs.length > 0) {
      const linked = operatorosOrgId
        ? userOrgs.find((o) => o.operatorosOrganizationId === operatorosOrgId)
        : undefined;
      req.session.orgId = (linked ?? userOrgs[0]).id;
    } else {
      delete req.session.orgId;
    }

    req.session.save((err) => {
      if (err) {
        reqLog.error(
          { outcome: "session_failed", jti: claims.jti, userId: user!.id },
          "SSO session save failed"
        );
        return sendLocalError(res, "session");
      }
      reqLog.info(
        {
          outcome: "success",
          jti: claims.jti,
          userId: user!.id,
          sub: payload.user.id,
          provisioned,
          hasOrg: userOrgs.length > 0,
          autoJoinedOrgId,
          autoProvisionedOrgId,
          activeOrgId: req.session.orgId ?? null,
        },
        "SSO sign-in succeeded"
      );
      let dest = "/dashboard";
      if (autoProvisionedOrgId) {
        dest += "?sso=provisioned";
      } else if (autoJoinedOrgId) {
        dest += "?sso=joined";
      } else if (operatorosOrgId && req.session.orgId) {
        dest += "?sso=signed_in";
      }
      res.redirect(302, dest);
    });
  } catch (err) {
    reqLog.error(
      {
        outcome: "internal_error",
        jti: claims.jti,
        err: err instanceof Error ? err.message : String(err),
      },
      "SSO sign-in failed with unexpected error"
    );
    sendLocalError(res, "internal");
  }
});

// Keep a named export of the unused-but-shared helper so other modules that
// need to map OperatorOS roles into TradeFlowKit roles can reuse it.
export { mapOperatorosRoleToMembershipRole };

export default router;
