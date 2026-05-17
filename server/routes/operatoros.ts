import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg } from "../middleware";
import { getSsoConfig } from "../env";
import { logger } from "../logger";

const router = Router();
const log = logger.child({ component: "operatoros-orgs" });

const LIST_TIMEOUT_MS = 5000;

type ListResponse =
  | { available: false; reason: "not_configured" | "not_linked" | "unavailable" }
  | { available: true; organizations: Array<{ id: string; name: string }> };

function parseOrgs(payload: unknown): Array<{ id: string; name: string }> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const arr = (payload as Record<string, unknown>).organizations;
  if (!Array.isArray(arr)) return null;
  const out: Array<{ id: string; name: string }> = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id) continue;
    if (typeof o.name !== "string" || !o.name) continue;
    out.push({ id: o.id, name: o.name });
  }
  return out;
}

router.get(
  "/api/operatoros/organizations",
  requireAuth,
  requireOrg,
  async (req: Request, res: Response) => {
    const config = getSsoConfig();
    if (!config) {
      const body: ListResponse = { available: false, reason: "not_configured" };
      return res.json(body);
    }
    const user = await storage.getUser(req.session.userId!);
    if (!user?.operatorosUserId) {
      const body: ListResponse = { available: false, reason: "not_linked" };
      return res.json(body);
    }

    const url = `${config.apiUrl}/v1/modules/users/${encodeURIComponent(user.operatorosUserId)}/organizations`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LIST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${config.secret}`,
          "x-module-slug": config.audience,
          "x-module-env": config.ssoEnv,
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        log.warn({ status: response.status }, "operatoros org listing failed");
        const body: ListResponse = { available: false, reason: "unavailable" };
        return res.json(body);
      }
      const json = await response.json().catch(() => null);
      const orgs = parseOrgs(json);
      if (!orgs) {
        log.warn("operatoros org listing returned unrecognized shape");
        const body: ListResponse = { available: false, reason: "unavailable" };
        return res.json(body);
      }
      const body: ListResponse = { available: true, organizations: orgs };
      return res.json(body);
    } catch (err: any) {
      log.warn({ err: err?.message }, "operatoros org listing errored");
      const body: ListResponse = { available: false, reason: "unavailable" };
      return res.json(body);
    } finally {
      clearTimeout(timeoutId);
    }
  }
);

export default router;
