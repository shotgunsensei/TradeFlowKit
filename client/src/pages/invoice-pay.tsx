import { useState, useEffect } from "react";
import { useParams, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, CreditCard, Building2 } from "lucide-react";
import { calcLineItemsTotal, calcTotalWithTaxDiscount } from "@shared/schema";
import { format } from "date-fns";
import type { Invoice, InvoiceItem, Customer, Org } from "@shared/schema";

type PublicInvoice = Invoice & {
  items?: InvoiceItem[];
  customerName?: string;
  customer?: Customer;
  org?: Org;
};

export default function InvoicePayPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const paidSuccess = params.get("paid") === "true";
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const { data: invoice, isLoading } = useQuery<PublicInvoice>({
    queryKey: [`/api/invoices/${id}/public`],
    queryFn: async () => {
      const res = await fetch(`/api/invoices/${id}/public`);
      if (!res.ok) throw new Error("Invoice not found");
      return res.json();
    },
    retry: false,
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/invoices/${id}/payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create payment session");
      return data as { url: string };
    },
    onSuccess: ({ url }) => {
      if (url) window.location.href = url;
    },
    onError: (err: any) => {
      setPaymentError(err.message || "Payment setup failed. Please try again.");
    },
  });

  const org = invoice?.org;
  const items = invoice?.items || [];
  const subtotal = calcLineItemsTotal(items);
  const totals = invoice
    ? calcTotalWithTaxDiscount(subtotal, invoice.taxRate || "0", invoice.discount || "0")
    : { subtotal: 0, tax: 0, discount: 0, total: 0 };

  const isPaid = invoice?.status === "paid";

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 dark:bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-muted/30 dark:bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Invoice not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (paidSuccess || isPaid) {
    return (
      <div className="min-h-screen bg-muted/30 dark:bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-10 pb-10 text-center space-y-4">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="h-9 w-9 text-emerald-600" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold text-emerald-700" data-testid="text-payment-success">Payment Received!</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Thank you — your payment of{" "}
                <strong className="text-foreground">${totals.total.toFixed(2)}</strong> has been received.
              </p>
              {org && <p className="text-sm text-muted-foreground mt-1">— {org.name}</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 dark:bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-1">
          {org?.logoUrl && (
            <img
              src={org.logoUrl}
              alt={`${org.name} logo`}
              className="h-12 w-auto mx-auto object-contain mb-2"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          {!org?.logoUrl && (
            <div className="flex justify-center mb-2">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
            </div>
          )}
          <h1 className="text-lg font-semibold" data-testid="text-org-name">{org?.name || "Invoice Payment"}</h1>
          <p className="text-sm text-muted-foreground">
            Invoice #{invoice.id.slice(0, 8).toUpperCase()}
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Invoice Details</span>
              <Badge
                variant={invoice.status === "paid" ? "default" : "secondary"}
                className={
                  invoice.status === "paid"
                    ? "bg-emerald-600 text-white"
                    : invoice.status === "processing"
                      ? "bg-amber-100 text-amber-800"
                      : ""
                }
                data-testid="badge-invoice-status"
              >
                {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {invoice.customer && (
              <div>
                <p className="text-xs text-muted-foreground">Bill To</p>
                <p className="text-sm font-medium" data-testid="text-customer-name">{invoice.customer.name}</p>
              </div>
            )}

            {items.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Items</p>
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {item.description}
                      {Number(item.qty) !== 1 && ` × ${Number(item.qty)}`}
                    </span>
                    <span>${(Number(item.qty) * Number(item.unitPrice)).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}

            <Separator />

            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>${totals.subtotal.toFixed(2)}</span>
              </div>
              {totals.tax > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax ({invoice.taxRate}%)</span>
                  <span>${totals.tax.toFixed(2)}</span>
                </div>
              )}
              {totals.discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span>-${totals.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-1">
                <span>Total Due</span>
                <span data-testid="text-invoice-total">${totals.total.toFixed(2)}</span>
              </div>
            </div>

            {invoice.dueDate && (
              <p className="text-xs text-muted-foreground">
                Due by {format(new Date(invoice.dueDate), "MMMM d, yyyy")}
              </p>
            )}
          </CardContent>
        </Card>

        {paymentError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" data-testid="text-payment-error">
            {paymentError}
          </div>
        )}

        {!org?.stripeConnectAccountId ? (
          <div className="rounded-md border bg-muted/50 p-4 text-center text-sm text-muted-foreground">
            Online payments are not available for this invoice.
          </div>
        ) : (
          <div className="space-y-2">
            <Button
              className="w-full gap-2"
              size="lg"
              onClick={() => {
                setPaymentError(null);
                payMutation.mutate();
              }}
              disabled={payMutation.isPending}
              data-testid="button-pay-now"
            >
              <CreditCard className="h-4 w-4" />
              {payMutation.isPending ? "Redirecting to payment..." : `Pay $${totals.total.toFixed(2)}`}
            </Button>
            <div
              className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"
              data-testid="text-payment-methods"
            >
              <CreditCard className="h-3.5 w-3.5" />
              <span>Pay by credit/debit card or</span>
              <Building2 className="h-3.5 w-3.5" />
              <span>ACH bank transfer</span>
            </div>
            <p
              className="text-xs text-center text-muted-foreground"
              data-testid="text-ach-notice"
            >
              ACH bank transfers typically take 3–5 business days to clear.
            </p>
          </div>
        )}

        <p className="text-xs text-center text-muted-foreground">
          Secure payment powered by Stripe
        </p>
      </div>
    </div>
  );
}
