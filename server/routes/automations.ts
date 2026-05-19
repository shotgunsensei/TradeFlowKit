import { errMsg } from "../errors";
import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg, resolveRequestAccess } from "../middleware";

const router = Router();

router.get("/api/automations", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const automations = await storage.getOrgAutomations(orgId);
    res.json(automations || {
      orgId,
      invoiceReminder: false,
      invoiceReminderDays: [3, 7, 14],
      quoteFollowUp: false,
      quoteFollowUpDays: [3, 5, 7],
    });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/automations", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const ctx = await resolveRequestAccess(req);
    if (!ctx || !ctx.access.allowed || !ctx.access.features.automations) {
      return res.status(403).json({
        error: "This feature requires the Small Business plan or above.",
        linked: ctx?.access.linked ?? false,
        reason: ctx?.access.reason,
      });
    }

    const { invoiceReminder, invoiceReminderDays, quoteFollowUp, quoteFollowUpDays } = req.body;

    const data: Record<string, unknown> = {};
    if (invoiceReminder !== undefined) data.invoiceReminder = Boolean(invoiceReminder);
    if (invoiceReminderDays !== undefined) data.invoiceReminderDays = Array.isArray(invoiceReminderDays) ? invoiceReminderDays.map(Number) : [3, 7, 14];
    if (quoteFollowUp !== undefined) data.quoteFollowUp = Boolean(quoteFollowUp);
    if (quoteFollowUpDays !== undefined) data.quoteFollowUpDays = Array.isArray(quoteFollowUpDays) ? quoteFollowUpDays.map(Number) : [3, 5, 7];

    const result = await storage.upsertOrgAutomations(orgId, data);
    res.json(result);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/reminder-logs", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const { targetType, targetId } = req.query;
    const logs = await storage.getReminderLogs(
      orgId,
      targetType as string | undefined,
      targetId as string | undefined
    );
    res.json(logs);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

export default router;
