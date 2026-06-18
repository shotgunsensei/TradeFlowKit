import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import { storage } from "../storage";
import { getEnv } from "../env";
import { logger } from "../logger";
import {
  TenantEntitlementSnapshotSchema,
  UserEntitlementSnapshotSchema,
  MODULE_ROLES,
  mapModuleRoleToMembershipRole,
  deriveDefaultsFromPlanSlug,
  FEATURE_KEYS,
  type TenantEntitlementSnapshot,
} from "@shared/entitlements";
import { errMsg } from "../errors";

const router = Router();
const entitleLog = logger.child({ component: "entitlements" });

/**
 * Push-sync from OperatorOS. Authorised via Bearer `OPERATOROS_SERVICE_TOKEN`.
 * The token is *required* — if not configured this endpoint returns 503 so
 * operators are forced to provision it explicitly rather than the route
 * silently accepting public writes.
 *
 * Body:
 *   { tenantId, planSlug?, subscriptionStatus?, accessLevel?, features?,
 *     limits?, members?: [{ operatorosUserId, moduleRole?, enabled?, tenantRole?, permissions? }] }
 *
 * The endpoint NEVER creates users — it only updates snapshots on rows that
 * already exist locally (orgs linked via `operatorosTenantId`, memberships
 * keyed via `operatorosUserId`). New users land via the existing `/sso` flow.
 */
const SyncMemberSchema = z.object({
  operatorosUserId: z.string().min(1),
  moduleRole: z.enum(MODULE_ROLES).optional(),
  enabled: z.boolean().optional(),
  tenantRole: z.string().nullable().optional(),
  permissions: z.array(z.string()).optional(),
});

const SyncBodySchema = z.object({
  tenantId: z.string().min(1),
  planSlug: z.string().nullable().optional(),
  subscriptionStatus: z.string().nullable().optional(),
  accessLevel: z.string().nullable().optional(),
  features: z.record(z.enum(FEATURE_KEYS), z.boolean()).optional(),
  limits: z
    .object({
      customers: z.number().int().optional(),
      jobs: z.number().int().optional(),
      quotes: z.number().int().optional(),
      invoices: z.number().int().optional(),
      teamMembers: z.number().int().optional(),
    })
    .optional(),
  members: z.array(SyncMemberSchema).optional(),
});

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

router.post(
  "/api/operatoros/entitlements/sync",
  async (req: Request, res: Response) => {
    const env = getEnv();
    if (!env.OPERATOROS_SERVICE_TOKEN) {
      return res.status(503).json({ error: "entitlement_sync_not_configured" });
    }

    const header = req.get("authorization") || "";
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (!match || !timingSafeEqualStr(match[1], env.OPERATOROS_SERVICE_TOKEN)) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const parsed = SyncBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const body = parsed.data;

    try {
      const org = await storage.getOrgByOperatorosTenantId(body.tenantId);
      if (!org) {
        // Don't auto-create tenants; the hub must link them first via the SSO
        // auto-provision path or operator action.
        return res.status(404).json({ error: "tenant_not_linked" });
      }

      // PARTIAL-UPDATE CONTRACT: the hub may send members-only payloads to
      // sync user membership snapshots without re-asserting tenant plan
      // data. We MUST NOT clobber existing tenant snapshot fields with
      // defaults when the caller omitted them — that would silently revoke
      // entitlement on every members-only call. Only mutate tenant fields
      // that are explicitly present in the request body.
      const hasTenantFields =
        body.planSlug !== undefined ||
        body.subscriptionStatus !== undefined ||
        body.accessLevel !== undefined ||
        body.features !== undefined ||
        body.limits !== undefined;

      const syncedAt = new Date().toISOString();
      let finalSnap: TenantEntitlementSnapshot | null = null;
      if (hasTenantFields) {
        const existingParsed = TenantEntitlementSnapshotSchema.safeParse(
          org.entitlementSnapshot,
        );
        const existing = existingParsed.success ? existingParsed.data : null;

        // Use deriveDefaultsFromPlanSlug ONLY when no existing snapshot is
        // present (first-ever sync) — to seed reasonable values for fields
        // the caller omitted. Subsequent partial calls preserve whatever is
        // already on disk.
        const seedPlanSlug =
          body.planSlug !== undefined ? body.planSlug : existing?.planSlug ?? org.operatorosPlanSlug ?? null;
        const defaults = deriveDefaultsFromPlanSlug(seedPlanSlug);

        const featuresMerged: Record<string, boolean> = {};
        for (const k of FEATURE_KEYS) {
          if (body.features && k in body.features) {
            featuresMerged[k] = body.features[k]!;
          } else if (existing?.features && k in existing.features) {
            featuresMerged[k] = (existing.features as Record<string, boolean>)[k] ?? false;
          } else {
            featuresMerged[k] = defaults.features[k] ?? false;
          }
        }
        const limitsMerged = {
          ...defaults.limits,
          ...(existing?.limits ?? {}),
          ...(body.limits ?? {}),
        };

        const snapshot: TenantEntitlementSnapshot = {
          schemaVersion: 1,
          tenantId: body.tenantId,
          planSlug: seedPlanSlug,
          subscriptionStatus:
            body.subscriptionStatus !== undefined
              ? body.subscriptionStatus
              : existing?.subscriptionStatus ?? org.operatorosSubscriptionStatus ?? null,
          accessLevel:
            body.accessLevel !== undefined
              ? body.accessLevel
              : existing?.accessLevel ?? org.operatorosAccessLevel ?? null,
          features: featuresMerged,
          limits: limitsMerged,
          syncedAt,
        };
        finalSnap = TenantEntitlementSnapshotSchema.parse(snapshot);

        const orgPatch: Record<string, unknown> = {
          entitlementSnapshot: finalSnap,
          lastEntitlementSyncAt: new Date(syncedAt),
        };
        if (body.planSlug !== undefined) orgPatch.operatorosPlanSlug = body.planSlug;
        if (body.subscriptionStatus !== undefined) {
          orgPatch.operatorosSubscriptionStatus = body.subscriptionStatus;
        }
        if (body.accessLevel !== undefined) orgPatch.operatorosAccessLevel = body.accessLevel;
        await storage.updateOrg(org.id, orgPatch as Partial<typeof org>);
      } else {
        // Members-only call: still bump the sync timestamp but leave tenant
        // snapshot + plan columns untouched.
        await storage.updateOrg(org.id, {
          lastEntitlementSyncAt: new Date(syncedAt),
        });
      }

      let memberUpdates = 0;
      let memberSkipped = 0;
      if (body.members && body.members.length > 0) {
        const mems = await storage.getOrgMemberships(org.id);
        for (const m of body.members) {
          // Resolve the local membership row keyed on operatorosUserId. We
          // accept both: memberships already labeled with this id, OR the
          // membership whose user has `users.operatorosUserId === id`. We
          // never auto-create users here.
          let target = mems.find((mm) => mm.operatorosUserId === m.operatorosUserId);
          if (!target) {
            const user = await storage.getUserByOperatorosUserId(m.operatorosUserId);
            if (user) target = mems.find((mm) => mm.userId === user.id);
          }
          if (!target) {
            memberSkipped += 1;
            continue;
          }
          const userSnap = UserEntitlementSnapshotSchema.parse({
            schemaVersion: 1,
            operatorosUserId: m.operatorosUserId,
            tenantRole: m.tenantRole ?? null,
            moduleRole: m.moduleRole ?? "module_user",
            enabled: m.enabled ?? true,
            permissions: m.permissions ?? [],
            syncedAt,
          });
          const newLocalRole = mapModuleRoleToMembershipRole(userSnap.moduleRole);
          await storage.updateMembershipEntitlements(org.id, target.userId, {
            operatorosUserId: m.operatorosUserId,
            tenantRole: m.tenantRole ?? null,
            moduleRole: userSnap.moduleRole,
            enabled: userSnap.enabled,
            userEntitlementSnapshot: userSnap,
            // Owners are not demoted by sync (OperatorOS can't mint owners).
            role: target.role === "owner" ? "owner" : newLocalRole,
          });
          memberUpdates += 1;
        }
      }

      await storage.recordAudit({
        orgId: org.id,
        userId: null,
        action: "entitlement_sync",
        entity: "organization",
        entityId: org.id,
        before: null,
        after: { planSlug: body.planSlug, subscriptionStatus: body.subscriptionStatus, memberUpdates, memberSkipped },
      });

      entitleLog.info(
        { tenantId: body.tenantId, orgId: org.id, memberUpdates, memberSkipped },
        "entitlement sync applied"
      );

      res.json({
        ok: true,
        orgId: org.id,
        memberUpdates,
        memberSkipped,
        snapshot: finalSnap,
        tenantUpdated: hasTenantFields,
      });
    } catch (err) {
      entitleLog.error({ err: errMsg(err) }, "entitlement sync failed");
      res.status(500).json({ error: errMsg(err) });
    }
  }
);

export default router;
