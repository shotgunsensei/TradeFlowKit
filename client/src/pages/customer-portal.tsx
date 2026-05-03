import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, FileText, Wrench, ExternalLink, CreditCard } from "lucide-react";
import { format } from "date-fns";

interface PortalData {
  customer: { id: string; name: string; email?: string; phone?: string };
  org: { name: string; email?: string; phone?: string; logoUrl?: string } | null;
  quotes: Array<{ id: string; status: string; total: number; createdAt: string; expiresAt?: string; publicToken?: string }>;
  invoices: Array<{ id: string; status: string; total: number; createdAt: string; dueDate?: string; paidAt?: string; publicToken?: string }>;
  recentJobs: Array<{ id: string; title: string; status: string; createdAt: string }>;
}

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "paid" || s === "accepted" || s === "done") return "default";
  if (s === "void" || s === "declined" || s === "canceled") return "destructive";
  return "secondary";
}

export default function CustomerPortalPage() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, error } = useQuery<PortalData>({
    queryKey: ["/api/portal", token],
    queryFn: async () => {
      const res = await fetch(`/api/portal/${token}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Portal unavailable");
      }
      return res.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 p-6 flex items-center justify-center">
        <div className="w-full max-w-3xl space-y-4">
          <Skeleton className="h-12 w-1/2" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Portal Unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This portal link is invalid, expired, or not available on the current plan. Please contact your service provider for assistance.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const openQuotes = data.quotes.filter((q) => q.status === "draft" || q.status === "sent");
  const openInvoices = data.invoices.filter((inv) => inv.status === "sent" || inv.status === "draft");
  const paidInvoices = data.invoices.filter((inv) => inv.status === "paid");

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold" data-testid="text-org-name">
              {data.org?.name || "Customer Portal"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Welcome, <span data-testid="text-customer-name">{data.customer.name}</span>
            </p>
          </div>
          {data.org && (
            <div className="hidden sm:block text-right text-xs text-muted-foreground">
              {data.org.phone && <p>{data.org.phone}</p>}
              {data.org.email && <p>{data.org.email}</p>}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <Card data-testid="card-portal-invoices">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              Invoices
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No invoices yet.</p>
            ) : (
              <div className="space-y-2">
                {data.invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                    data-testid={`portal-invoice-${inv.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">Invoice #{inv.id.slice(0, 8).toUpperCase()}</p>
                        <Badge variant={statusVariant(inv.status)} className="text-xs">{inv.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {inv.dueDate ? `Due ${format(new Date(inv.dueDate), "MMM d, yyyy")}` : `Created ${format(new Date(inv.createdAt), "MMM d, yyyy")}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">${Number(inv.total).toFixed(2)}</p>
                      {inv.status !== "paid" && inv.status !== "void" && (
                        <a href={`/invoices/${inv.id}/pay`} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="default" className="mt-1.5 h-7 text-xs gap-1" data-testid={`button-pay-${inv.id}`}>
                            <CreditCard className="h-3 w-3" />
                            Pay
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-portal-quotes">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Quotes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.quotes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No quotes yet.</p>
            ) : (
              <div className="space-y-2">
                {data.quotes.map((q) => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                    data-testid={`portal-quote-${q.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">Quote #{q.id.slice(0, 8).toUpperCase()}</p>
                        <Badge variant={statusVariant(q.status)} className="text-xs">{q.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {q.expiresAt ? `Expires ${format(new Date(q.expiresAt), "MMM d, yyyy")}` : `Created ${format(new Date(q.createdAt), "MMM d, yyyy")}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">${Number(q.total).toFixed(2)}</p>
                      {q.publicToken && (
                        <a href={`/quotes/${q.id}/view?token=${q.publicToken}`} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline" className="mt-1.5 h-7 text-xs gap-1" data-testid={`button-view-quote-${q.id}`}>
                            <ExternalLink className="h-3 w-3" />
                            View
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-portal-jobs">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              Recent Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No recent jobs.</p>
            ) : (
              <div className="space-y-2">
                {data.recentJobs.map((j) => (
                  <div
                    key={j.id}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                    data-testid={`portal-job-${j.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{j.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(j.createdAt), "MMM d, yyyy")}
                      </p>
                    </div>
                    <Badge variant={statusVariant(j.status)} className="text-xs">{j.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center pt-4">
          This is a private link. Please don't share it publicly.
        </p>
      </main>
    </div>
  );
}
