import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, ExternalLink } from "lucide-react";
import { PLAN_LIMITS } from "@shared/schema";

interface PlanInfo {
  plan: string;
  limits: { customers: number; jobs: number; quotes: number; invoices: number; teamMembers: number; canInvite: boolean };
  counts: { customers: number; jobs: number; quotes: number; invoices: number; members: number };
  subscriptionStatus: string | null;
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = limit === -1;
  const pct = unlimited ? 0 : Math.min((used / limit) * 100, 100);
  const warn = !unlimited && pct >= 80;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-medium ${warn ? "text-orange-600" : ""}`}>
          {used}{unlimited ? "" : ` / ${limit}`}
          {unlimited && <span className="text-xs text-muted-foreground ml-1">(unlimited)</span>}
        </span>
      </div>
      {!unlimited && (
        <Progress value={pct} className={warn ? "[&>div]:bg-orange-500" : ""} />
      )}
    </div>
  );
}

export default function BillingTab() {
  const { org, access } = useAuth();
  const { toast } = useToast();
  const [portalLoading, setPortalLoading] = useState(false);

  const { data: planInfo } = useQuery<PlanInfo>({
    queryKey: ["/api/plan-info"],
    enabled: !!org,
  });

  const linked = !!access?.linked;
  // SECURITY: for linked orgs the entitlement snapshot is the authority,
  // so prefer `access.planSlug` over the legacy `org.plan` / `planInfo.plan`
  // (which still reflect the local Stripe-era plan column).
  const plan = linked
    ? (access?.planSlug || planInfo?.plan || org?.plan || "free")
    : (planInfo?.plan || org?.plan || "free");
  const limits = (linked ? access?.limits : null) || planInfo?.limits || PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const counts = planInfo?.counts || { customers: 0, jobs: 0, quotes: 0, invoices: 0, members: 0 };
  const subStatus = linked
    ? (access?.subscriptionStatus ?? planInfo?.subscriptionStatus ?? null)
    : (planInfo?.subscriptionStatus ?? null);
  const accessLevel = access?.accessLevel ?? null;
  const enabledFeatures = access?.features
    ? (Object.keys(access.features) as Array<keyof typeof access.features>).filter((k) => access.features[k])
    : [];
  const effectiveRole = access?.effectiveRole ?? null;

  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const res = await apiRequest("POST", "/api/stripe/create-portal");
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to open billing portal", variant: "destructive" });
    } finally {
      setPortalLoading(false);
    }
  };

  const operatorosUrl =
    (import.meta.env.VITE_OPERATOROS_BASE_URL as string | undefined) ||
    "https://operatoros.net";

  return (
    <Card data-testid="card-billing">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> Plan &amp; Usage
            </CardTitle>
            <CardDescription>
              {linked
                ? "Plan and billing are managed by OperatorOS"
                : "Current plan and usage for this billing period"}
            </CardDescription>
          </div>
          <Badge variant="outline" className="capitalize" data-testid="badge-plan">
            {plan.replace("_", " ")}
            {subStatus && subStatus !== "active" && (
              <span className="ml-1 text-xs text-orange-600">({subStatus})</span>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {linked && (
          <div
            className="rounded-md border bg-muted/40 p-3 space-y-3 text-sm"
            data-testid="banner-operatoros-managed"
          >
            <p className="text-muted-foreground">
              Plan, subscription, and billing for this organization are
              managed by OperatorOS. Changes made in OperatorOS sync here
              automatically.
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <dt className="text-muted-foreground">Plan</dt>
              <dd className="font-medium capitalize" data-testid="text-managed-plan">
                {plan.replace("_", " ")}
              </dd>
              <dt className="text-muted-foreground">Subscription</dt>
              <dd className="font-medium" data-testid="text-managed-substatus">
                {subStatus ?? "—"}
              </dd>
              <dt className="text-muted-foreground">Access level</dt>
              <dd className="font-medium capitalize" data-testid="text-managed-access-level">
                {accessLevel ?? "—"}
              </dd>
              <dt className="text-muted-foreground">Your role</dt>
              <dd className="font-medium capitalize" data-testid="text-managed-role">
                {effectiveRole ?? "—"}
              </dd>
            </dl>
            <div>
              <p className="text-muted-foreground mb-1.5">Enabled features</p>
              <div className="flex flex-wrap gap-1.5" data-testid="list-managed-features">
                {enabledFeatures.length === 0 ? (
                  <span className="text-muted-foreground">None</span>
                ) : (
                  enabledFeatures.map((f) => (
                    <Badge key={f} variant="secondary" data-testid={`badge-feature-${f}`}>
                      {String(f).replace(/_/g, " ")}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3" data-testid="usage-list">
          <UsageBar label="Customers" used={counts.customers} limit={limits.customers} />
          <UsageBar label="Jobs" used={counts.jobs} limit={limits.jobs} />
          <UsageBar label="Quotes" used={counts.quotes} limit={limits.quotes} />
          <UsageBar label="Invoices" used={counts.invoices} limit={limits.invoices} />
          <UsageBar label="Team members" used={counts.members} limit={limits.teamMembers} />
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t">
          {linked ? (
            <a href={operatorosUrl} target="_blank" rel="noopener noreferrer">
              <Button
                size="sm"
                variant="outline"
                data-testid="button-manage-billing-operatoros"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Manage Billing in OperatorOS
              </Button>
            </a>
          ) : (
            <>
              <a href="/subscription">
                <Button size="sm" variant="outline" data-testid="button-change-plan">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Change Plan
                </Button>
              </a>
              <Button
                size="sm"
                variant="outline"
                onClick={handleManageBilling}
                disabled={portalLoading}
                data-testid="button-manage-billing"
              >
                <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                {portalLoading ? "Opening..." : "Manage Billing"}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
