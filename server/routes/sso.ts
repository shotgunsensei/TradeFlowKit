import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { storage } from "../storage";
import { hashPassword } from "../middleware";
import { getSsoConfig } from "../env";
import { verifySsoToken, type SsoVerifyFailureReason } from "../sso/verifier";
import { consumeSsoToken } from "../sso/consume";
import { renderSsoErrorPage } from "../sso/errorPage";
import { logger } from "../logger";

const router = Router();

const ssoLog = logger.child({ component: "sso" });

const FAILURE_PAGES: Record<
  SsoVerifyFailureReason | "replay" | "unknown" | "consume_expired" | "mismatch" | "transient" | "not_configured" | "session" | "internal",
  { status: number; title: string; message: string; code: string }
> = {
  missing_token: {
    status: 400,
    title: "Sign-in link is missing",
    message: "This page expects a sign-in link from OperatorOS. Please return to OperatorOS and try again.",
    code: "SSO-001",
  },
  malformed: {
    status: 400,
    title: "Sign-in link is invalid",
    message: "This sign-in link is not valid. Please return to OperatorOS and request a new one.",
    code: "SSO-002",
  },
  bad_alg: {
    status: 400,
    title: "Sign-in link is invalid",
    message: "This sign-in link uses an unsupported format. Please return to OperatorOS and request a new one.",
    code: "SSO-003",
  },
  bad_signature: {
    status: 401,
    title: "Sign-in link could not be verified",
    message: "We couldn't verify this sign-in link. Please return to OperatorOS and request a new one.",
    code: "SSO-004",
  },
  bad_iss: {
    status: 401,
    title: "Sign-in link could not be verified",
    message: "We couldn't verify this sign-in link. Please return to OperatorOS and request a new one.",
    code: "SSO-005",
  },
  bad_aud: {
    status: 400,
    title: "Sign-in link is for a different app",
    message: "This sign-in link wasn't issued for TradeFlowKit. Please return to OperatorOS and try again.",
    code: "SSO-006",
  },
  bad_module_slug: {
    status: 400,
    title: "Sign-in link is for a different app",
    message: "This sign-in link wasn't issued for TradeFlowKit. Please return to OperatorOS and try again.",
    code: "SSO-007",
  },
  bad_env: {
    status: 400,
    title: "Sign-in link is for the wrong environment",
    message: "This sign-in link was issued for a different environment. Please return to OperatorOS and try again.",
    code: "SSO-008",
  },
  expired: {
    status: 410,
    title: "Sign-in link has expired",
    message: "This sign-in link has expired. Please return to OperatorOS and request a new one.",
    code: "SSO-009",
  },
  missing_jti: {
    status: 400,
    title: "Sign-in link is invalid",
    message: "This sign-in link is missing required information. Please return to OperatorOS and request a new one.",
    code: "SSO-010",
  },
  missing_email: {
    status: 400,
    title: "Sign-in link is missing your email",
    message: "We couldn't read your email from this sign-in link. Please return to OperatorOS and try again.",
    code: "SSO-011",
  },
  replay: {
    status: 409,
    title: "This sign-in link has already been used",
    message: "Each OperatorOS sign-in link works only once. Please return to OperatorOS and request a new one.",
    code: "SSO-012",
  },
  unknown: {
    status: 404,
    title: "Sign-in link is unknown",
    message: "OperatorOS doesn't recognize this sign-in link. Please return to OperatorOS and request a new one.",
    code: "SSO-013",
  },
  consume_expired: {
    status: 410,
    title: "Sign-in link has expired",
    message: "This sign-in link has expired. Please return to OperatorOS and request a new one.",
    code: "SSO-014",
  },
  mismatch: {
    status: 400,
    title: "Sign-in link could not be verified",
    message: "Some details on this sign-in link don't match. Please return to OperatorOS and request a new one.",
    code: "SSO-015",
  },
  transient: {
    status: 503,
    title: "Sign-in temporarily unavailable",
    message: "We couldn't reach OperatorOS to complete sign-in. Please try again in a moment.",
    code: "SSO-016",
  },
  not_configured: {
    status: 503,
    title: "Sign-in is not configured",
    message: "OperatorOS sign-in isn't enabled on this server. Please sign in with your username and password instead.",
    code: "SSO-017",
  },
  session: {
    status: 500,
    title: "Couldn't start your session",
    message: "We verified your sign-in but couldn't start a session. Please try again.",
    code: "SSO-018",
  },
  internal: {
    status: 500,
    title: "Something went wrong",
    message: "An unexpected error occurred while signing you in. Please try again.",
    code: "SSO-019",
  },
};

function sendError(
  res: Response,
  reason: keyof typeof FAILURE_PAGES
): void {
  const page = FAILURE_PAGES[reason];
  res
    .status(page.status)
    .type("html")
    .send(renderSsoErrorPage({ title: page.title, message: page.message, code: page.code }));
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
    return sendError(res, "not_configured");
  }

  const tokenRaw = req.query.token;
  const token = typeof tokenRaw === "string" ? tokenRaw : undefined;

  const verify = verifySsoToken(token, config);
  if (!verify.ok) {
    reqLog.warn({ outcome: "verify_failed", reason: verify.reason }, "SSO token verification failed");
    return sendError(res, verify.reason);
  }

  const { claims } = verify;
  const consume = await consumeSsoToken(claims.jti, config);
  if (!consume.ok) {
    reqLog.warn(
      { outcome: "consume_failed", reason: consume.reason, jti: claims.jti },
      "SSO consume rejected"
    );
    if (consume.reason === "expired") return sendError(res, "consume_expired");
    return sendError(res, consume.reason);
  }

  try {
    const emailNormalized = claims.email.trim().toLowerCase();
    let user;
    try {
      user = await storage.getUserByEmail(emailNormalized);
    } catch (lookupErr) {
      const msg = lookupErr instanceof Error ? lookupErr.message : String(lookupErr);
      if (msg.startsWith("AMBIGUOUS_EMAIL")) {
        reqLog.error(
          { outcome: "ambiguous_email", jti: claims.jti, email: emailNormalized },
          "SSO blocked: multiple local users share this email"
        );
        return sendError(res, "internal");
      }
      throw lookupErr;
    }
    let provisioned = false;

    if (!user) {
      const username = await pickUniqueUsername(emailNormalized);
      const randomPassword = await hashPassword(generateRandomPassword());
      user = await storage.createUser({
        username,
        password: randomPassword,
        fullName: deriveFullName(claims),
        phone: "",
        email: emailNormalized,
      });
      provisioned = true;
    }

    if (user.totpEnabledAt) {
      reqLog.warn(
        { outcome: "blocked_2fa", jti: claims.jti, userId: user.id },
        "SSO blocked: user has 2FA enabled"
      );
      return sendError(res, "internal");
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
        return sendError(res, "session");
      }
      reqLog.info(
        {
          outcome: "success",
          jti: claims.jti,
          userId: user!.id,
          email: emailNormalized,
          provisioned,
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
    sendError(res, "internal");
  }
});

export default router;
