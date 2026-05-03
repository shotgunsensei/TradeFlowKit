import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Lock, ExternalLink, Zap, CheckCircle2, XCircle } from "lucide-react";

export default function PaymentsTab({ plan }: { plan: string }) {
  const { org, refreshAuth } = useAuth();
  const { toast } = useToast();
  const [connectLoading, setConnectLoading] = useState(false);

  const handleConnectStripe = async () => {
    setConnectLoading(true);
    try {
      const res = await apiRequest("GET", "/api/stripe/connect/authorize");
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else toast({ title: "Error", description: data.error || "Failed to start connection", variant: "destructive" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to start Stripe connection", variant: "destructive" });
    } finally {
      setConnectLoading(false);
    }
  };

  const disconnectStripeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/stripe/connect");
    },
    onSuccess: () => {
      refreshAuth();
      toast({ title: "Stripe account disconnected" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to disconnect", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accept Online Payments</CardTitle>
          <CardDescription>
            Connect your Stripe account to collect card payments from customers directly on invoices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {plan === "free" ? (
            <div className="rounded-lg border border-dashed p-5 text-center space-y-3">
              <div className="flex justify-center">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>
              <div>
                <p className="font-medium text-sm">Upgrade to enable online payments</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Online invoice payments are available on Individual plan and above.
                </p>
              </div>
              <a href="/subscription">
                <Button size="sm" data-testid="button-upgrade-for-payments">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Upgrade Plan
                </Button>
              </a>
            </div>
          ) : (
            <>
              {org?.stripeConnectOnboarded && org?.stripeConnectAccountId ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 p-4">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-sm text-emerald-800 dark:text-emerald-300" data-testid="text-stripe-connected">Connected</p>
                      <p className="text-xs text-emerald-700/70 dark:text-emerald-400/70 font-mono">{org.stripeConnectAccountId}</p>
                    </div>
                    <Badge className="bg-emerald-600 text-white text-xs">Active</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Your Stripe account is connected. Customers will see a "Pay Online" button on their invoices.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => {
                      if (confirm("Disconnect your Stripe account? Customers will no longer be able to pay invoices online.")) {
                        disconnectStripeMutation.mutate();
                      }
                    }}
                    disabled={disconnectStripeMutation.isPending}
                    data-testid="button-disconnect-stripe"
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1.5" />
                    {disconnectStripeMutation.isPending ? "Disconnecting..." : "Disconnect Stripe"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="space-y-3">
                    <p className="text-sm font-medium">How to set up:</p>
                    <ol className="space-y-2.5">
                      <li className="flex gap-3 text-sm">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold mt-0.5">1</span>
                        <div>
                          <span className="font-medium">Create a free Stripe account</span>
                          <span className="text-muted-foreground"> (if you don't have one)</span>
                          <div className="mt-0.5">
                            <a
                              href="https://stripe.com/register"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                              data-testid="link-stripe-register"
                            >
                              Open stripe.com/register <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                      </li>
                      <li className="flex gap-3 text-sm">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold mt-0.5">2</span>
                        <div>
                          <span className="font-medium">Connect your account to TradeFlow</span>
                          <p className="text-muted-foreground text-xs mt-0.5">Click below to authorize via Stripe's secure OAuth flow</p>
                        </div>
                      </li>
                      <li className="flex gap-3 text-sm">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold mt-0.5">3</span>
                        <span>
                          <span className="font-medium">Complete Stripe's quick onboarding</span>
                          <span className="text-muted-foreground"> (~5 minutes, requires bank details)</span>
                        </span>
                      </li>
                      <li className="flex gap-3 text-sm">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold mt-0.5">4</span>
                        <span className="font-medium">Done — your invoices will show a Pay Online button</span>
                      </li>
                    </ol>
                  </div>
                  <Button
                    onClick={handleConnectStripe}
                    disabled={connectLoading}
                    data-testid="button-connect-stripe"
                  >
                    <Zap className="h-4 w-4 mr-1.5" />
                    {connectLoading ? "Redirecting to Stripe..." : "Connect Stripe Account"}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
