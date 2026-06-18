import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PLAN_LABELS, PLAN_PRICES, PLAN_LIMITS } from "@shared/schema";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, X, CreditCard, ExternalLink, Users, Briefcase, FileText, Receipt, Crown, AlertTriangle } from "lucide-react";

interface StripePlan {
  product_id: string;
  product_name: string;
  product_description: string;
  product_metadata: { plan?: string } | string;
  price_id: string;
  unit_amount: number;
  currency: string;
  recurring: any;
}

const PLAN_ORDER = ["free", "individual", "small_business", "enterprise"] as const;

const PLAN_FEATURES: Record<string, { label: string; included: boolean }[]> = {
  free: [
    { label: "5 customers, jobs, quotes & invoices", included: true },
    { label: "1 user", included: true },
    { label: "Kanban + list views", included: true },
    { label: "Online invoice payments (Stripe)", included: true },
    { label: "Business analytics", included: true },
    { label: "Review request SMS", included: false },
    { label: "Auto SMS reminders", included: false },
    { label: "Recurring jobs", included: false },
    { label: "Team invites", included: false },
  ],
  individual: [
    { label: "Unlimited customers, jobs, quotes & invoices", included: true },
    { label: "1 user", included: true },
    { label: "Online invoice payments (Stripe)", included: true },
    { label: "Business analytics", included: true },
    { label: "Review request SMS after job done", included: true },
    { label: "Auto SMS reminders", included: false },
    { label: "Recurring jobs", included: false },
    { label: "Team invites", included: false },
  ],
  small_business: [
    { label: "Everything in Individual", included: true },
    { label: "Up to 25 team members with roles", included: true },
    { label: "Auto SMS reminders (overdue invoices, pending quotes)", included: true },
    { label: "Recurring jobs (weekly / monthly / annual)", included: true },
    { label: "Team workload tracking", included: true },
    { label: "Custom invoice/quote branding", included: true },
  ],
  enterprise: [
    { label: "Everything in Small Business", included: true },
    { label: "Unlimited team members", included: true },
    { label: "Priority support", included: true },
    { label: "Multi-org switching", included: true },
    { label: "Advanced analytics", included: true },
  ],
};

function UsageBar({ label, current, limit, icon: Icon }: { label: string; current: number; limit: number; icon: any }) {
  const isUnlimited = limit === -1;
  const percentage = isUnlimited ? 0 : limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
  const isNearLimit = !isUnlimited && percentage >= 80;

  return (
    <div className="space-y-1.5" data-testid={`usage-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{label}</span>
        </div>
        <span className="text-sm text-muted-foreground">
          {current} / {isUnlimited ? "Unlimited" : limit}
        </span>
      </div>
      {!isUnlimited && (
        <Progress
          value={percentage}
          className={isNearLimit ? "[&>div]:bg-orange-500" : ""}
          data-testid={`progress-${label.toLowerCase().replace(/\s/g, "-")}`}
        />
      )}
      {isUnlimited && (
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full w-full bg-primary/20 rounded-full" />
        </div>
      )}
    </div>
  );
}

export default function SubscriptionPage() {
  const { org, planLimits, orgCounts, access, refreshAuth } = useAuth();
  const { toast } = useToast();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const { data: stripePlans, isLoading: plansLoading } = useQuery<StripePlan[]>({
    queryKey: ["/api/stripe/plans"],
  });

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("subscription") === "success") {
      toast({ title: "Subscription activated", description: "Your plan has been upgraded successfully." });
      refreshAuth();
      setLocation("/subscription", { replace: true });
    } else if (params.get("subscription") === "cancelled") {
      toast({ title: "Subscription cancelled", description: "You can upgrade anytime.", variant: "destructive" });
      setLocation("/subscription", { replace: true });
    }
  }, [search]);

  const currentPlan = org?.plan || "free";

  const getStripePriceId = (planKey: string): string | null => {
    if (!stripePlans) return null;
    const match = stripePlans.find((sp) => {
      try {
        const metadata = typeof sp.product_metadata === "string" ? JSON.parse(sp.product_metadata) : sp.product_metadata;
        return metadata?.plan === planKey;
      } catch {
        return false;
      }
    });
    return match?.price_id || null;
  };

  const handleUpgrade = async (planKey: string) => {
    const priceId = getStripePriceId(planKey);
    if (!priceId) {
      toast({ title: "Plan not available", description: "This plan is not configured in Stripe yet.", variant: "destructive" });
      return;
    }

    setLoadingPlan(planKey);
    try {
      const res = await apiRequest("POST", "/api/stripe/create-checkout", { priceId, plan: planKey });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to create checkout session", variant: "destructive" });
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const res = await apiRequest("POST", "/api/stripe/create-portal");
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to open billing portal", variant: "destructive" });
    } finally {
      setPortalLoading(false);
    }
  };

  const getPlanButtonLabel = (planKey: string) => {
    const currentIndex = PLAN_ORDER.indexOf(currentPlan as any);
    const targetIndex = PLAN_ORDER.indexOf(planKey as any);
    if (targetIndex > currentIndex) return "Upgrade";
    if (targetIndex < currentIndex) return "Downgrade";
    return "Current Plan";
  };

  if (!org || !planLimits || !orgCounts) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Subscription" description="Manage your plan and billing" />
        <div className="flex-1 overflow-auto p-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-80" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const isOperatorOsManaged = Boolean(
    (org as any).operatorosTenantId || (org as any).operatorosOrganizationId,
  );

  if (isOperatorOsManaged) {
    const planSlug = access?.planSlug ?? (org as any).operatorosPlanSlug ?? null;
    const subStatus = access?.subscriptionStatus ?? (org as any).operatorosSubscriptionStatus ?? org.subscriptionStatus ?? null;
    const accessLevel = (org as any).operatorosAccessLevel ?? null;
    const userRole = access?.effectiveRole ?? null;
    const featureEntries = access?.features
      ? Object.entries(access.features).filter(([, v]) => v === true)
      : [];
    return (
      <div className="flex flex-col h-full">
        <PageHeader
          title="Subscription"
          description="Managed by OperatorOS"
        />
        <div className="flex-1 overflow-auto p-6">
          <Card data-testid="card-managed-by-operatoros">
            <CardHeader>
              <CardTitle className="text-base">Billing managed by OperatorOS</CardTitle>
              <CardDescription>
                This organization's plan, payment method, and team seats are administered
                from OperatorOS. Make changes there and they will sync back automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd className="font-medium flex items-center gap-1.5" data-testid="text-managed-plan">
                    <Crown className="h-3.5 w-3.5" />
                    {planSlug ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Subscription status</dt>
                  <dd className="font-medium" data-testid="text-managed-status">{subStatus ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Access level</dt>
                  <dd className="font-medium" data-testid="text-managed-access-level">{accessLevel ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Your role</dt>
                  <dd className="font-medium" data-testid="text-managed-user-role">{userRole ?? "—"}</dd>
                </div>
              </dl>
              <div>
                <div className="text-sm text-muted-foreground mb-2">Enabled features</div>
                <div className="flex flex-wrap gap-1.5" data-testid="list-managed-features">
                  {featureEntries.length === 0 ? (
                    <span className="text-sm text-muted-foreground">None reported</span>
                  ) : (
                    featureEntries.map(([k]) => (
                      <Badge key={k} variant="outline" data-testid={`badge-feature-${k}`}>
                        {k}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
              <Button asChild data-testid="button-manage-billing-operatoros">
                <a
                  href={(import.meta as any).env?.VITE_OPERATOROS_BASE_URL || "https://operatoros.net"}
                  target="_blank"
                  rel="noreferrer"
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Manage Billing in OperatorOS
                  <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Subscription"
        description="Manage your plan and billing"
        actions={
          org.stripeSubscriptionId ? (
            <Button
              variant="outline"
              onClick={handleManageSubscription}
              disabled={portalLoading}
              data-testid="button-manage-subscription"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              {portalLoading ? "Opening..." : "Manage Billing"}
              <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Card data-testid="card-current-plan">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Current Plan</CardTitle>
                <Badge variant="secondary" data-testid="badge-current-plan">
                  <Crown className="h-3 w-3 mr-1" />
                  {PLAN_LABELS[currentPlan] || currentPlan}
                </Badge>
              </div>
              <CardDescription>
                ${PLAN_PRICES[currentPlan] || 0}/month
                {org.subscriptionStatus && org.subscriptionStatus !== "active" && (
                  <span className="ml-2 text-orange-600 dark:text-orange-400">
                    ({org.subscriptionStatus})
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {currentPlan === "free" ? (
                <p className="text-sm text-muted-foreground">
                  You are on the free plan. Upgrade to unlock more features and higher limits.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Your subscription is {org.subscriptionStatus || "active"}.
                  {org.currentPeriodEnd && (
                    <> Current period ends on {new Date(org.currentPeriodEnd).toLocaleDateString()}.</>
                  )}
                </p>
              )}
              {org.cancelAtPeriodEnd && org.currentPeriodEnd && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-3 py-2.5" data-testid="cancel-at-period-end-notice">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    Your plan is set to cancel on{" "}
                    <strong>{new Date(org.currentPeriodEnd).toLocaleDateString()}</strong>.
                    You'll remain on your current plan until then.
                    Reactivate anytime via Manage Billing.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-usage">
            <CardHeader>
              <CardTitle className="text-base">Usage</CardTitle>
              <CardDescription>Current resource usage vs plan limits</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <UsageBar label="Customers" current={orgCounts.customers} limit={planLimits.customers} icon={Users} />
              <UsageBar label="Jobs" current={orgCounts.jobs} limit={planLimits.jobs} icon={Briefcase} />
              <UsageBar label="Quotes" current={orgCounts.quotes} limit={planLimits.quotes} icon={FileText} />
              <UsageBar label="Invoices" current={orgCounts.invoices} limit={planLimits.invoices} icon={Receipt} />
              <UsageBar label="Team Members" current={orgCounts.members} limit={planLimits.teamMembers} icon={Users} />
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-base font-semibold mb-4">Available Plans</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {PLAN_ORDER.map((planKey) => {
              const isCurrent = planKey === currentPlan;
              const features = PLAN_FEATURES[planKey];
              const price = PLAN_PRICES[planKey];
              const label = PLAN_LABELS[planKey];
              const buttonLabel = getPlanButtonLabel(planKey);
              const isLoading = loadingPlan === planKey;

              return (
                <Card
                  key={planKey}
                  className={isCurrent ? "border-primary" : ""}
                  data-testid={`card-plan-${planKey}`}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{label}</CardTitle>
                      {isCurrent && (
                        <Badge variant="default" data-testid={`badge-current-${planKey}`}>
                          Current Plan
                        </Badge>
                      )}
                    </div>
                    <CardDescription>
                      <span className="text-2xl font-bold text-foreground">${price}</span>
                      <span className="text-muted-foreground">/mo</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {features.map((feature) => (
                        <li key={feature.label} className="flex items-center gap-2 text-sm">
                          {feature.included ? (
                            <Check className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                          ) : (
                            <X className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <span className={feature.included ? "" : "text-muted-foreground"}>
                            {feature.label}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    {isCurrent ? (
                      <Button variant="outline" className="w-full" disabled data-testid={`button-plan-${planKey}`}>
                        Current Plan
                      </Button>
                    ) : planKey === "free" ? (
                      org.stripeSubscriptionId ? (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={handleManageSubscription}
                          disabled={portalLoading}
                          data-testid={`button-plan-${planKey}`}
                        >
                          {portalLoading ? "Loading..." : "Downgrade via Portal"}
                        </Button>
                      ) : (
                        <Button variant="outline" className="w-full" disabled data-testid={`button-plan-${planKey}`}>
                          {buttonLabel}
                        </Button>
                      )
                    ) : (
                      <Button
                        className="w-full"
                        onClick={() => handleUpgrade(planKey)}
                        disabled={isLoading || plansLoading}
                        data-testid={`button-plan-${planKey}`}
                      >
                        {isLoading ? "Redirecting..." : buttonLabel}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
