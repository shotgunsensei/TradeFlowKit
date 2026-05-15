import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import type { InsertUser, User } from "@shared/schema";
import { storage } from "../storage";
import { hashPassword } from "../middleware";
import { getSsoConfig } from "../env";
import { verifySsoToken, type SsoRejectCode, type SsoTokenClaims } from "../sso/verifier";
import { consumeSsoToken } from "../sso/consume";
import { renderSsoErrorPage } from "../sso/errorPage";
import { logger } from "../logger";

const router = Router();

const ssoLog = logger.child({ component: "sso" });

/**
 * The canonical reject codes plus a few local-only outcomes (`not_configured`,
 * `session`, `internal`) for things that aren't part of the wire contract but
 * we still need to surface to the user.
 */
type LocalReason = "not_configured" | "session" | "internal";
type Reason = SsoRejectCode | LocalReason;

interface FailureMeta {
  status: number;
  title: string;
  message: string;
}

const FAILURE_META: Record<Reason, FailureMeta> = {
  // Canonical reject codes from the OperatorOS contract.
  missing_token: {
    status: 400,
    title: "Sign-in link is missing",
    message: "This page expects a sign-in link from OperatorOS. Please return to OperatorOS and try again.",
  },
  bad_request: {
    status: 400,
    title: "Sign-in link is invalid",
    message: "This sign-in link is not valid. Please return to OperatorOS and request a new one.",
  },
  signature_invalid: {
    status: 401,
    title: "Sign-in link could not be verified",
    message: "We couldn't verify this sign-in link. Please return to OperatorOS and request a new one.",
  },
  issuer_mismatch: {
    status: 401,
    title: "Sign-in link could not be verified",
    message: "This sign-in link wasn't issued by your OperatorOS server. Please return to OperatorOS and try again.",
  },
  audience_mismatch: {
    status: 401,
    title: "Sign-in link is for a different app",
    message: "This sign-in link wasn't issued for TradeFlowKit. Please return to OperatorOS and try again.",
  },
  env_mismatch: {
    status: 401,
    title: "Sign-in link is for the wrong environment",
    message: "This sign-in link was issued for a different environment. Please return to OperatorOS and try again.",
  },
  expired: {
    status: 401,
    title: "Sign-in link has expired",
    message: "This sign-in link has expired. Please return to OperatorOS and request a new one.",
  },
  clock_skew: {
    status: 401,
    title: "Sign-in link could not be verified",
    message: "Your clock and the OperatorOS server clock are out of sync. Please try again in a moment.",
  },
  consume_failed: {
    status: 401,
    title: "Sign-in link could not be redeemed",
    message: "OperatorOS rejected this sign-in link. Please return to OperatorOS and request a new one.",
  },
  sso_consume_unavailable: {
    status: 502,
    title: "Sign-in temporarily unavailable",
    message: "We couldn't reach OperatorOS to complete sign-in. Please try again in a moment.",
  },

  // Local-only outcomes (not part of the wire contract).
  not_configured: {
    status: 503,
    title: "Sign-in is not configured",
    message: "OperatorOS sign-in isn't enabled on this server. Please sign in with your username and password instead.",
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
};

/**
 * Decide whether to return JSON or HTML based on the request `Accept` header.
 * Browser launches (the normal case) get HTML. API/programmatic callers that
 * explicitly prefer JSON get the canonical `{ "code": "<reason>" }` body.
 */
function prefersJson(req: Request): boolean {
  // Use Express's standards-based content negotiation, which honors q-values
  // and the explicit ordering rules from RFC 9110.
  // - No Accept header (or only `*/*`) → first preference wins → HTML.
  // - `Accept: application/json` only → JSON.
  // - `Accept: application/json, text/html;q=0.8` → JSON wins by q-value.
  // - Browser default `text/html,application/xhtml+xml,...,*/*;q=0.8` → HTML.
  const best = req.accepts(["html", "json"]);
  return best === "json";
}

function sendError(req: Request, res: Response, reason: Reason): void {
  const meta = FAILURE_META[reason];
  res.status(meta.status);
  if (prefersJson(req)) {
    res.type("application/json").send(JSON.stringify({ code: reason }));
    return;
  }
  res
    .type("html")
    .send(renderSsoErrorPage({ title: meta.title, message: meta.message, code: reason }));
}

function generateRandomPassword(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function deriveFullName(claims: Pick<SsoTokenClaims, "name" | "email">): string {
  if (claims.name && claims.name.trim()) return claims.name.trim();
  const local = claims.email.split("@")[0] || "";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/**
 * Map an OperatorOS role claim to a TradeFlowKit membership role when
 * auto-joining a user to an existing linked org. We deliberately avoid
 * minting "owner" via this path — the existing org already has its own
 * owner, and a fresh sub-tenant launch shouldn't elevate to that level.
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

function deriveOrgNameFromClaims(claims: SsoTokenClaims): string {
  const fromName = claims.name?.trim();
  if (fromName) return `${fromName}'s Organization`;
  const local = claims.email.split("@")[0] || "";
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

async function pickUniqueOrgSlug(claims: SsoTokenClaims, operatorosOrgId: string): Promise<string> {
  const base =
    slugifyBase(claims.name ?? "") ||
    slugifyBase(claims.email.split("@")[0] ?? "") ||
    "org";
  // Use a short suffix derived from the OperatorOS org id for stability/uniqueness.
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
    return sendError(req, res, "not_configured");
  }

  const tokenRaw = req.query.token;
  const token = typeof tokenRaw === "string" ? tokenRaw : undefined;

  const verify = verifySsoToken(token, config);
  if (!verify.ok) {
    reqLog.warn({ outcome: "verify_failed", reason: verify.reason }, "SSO token verification failed");
    return sendError(req, res, verify.reason);
  }

  const { claims } = verify;
  const consume = await consumeSsoToken(claims.jti, config);
  if (!consume.ok) {
    reqLog.warn(
      {
        outcome: "consume_failed",
        reason: consume.reason,
        apiCode: consume.apiCode,
        httpStatus: consume.httpStatus,
        jti: claims.jti,
      },
      "SSO consume rejected"
    );
    return sendError(req, res, consume.reason);
  }

  try {
    const emailNormalized = claims.email.trim().toLowerCase();
    let user = await storage.getUserByOperatorosUserId(claims.sub);
    let provisioned = false;
    let backfilled = false;

    if (!user) {
      // Backfill path: a user provisioned by the original task #66 implementation
      // was keyed on email and has no operatorosUserId yet. Match by email and
      // attach the sub so subsequent launches go through the sub-keyed path.
      //
      // CRITICAL: only backfill when the existing record has no
      // operatorosUserId. If the email already belongs to a user bound to a
      // *different* sub, refuse the launch — silently rebinding would let an
      // attacker who controls a new OperatorOS account with the same email
      // take over the existing TradeFlowKit user.
      const byEmail = await storage.getUserByEmail(emailNormalized);
      if (byEmail) {
        if (byEmail.operatorosUserId && byEmail.operatorosUserId !== claims.sub) {
          reqLog.warn(
            {
              outcome: "identity_conflict",
              jti: claims.jti,
              existingUserId: byEmail.id,
              tokenSub: claims.sub,
            },
            "SSO refused: email maps to a user already bound to a different OperatorOS sub"
          );
          return sendError(req, res, "consume_failed");
        }
        const backfillPatch: Partial<User> = { operatorosUserId: claims.sub };
        user = (await storage.updateUser(byEmail.id, backfillPatch)) || byEmail;
        backfilled = true;
      }
    }

    // OperatorOS owns the role for SSO-bound users: a `super_admin` role on
    // the token grants the local TradeFlowKit master-admin flag, and any other
    // role revokes it. Operators who manually flipped `isSuperAdmin` on a
    // non-SSO user are unaffected — we only touch this on the SSO code path.
    const desiredSuperAdmin = claims.role === "super_admin";

    if (!user) {
      const username = await pickUniqueUsername(emailNormalized);
      const randomPassword = await hashPassword(generateRandomPassword());
      const newUser: InsertUser = {
        username,
        password: randomPassword,
        fullName: deriveFullName(claims),
        phone: "",
        email: emailNormalized,
        isSsoProvisioned: true,
        operatorosUserId: claims.sub,
        operatorosRole: claims.role ?? null,
        operatorosPlanSlug: claims.plan_slug ?? null,
        operatorosOrganizationId: claims.organization_id ?? null,
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
      if (user.email !== emailNormalized) patch.email = emailNormalized;
      if (user.operatorosRole !== (claims.role ?? null)) {
        patch.operatorosRole = claims.role ?? null;
      }
      if (user.operatorosPlanSlug !== (claims.plan_slug ?? null)) {
        patch.operatorosPlanSlug = claims.plan_slug ?? null;
      }
      if (user.operatorosOrganizationId !== (claims.organization_id ?? null)) {
        patch.operatorosOrganizationId = claims.organization_id ?? null;
      }
      if (user.isSuperAdmin !== desiredSuperAdmin) {
        patch.isSuperAdmin = desiredSuperAdmin;
      }
      if (Object.keys(patch).length > 0) {
        const updated = await storage.updateUser(user.id, patch);
        if (updated) user = updated;
      }
    }

    req.session.userId = user.id;
    delete req.session.pending2faUserId;

    let userOrgs = await storage.getUserOrgs(user.id);
    let autoJoinedOrgId: string | null = null;
    let autoProvisionedOrgId: string | null = null;

    const operatorosOrgId = claims.organization_id ?? null;
    if (operatorosOrgId) {
      const linkedOrg = await storage.getOrgByOperatorosOrganizationId(operatorosOrgId);
      if (linkedOrg) {
        // Auto-join the user to the matching org if they're not already a member.
        const existingMembership = await storage.getMembership(linkedOrg.id, user.id);
        if (!existingMembership) {
          const role = mapOperatorosRoleToMembershipRole(claims.role);
          await storage.createMembership(linkedOrg.id, user.id, role);
          autoJoinedOrgId = linkedOrg.id;
          userOrgs = await storage.getUserOrgs(user.id);
          reqLog.info(
            { outcome: "auto_joined_org", userId: user.id, orgId: linkedOrg.id, role },
            "SSO auto-joined user to linked TradeFlowKit org"
          );
        }
      } else if (userOrgs.length === 0) {
        // First-time user with no TradeFlowKit org and no existing link: provision one.
        // Two concurrent first launches for the same OperatorOS tenant can race on the
        // unique index over `operatoros_organization_id` (and the slug unique index).
        // If we lose the race, fall back to joining the org the winner created.
        try {
          const newOrg = await storage.createOrg({
            name: deriveOrgNameFromClaims(claims),
            slug: await pickUniqueOrgSlug(claims, operatorosOrgId),
            phone: "",
            email: emailNormalized,
            address: "",
            operatorosOrganizationId: operatorosOrgId,
          });
          await storage.createMembership(newOrg.id, user.id, "owner");
          autoProvisionedOrgId = newOrg.id;
          userOrgs = await storage.getUserOrgs(user.id);
          reqLog.info(
            { outcome: "auto_provisioned_org", userId: user.id, orgId: newOrg.id, operatorosOrgId },
            "SSO auto-provisioned a TradeFlowKit org for new OperatorOS tenant"
          );
        } catch (provisionErr) {
          const code = (provisionErr as { code?: string })?.code;
          // 23505 = unique_violation in PostgreSQL.
          if (code !== "23505") throw provisionErr;
          const winner = await storage.getOrgByOperatorosOrganizationId(operatorosOrgId);
          if (winner) {
            const existing = await storage.getMembership(winner.id, user.id);
            if (!existing) {
              const role = mapOperatorosRoleToMembershipRole(claims.role);
              await storage.createMembership(winner.id, user.id, role);
            }
            autoJoinedOrgId = winner.id;
            userOrgs = await storage.getUserOrgs(user.id);
            reqLog.info(
              { outcome: "auto_joined_after_race", userId: user.id, orgId: winner.id, operatorosOrgId },
              "SSO lost provision race; joined the org the winner created"
            );
          } else {
            // Unique violation but no linked org found — likely a slug collision against
            // an unrelated org. Surface as an internal error so the user sees a clean retry.
            throw provisionErr;
          }
        }
      }
    }

    // Prefer the org linked to the user's OperatorOS tenant when picking the active org.
    // This keeps the auto-pick safe for users with multiple TradeFlowKit orgs — it only
    // fires when there's a clean OperatorOS-linked match.
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
        reqLog.error({ outcome: "session_failed", jti: claims.jti, userId: user!.id }, "SSO session save failed");
        return sendError(req, res, "session");
      }
      reqLog.info(
        {
          outcome: "success",
          jti: claims.jti,
          userId: user!.id,
          sub: claims.sub,
          provisioned,
          backfilled,
          hasOrg: userOrgs.length > 0,
          autoJoinedOrgId,
          autoProvisionedOrgId,
          activeOrgId: req.session.orgId ?? null,
        },
        "SSO sign-in succeeded"
      );
      res.redirect(302, "/dashboard");
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
    sendError(req, res, "internal");
  }
});

export default router;
