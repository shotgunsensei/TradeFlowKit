import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { PageHeader } from "@/components/page-header";
import { MobileActionBar } from "@/components/mobile-action-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Edit, Trash2, Printer, Mail, CheckCircle2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { calcLineItemsTotal, calcTotalWithTaxDiscount } from "@shared/schema";
import { format } from "date-fns";
import type { Invoice, InvoiceItem, Customer, Org } from "@shared/schema";
import { InvoicePdf } from "@/components/pdf/InvoicePdf";
import { PdfDownloadButton } from "@/components/pdf/PdfDownloadButton";

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [paymentNotes, setPaymentNotes] = useState("");

  const { data: invoice, isLoading } = useQuery<Invoice & { items?: InvoiceItem[]; customerName?: string; customer?: Customer; org?: Org }>({
    queryKey: ["/api/invoices", id],
  });

  const statusMutation = useMutation({
    mutationFn: async (data: { status: string; paymentNotes?: string }) => {
      await apiRequest("PATCH", `/api/invoices/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setShowMarkPaid(false);
      toast({ title: "Invoice updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/invoices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      navigate("/invoices");
      toast({ title: "Invoice deleted" });
    },
  });

  const handlePrint = () => window.print();

  const handleEmail = () => {
    if (!invoice) return;
    const customer = invoice.customer;
    const items = invoice.items || [];
    const subtotal = calcLineItemsTotal(items);
    const totals = calcTotalWithTaxDiscount(subtotal, invoice.taxRate || "0", invoice.discount || "0");
    const subject = encodeURIComponent(`Invoice #${invoice.id.slice(0, 8)} from ${invoice.org?.name || "Our Company"}`);
    const body = encodeURIComponent(
      `Dear ${customer?.name || "Customer"},\n\nPlease find your invoice #${invoice.id.slice(0, 8)}.\n\nTotal Due: $${totals.total.toFixed(2)}\n` +
      `${invoice.dueDate ? `Due Date: ${format(new Date(invoice.dueDate), "MMM d, yyyy")}\n` : ""}` +
      `\nItems:\n${items.map(it => `- ${it.description}: ${it.qty} x $${Number(it.unitPrice).toFixed(2)}`).join("\n")}\n\n` +
      `${invoice.notes ? `Notes: ${invoice.notes}\n\n` : ""}Thank you!\n\n${invoice.org?.name || ""}`
    );
    window.open(`mailto:${customer?.email || ""}?subject=${subject}&body=${body}`);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!invoice) {
    return <div className="p-6 text-center text-muted-foreground">Invoice not found</div>;
  }

  const items = invoice.items || [];
  const subtotal = calcLineItemsTotal(items);
  const totals = calcTotalWithTaxDiscount(subtotal, invoice.taxRate || "0", invoice.discount || "0");
  const customer = invoice.customer;
  const org = invoice.org;
  const isPaid = invoice.status === "paid";

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={`Invoice #${invoice.id.slice(0, 8)}`}
        description={invoice.customerName || undefined}
        actions={
          <div className="hidden md:flex items-center gap-2 flex-wrap print:hidden">
            <Button variant="outline" size="sm" onClick={() => navigate("/invoices")} data-testid="button-back-invoices">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            {!isPaid && (
              <Button
                size="sm"
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => setShowMarkPaid(true)}
                data-testid="button-mark-paid"
              >
                <CheckCircle2 className="h-4 w-4" />
                Mark as Paid
              </Button>
            )}
            <PdfDownloadButton
              filename={`Invoice-${invoice.id.slice(0, 8).toUpperCase()}.pdf`}
              testId="button-download-pdf-invoice"
            >
              Download PDF
            </PdfDownloadButton>
            <Button variant="outline" size="sm" onClick={handlePrint} data-testid="button-print-invoice">
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
            <Button variant="outline" size="sm" onClick={handleEmail} data-testid="button-email-invoice">
              <Mail className="h-4 w-4 mr-1" /> Email
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/invoices/${id}/edit`)} data-testid="button-edit-invoice">
              <Edit className="h-4 w-4 mr-1" /> Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { if (confirm("Delete this invoice?")) deleteMutation.mutate(); }}
              data-testid="button-delete-invoice"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-4 md:p-6 pb-24 md:pb-6">
        <div className="flex items-center gap-6 flex-wrap print:hidden mb-6">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Status</p>
            <Select value={invoice.status} onValueChange={(v) => statusMutation.mutate({ status: v })}>
              <SelectTrigger className="w-[160px]" data-testid="select-invoice-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="void">Void</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {invoice.dueDate && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Due Date</p>
              <p className="text-sm">{format(new Date(invoice.dueDate), "MMM d, yyyy")}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Created</p>
            <p className="text-sm">{invoice.createdAt ? format(new Date(invoice.createdAt), "MMM d, yyyy") : ""}</p>
          </div>
          {invoice.paidAt && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Paid</p>
              <p className="text-sm text-emerald-600">{format(new Date(invoice.paidAt), "MMM d, yyyy")}</p>
            </div>
          )}
        </div>

        <div className="hidden print:block mb-8 border-b pb-6">
          <div className="flex justify-between items-start">
            <div>
              {org && <h2 className="text-xl font-bold">{org.name}</h2>}
              {org?.address && <p className="text-sm text-gray-600 mt-0.5">{org.address}</p>}
              {org?.phone && <p className="text-sm text-gray-600">{org.phone}</p>}
              {org?.email && <p className="text-sm text-gray-600">{org.email}</p>}
            </div>
            <div className="text-right">
              <h1 className="text-3xl font-bold">INVOICE</h1>
              <p className="text-sm text-gray-600 mt-1">#{invoice.id.slice(0, 8)}</p>
              {invoice.createdAt && (
                <p className="text-sm text-gray-600">Date: {format(new Date(invoice.createdAt), "MMM d, yyyy")}</p>
              )}
              {invoice.dueDate && (
                <p className="text-sm font-medium">Due: {format(new Date(invoice.dueDate), "MMM d, yyyy")}</p>
              )}
              {isPaid && invoice.paidAt && (
                <p className="text-sm font-medium text-green-700">Paid: {format(new Date(invoice.paidAt), "MMM d, yyyy")}</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {org && (
            <Card data-testid="card-org-info">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">From</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p className="font-medium">{org.name}</p>
                {org.address && <p className="text-muted-foreground">{org.address}</p>}
                {org.phone && <p className="text-muted-foreground">{org.phone}</p>}
                {org.email && <p className="text-muted-foreground">{org.email}</p>}
              </CardContent>
            </Card>
          )}
          {customer && (
            <Card data-testid="card-customer-info">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Bill To</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p className="font-medium">{customer.name}</p>
                {customer.address && <p className="text-muted-foreground">{customer.address}</p>}
                {customer.phone && <p className="text-muted-foreground">{customer.phone}</p>}
                {customer.email && <p className="text-muted-foreground">{customer.email}</p>}
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Line Items</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right w-20">Qty</TableHead>
                  <TableHead className="text-right w-28">Unit Price</TableHead>
                  <TableHead className="text-right w-28">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell className="text-right">{Number(item.qty).toFixed(0)}</TableCell>
                    <TableCell className="text-right">${Number(item.unitPrice).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-medium">
                      ${(Number(item.qty) * Number(item.unitPrice)).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-4 border-t pt-4 space-y-1 max-w-xs ml-auto">
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
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Total</span>
                <span>${totals.total.toFixed(2)}</span>
              </div>
              {isPaid && (
                <div className="flex justify-between text-sm text-emerald-600 font-medium">
                  <span>Paid</span>
                  <span>${totals.total.toFixed(2)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {invoice.notes && (
          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{invoice.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {!isPaid && (
        <MobileActionBar
          actions={[
            {
              label: "Mark Paid",
              icon: <CheckCircle2 className="h-3.5 w-3.5" />,
              onClick: () => setShowMarkPaid(true),
              variant: "default",
              testId: "mobile-action-mark-paid",
            },
            {
              label: "Print",
              icon: <Printer className="h-3.5 w-3.5" />,
              onClick: handlePrint,
              testId: "mobile-action-print",
            },
            {
              label: "Edit",
              icon: <Edit className="h-3.5 w-3.5" />,
              onClick: () => navigate(`/invoices/${id}/edit`),
              testId: "mobile-action-edit",
            },
          ]}
        />
      )}

      <Dialog open={showMarkPaid} onOpenChange={setShowMarkPaid}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark Invoice as Paid</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Total: <strong className="text-foreground">${totals.total.toFixed(2)}</strong>
            </p>
            <div className="space-y-2">
              <Label>Payment Notes (optional)</Label>
              <Textarea
                placeholder="e.g. Cash payment, check #1234, Venmo..."
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                rows={3}
                data-testid="input-payment-notes"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowMarkPaid(false)}>Cancel</Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate({ status: "paid", paymentNotes: paymentNotes || undefined })}
                data-testid="button-confirm-mark-paid"
              >
                {statusMutation.isPending ? "Marking..." : "Confirm Paid"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <InvoicePdf invoice={invoice} />
    </div>
  );
}
