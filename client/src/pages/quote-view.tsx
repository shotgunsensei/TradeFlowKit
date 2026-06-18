import { useQuery } from "@tanstack/react-query";
import { useParams, useSearch } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Printer, Mail } from "lucide-react";
import { calcLineItemsTotal, calcTotalWithTaxDiscount } from "@shared/schema";
import { format } from "date-fns";
import type { Quote, QuoteItem, Customer, Org } from "@shared/schema";

export default function QuoteView() {
  const { id } = useParams<{ id: string }>();
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") || "";

  const { data: quote, isLoading, error } = useQuery<Quote & { items?: QuoteItem[]; customerName?: string; customer?: Customer; org?: Org }>({
    queryKey: ["/api/quotes", id, "public", token],
    queryFn: async () => {
      const res = await fetch(`/api/quotes/${id}/public?token=${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error(res.status === 403 ? "This link is invalid or has expired." : "Quote not found");
      return res.json();
    },
    enabled: !!token,
  });

  const handlePrint = () => window.print();

  const handleEmail = () => {
    if (!quote) return;
    const customer = quote.customer;
    const items = quote.items || [];
    const subtotal = calcLineItemsTotal(items);
    const totals = calcTotalWithTaxDiscount(subtotal, quote.taxRate || "0", quote.discount || "0");
    const subject = encodeURIComponent(`Quote #${quote.id.slice(0, 8)} from ${quote.org?.name || "Our Company"}`);
    const body = encodeURIComponent(
      `Dear ${customer?.name || "Customer"},\n\nPlease find your quote #${quote.id.slice(0, 8)}.\n\nTotal: $${totals.total.toFixed(2)}\n` +
      (quote.expiresAt ? `Valid until: ${format(new Date(quote.expiresAt), "MMM d, yyyy")}\n` : "") +
      `\nItems:\n${items.map(it => `- ${it.description}: ${it.qty} x $${Number(it.unitPrice).toFixed(2)}`).join("\n")}\n\n` +
      `${quote.notes ? `Notes: ${quote.notes}\n\n` : ""}Thank you!\n\n${quote.org?.name || ""}`
    );
    window.open(`mailto:${customer?.email || ""}?subject=${subject}&body=${body}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-background p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (!token || error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground font-medium">
            {error ? (error as Error).message : "This link is invalid or has expired."}
          </p>
          <p className="text-sm text-muted-foreground">Please request a new share link from your service provider.</p>
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Quote not found</p>
      </div>
    );
  }

  const items = quote.items || [];
  const subtotal = calcLineItemsTotal(items);
  const totals = calcTotalWithTaxDiscount(subtotal, quote.taxRate || "0", quote.discount || "0");
  const customer = quote.customer;
  const org = quote.org;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Action bar — hidden when printing */}
        <div className="flex items-center justify-between print:hidden">
          <p className="text-sm text-muted-foreground">Quote Preview</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleEmail} data-testid="button-email-quote-view">
              <Mail className="h-4 w-4 mr-1.5" />
              Email
            </Button>
            <Button size="sm" onClick={handlePrint} data-testid="button-print-quote-view">
              <Printer className="h-4 w-4 mr-1.5" />
              Print / Save PDF
            </Button>
          </div>
        </div>

        {/* Document */}
        <div className="bg-white dark:bg-card rounded-xl shadow-sm border p-8 space-y-8 print:shadow-none print:border-0 print:rounded-none" data-testid="quote-document">
          {/* Header */}
          <div className="flex justify-between items-start gap-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">QUOTE</h1>
              <p className="text-gray-500 text-sm mt-1">#{quote.id.slice(0, 8).toUpperCase()}</p>
            </div>
            {org && (
              <div className="text-right text-sm flex flex-col items-end gap-2">
                {org.logoUrl && (
                  <img
                    src={org.logoUrl}
                    alt={org.name}
                    className="max-h-14 max-w-[180px] object-contain"
                    data-testid="img-quote-view-logo"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{org.name}</p>
                  {org.address && <p className="text-gray-500">{org.address}</p>}
                  {org.phone && <p className="text-gray-500">{org.phone}</p>}
                  {org.email && <p className="text-gray-500">{org.email}</p>}
                </div>
              </div>
            )}
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap gap-8 text-sm border-t border-b py-4">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Date</p>
              <p className="text-gray-800 dark:text-gray-200">{quote.createdAt ? format(new Date(quote.createdAt), "MMMM d, yyyy") : ""}</p>
            </div>
            {quote.expiresAt && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Valid Until</p>
                <p className="text-gray-800 dark:text-gray-200">{format(new Date(quote.expiresAt), "MMMM d, yyyy")}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Status</p>
              <p className="capitalize text-gray-800 dark:text-gray-200">{quote.status}</p>
            </div>
          </div>

          {/* Bill To */}
          {customer && (
            <div className="text-sm">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Prepared For</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{customer.name}</p>
              {customer.address && <p className="text-gray-500">{customer.address}</p>}
              {customer.phone && <p className="text-gray-500">{customer.phone}</p>}
              {customer.email && <p className="text-gray-500">{customer.email}</p>}
            </div>
          )}

          {/* Line Items */}
          <div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-semibold text-gray-600 dark:text-gray-400">Description</th>
                  <th className="pb-2 font-semibold text-gray-600 dark:text-gray-400 text-right w-16">Qty</th>
                  <th className="pb-2 font-semibold text-gray-600 dark:text-gray-400 text-right w-24">Unit Price</th>
                  <th className="pb-2 font-semibold text-gray-600 dark:text-gray-400 text-right w-24">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2.5 text-gray-800 dark:text-gray-200">{item.description}</td>
                    <td className="py-2.5 text-right text-gray-600 dark:text-gray-400">{Number(item.qty)}</td>
                    <td className="py-2.5 text-right text-gray-600 dark:text-gray-400">${Number(item.unitPrice).toFixed(2)}</td>
                    <td className="py-2.5 text-right font-medium text-gray-900 dark:text-gray-100">
                      ${(Number(item.qty) * Number(item.unitPrice)).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="space-y-1.5 w-48">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>Subtotal</span>
                <span>${totals.subtotal.toFixed(2)}</span>
              </div>
              {totals.tax > 0 && (
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Tax ({quote.taxRate}%)</span>
                  <span>${totals.tax.toFixed(2)}</span>
                </div>
              )}
              {totals.discount > 0 && (
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Discount</span>
                  <span>-${totals.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base text-gray-900 dark:text-gray-100 border-t pt-2 mt-1">
                <span>Total</span>
                <span>${totals.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t pt-4 text-center text-xs text-gray-400">
            Thank you for your business. Questions? Contact us at{" "}
            {org?.email || org?.phone || org?.name || "us"}.
          </div>
        </div>
      </div>
    </div>
  );
}
