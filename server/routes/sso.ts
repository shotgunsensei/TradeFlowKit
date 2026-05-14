import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { storage } from "../storage";
import { hashPassword } from "../middleware";
import { getSsoConfig } from "../env";
import { verifySsoToken, type SsoRejectCode } from "../sso/verifier";
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
  const accept = (req.headers.accept || "").toLowerCase();
  if (!accept || accept.includes("*/*") && !accept.includes("application/json")) {
    // No explicit preference (or only `*/*`) → assume HTML for browser UX.
    return false;
  }
  if (accept.includes("application/json") && !accept.includes("text/html")) {
    return true;
  }
  // If both are listed, prefer HTML (browser's default Accept header lists both).
  return false;
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

function deriveFullName(claims: { name?: string; email: string }): string {
  if (claims.name && claims.name.trim()) return claims.name.trim();
  const local = claims.email.split("@")[0] || "";
  return local.charAt(0).toUpperCase() + local.slice(1);
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
  const reqLog = (req as any).log?.child?.({ route: "/sso" }) || ssoLog;

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
      const byEmail = await storage.getUserByEmail(emailNormalized);
      if (byEmail) {
        user = (await storage.updateUser(byEmail.id, {
          operatorosUserId: claims.sub,
        })) || byEmail;
        backfilled = true;
      }
    }

    if (!user) {
      const username = await pickUniqueUsername(emailNormalized);
      const randomPassword = await hashPassword(generateRandomPassword());
      user = await storage.createUser({
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
      } as any);
      provisioned = true;
    } else {
      // Refresh OperatorOS-owned attributes on every successful launch so the
      // local copy stays in sync with the parent platform.
      const patch: Record<string, unknown> = {};
      if (user.email !== emailNormalized) patch.email = emailNormalized;
      if ((user as any).operatorosRole !== (claims.role ?? null)) {
        patch.operatorosRole = claims.role ?? null;
      }
      if ((user as any).operatorosPlanSlug !== (claims.plan_slug ?? null)) {
        patch.operatorosPlanSlug = claims.plan_slug ?? null;
      }
      if ((user as any).operatorosOrganizationId !== (claims.organization_id ?? null)) {
        patch.operatorosOrganizationId = claims.organization_id ?? null;
      }
      if (Object.keys(patch).length > 0) {
        const updated = await storage.updateUser(user.id, patch as any);
        if (updated) user = updated;
      }
    }

    req.session.userId = user.id;
    delete req.session.pending2faUserId;

    const userOrgs = await storage.getUserOrgs(user.id);
    if (userOrgs.length > 0) {
      req.session.orgId = userOrgs[0].id;
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
