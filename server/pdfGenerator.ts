import PDFDocument from "pdfkit";
import { format } from "date-fns";
import {
  calcLineItemsTotal,
  calcTotalWithTaxDiscount,
  type Quote,
  type QuoteItem,
  type Invoice,
  type InvoiceItem,
  type Customer,
  type Org,
} from "@shared/schema";

type QuoteWithRelations = Quote & {
  items?: QuoteItem[];
  customer?: Customer;
  org?: Org;
};

type InvoiceWithRelations = Invoice & {
  items?: InvoiceItem[];
  customer?: Customer;
  org?: Org;
};

interface LineItem {
  description: string;
  qty: string | number;
  unitPrice: string | number;
}

function streamToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

const COLORS = {
  text: "#1a1a1a",
  muted: "#6b7280",
  faint: "#9ca3af",
  rule: "#e5e7eb",
  heading: "#111827",
  zebra: "#f9fafb",
  total: "#111827",
  due: "#dc2626",
  paid: "#16a34a",
};

function drawHeader(
  doc: PDFKit.PDFDocument,
  org: Org | undefined,
  title: string,
  refNumber: string,
  status: string,
) {
  const statusColors: Record<string, string> = {
    draft: "#6b7280",
    sent: "#2563eb",
    accepted: "#16a34a",
    declined: "#dc2626",
    paid: "#16a34a",
    void: "#9ca3af",
  };
  const statusColor = statusColors[status] || "#6b7280";

  const startY = doc.y;

  if (org) {
    doc
      .fontSize(16)
      .fillColor(COLORS.heading)
      .font("Helvetica-Bold")
      .text(org.name, 48, startY);
    doc.font("Helvetica").fontSize(10).fillColor(COLORS.muted);
    if (org.address) doc.text(org.address);
    if (org.phone) doc.text(org.phone);
    if (org.email) doc.text(org.email);
  }

  const rightX = 380;
  doc
    .fontSize(26)
    .fillColor(COLORS.heading)
    .font("Helvetica-Bold")
    .text(title, rightX, startY, { width: 170, align: "right" });
  doc
    .fontSize(11)
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .text(`#${refNumber}`, rightX, doc.y, { width: 170, align: "right" });

  const badgeY = doc.y + 4;
  const badgeText = status.toUpperCase();
  const badgeWidth = doc.widthOfString(badgeText) + 14;
  const badgeX = 48 + 502 - badgeWidth;
  doc
    .roundedRect(badgeX, badgeY, badgeWidth, 16, 8)
    .fillColor(statusColor)
    .fill();
  doc
    .fillColor("#ffffff")
    .fontSize(9)
    .font("Helvetica-Bold")
    .text(badgeText, badgeX, badgeY + 4, { width: badgeWidth, align: "center" });

  doc.fillColor(COLORS.text).font("Helvetica");
  doc.y = Math.max(startY + 80, badgeY + 30);
  doc.x = 48;
}

function drawDateBlocks(
  doc: PDFKit.PDFDocument,
  blocks: { label: string; value: string; emphasized?: boolean; color?: string }[],
) {
  const y = doc.y + 6;
  doc
    .moveTo(48, y - 2)
    .lineTo(550, y - 2)
    .strokeColor(COLORS.rule)
    .lineWidth(0.7)
    .stroke();
  let x = 48;
  blocks.forEach((b) => {
    doc.fillColor(COLORS.faint).font("Helvetica").fontSize(8).text(b.label.toUpperCase(), x, y + 6);
    doc
      .fillColor(b.color || COLORS.text)
      .font(b.emphasized ? "Helvetica-Bold" : "Helvetica")
      .fontSize(10)
      .text(b.value, x, y + 18);
    x += 140;
  });
  doc.y = y + 36;
  doc
    .moveTo(48, doc.y)
    .lineTo(550, doc.y)
    .strokeColor(COLORS.rule)
    .lineWidth(0.7)
    .stroke();
  doc.y += 14;
  doc.x = 48;
}

function drawCustomerBlock(doc: PDFKit.PDFDocument, label: string, customer: Customer) {
  doc.fillColor(COLORS.faint).font("Helvetica").fontSize(8).text(label.toUpperCase(), 48, doc.y);
  doc.moveDown(0.3);
  doc.fillColor(COLORS.heading).font("Helvetica-Bold").fontSize(11).text(customer.name);
  doc.font("Helvetica").fontSize(10).fillColor(COLORS.muted);
  if (customer.address) doc.text(customer.address);
  if (customer.phone) doc.text(customer.phone);
  if (customer.email) doc.text(customer.email);
  doc.moveDown(1);
  doc.fillColor(COLORS.text);
}

function drawItemsTable(doc: PDFKit.PDFDocument, items: LineItem[]) {
  const colX = { desc: 48, qty: 340, unit: 400, total: 480 };
  const headerY = doc.y;
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("DESCRIPTION", colX.desc, headerY)
    .text("QTY", colX.qty, headerY, { width: 50, align: "right" })
    .text("UNIT PRICE", colX.unit, headerY, { width: 70, align: "right" })
    .text("TOTAL", colX.total, headerY, { width: 70, align: "right" });
  doc.y = headerY + 14;
  doc
    .moveTo(48, doc.y)
    .lineTo(550, doc.y)
    .strokeColor(COLORS.rule)
    .lineWidth(1.2)
    .stroke();
  doc.y += 4;

  items.forEach((it, i) => {
    const rowY = doc.y;
    const rowH = 22;
    if (i % 2 === 1) {
      doc.rect(48, rowY - 2, 502, rowH).fillColor(COLORS.zebra).fill();
    }
    doc
      .fillColor(COLORS.text)
      .font("Helvetica")
      .fontSize(10)
      .text(it.description || "", colX.desc, rowY + 4, { width: 285 })
      .text(`${Number(it.qty)}`, colX.qty, rowY + 4, { width: 50, align: "right" })
      .text(`$${Number(it.unitPrice).toFixed(2)}`, colX.unit, rowY + 4, {
        width: 70,
        align: "right",
      })
      .font("Helvetica-Bold")
      .text(
        `$${(Number(it.qty) * Number(it.unitPrice)).toFixed(2)}`,
        colX.total,
        rowY + 4,
        { width: 70, align: "right" },
      );
    doc.y = rowY + rowH;
    doc.font("Helvetica");
    if (doc.y > 700) {
      doc.addPage();
      doc.y = 60;
    }
  });

  doc
    .moveTo(48, doc.y + 2)
    .lineTo(550, doc.y + 2)
    .strokeColor(COLORS.rule)
    .lineWidth(0.7)
    .stroke();
  doc.y += 12;
}

function drawTotalsBlock(
  doc: PDFKit.PDFDocument,
  totals: { subtotal: number; tax: number; discount: number; total: number },
  taxRate: string,
  trailing?: { label: string; value: string; color: string }[],
) {
  const labelX = 380;
  const valueX = 480;
  const rowH = 16;
  const draw = (label: string, value: string, opts?: { bold?: boolean; color?: string; rule?: boolean }) => {
    if (opts?.rule) {
      doc.moveTo(labelX, doc.y).lineTo(550, doc.y).strokeColor(COLORS.heading).lineWidth(1.2).stroke();
      doc.y += 4;
    }
    doc
      .font(opts?.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(opts?.bold ? 12 : 10)
      .fillColor(opts?.color || COLORS.text)
      .text(label, labelX, doc.y, { width: 100, align: "left", continued: false });
    doc
      .font(opts?.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(opts?.bold ? 12 : 10)
      .fillColor(opts?.color || COLORS.text)
      .text(value, valueX, doc.y - rowH, { width: 70, align: "right" });
    doc.y += 4;
  };

  doc.y += 8;
  draw("Subtotal", `$${totals.subtotal.toFixed(2)}`);
  if (totals.tax > 0) draw(`Tax (${taxRate}%)`, `$${totals.tax.toFixed(2)}`);
  if (totals.discount > 0) draw("Discount", `-$${totals.discount.toFixed(2)}`);
  draw("Total", `$${totals.total.toFixed(2)}`, { bold: true, rule: true });
  if (trailing) {
    trailing.forEach((t) => draw(t.label, t.value, { color: t.color, bold: true }));
  }
  doc.y += 8;
}

function drawNotes(doc: PDFKit.PDFDocument, label: string, content: string, accent = COLORS.rule, bg = COLORS.zebra) {
  const startY = doc.y;
  doc.font("Helvetica").fontSize(10);
  const contentHeight = doc.heightOfString(content, { width: 480 });
  const blockHeight = 22 + contentHeight + 14;
  doc.rect(48, startY, 502, blockHeight).fillColor(bg).fill();
  doc.rect(48, startY, 3, blockHeight).fillColor(accent).fill();
  doc.fillColor(COLORS.faint).font("Helvetica-Bold").fontSize(8).text(label.toUpperCase(), 60, startY + 8);
  doc
    .fillColor(COLORS.text)
    .font("Helvetica")
    .fontSize(10)
    .text(content, 60, startY + 22, { width: 480 });
  doc.y = startY + blockHeight + 8;
  doc.x = 48;
}

function drawFooter(doc: PDFKit.PDFDocument, org: Org | undefined) {
  doc.y = Math.max(doc.y, 740);
  doc.moveTo(48, doc.y).lineTo(550, doc.y).strokeColor(COLORS.rule).lineWidth(0.5).stroke();
  doc.y += 6;
  const contact = org?.email || org?.phone || "";
  const msg = `Thank you for your business.${contact ? ` Questions? ${contact}` : ""}`;
  doc.fillColor(COLORS.faint).font("Helvetica").fontSize(9).text(msg, 48, doc.y, {
    width: 502,
    align: "center",
  });
}

export async function generateQuotePdf(quote: QuoteWithRelations): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 48, bottom: 48, left: 48, right: 48 } });
  const bufferPromise = streamToBuffer(doc);

  const items = quote.items || [];
  const subtotal = calcLineItemsTotal(items as any);
  const totals = calcTotalWithTaxDiscount(subtotal, quote.taxRate || "0", quote.discount || "0");

  drawHeader(doc, quote.org, "QUOTE", quote.id.slice(0, 8).toUpperCase(), quote.status);

  const blocks = [
    {
      label: "Date",
      value: quote.createdAt ? format(new Date(quote.createdAt), "MMMM d, yyyy") : "",
    },
  ];
  if (quote.expiresAt) {
    blocks.push({
      label: "Valid Until",
      value: format(new Date(quote.expiresAt), "MMMM d, yyyy"),
    });
  }
  drawDateBlocks(doc, blocks);

  if (quote.customer) drawCustomerBlock(doc, "Prepared For", quote.customer);
  drawItemsTable(doc, items as LineItem[]);
  drawTotalsBlock(doc, totals, quote.taxRate || "0");
  if (quote.notes) drawNotes(doc, "Notes / Terms", quote.notes);
  drawFooter(doc, quote.org);

  doc.end();
  return bufferPromise;
}

export async function generateInvoicePdf(invoice: InvoiceWithRelations): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 48, bottom: 48, left: 48, right: 48 } });
  const bufferPromise = streamToBuffer(doc);

  const items = invoice.items || [];
  const subtotal = calcLineItemsTotal(items as any);
  const totals = calcTotalWithTaxDiscount(subtotal, invoice.taxRate || "0", invoice.discount || "0");
  const isPaid = invoice.status === "paid";

  drawHeader(doc, invoice.org, "INVOICE", invoice.id.slice(0, 8).toUpperCase(), invoice.status);

  const blocks: { label: string; value: string; emphasized?: boolean; color?: string }[] = [
    {
      label: "Invoice Date",
      value: invoice.createdAt ? format(new Date(invoice.createdAt), "MMMM d, yyyy") : "",
    },
  ];
  if (invoice.dueDate) {
    blocks.push({
      label: "Due Date",
      value: format(new Date(invoice.dueDate), "MMMM d, yyyy"),
      emphasized: true,
    });
  }
  if (isPaid && invoice.paidAt) {
    blocks.push({
      label: "Date Paid",
      value: format(new Date(invoice.paidAt), "MMMM d, yyyy"),
      emphasized: true,
      color: COLORS.paid,
    });
  }
  drawDateBlocks(doc, blocks);

  if (invoice.customer) drawCustomerBlock(doc, "Bill To", invoice.customer);
  drawItemsTable(doc, items as LineItem[]);

  const trailing = isPaid
    ? [{ label: "Amount Paid", value: `$${totals.total.toFixed(2)}`, color: COLORS.paid }]
    : [{ label: "Balance Due", value: `$${totals.total.toFixed(2)}`, color: COLORS.due }];
  drawTotalsBlock(doc, totals, invoice.taxRate || "0", trailing);

  if (invoice.notes) drawNotes(doc, "Notes / Terms", invoice.notes);
  if (isPaid && (invoice as any).paymentNotes) {
    drawNotes(doc, "Payment Notes", (invoice as any).paymentNotes, "#86efac", "#f0fdf4");
  }
  drawFooter(doc, invoice.org);

  doc.end();
  return bufferPromise;
}
