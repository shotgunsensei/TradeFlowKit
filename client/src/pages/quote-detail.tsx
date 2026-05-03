import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { PageHeader } from "@/components/page-header";
import { MobileActionBar } from "@/components/mobile-action-bar";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import { ArrowLeft, Edit, Wrench, Trash2, Printer, Mail, Clock, AlertTriangle, CheckCircle2, XCircle, ExternalLink, Copy, MessageSquare, Receipt } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { calcLineItemsTotal, calcTotalWithTaxDiscount } from "@shared/schema";
import { format, differenceInDays } from "date-fns";
import type { Quote, QuoteItem, Customer, Org, ReminderLog } from "@shared/schema";
import { PdfDownloadButton } from "@/components/pdf/PdfDownloadButton";
import { EmailDialog } from "@/components/email-dialog";
import { useHotkey } from "@/hooks/use-hotkey";
import { usePageShortcuts } from "@/components/shortcuts-help";

const STATUS_STEPS = ["draft", "sent", "accepted"] as const;

function StatusProgressBar({ status }: { status: string }) {
  if (status === "declined") {
    return (
      <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
        <XCircle className="h-4 w-4 text-red-500" />
        <span className="text-sm font-medium text-red-600 dark:text-red-400">Quote Declined</span>
      </div>
    );
  }
  const currentIdx = STATUS_STEPS.indexOf(status as any);
  return (
    <div className="flex items-center gap-0">
      {STATUS_STEPS.map((step, idx) => {
        const isComplete = currentIdx > idx;
        const isCurrent = currentIdx === idx;
        return (
          <div key={step} className="flex items-center">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
              isComplete
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : isCurrent
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}>
              {isComplete && <CheckCircle2 className="h-3 w-3" />}
              {step.charAt(0).toUpperCase() + step.slice(1)}
            </div>
            {idx < STATUS_STEPS.length - 1 && (
              <div className={`h-px w-8 ${isComplete ? "bg-emerald-300 dark:bg-emerald-700" : "bg-muted-foreground/20"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function QuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [emailOpen, setEmailOpen] = useState(false);

  useHotkey("e", () => navigate(`/quotes/${id}/edit`), { enabled: !!id });
  usePageShortcuts([
    { keys: "E", description: "Edit quote" },
    { keys: "Esc", description: "Close dialog" },
  ]);

  const { data: quote, isLoading } = useQuery<Quote & { items?: QuoteItem[]; customerName?: string; customer?: Customer; org?: Org }>({
    queryKey: ["/api/quotes", id],
  });

  const { data: reminderLogs = [] } = useQuery<ReminderLog[]>({
    queryKey: ["/api/reminder-logs", "quote", id],
    queryFn: () => fetch(`/api/reminder-logs?targetType=quote&targetId=${id}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!id,
  });

  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      await apiRequest("PATCH", `/api/quotes/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({ title: "Status updated" });
    },
  });

  const convertMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/quotes/${id}/convert-to-job`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Job created from quote" });
      navigate("/jobs");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const convertToInvoiceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/quotes/${id}/convert-to-invoice`);
      return res.json();
    },
    onSuccess: (newInv: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Invoice created from quote" });
      if (newInv?.id) navigate(`/invoices/${newInv.id}`);
    },
    onError: async (err: any) => {
      let msg = err?.message || "Failed to convert quote";
      try {
        const parsed = JSON.parse(msg.replace(/^\d+:\s*/, ""));
        if (parsed?.error) msg = parsed.error;
      } catch {}
      toast({ title: "Couldn't convert quote", description: msg, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/quotes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      navigate("/quotes");
      toast({ title: "Quote deleted" });
    },
  });

  const handlePrint = () => window.print();

  const handleEmail = () => setEmailOpen(true);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!quote) {
    return <div className="p-6 text-center text-muted-foreground">Quote not found</div>;
  }

  const items = quote.items || [];
  const subtotal = calcLineItemsTotal(items);
  const totals = calcTotalWithTaxDiscount(subtotal, quote.taxRate || "0", quote.discount || "0");
  const customer = quote.customer;
  const org = quote.org;
  const expiryDays = quote.expiresAt ? differenceInDays(new Date(quote.expiresAt), new Date()) : null;
  const isExpired = expiryDays !== null && expiryDays < 0;
  const isExpiringSoon = expiryDays !== null && expiryDays >= 0 && expiryDays <= 7;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={`Quote #${quote.id.slice(0, 8)}`}
        description={quote.customerName || undefined}
        actions={
          <div className="hidden md:flex items-center gap-2 flex-wrap print:hidden">
            <Button variant="outline" size="sm" onClick={() => navigate("/quotes")} data-testid="button-back-quotes">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/quotes/${id}/view?token=${quote.publicToken}`, "_blank")}
              data-testid="button-preview-quote"
            >
              <ExternalLink className="h-4 w-4 mr-1" /> Preview
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const url = `${window.location.origin}/quotes/${id}/view?token=${quote.publicToken}`;
                navigator.clipboard.writeText(url).then(() =>
                  toast({ title: "Share link copied!", description: "Send this link to your customer." })
                );
              }}
              data-testid="button-copy-share-link"
            >
              <Copy className="h-4 w-4 mr-1" /> Copy Link
            </Button>
            <PdfDownloadButton
              filename={`Quote-${quote.id.slice(0, 8).toUpperCase()}.pdf`}
              testId="button-download-pdf-quote"
              loadPdf={async () => {
                const { QuotePdf } = await import("@/components/pdf/QuotePdf");
                return <QuotePdf quote={quote} />;
              }}
            >
              Download PDF
            </PdfDownloadButton>
            <Button variant="outline" size="sm" onClick={handlePrint} data-testid="button-print-quote">
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
            <Button variant="outline" size="sm" onClick={handleEmail} data-testid="button-email-quote">
              <Mail className="h-4 w-4 mr-1" /> Email
            </Button>
            {!quote.jobId && quote.status !== "declined" && (
              <Button
                size="sm"
                onClick={() => convertMutation.mutate()}
                disabled={convertMutation.isPending}
                data-testid="button-convert-to-job"
              >
                <Wrench className="h-4 w-4 mr-1" />
                Convert to Job
              </Button>
            )}
            {quote.status !== "declined" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => convertToInvoiceMutation.mutate()}
                disabled={convertToInvoiceMutation.isPending}
                data-testid="button-convert-to-invoice"
              >
                <Receipt className="h-4 w-4 mr-1" />
                {convertToInvoiceMutation.isPending ? "Converting..." : "Convert to Invoice"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate(`/quotes/${id}/edit`)} data-testid="button-edit-quote">
              <Edit className="h-4 w-4 mr-1" /> Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { if (confirm("Delete this quote?")) deleteMutation.mutate(); }}
              data-testid="button-delete-quote"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-4 md:p-6 pb-24 md:pb-6 space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden">
          <StatusProgressBar status={quote.status} />
          <div className="flex items-center gap-3">
            <Select value={quote.status} onValueChange={(v) => statusMutation.mutate(v)}>
              <SelectTrigger className="w-[140px]" data-testid="select-quote-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="declined">Declined</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm print:hidden">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Created</p>
            <p>{quote.createdAt ? format(new Date(quote.createdAt), "MMM d, yyyy") : ""}</p>
          </div>
          {quote.expiresAt && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Valid Until</p>
              <p className={`flex items-center gap-1 ${isExpired ? "text-red-600 font-medium" : isExpiringSoon ? "text-amber-600 font-medium" : ""}`}>
                {isExpired && <AlertTriangle className="h-3.5 w-3.5" />}
                {isExpiringSoon && !isExpired && <Clock className="h-3.5 w-3.5" />}
                {format(new Date(quote.expiresAt), "MMM d, yyyy")}
                {isExpired && " (Expired)"}
                {isExpiringSoon && !isExpired && ` (${expiryDays}d left)`}
              </p>
            </div>
          )}
        </div>

        {(isExpired || isExpiringSoon) && quote.status !== "accepted" && quote.status !== "declined" && (
          <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm print:hidden ${
            isExpired
              ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-800 dark:text-red-400"
              : "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-400"
          }`}>
            {isExpired ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <Clock className="h-4 w-4 shrink-0" />}
            <span>
              {isExpired
                ? "This quote has expired. Consider updating the expiry date or issuing a new quote."
                : `This quote expires in ${expiryDays} day${expiryDays === 1 ? "" : "s"}. Follow up with the customer soon.`}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <CardTitle className="text-sm">To</CardTitle>
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

            <div className="mt-4 border-t pt-4 space-y-1.5 max-w-xs ml-auto">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>${totals.subtotal.toFixed(2)}</span>
              </div>
              {totals.tax > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax ({quote.taxRate}%)</span>
                  <span>${totals.tax.toFixed(2)}</span>
                </div>
              )}
              {totals.discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span>-${totals.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold border-t pt-2">
                <span>Total</span>
                <span>${totals.total.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {quote.notes && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{quote.notes}</p>
            </CardContent>
          </Card>
        )}

        {reminderLogs.length > 0 && (
          <Card className="print:hidden" data-testid="card-reminder-history">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                SMS Follow-up History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {reminderLogs.map((log) => (
                  <div key={log.id} className="text-sm border-l-2 border-muted pl-3" data-testid={`reminder-log-${log.id}`}>
                    <p className="text-muted-foreground text-xs mb-0.5">
                      {format(new Date(log.sentAt), "MMM d, yyyy 'at' h:mm a")} · {log.phoneNumber}
                    </p>
                    <p className="text-foreground">{log.message}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <MobileActionBar
        actions={[
          ...((!quote.jobId && quote.status !== "declined") ? [{
            label: "Convert",
            icon: <Wrench className="h-3.5 w-3.5" />,
            onClick: () => convertMutation.mutate(),
            variant: "default" as const,
            testId: "mobile-action-convert",
          }] : []),
          {
            label: "Share",
            icon: <Copy className="h-3.5 w-3.5" />,
            onClick: () => {
              const url = `${window.location.origin}/quotes/${id}/view?token=${quote.publicToken}`;
              navigator.clipboard.writeText(url).then(() =>
                toast({ title: "Link copied!", description: "Send this link to your customer." })
              );
            },
            testId: "mobile-action-share",
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
            onClick: () => navigate(`/quotes/${id}/edit`),
            testId: "mobile-action-edit",
          },
        ]}
      />

      <EmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        documentType="quote"
        documentId={quote.id}
        documentNumber={quote.id.slice(0, 8).toUpperCase()}
        defaultRecipient={customer?.email || ""}
        defaultSubject={`Quote #${quote.id.slice(0, 8).toUpperCase()} from ${org?.name || "Our Company"}`}
        defaultMessage={`Dear ${customer?.name || "Customer"},\n\nPlease find attached your quote #${quote.id.slice(0, 8).toUpperCase()}.${quote.expiresAt ? ` This quote is valid until ${format(new Date(quote.expiresAt), "MMM d, yyyy")}.` : ""} Let me know if you have any questions.\n\nThank you,\n${org?.name || ""}`}
        onSent={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/quotes", id] });
          queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
        }}
      />
    </div>
  );
}
