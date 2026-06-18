import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg, resolveRequestAccess } from "../middleware";
import { hasFeature } from "@shared/entitlements";

const router = Router();

async function requireExportPlan(req: Request, res: Response): Promise<boolean> {
  const ctx = await resolveRequestAccess(req);
  if (!ctx) {
    res.status(404).json({ error: "Organization not found" });
    return false;
  }
  if (!hasFeature(ctx.access, "accounting_export")) {
    res.status(403).json({
      error: "feature_not_in_plan",
      feature: "accounting_export",
      linked: ctx.access.linked,
      planSlug: ctx.access.planSlug,
      message: "Accounting exports are not enabled for this plan.",
    });
    return false;
  }
  return true;
}

function csvEscape(value: any): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(fields: any[]): string {
  return fields.map(csvEscape).join(",") + "\r\n";
}

function fmtDateMDY(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "";
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${m}/${day}/${dt.getFullYear()}`;
}

function fmtDateISO(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

function safeFilenameSegment(s: string): string {
  return (s || "export").replace(/[^a-z0-9]/gi, "_");
}

async function loadFullInvoices(orgId: string) {
  const invList = await storage.getInvoices(orgId);
  const detailed = await Promise.all(invList.map(i => storage.getInvoice(orgId, i.id)));
  return detailed.filter((x): x is NonNullable<typeof x> => !!x);
}

router.get("/api/exports/quickbooks/iif", requireAuth, requireOrg, async (req: Request, res: Response) => {
  if (!(await requireExportPlan(req, res))) return;
  try {
    const orgId = req.session.orgId!;
    const org = await storage.getOrg(orgId);
    const detailed = await loadFullInvoices(orgId);

    let iif = "";
    iif += "!ACCNT\tNAME\tACCNTTYPE\r\n";
    iif += "ACCNT\tAccounts Receivable\tAR\r\n";
    iif += "ACCNT\tSales Income\tINC\r\n";
    iif += "ACCNT\tUndeposited Funds\tOCASSET\r\n";
    iif += "ENDACCNT\r\n";

    iif += "!CUST\tNAME\tBADDR1\tEMAIL\tPHONE\r\n";
    const customers = await storage.getCustomers(orgId);
    for (const c of customers) {
      iif += [
        "CUST",
        csvEscape(c.name),
        csvEscape(c.address || ""),
        csvEscape(c.email || ""),
        csvEscape(c.phone || ""),
      ].join("\t") + "\r\n";
    }
    iif += "ENDCUST\r\n";

    iif += "!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO\r\n";
    iif += "!SPL\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO\r\n";
    iif += "!ENDTRNS\r\n";

    for (const inv of detailed) {
      const items = inv.items || [];
      const subtotal = items.reduce((s, it) => s + Number(it.qty) * Number(it.unitPrice), 0);
      const total = subtotal + subtotal * (Number(inv.taxRate) / 100) - Number(inv.discount);
      const docNum = inv.id.slice(0, 8).toUpperCase();
      const date = fmtDateMDY(inv.createdAt);
      const customerName = inv.customer?.name || inv.customerName || "Customer";
      const memo = `Invoice ${docNum}`;

      iif += ["TRNS", "INVOICE", date, "Accounts Receivable", csvEscape(customerName), total.toFixed(2), docNum, memo].join("\t") + "\r\n";
      iif += ["SPL", "INVOICE", date, "Sales Income", csvEscape(customerName), (-total).toFixed(2), memo].join("\t") + "\r\n";
      iif += "ENDTRNS\r\n";

      if (inv.status === "paid" && inv.paidAt) {
        const paidDate = fmtDateMDY(inv.paidAt);
        iif += ["TRNS", "PAYMENT", paidDate, "Undeposited Funds", csvEscape(customerName), total.toFixed(2), docNum, `Payment for ${docNum}`].join("\t") + "\r\n";
        iif += ["SPL", "PAYMENT", paidDate, "Accounts Receivable", csvEscape(customerName), (-total).toFixed(2), `Payment for ${docNum}`].join("\t") + "\r\n";
        iif += "ENDTRNS\r\n";
      }
    }

    const filename = `tradeflow-${safeFilenameSegment(org?.name || "")}-quickbooks-${fmtDateISO(new Date())}.iif`;
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(iif);
  } catch (err: any) {
    console.error("[exports] iif error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/exports/xero/customers.csv", requireAuth, requireOrg, async (req: Request, res: Response) => {
  if (!(await requireExportPlan(req, res))) return;
  const orgId = req.session.orgId!;
  const org = await storage.getOrg(orgId);
  const customers = await storage.getCustomers(orgId);

  let csv = csvRow([
    "ContactName", "EmailAddress", "FirstName", "LastName", "POAddressLine1",
    "POCity", "PORegion", "POPostalCode", "POCountry", "PhoneNumber",
  ]);
  for (const c of customers) {
    const parts = (c.name || "").trim().split(/\s+/);
    const first = parts[0] || c.name || "";
    const last = parts.slice(1).join(" ");
    csv += csvRow([
      c.name, c.email || "", first, last, c.address || "",
      "", "", "", "", c.phone || "",
    ]);
  }

  const filename = `tradeflow-${safeFilenameSegment(org?.name || "")}-xero-customers-${fmtDateISO(new Date())}.csv`;
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

router.get("/api/exports/xero/invoices.csv", requireAuth, requireOrg, async (req: Request, res: Response) => {
  if (!(await requireExportPlan(req, res))) return;
  const orgId = req.session.orgId!;
  const org = await storage.getOrg(orgId);
  const detailed = await loadFullInvoices(orgId);

  let csv = csvRow([
    "ContactName", "EmailAddress", "InvoiceNumber", "InvoiceDate", "DueDate",
    "Description", "Quantity", "UnitAmount", "AccountCode", "TaxType", "Currency", "Status",
  ]);

  for (const inv of detailed) {
    const number = inv.id.slice(0, 8).toUpperCase();
    const issueDate = fmtDateISO(inv.createdAt);
    const dueDate = fmtDateISO(inv.dueDate);
    const status = inv.status === "paid" ? "PAID" : (inv.status === "draft" ? "DRAFT" : "AUTHORISED");
    const items = inv.items || [];
    const customerName = inv.customer?.name || inv.customerName || "Customer";
    const customerEmail = inv.customer?.email || "";

    if (items.length === 0) {
      csv += csvRow([
        customerName, customerEmail, number, issueDate, dueDate,
        `Invoice ${number}`, 1, "0.00", "200", "NONE", "USD", status,
      ]);
    } else {
      for (const it of items) {
        csv += csvRow([
          customerName, customerEmail, number, issueDate, dueDate,
          it.description || `Invoice ${number}`,
          Number(it.qty || 1),
          Number(it.unitPrice || 0).toFixed(2),
          "200", "NONE", "USD", status,
        ]);
      }
    }
  }

  const filename = `tradeflow-${safeFilenameSegment(org?.name || "")}-xero-invoices-${fmtDateISO(new Date())}.csv`;
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

router.get("/api/exports/xero/payments.csv", requireAuth, requireOrg, async (req: Request, res: Response) => {
  if (!(await requireExportPlan(req, res))) return;
  const orgId = req.session.orgId!;
  const org = await storage.getOrg(orgId);
  const detailed = await loadFullInvoices(orgId);

  let csv = csvRow(["InvoiceNumber", "ContactName", "Date", "Amount", "Reference", "BankAccount"]);
  for (const inv of detailed) {
    if (inv.status !== "paid" || !inv.paidAt) continue;
    const items = inv.items || [];
    const subtotal = items.reduce((s, it) => s + Number(it.qty) * Number(it.unitPrice), 0);
    const total = subtotal + subtotal * (Number(inv.taxRate) / 100) - Number(inv.discount);
    csv += csvRow([
      inv.id.slice(0, 8).toUpperCase(),
      inv.customer?.name || inv.customerName || "Customer",
      fmtDateISO(inv.paidAt),
      total.toFixed(2),
      `Payment for ${inv.id.slice(0, 8).toUpperCase()}`,
      "Bank Account",
    ]);
  }

  const filename = `tradeflow-${safeFilenameSegment(org?.name || "")}-xero-payments-${fmtDateISO(new Date())}.csv`;
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

router.get("/api/exports/status", requireAuth, requireOrg, async (req: Request, res: Response) => {
  const ctx = await resolveRequestAccess(req);
  res.json({
    available: ctx ? hasFeature(ctx.access, "accounting_export") : false,
    plan: ctx?.access.planSlug ?? ctx?.org.plan ?? null,
  });
});

export default router;
