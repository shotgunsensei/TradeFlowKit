import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Lock } from "lucide-react";

export default function IntegrationsTab({ plan }: { plan: string }) {
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
                  <a href="/api/exports/quickbooks/iif" download>
                    <Button size="sm" variant="outline" data-testid="button-export-quickbooks">
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Download .IIF
                    </Button>
                  </a>
                </div>
              </div>
              <div className="rounded-lg border p-4 space-y-3">
                <div>
                  <p className="font-medium text-sm">Xero CSV</p>
                  <p className="text-xs text-muted-foreground">Three CSV files matching Xero's import templates.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a href="/api/exports/xero/customers.csv" download>
                    <Button size="sm" variant="outline" data-testid="button-export-xero-customers">
                      <Download className="h-3.5 w-3.5 mr-1.5" /> Customers.csv
                    </Button>
                  </a>
                  <a href="/api/exports/xero/invoices.csv" download>
                    <Button size="sm" variant="outline" data-testid="button-export-xero-invoices">
                      <Download className="h-3.5 w-3.5 mr-1.5" /> Invoices.csv
                    </Button>
                  </a>
                  <a href="/api/exports/xero/payments.csv" download>
                    <Button size="sm" variant="outline" data-testid="button-export-xero-payments">
                      <Download className="h-3.5 w-3.5 mr-1.5" /> Payments.csv
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
