import { errMsg } from "../errors";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, requireOrg, checkPlanLimit } from "../middleware";

const router = Router();

const bulkIdsSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(1000) });

router.get("/api/customers", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const search = typeof req.query.q === "string" && req.query.q.trim() ? req.query.q.trim() : undefined;
    const result = await storage.getCustomers(req.session.orgId!, search);
    res.json(result);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/customers/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const c = await storage.getCustomer(req.session.orgId!, req.params.id as string);
    if (!c) return res.status(404).send("Customer not found");
    res.json(c);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/customers/:id/jobs", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const result = await storage.getCustomerJobs(req.session.orgId!, req.params.id as string);
    res.json(result);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/customers/:id/invoices", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const result = await storage.getCustomerInvoices(req.session.orgId!, req.params.id as string);
    res.json(result);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/customers/:id/reminders", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const result = await storage.getCustomerReminderLogs(req.session.orgId!, req.params.id as string);
    res.json(result);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

router.post("/api/customers", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const planCheck = await checkPlanLimit(req.session.orgId!, "customers");
    if (!planCheck.allowed) {
      return res.status(403).json({
        error: `Customer limit reached (${planCheck.limit}). Upgrade your plan to add more customers.`,
        limitReached: true,
        resource: "customers",
        current: planCheck.current,
        limit: planCheck.limit,
      });
    }
    const c = await storage.createCustomer(req.session.orgId!, req.body);
    await storage.recordAudit({ orgId: req.session.orgId!, userId: req.session.userId, action: "create", entity: "customer", entityId: c.id, after: c });
    res.json(c);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.patch("/api/customers/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const before = await storage.getCustomer(req.session.orgId!, req.params.id as string);
    const c = await storage.updateCustomer(req.session.orgId!, req.params.id as string, req.body);
    if (!c) return res.status(404).send("Customer not found");
    await storage.recordAudit({ orgId: req.session.orgId!, userId: req.session.userId, action: "update", entity: "customer", entityId: c.id, before, after: c });
    res.json(c);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.delete("/api/customers/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const before = await storage.getCustomer(req.session.orgId!, req.params.id as string);
    await storage.deleteCustomer(req.session.orgId!, req.params.id as string);
    await storage.recordAudit({ orgId: req.session.orgId!, userId: req.session.userId, action: "delete", entity: "customer", entityId: req.params.id as string, before });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/customers/import", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { customers: rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No customers provided" });
    }

    const orgId = req.session.orgId!;
    const planCheck = await checkPlanLimit(orgId, "customers");
    if (planCheck.limit !== -1) {
      const remaining = planCheck.limit - planCheck.current;
      if (remaining <= 0) {
        return res.status(403).json({
          error: `Customer limit reached (${planCheck.limit}). Upgrade your plan to add more customers.`,
          limitReached: true,
        });
      }
      if (rows.length > remaining) {
        return res.status(403).json({
          error: `Import would exceed your plan limit. You can add ${remaining} more customer(s) on your current plan.`,
          limitReached: true,
        });
      }
    }

    const existing = await storage.getCustomers(orgId);
    const existingByName = new Map<string, true>();
    const existingByEmail = new Map<string, true>();
    const existingByPhone = new Map<string, true>();
    for (const c of existing) {
      existingByName.set(c.name.trim().toLowerCase(), true);
      if (c.email) existingByEmail.set(c.email.trim().toLowerCase(), true);
      if (c.phone) {
        const p = c.phone.replace(/\D/g, "");
        if (p.length >= 7) existingByPhone.set(p, true);
      }
    }

    let imported = 0;
    let skipped = 0;
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = (row.name || "").trim();
      if (!name) {
        errors.push({ row: i + 2, error: "Name is required" });
        continue;
      }
      const email = (row.email || "").trim();
      const phone = (row.phone || "").trim();
      const phoneNorm = phone.replace(/\D/g, "");
      const nameKey = name.toLowerCase();
      const emailKey = email.toLowerCase();

      const isDup =
        existingByName.has(nameKey) ||
        (emailKey && existingByEmail.has(emailKey)) ||
        (phoneNorm.length >= 7 && existingByPhone.has(phoneNorm));

      if (isDup) {
        skipped++;
        continue;
      }

      try {
        await storage.createCustomer(orgId, {
          name,
          phone,
          email,
          address: (row.address || "").trim(),
          notes: (row.notes || "").trim(),
        });
        imported++;
        existingByName.set(nameKey, true);
        if (emailKey) existingByEmail.set(emailKey, true);
        if (phoneNorm.length >= 7) existingByPhone.set(phoneNorm, true);
      } catch (err) {
        errors.push({ row: i + 2, error: errMsg(err) });
      }
    }

    res.json({ imported, skipped, errors });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

router.post("/api/customers/bulk-delete", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const parsed = bulkIdsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid ids" });
    const updated = await storage.bulkDeleteCustomers(req.session.orgId!, parsed.data.ids);
    res.json({ updated });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

router.post("/api/customers/bulk-restore", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const parsed = bulkIdsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid ids" });
    const restored = await storage.bulkRestoreCustomers(req.session.orgId!, parsed.data.ids);
    res.json({ restored });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

export default router;
