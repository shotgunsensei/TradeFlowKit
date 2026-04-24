import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg, checkPlanLimit } from "../middleware";
import { getUncachableStripeClient } from "../stripeClient";
import { calcLineItemsTotal, calcTotalWithTaxDiscount } from "@shared/schema";

const router = Router();

router.get("/api/invoices", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const result = await storage.getInvoices(req.session.orgId!);
    res.json(result);
  } catch (err: any) {
    res.status(500).send(err.message);
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
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

router.get("/api/invoices/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const inv = await storage.getInvoice(req.session.orgId!, req.params.id as string);
    if (!inv) return res.status(404).send("Invoice not found");
    const org = await storage.getOrg(req.session.orgId!);
    res.json({ ...inv, org });
  } catch (err: any) {
    res.status(500).send(err.message);
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
    res.json(inv);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

router.patch("/api/invoices/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const inv = await storage.updateInvoice(req.session.orgId!, req.params.id as string, req.body);
    if (!inv) return res.status(404).send("Invoice not found");
    res.json(inv);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

router.delete("/api/invoices/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    await storage.deleteInvoice(req.session.orgId!, req.params.id as string);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).send(err.message);
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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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

    const replitDomains = process.env.REPLIT_DOMAINS;
    const appUrl = replitDomains
      ? `https://${replitDomains.split(",")[0]}`
      : `http://localhost:${process.env.PORT || 5000}`;

    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
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
      },
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error("[payment-link] error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/dashboard", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const stats = await storage.getDashboardStats(req.session.orgId!);
    res.json(stats);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

export default router;
