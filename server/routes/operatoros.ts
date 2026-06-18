import { Router, type Request, type Response } from "express";
import { requireAuth, requireOrg } from "../middleware";

const router = Router();

/**
 * The canonical OperatorOS Child-App SSO contract does not define a
 * user-organizations endpoint on the hub. The consume response IS the
 * userinfo, and `organizationId` is currently always `null`. We keep this
 * endpoint so the existing settings UI can call it, but it always reports
 * `unavailable` so the UI falls back to its manual-id entry path.
 */
router.get(
  "/api/operatoros/organizations",
  requireAuth,
  requireOrg,
  async (_req: Request, res: Response) => {
    res.json({ available: false, reason: "unavailable" } as const);
  }
);

export default router;
