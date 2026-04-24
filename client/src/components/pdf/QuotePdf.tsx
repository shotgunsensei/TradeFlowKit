import { calcLineItemsTotal, calcTotalWithTaxDiscount } from "@shared/schema";
import { format } from "date-fns";
import type { Quote, QuoteItem, Customer, Org } from "@shared/schema";

interface QuotePdfProps {
  quote: Quote & { items?: QuoteItem[]; customer?: Customer; org?: Org };
}

export function QuotePdf({ quote }: QuotePdfProps) {
  const items = quote.items || [];
  const subtotal = calcLineItemsTotal(items);
  const totals = calcTotalWithTaxDiscount(subtotal, quote.taxRate || "0", quote.discount || "0");
  const customer = quote.customer;
  const org = quote.org;

  const statusColors: Record<string, string> = {
    draft: "#6b7280",
    sent: "#2563eb",
    accepted: "#16a34a",
    declined: "#dc2626",
  };
  const statusColor = statusColors[quote.status] || "#6b7280";

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
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#111827", letterSpacing: "-0.5px" }}>QUOTE</div>
          <div style={{ color: "#6b7280", fontSize: "13px", marginTop: "4px" }}>#{quote.id.slice(0, 8).toUpperCase()}</div>
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
            {quote.status}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "32px", borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb", padding: "12px 0", marginBottom: "24px" }}>
        <div>
          <div style={{ fontSize: "10px", textTransform: "uppercase", color: "#9ca3af", letterSpacing: "0.05em", marginBottom: "3px" }}>Date</div>
          <div style={{ color: "#374151" }}>{quote.createdAt ? format(new Date(quote.createdAt), "MMMM d, yyyy") : ""}</div>
        </div>
        {quote.expiresAt && (
          <div>
            <div style={{ fontSize: "10px", textTransform: "uppercase", color: "#9ca3af", letterSpacing: "0.05em", marginBottom: "3px" }}>Valid Until</div>
            <div style={{ color: "#374151" }}>{format(new Date(quote.expiresAt), "MMMM d, yyyy")}</div>
          </div>
        )}
      </div>

      {customer && (
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "10px", textTransform: "uppercase", color: "#9ca3af", letterSpacing: "0.05em", marginBottom: "6px" }}>Prepared For</div>
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
              <span>Tax ({quote.taxRate}%)</span>
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
        </div>
      </div>

      {quote.notes && (
        <div style={{ marginBottom: "24px", padding: "14px 16px", background: "#f9fafb", borderRadius: "6px", borderLeft: "3px solid #e5e7eb" }}>
          <div style={{ fontSize: "10px", textTransform: "uppercase", color: "#9ca3af", letterSpacing: "0.05em", marginBottom: "6px" }}>Notes / Terms</div>
          <div style={{ color: "#4b5563", lineHeight: "1.6" }}>{quote.notes}</div>
        </div>
      )}

      <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "16px", textAlign: "center", color: "#9ca3af", fontSize: "11px" }}>
        Thank you for your business.{org?.email ? ` Questions? ${org.email}` : org?.phone ? ` Questions? ${org.phone}` : ""}
      </div>
    </div>
  );
}
