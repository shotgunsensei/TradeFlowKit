import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Lock } from "lucide-react";
import { useState } from "react";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function IntegrationsTab({ plan }: { plan: string }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const { toast } = useToast();

  async function downloadExport(url: string, filename: string) {
    setDownloading(url);
    try {
      const res = await apiRequest("GET", url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      // 403 feature_not_in_plan already triggers the global upgrade
      // dialog via queryClient; only show a toast for other errors.
      const isFeatureGate =
        err instanceof ApiError &&
        err.status === 403 &&
        err.data &&
        typeof err.data === "object" &&
        (err.data as { error?: string }).error === "feature_not_in_plan";
      if (!isFeatureGate) {
        const message = err instanceof Error ? err.message : "Download failed.";
        toast({ title: "Export failed", description: message, variant: "destructive" });
      }
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4" /> Accounting exports
          </CardTitle>
          <CardDescription>
            Export your customers, invoices, and payments for QuickBooks (.IIF) or Xero (.CSV).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {plan !== "small_business" && plan !== "enterprise" ? (
            <div className="rounded-lg border border-dashed p-5 text-center space-y-3" data-testid="exports-locked">
              <Lock className="h-5 w-5 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">Exports are available on Small Business and Enterprise plans.</p>
              <a href="/subscription">
                <Button size="sm" data-testid="button-upgrade-for-exports">Upgrade Plan</Button>
              </a>
            </div>
          ) : (
            <div className="space-y-4" data-testid="exports-panel">
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">QuickBooks Desktop (.IIF)</p>
                    <p className="text-xs text-muted-foreground">Customers, invoices, and payments in IIF format.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="button-export-quickbooks"
                    disabled={downloading === "/api/exports/quickbooks/iif"}
                    onClick={() => downloadExport("/api/exports/quickbooks/iif", "tradeflow-quickbooks.iif")}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Download .IIF
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border p-4 space-y-3">
                <div>
                  <p className="font-medium text-sm">Xero CSV</p>
                  <p className="text-xs text-muted-foreground">Three CSV files matching Xero's import templates.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="button-export-xero-customers"
                    disabled={downloading === "/api/exports/xero/customers.csv"}
                    onClick={() => downloadExport("/api/exports/xero/customers.csv", "tradeflow-xero-customers.csv")}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Customers.csv
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="button-export-xero-invoices"
                    disabled={downloading === "/api/exports/xero/invoices.csv"}
                    onClick={() => downloadExport("/api/exports/xero/invoices.csv", "tradeflow-xero-invoices.csv")}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Invoices.csv
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="button-export-xero-payments"
                    disabled={downloading === "/api/exports/xero/payments.csv"}
                    onClick={() => downloadExport("/api/exports/xero/payments.csv", "tradeflow-xero-payments.csv")}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Payments.csv
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
