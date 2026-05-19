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
  mapModuleRoleToMembershipRole as mapModuleRoleEntitlement,
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
      const activeOrgId = operatorosOrgId
        ? userOrgs.find((o) => o.operatorosOrganizationId === operatorosOrgId)?.id
        : autoProvisionedOrgId ?? autoJoinedOrgId ?? userOrgs[0]?.id;
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
        if (!existingSnap.success) {
          // First-time bootstrap snapshot. Defaults to module_user / enabled
          // until the next push-sync supplies the real values.
          const fresh = UserEntitlementSnapshotSchema.parse({
            schemaVersion: 1,
            operatorosUserId: payload.user.id,
            tenantRole: null,
            moduleRole: "module_user",
            enabled: true,
            permissions: [],
            syncedAt: new Date().toISOString(),
          });
          patch.userEntitlementSnapshot = fresh as any;
          patch.moduleRole = fresh.moduleRole;
          patch.enabled = true;
        } else {
          // Preserve the existing module role / enabled flag from the last
          // push-sync; just refresh `syncedAt` and ensure the OperatorOS
          // user id stays in lock-step.
          const refreshed = {
            ...existingSnap.data,
            operatorosUserId: payload.user.id,
            syncedAt: new Date().toISOString(),
          };
          patch.userEntitlementSnapshot = refreshed as any;
        }
        await storage.updateMembershipEntitlements(mem.orgId, user!.id, patch);
        // Reference the import so it stays type-checked even though we don't
        // mutate `role` from this path (push-sync owns role mirroring).
        void mapModuleRoleEntitlement;
      }
      // Touch the variable to satisfy linters when we don't use activeOrgId here.
      void activeOrgId;
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
