import { useState } from "react";
import {
  CALL_RECOVERY_PLAN_LABELS,
  CALL_RECOVERY_PLAN_PRICES,
  CALL_RECOVERY_PLAN_LIMITS,
} from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Zap, ExternalLink } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PLAN_BADGES, type CRSubscription } from "./types";

export function PlanCard({ subscription }: { subscription: CRSubscription }) {
  const { toast } = useToast();
  const [portalLoading, setPortalLoading] = useState(false);

  const plan = subscription.plan || "starter";
  const limits = CALL_RECOVERY_PLAN_LIMITS[plan];
  const usagePercent = limits?.recoveriesPerMonth === -1
    ? 0
    : limits?.recoveriesPerMonth
      ? Math.min((subscription.usage / limits.recoveriesPerMonth) * 100, 100)
      : 0;

  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const res = await apiRequest("POST", "/api/call-recovery/portal");
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to open billing portal", variant: "destructive" });
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <Card data-testid="card-cr-plan">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Call Recovery Plan</CardTitle>
          <Badge className={PLAN_BADGES[plan] || ""} data-testid="badge-cr-plan">
            <Zap className="h-3 w-3 mr-1" />
            {CALL_RECOVERY_PLAN_LABELS[plan] || plan}
          </Badge>
        </div>
        <CardDescription>
          ${CALL_RECOVERY_PLAN_PRICES[plan] || 0}/month
          {subscription.status && subscription.status !== "active" && (
            <span className="ml-2 text-orange-600 dark:text-orange-400">({subscription.status})</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Recoveries this month</span>
            <span className="font-medium">
              {subscription.usage}
              {limits?.recoveriesPerMonth !== -1 ? ` / ${limits?.recoveriesPerMonth}` : " (unlimited)"}
            </span>
          </div>
          {limits?.recoveriesPerMonth !== -1 && (
            <Progress value={usagePercent} className={usagePercent >= 80 ? "[&>div]:bg-orange-500" : ""} data-testid="progress-cr-usage" />
          )}
        </div>
        {subscription.stripeSubscriptionId && (
          <Button variant="outline" size="sm" onClick={handleManageBilling} disabled={portalLoading} data-testid="button-cr-manage-billing">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            {portalLoading ? "Opening..." : "Manage Billing"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
