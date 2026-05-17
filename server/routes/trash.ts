import { errMsg } from "../errors";
import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg } from "../middleware";

const router = Router();

router.get("/api/trash", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const [customers, jobs, invoices] = await Promise.all([
      storage.getDeletedCustomers(orgId),
      storage.getDeletedJobs(orgId),
      storage.getDeletedInvoices(orgId),
    ]);
    res.json({ customers, jobs, invoices });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

router.post("/api/trash/customers/:id/restore", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const restored = await storage.bulkRestoreCustomers(req.session.orgId!, [req.params.id as string]);
    if (restored === 0) return res.status(404).json({ error: "Customer not found" });
    await storage.recordAudit({ orgId: req.session.orgId!, userId: req.session.userId, action: "restore", entity: "customer", entityId: req.params.id as string });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

router.delete("/api/trash/customers/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const ok = await storage.hardDeleteCustomer(req.session.orgId!, req.params.id as string);
    if (!ok) return res.status(404).json({ error: "Customer not found in trash" });
    await storage.recordAudit({ orgId: req.session.orgId!, userId: req.session.userId, action: "purge", entity: "customer", entityId: req.params.id as string });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

router.post("/api/trash/jobs/:id/restore", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const restored = await storage.bulkRestoreJobs(req.session.orgId!, [req.params.id as string]);
    if (restored === 0) return res.status(404).json({ error: "Job not found" });
    await storage.recordAudit({ orgId: req.session.orgId!, userId: req.session.userId, action: "restore", entity: "job", entityId: req.params.id as string });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

router.delete("/api/trash/jobs/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const ok = await storage.hardDeleteJob(req.session.orgId!, req.params.id as string);
    if (!ok) return res.status(404).json({ error: "Job not found in trash" });
    await storage.recordAudit({ orgId: req.session.orgId!, userId: req.session.userId, action: "purge", entity: "job", entityId: req.params.id as string });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

router.post("/api/trash/invoices/:id/restore", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const restored = await storage.bulkRestoreInvoices(req.session.orgId!, [req.params.id as string]);
    if (restored === 0) return res.status(404).json({ error: "Invoice not found" });
    await storage.recordAudit({ orgId: req.session.orgId!, userId: req.session.userId, action: "restore", entity: "invoice", entityId: req.params.id as string });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

router.delete("/api/trash/invoices/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const ok = await storage.hardDeleteInvoice(req.session.orgId!, req.params.id as string);
    if (!ok) return res.status(404).json({ error: "Invoice not found in trash" });
    await storage.recordAudit({ orgId: req.session.orgId!, userId: req.session.userId, action: "purge", entity: "invoice", entityId: req.params.id as string });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

export default router;
