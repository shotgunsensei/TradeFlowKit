import { errMsg } from "../errors";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, requireOrg, checkPlanLimit } from "../middleware";
import { getUncachableStripeClient } from "../stripeClient";
import { calcLineItemsTotal, calcTotalWithTaxDiscount } from "@shared/schema";
import { sendEmail, buildInvoicePaymentEmail } from "../emailClient";
import { generateInvoicePdf } from "../pdfGenerator";
import {
  sendDocumentEmail,
  buildEmailContent,
  isEmailConfigured,
} from "../emailService";
import { format } from "date-fns";
import { logger as rootLogger } from "../logger";

const log = rootLogger.child({ component: "invoices-route" });

const router = Router();

const sendEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200).optional(),
  message: z.string().max(2000).optional(),
});

router.get("/api/invoices", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const result = await storage.getInvoices(req.session.orgId!);
    res.json(result);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/invoices/export/quickbooks", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const allInvoices = await storage.getInvoices(req.session.orgId!);
    const rows: string[] = [];
    const headers = [
      "InvoiceNo", "Customer", "InvoiceDate", "DueDate", "Status",
      "ItemDescription", "Qty", "UnitPrice", "LineTotal",
      "Subtotal", "TaxRate%", "TaxAmount", "Discount", "Total", "Notes",
    ];
    rows.push(headers.join(","));

    for (const inv of allInvoices) {
      const full = await storage.getInvoice(req.session.orgId!, inv.id);
      if (!full) continue;
      const items = full.items || [];
      const subtotal = items.reduce((s, it) => s + Number(it.qty) * Number(it.unitPrice), 0);
      const taxAmount = subtotal * (Number(inv.taxRate) / 100);
      const discount = Number(inv.discount) || 0;
      const total = subtotal + taxAmount - discount;
      const invoiceDate = inv.createdAt ? new Date(inv.createdAt).toLocaleDateString("en-US") : "";
      const dueDate = inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-US") : "";
      const invoiceNo = inv.id.slice(0, 8).toUpperCase();
      const customer = (inv.customerName || "").replace(/,/g, " ");
      const notes = (inv.notes || "").replace(/,/g, " ").replace(/\n/g, " ");

      if (items.length === 0) {
        rows.push(
          [
            invoiceNo, customer, invoiceDate, dueDate, inv.status,
            "", "", "", "",
            subtotal.toFixed(2), Number(inv.taxRate).toFixed(2), taxAmount.toFixed(2),
            discount.toFixed(2), total.toFixed(2), notes,
          ]
            .map((v) => `"${v}"`)
            .join(",")
        );
      } else {
        items.forEach((item, idx) => {
          const lineTotal = Number(item.qty) * Number(item.unitPrice);
          const desc = (item.description || "").replace(/"/g, "'");
          rows.push(
            [
              invoiceNo, customer, invoiceDate, dueDate, inv.status,
              desc, Number(item.qty).toFixed(2), Number(item.unitPrice).toFixed(2), lineTotal.toFixed(2),
              idx === 0 ? subtotal.toFixed(2) : "",
              idx === 0 ? Number(inv.taxRate).toFixed(2) : "",
              idx === 0 ? taxAmount.toFixed(2) : "",
              idx === 0 ? discount.toFixed(2) : "",
              idx === 0 ? total.toFixed(2) : "",
              idx === 0 ? notes : "",
            ]
              .map((v) => `"${v}"`)
              .join(",")
          );
        });
      }
    }

    const csv = rows.join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="invoices-quickbooks-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(csv);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/invoices/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const inv = await storage.getInvoice(req.session.orgId!, req.params.id as string);
    if (!inv) return res.status(404).send("Invoice not found");
    const org = await storage.getOrg(req.session.orgId!);
    res.json({ ...inv, org });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/invoices", requireAuth, requireOrg, async (req: Request, res: Response) => {
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
    const inv = await storage.createInvoice(req.session.orgId!, req.body, req.session.userId!);
    await storage.recordAudit({ orgId: req.session.orgId!, userId: req.session.userId, action: "create", entity: "invoice", entityId: inv.id, after: inv });
    res.json(inv);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.patch("/api/invoices/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const body = { ...req.body };

    if ("recurringInterval" in body && body.recurringInterval) {
      const { resolveRequestAccess } = await import("../middleware");
      const { hasFeature } = await import("@shared/entitlements");
      const ctx = await resolveRequestAccess(req);
      if (!ctx || !hasFeature(ctx.access, "recurring_invoices")) {
        return res.status(403).json({
          error: "feature_not_in_plan",
          feature: "recurring_invoices",
          linked: ctx?.access.linked ?? false,
          planSlug: ctx?.access.planSlug ?? null,
          message: "Recurring invoices are not enabled for this plan.",
          upgradeRequired: true,
        });
      }
      if (!body.nextRunAt) {
        body.nextRunAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      }
    }
    if (body.nextRunAt && typeof body.nextRunAt === "string") {
      body.nextRunAt = new Date(body.nextRunAt);
    }
    if ("recurringInterval" in body && !body.recurringInterval) {
      body.recurringInterval = null;
      body.nextRunAt = null;
    }

    const before = await storage.getInvoice(orgId, req.params.id as string);
    const inv = await storage.updateInvoice(orgId, req.params.id as string, body);
    if (!inv) return res.status(404).send("Invoice not found");
    await storage.recordAudit({ orgId: req.session.orgId!, userId: req.session.userId, action: "update", entity: "invoice", entityId: inv.id, before, after: inv });
    res.json(inv);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.delete("/api/invoices/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const before = await storage.getInvoice(req.session.orgId!, req.params.id as string);
    await storage.deleteInvoice(req.session.orgId!, req.params.id as string);
    await storage.recordAudit({ orgId: req.session.orgId!, userId: req.session.userId, action: "delete", entity: "invoice", entityId: req.params.id as string, before });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/invoices/:id/public", async (req: Request, res: Response) => {
  try {
    const inv = await storage.getInvoicePublic(req.params.id as string);
    if (!inv) return res.status(404).json({ error: "Invoice not found" });

    const { org, ...invoiceFields } = inv;
    const safeOrg = org ? {
      name: org.name,
      address: org.address,
      phone: org.phone,
      email: org.email,
      logoUrl: org.logoUrl,
      stripeConnectAccountId: org.stripeConnectAccountId,
      stripeConnectOnboarded: org.stripeConnectOnboarded,
    } : undefined;

    res.json({ ...invoiceFields, org: safeOrg });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

router.post("/api/invoices/:id/payment-link", async (req: Request, res: Response) => {
  try {
    const inv = await storage.getInvoicePublic(req.params.id as string);
    if (!inv) return res.status(404).json({ error: "Invoice not found" });

    const org = inv.org;
    if (!org) return res.status(404).json({ error: "Organization not found" });

    if (!org.stripeConnectAccountId || !org.stripeConnectOnboarded) {
      return res.status(400).json({ error: "This business has not connected a Stripe account yet." });
    }

    if (inv.status === "paid") {
      return res.status(400).json({ error: "This invoice is already paid." });
    }

    const items = inv.items || [];
    const subtotal = calcLineItemsTotal(items);
    const totals = calcTotalWithTaxDiscount(subtotal, inv.taxRate || "0", inv.discount || "0");
    const totalCents = Math.round(totals.total * 100);

    if (totalCents <= 0) {
      return res.status(400).json({ error: "Invoice total must be greater than zero." });
    }

    const DEFAULT_PLATFORM_FEE_PERCENT = 0.5;
    const parsedFeePercent = Number(process.env.PLATFORM_FEE_PERCENT);
    const platformFeePercent =
      Number.isFinite(parsedFeePercent) && parsedFeePercent >= 0 && parsedFeePercent <= 100
        ? parsedFeePercent
        : DEFAULT_PLATFORM_FEE_PERCENT;
    const applicationFeeAmount = Math.min(
      totalCents,
      Math.max(0, Math.floor((totalCents * platformFeePercent) / 100)),
    );

    const replitDomains = process.env.REPLIT_DOMAINS;
    const appUrl = replitDomains
      ? `https://${replitDomains.split(",")[0]}`
      : `http://localhost:${process.env.PORT || 5000}`;

    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "us_bank_account"],
      payment_method_options: {
        us_bank_account: {
          financial_connections: { permissions: ["payment_method"] },
          verification_method: "automatic",
        },
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Invoice #${inv.id.slice(0, 8).toUpperCase()} — ${org.name}`,
            },
            unit_amount: totalCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        invoiceId: inv.id,
        orgId: org.id,
        feature: "invoice_payment",
      },
      success_url: `${appUrl}/invoices/${inv.id}/pay?paid=true`,
      cancel_url: `${appUrl}/invoices/${inv.id}/pay`,
      payment_intent_data: {
        on_behalf_of: org.stripeConnectAccountId,
        transfer_data: {
          destination: org.stripeConnectAccountId,
        },
        metadata: {
          invoiceId: inv.id,
          orgId: org.id,
          feature: "invoice_payment",
        },
        ...(applicationFeeAmount > 0 ? { application_fee_amount: applicationFeeAmount } : {}),
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    log.error({ err, msg: errMsg(err) }, "[payment-link] error");
    res.status(500).json({ error: errMsg(err) });
  }
});

router.post("/api/invoices/:id/send-payment-email", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const id = req.params.id as string;
    const inv = await storage.getInvoice(orgId, id);
    if (!inv) return res.status(404).json({ error: "Invoice not found" });

    const org = await storage.getOrg(orgId);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    if (!org.stripeConnectAccountId || !org.stripeConnectOnboarded) {
      return res.status(400).json({ error: "Connect Stripe before emailing payment links to customers." });
    }

    const customer = inv.customer;
    if (!customer?.email) {
      return res.status(400).json({ error: "This customer has no email address on file. Add one to their profile first." });
    }

    if (inv.status === "paid") {
      return res.status(400).json({ error: "This invoice has already been paid." });
    }

    if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_FROM_EMAIL) {
      return res.status(500).json({ error: "Email service is not configured on the server." });
    }

    const items = inv.items || [];
    const subtotal = calcLineItemsTotal(items);
    const totals = calcTotalWithTaxDiscount(subtotal, inv.taxRate || "0", inv.discount || "0");

    const replitDomains = process.env.REPLIT_DOMAINS;
    const appUrl = replitDomains
      ? `https://${replitDomains.split(",")[0]}`
      : `http://localhost:${process.env.PORT || 5000}`;
    const payUrl = `${appUrl}/invoices/${inv.id}/pay`;

    const { subject, text, html } = buildInvoicePaymentEmail({
      businessName: org.name,
      businessEmail: org.email,
      businessLogoUrl: (org as any).logoUrl,
      customerName: customer.name,
      customerEmail: customer.email,
      invoiceNumber: `#${inv.id.slice(0, 8).toUpperCase()}`,
      totalFormatted: `$${totals.total.toFixed(2)}`,
      dueDateFormatted: inv.dueDate ? format(new Date(inv.dueDate), "MMM d, yyyy") : null,
      payUrl,
    });

    await sendEmail({
      to: customer.email,
      fromName: org.name,
      replyTo: org.email || undefined,
      subject,
      text,
      html,
    });

    if (inv.status === "draft") {
      await storage.updateInvoice(orgId, id, { status: "sent" });
    }

    res.json({ ok: true, sentTo: customer.email });
  } catch (err) {
    log.error({ err, msg: errMsg(err), sgError: (err as any)?.response?.body }, "[send-payment-email] error");
    const msg = (err as any)?.response?.body?.errors?.[0]?.message || errMsg(err) || "Failed to send email";
    res.status(500).json({ error: msg });
  }
});
router.post(
  "/api/invoices/:id/send-email",
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
      const invoice = await storage.getInvoice(req.session.orgId!, req.params.id as string);
      if (!invoice) return res.status(404).json({ error: "Invoice not found" });
      const org = await storage.getOrg(req.session.orgId!);

      const items = invoice.items || [];
      const subtotal = calcLineItemsTotal(items);
      const totals = calcTotalWithTaxDiscount(
        subtotal,
        invoice.taxRate || "0",
        invoice.discount || "0",
      );
      const refNumber = invoice.id.slice(0, 8).toUpperCase();
      const orgName = org?.name || "Our Company";

      const pdfBuffer = await generateInvoicePdf({
        ...invoice,
        org: org ?? undefined,
      } as any);

      const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol;
      const host = req.get("host");
      const publicLink =
        host && invoice.status !== "paid"
          ? `${protocol}://${host}/invoices/${invoice.id}/pay`
          : undefined;

      const subject = parsed.data.subject || `Invoice #${refNumber} from ${orgName}`;
      const { text, html } = buildEmailContent({
        recipientName: invoice.customer?.name || "Customer",
        orgName,
        documentType: "invoice",
        documentNumber: refNumber,
        total: `$${totals.total.toFixed(2)}`,
        dueOrExpiry: invoice.dueDate
          ? { label: "Due Date", value: format(new Date(invoice.dueDate), "MMMM d, yyyy") }
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
        attachmentFilename: `Invoice-${refNumber}.pdf`,
        fromName: orgName,
        replyTo: org?.email || undefined,
      });

      if (invoice.status === "draft") {
        await storage.updateInvoice(req.session.orgId!, invoice.id, { status: "sent" });
      }

      res.json({ ok: true, sentTo: parsed.data.to });
    } catch (err) {
      const sgErr = (err as any)?.response?.body?.errors?.[0]?.message;
      log.error({ err, msg: errMsg(err), sgError: sgErr || undefined }, "[send-email invoice]");
      res.status(500).json({ error: sgErr || errMsg(err) || "Failed to send email" });
    }
  },
);

const bulkIdsSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(1000) });

const importInvoiceRowSchema = z.object({
  invoiceRef: z.string().optional().default(""),
  customerName: z.string().trim().min(1, "Customer name is required"),
  status: z.enum(["draft", "sent", "paid", "void"]).optional(),
  dueDate: z.string().optional().default(""),
  taxRate: z.union([z.string(), z.number()]).optional(),
  discount: z.union([z.string(), z.number()]).optional(),
  notes: z.string().optional().default(""),
  itemDescription: z.string().optional().default(""),
  itemQty: z.union([z.string(), z.number()]).optional(),
  itemUnitPrice: z.union([z.string(), z.number()]).optional(),
});

router.post("/api/invoices/import", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const rows = req.body?.invoices;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No invoices provided" });
    }
    if (rows.length > 1000) {
      return res.status(400).json({ error: "Maximum 1000 rows per import" });
    }

    const customers = await storage.getCustomers(orgId);
    const customerByName = new Map<string, string>();
    for (const c of customers) {
      customerByName.set(c.name.trim().toLowerCase(), c.id);
    }

    type Group = {
      firstRow: number;
      header: z.infer<typeof importInvoiceRowSchema>;
      items: { description: string; qty: string; unitPrice: string }[];
    };
    const groups = new Map<string, Group>();
    const ordered: string[] = [];
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const parsed = importInvoiceRowSchema.safeParse(rows[i] ?? {});
      if (!parsed.success) {
        errors.push({ row: i + 2, error: parsed.error.errors[0]?.message || "Invalid row" });
        continue;
      }
      const r = parsed.data;
      const ref = (r.invoiceRef || "").trim();
      const key = ref ? `ref:${ref.toLowerCase()}` : `row:${i}`;
      let g = groups.get(key);
      if (!g) {
        g = { firstRow: i + 2, header: r, items: [] };
        groups.set(key, g);
        ordered.push(key);
      }
      const desc = (r.itemDescription || "").trim();
      if (desc) {
        const qtyNum = Number(r.itemQty ?? 0);
        const priceNum = Number(r.itemUnitPrice ?? 0);
        if (!isFinite(qtyNum) || !isFinite(priceNum)) {
          errors.push({ row: i + 2, error: "Invalid qty or unit price" });
          continue;
        }
        g.items.push({
          description: desc,
          qty: String(qtyNum || 0),
          unitPrice: String(priceNum || 0),
        });
      }
    }

    const planCheck = await checkPlanLimit(orgId, "invoices");
    if (planCheck.limit !== -1) {
      const remaining = planCheck.limit - planCheck.current;
      if (remaining <= 0) {
        return res.status(403).json({
          error: `Invoice limit reached (${planCheck.limit}). Upgrade your plan to add more invoices.`,
          limitReached: true,
        });
      }
      if (groups.size > remaining) {
        return res.status(403).json({
          error: `Import would exceed your plan limit. You can add ${remaining} more invoice(s) on your current plan.`,
          limitReached: true,
        });
      }
    }

    let imported = 0;

    for (const key of ordered) {
      const g = groups.get(key)!;
      const r = g.header;
      const customerKey = r.customerName.trim().toLowerCase();
      const customerId = customerByName.get(customerKey);
      if (!customerId) {
        errors.push({ row: g.firstRow, error: `Customer "${r.customerName}" not found` });
        continue;
      }

      let dueDate: Date | null = null;
      if (r.dueDate && r.dueDate.trim()) {
        const d = new Date(r.dueDate.trim());
        if (!isNaN(d.getTime())) dueDate = d;
      }

      try {
        await storage.createInvoice(
          orgId,
          {
            customerId,
            jobId: null,
            status: r.status || "draft",
            taxRate: r.taxRate !== undefined ? String(r.taxRate) : "0",
            discount: r.discount !== undefined ? String(r.discount) : "0",
            dueDate,
            notes: r.notes || "",
            items: g.items,
          },
          req.session.userId!,
        );
        imported++;
      } catch (err: any) {
        errors.push({ row: g.firstRow, error: err.message });
      }
    }

    res.json({ imported, skipped: 0, errors });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/invoices/bulk-delete", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const parsed = bulkIdsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid ids" });
    const updated = await storage.bulkDeleteInvoices(req.session.orgId!, parsed.data.ids);
    res.json({ updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/invoices/bulk-restore", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const parsed = bulkIdsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid ids" });
    const restored = await storage.bulkRestoreInvoices(req.session.orgId!, parsed.data.ids);
    res.json({ restored });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/invoices/bulk-mark-paid", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const parsed = bulkIdsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid ids" });
    const updated = await storage.bulkMarkInvoicesPaid(req.session.orgId!, parsed.data.ids);
    res.json({ updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/dashboard", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const stats = await storage.getDashboardStats(req.session.orgId!);
    res.json(stats);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

export default router;
