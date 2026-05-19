import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg, resolveRequestAccess } from "../middleware";
import { hasFeature } from "@shared/entitlements";

const router = Router();

const SENSITIVE_FIELDS = new Set([
  "password", "passwordhash", "password_hash", "passwordsalt", "salt",
  "token", "accesstoken", "access_token", "refreshtoken", "refresh_token",
  "sessiontoken", "session_token", "apikey", "api_key", "secret",
  "client_secret", "clientsecret", "recoverycodehash", "recovery_code_hash",
  "codehash", "code_hash", "totpsecret", "totp_secret",
  "stripecustomerid", "stripesubscriptionid",
]);

function isSensitive(key: string): boolean {
  const k = key.toLowerCase();
  if (SENSITIVE_FIELDS.has(k)) return true;
  return /password|secret|token|apikey|api_key|hash/.test(k);
}

function sanitizeValue(v: any): any {
  if (v == null) return v;
  if (Array.isArray(v)) return v.map(sanitizeValue);
  if (typeof v === "object") {
    const out: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) {
      if (isSensitive(k)) continue;
      out[k] = sanitizeValue(val);
    }
    return out;
  }
  return v;
}

function csvCell(value: any): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "string" ? value : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function valuesEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

function buildChangeSummary(action: string, before: any, after: any): any {
  const b = before && typeof before === "object" ? sanitizeValue(before) : null;
  const a = after && typeof after === "object" ? sanitizeValue(after) : null;
  const act = action.toLowerCase();
  const isCreate = (!before && !!after) || (/create|insert|add/.test(act) && a && (!b || Object.keys(b).length === 0));
  const isDelete = (!!before && !after) || (/delete|remove/.test(act) && b && (!a || Object.keys(a).length === 0));
  if (isCreate) return { type: "create", after: a ?? {} };
  if (isDelete) return { type: "delete", before: b ?? {} };
  if (!b && !a) return {};
  const changes: Record<string, { before: any; after: any }> = {};
  const keys = new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})]);
  for (const k of keys) {
    if (!valuesEqual((b as any)?.[k], (a as any)?.[k])) {
      changes[k] = { before: (b as any)?.[k] ?? null, after: (a as any)?.[k] ?? null };
    }
  }
  return { type: "update", changes };
}

router.get("/api/audit-log/export.csv", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const org = await storage.getOrg(orgId);
    if (!org) return res.status(404).json({ error: "Organization not found" });
    const ctx = await resolveRequestAccess(req);
    if (!ctx || !hasFeature(ctx.access, "audit_log")) {
      return res.status(403).json({
        error: "feature_not_in_plan",
        feature: "audit_log",
        linked: ctx?.access.linked ?? false,
        planSlug: ctx?.access.planSlug ?? null,
        message: "Audit log access is not enabled for this plan.",
      });
    }
    const entity = req.query.entity ? String(req.query.entity) : undefined;
    const action = req.query.action ? String(req.query.action) : undefined;
    const userId = req.query.userId ? String(req.query.userId) : undefined;

    const rows = await storage.getAuditLogForExport(orgId, { entity, action, userId });

    const header = ["timestamp", "user", "action", "entity", "entity_id", "change_summary"];
    const lines: string[] = [header.join(",")];
    for (const r of rows) {
      const ts = r.createdAt instanceof Date ? r.createdAt.toISOString() : new Date(r.createdAt as any).toISOString();
      const user = r.userName || r.userUsername || "";
      const summary = buildChangeSummary(r.action, r.before, r.after);
      lines.push([
        csvCell(ts),
        csvCell(user),
        csvCell(r.action),
        csvCell(r.entity),
        csvCell(r.entityId ?? ""),
        csvCell(JSON.stringify(summary)),
      ].join(","));
    }
    const csv = lines.join("\r\n") + "\r\n";
    const filename = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/audit-log", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const org = await storage.getOrg(orgId);
    if (!org) return res.status(404).json({ error: "Organization not found" });
    const ctx = await resolveRequestAccess(req);
    if (!ctx || !hasFeature(ctx.access, "audit_log")) {
      return res.status(403).json({
        error: "feature_not_in_plan",
        feature: "audit_log",
        linked: ctx?.access.linked ?? false,
        planSlug: ctx?.access.planSlug ?? null,
        message: "Audit log access is not enabled for this plan.",
      });
    }

    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "50")) || 50, 1), 200);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0")) || 0, 0);
    const entity = req.query.entity ? String(req.query.entity) : undefined;
    const action = req.query.action ? String(req.query.action) : undefined;
    const userId = req.query.userId ? String(req.query.userId) : undefined;

    let from: Date | undefined;
    let to: Date | undefined;
    if (req.query.from) {
      const d = new Date(String(req.query.from));
      if (isNaN(d.getTime())) return res.status(400).json({ error: "Invalid 'from' date" });
      from = d;
    }
    if (req.query.to) {
      const d = new Date(String(req.query.to));
      if (isNaN(d.getTime())) return res.status(400).json({ error: "Invalid 'to' date" });
      to = d;
    }
    if (from && to && from > to) {
      return res.status(400).json({ error: "'from' must be on or before 'to'" });
    }

    const result = await storage.getAuditLog(orgId, { limit, offset, entity, action, userId, from, to });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
