import { calcLineItemsTotal, calcTotalWithTaxDiscount } from "@shared/schema";
import { format } from "date-fns";
import type { Invoice, InvoiceItem, Customer, Org } from "@shared/schema";

interface InvoicePdfProps {
  invoice: Invoice & { items?: InvoiceItem[]; customer?: Customer; org?: Org };
}

export function InvoicePdf({ invoice }: InvoicePdfProps) {
  const items = invoice.items || [];
  const subtotal = calcLineItemsTotal(items);
  const totals = calcTotalWithTaxDiscount(subtotal, invoice.taxRate || "0", invoice.discount || "0");
  const customer = invoice.customer;
  const org = invoice.org;
  const isPaid = invoice.status === "paid";

  const statusColors: Record<string, string> = {
    draft: "#6b7280",
    sent: "#2563eb",
    paid: "#16a34a",
    void: "#9ca3af",
  };
  const statusColor = statusColors[invoice.status] || "#6b7280";

  return (
    <div
      id="pdf-print-root"
      style={{
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "12px",
        color: "#1a1a1a",
        background: "white",
        padding: "40px 48px",
        maxWidth: "740px",
        margin: "0 auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px" }}>
        <div>
          {org?.logoUrl && (
            <img
              src={org.logoUrl}
              alt={org.name}
              style={{ maxHeight: "56px", maxWidth: "180px", marginBottom: "8px", objectFit: "contain" }}
            />
          )}
          {org && (
            <div>
              <div style={{ fontSize: "18px", fontWeight: "700", color: "#111827" }}>{org.name}</div>
              {org.address && <div style={{ color: "#6b7280", marginTop: "2px" }}>{org.address}</div>}
              {org.phone && <div style={{ color: "#6b7280" }}>{org.phone}</div>}
              {org.email && <div style={{ color: "#6b7280" }}>{org.email}</div>}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#111827", letterSpacing: "-0.5px" }}>INVOICE</div>
          <div style={{ color: "#6b7280", fontSize: "13px", marginTop: "4px" }}>#{invoice.id.slice(0, 8).toUpperCase()}</div>
          <div
            style={{
              display: "inline-block",
              marginTop: "8px",
              padding: "3px 10px",
              borderRadius: "9999px",
              fontSize: "11px",
              fontWeight: "600",
              textTransform: "capitalize",
              color: "white",
              background: statusColor,
            }}
          >
            {invoice.status}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "32px", borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb", padding: "12px 0", marginBottom: "24px" }}>
        <div>
          <div style={{ fontSize: "10px", textTransform: "uppercase", color: "#9ca3af", letterSpacing: "0.05em", marginBottom: "3px" }}>Invoice Date</div>
          <div style={{ color: "#374151" }}>{invoice.createdAt ? format(new Date(invoice.createdAt), "MMMM d, yyyy") : ""}</div>
        </div>
        {invoice.dueDate && (
          <div>
            <div style={{ fontSize: "10px", textTransform: "uppercase", color: "#9ca3af", letterSpacing: "0.05em", marginBottom: "3px" }}>Due Date</div>
            <div style={{ color: "#374151", fontWeight: "600" }}>{format(new Date(invoice.dueDate), "MMMM d, yyyy")}</div>
          </div>
        )}
        {isPaid && invoice.paidAt && (
          <div>
            <div style={{ fontSize: "10px", textTransform: "uppercase", color: "#9ca3af", letterSpacing: "0.05em", marginBottom: "3px" }}>Date Paid</div>
            <div style={{ color: "#16a34a", fontWeight: "600" }}>{format(new Date(invoice.paidAt), "MMMM d, yyyy")}</div>
          </div>
        )}
      </div>

      {customer && (
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "10px", textTransform: "uppercase", color: "#9ca3af", letterSpacing: "0.05em", marginBottom: "6px" }}>Bill To</div>
          <div style={{ fontWeight: "600", color: "#111827" }}>{customer.name}</div>
          {customer.address && <div style={{ color: "#6b7280", marginTop: "2px" }}>{customer.address}</div>}
          {customer.phone && <div style={{ color: "#6b7280" }}>{customer.phone}</div>}
          {customer.email && <div style={{ color: "#6b7280" }}>{customer.email}</div>}
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
            <th style={{ textAlign: "left", padding: "8px 4px", fontWeight: "600", color: "#6b7280", fontSize: "11px", textTransform: "uppercase" }}>Description</th>
            <th style={{ textAlign: "right", padding: "8px 4px", fontWeight: "600", color: "#6b7280", fontSize: "11px", textTransform: "uppercase", width: "60px" }}>Qty</th>
            <th style={{ textAlign: "right", padding: "8px 4px", fontWeight: "600", color: "#6b7280", fontSize: "11px", textTransform: "uppercase", width: "90px" }}>Unit Price</th>
            <th style={{ textAlign: "right", padding: "8px 4px", fontWeight: "600", color: "#6b7280", fontSize: "11px", textTransform: "uppercase", width: "90px" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.id} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "white" : "#f9fafb" }}>
              <td style={{ padding: "9px 4px", color: "#374151" }}>{item.description}</td>
              <td style={{ padding: "9px 4px", textAlign: "right", color: "#6b7280" }}>{Number(item.qty)}</td>
              <td style={{ padding: "9px 4px", textAlign: "right", color: "#6b7280" }}>${Number(item.unitPrice).toFixed(2)}</td>
              <td style={{ padding: "9px 4px", textAlign: "right", fontWeight: "500", color: "#111827" }}>
                ${(Number(item.qty) * Number(item.unitPrice)).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "28px" }}>
        <div style={{ width: "200px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: "#6b7280" }}>
            <span>Subtotal</span>
            <span>${totals.subtotal.toFixed(2)}</span>
          </div>
          {totals.tax > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: "#6b7280" }}>
              <span>Tax ({invoice.taxRate}%)</span>
              <span>${totals.tax.toFixed(2)}</span>
            </div>
          )}
          {totals.discount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: "#6b7280" }}>
              <span>Discount</span>
              <span>-${totals.discount.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 4px", borderTop: "2px solid #111827", fontWeight: "700", fontSize: "15px", color: "#111827" }}>
            <span>Total</span>
            <span>${totals.total.toFixed(2)}</span>
          </div>
          {isPaid && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: "#16a34a", fontWeight: "600" }}>
              <span>Amount Paid</span>
              <span>${totals.total.toFixed(2)}</span>
            </div>
          )}
          {!isPaid && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: "#dc2626", fontWeight: "600" }}>
              <span>Balance Due</span>
              <span>${totals.total.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>

      {invoice.notes && (
        <div style={{ marginBottom: "24px", padding: "14px 16px", background: "#f9fafb", borderRadius: "6px", borderLeft: "3px solid #e5e7eb" }}>
          <div style={{ fontSize: "10px", textTransform: "uppercase", color: "#9ca3af", letterSpacing: "0.05em", marginBottom: "6px" }}>Notes / Terms</div>
          <div style={{ color: "#4b5563", lineHeight: "1.6" }}>{invoice.notes}</div>
        </div>
      )}

      {invoice.paymentNotes && isPaid && (
        <div style={{ marginBottom: "24px", padding: "14px 16px", background: "#f0fdf4", borderRadius: "6px", borderLeft: "3px solid #86efac" }}>
          <div style={{ fontSize: "10px", textTransform: "uppercase", color: "#9ca3af", letterSpacing: "0.05em", marginBottom: "6px" }}>Payment Notes</div>
          <div style={{ color: "#4b5563", lineHeight: "1.6" }}>{invoice.paymentNotes}</div>
        </div>
      )}

      <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "16px", textAlign: "center", color: "#9ca3af", fontSize: "11px" }}>
        Thank you for your business.{org?.email ? ` Questions? ${org.email}` : org?.phone ? ` Questions? ${org.phone}` : ""}
      </div>
    </div>
  );
}
