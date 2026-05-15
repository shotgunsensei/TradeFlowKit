import { errMsg } from "../errors";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, requireOrg, checkPlanLimit } from "../middleware";
import { generateQuotePdf } from "../pdfGenerator";
import {
  sendDocumentEmail,
  buildEmailContent,
  isEmailConfigured,
} from "../emailService";
import { calcLineItemsTotal, calcTotalWithTaxDiscount } from "@shared/schema";
import { format } from "date-fns";
import { logger as rootLogger } from "../logger";

const log = rootLogger.child({ component: "quotes-route" });

const router = Router();

const sendEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200).optional(),
  message: z.string().max(2000).optional(),
});

router.get("/api/quotes", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const result = await storage.getQuotes(req.session.orgId!);
    res.json(result);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/quotes/:id/public", async (req: Request, res: Response) => {
  try {
    const q = await storage.getQuotePublic(req.params.id as string);
    if (!q) return res.status(404).send("Quote not found");
    const token = req.query.token as string | undefined;
    if (!token || token !== q.publicToken) {
      return res.status(403).send("Invalid or missing share token");
    }
    res.json(q);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/quotes/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const q = await storage.getQuote(req.session.orgId!, req.params.id as string);
    if (!q) return res.status(404).send("Quote not found");
    const org = await storage.getOrg(req.session.orgId!);
    res.json({ ...q, org });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/quotes", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const planCheck = await checkPlanLimit(req.session.orgId!, "quotes");
    if (!planCheck.allowed) {
      return res.status(403).json({
        error: `Quote limit reached (${planCheck.limit}). Upgrade your plan to add more quotes.`,
        limitReached: true,
        resource: "quotes",
        current: planCheck.current,
        limit: planCheck.limit,
      });
    }
    const q = await storage.createQuote(req.session.orgId!, req.body, req.session.userId!);
    await storage.recordAudit({ orgId: req.session.orgId!, userId: req.session.userId, action: "create", entity: "quote", entityId: q.id, after: q });
    res.json(q);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.patch("/api/quotes/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const before = await storage.getQuote(req.session.orgId!, req.params.id as string);
    const q = await storage.updateQuote(req.session.orgId!, req.params.id as string, req.body);
    if (!q) return res.status(404).send("Quote not found");
    await storage.recordAudit({ orgId: req.session.orgId!, userId: req.session.userId, action: "update", entity: "quote", entityId: q.id, before, after: q });
    res.json(q);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.delete("/api/quotes/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const before = await storage.getQuote(req.session.orgId!, req.params.id as string);
    await storage.deleteQuote(req.session.orgId!, req.params.id as string);
    await storage.recordAudit({ orgId: req.session.orgId!, userId: req.session.userId, action: "delete", entity: "quote", entityId: req.params.id as string, before });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/quotes/:id/convert-to-invoice", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const planCheck = await checkPlanLimit(req.session.orgId!, "invoices");
    if (!planCheck.allowed) {
      return res.status(403).json({
        error: `Invoice limit reached (${planCheck.limit}). Upgrade your plan to add more invoices.`,
        limitReached: true,
        resource: "invoices",
        current: planCheck.current,
        limit: planCheck.limit,
      });
    }
    const inv = await storage.convertQuoteToInvoice(
      req.session.orgId!,
      req.params.id as string,
      req.session.userId!,
    );
    if (!inv) return res.status(404).send("Quote not found");
    res.json(inv);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

router.post("/api/quotes/:id/convert-to-job", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const planCheck = await checkPlanLimit(req.session.orgId!, "jobs");
    if (!planCheck.allowed) {
      return res.status(403).json({
        error: `Job limit reached (${planCheck.limit}). Upgrade your plan to add more jobs.`,
        limitReached: true,
      });
    }

    const quote = await storage.getQuote(req.session.orgId!, req.params.id as string);
    if (!quote) return res.status(404).send("Quote not found");

    const job = await storage.createJob(
      req.session.orgId!,
      {
        title: `Job from Quote #${quote.id.slice(0, 8)}`,
        description: quote.notes || "",
        customerId: quote.customerId || null,
        status: "scheduled",
      },
      req.session.userId!
    );

    await storage.updateQuote(req.session.orgId!, req.params.id as string, {
      status: "accepted",
      jobId: job.id,
    });

    res.json(job);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post(
  "/api/quotes/:id/send-email",
  requireAuth,
  requireOrg,
  async (req: Request, res: Response) => {
    try {
      if (!isEmailConfigured()) {
        return res.status(503).json({
          error:
            "Email is not configured on the server. Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL.",
        });
      }
      const parsed = sendEmailSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid request" });
      }
      const quote = await storage.getQuote(req.session.orgId!, req.params.id as string);
      if (!quote) return res.status(404).json({ error: "Quote not found" });
      const org = await storage.getOrg(req.session.orgId!);

      const items = quote.items || [];
      const subtotal = calcLineItemsTotal(items);
      const totals = calcTotalWithTaxDiscount(
        subtotal,
        quote.taxRate || "0",
        quote.discount || "0",
      );
      const refNumber = quote.id.slice(0, 8).toUpperCase();
      const orgName = org?.name || "Our Company";

      const pdfBuffer = await generateQuotePdf({
        ...quote,
        org: org ?? undefined,
      } as any);

      const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol;
      const host = req.get("host");
      const publicLink =
        host && quote.publicToken
          ? `${protocol}://${host}/quotes/${quote.id}/view?token=${quote.publicToken}`
          : undefined;

      const subject = parsed.data.subject || `Quote #${refNumber} from ${orgName}`;
      const { text, html } = buildEmailContent({
        recipientName: quote.customer?.name || "Customer",
        orgName,
        documentType: "quote",
        documentNumber: refNumber,
        total: `$${totals.total.toFixed(2)}`,
        dueOrExpiry: quote.expiresAt
          ? { label: "Valid Until", value: format(new Date(quote.expiresAt), "MMMM d, yyyy") }
          : undefined,
        customMessage: parsed.data.message,
        publicLink,
      });

      await sendDocumentEmail({
        to: parsed.data.to,
        subject,
        text,
        html,
        attachmentBuffer: pdfBuffer,
        attachmentFilename: `Quote-${refNumber}.pdf`,
        fromName: orgName,
        replyTo: org?.email || undefined,
      });

      if (quote.status === "draft") {
        await storage.updateQuote(req.session.orgId!, quote.id, { status: "sent" });
      }

      res.json({ ok: true, sentTo: parsed.data.to });
    } catch (err) {
      const sgErr = (err as any)?.response?.body?.errors?.[0]?.message;
      log.error({ err, msg: errMsg(err), sgError: sgErr || undefined }, "[send-email quote]");
      res.status(500).json({ error: sgErr || errMsg(err) || "Failed to send email" });
    }
  },
);

export default router;
