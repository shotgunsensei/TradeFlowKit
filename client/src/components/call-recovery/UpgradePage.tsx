import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  CALL_RECOVERY_PLAN_LABELS,
  CALL_RECOVERY_PLAN_PRICES,
} from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Check, X, Phone, PhoneMissed, MessageSquare, Zap, Briefcase, Loader2,
} from "lucide-react";
import { PLAN_ORDER, PLAN_FEATURES, type StripePlan } from "./types";

export function UpgradePage({
  stripePlans,
  plansLoading,
}: {
  stripePlans: StripePlan[] | undefined;
  plansLoading: boolean;
}) {
  const { toast } = useToast();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const getPriceId = (planKey: string) => {
    if (!stripePlans) return null;
    const match = stripePlans.find((sp) => {
      try {
        const meta = typeof sp.product_metadata === "string" ? JSON.parse(sp.product_metadata) : sp.product_metadata;
        return meta?.feature === "call_recovery" && meta?.plan === planKey;
      } catch {
        return false;
      }
    });
    return match?.price_id || null;
  };

  const handleSubscribe = async (planKey: string) => {
    const priceId = getPriceId(planKey);
    if (!priceId) {
      toast({ title: "Plan not available", description: "Stripe product not yet configured.", variant: "destructive" });
      return;
    }
    setLoadingPlan(planKey);
    try {
      const res = await apiRequest("POST", "/api/call-recovery/checkout", { priceId, plan: planKey });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to start checkout", variant: "destructive" });
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="text-center space-y-3 py-4">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-primary/10 mb-2">
          <PhoneMissed className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Never Miss a Lead Again</h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          When a customer calls and you can't answer, our AI automatically sends them an SMS, collects their job details, and creates a lead in your CRM — all while you're on the job.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLAN_ORDER.map((planKey) => {
          const price = CALL_RECOVERY_PLAN_PRICES[planKey];
          const label = CALL_RECOVERY_PLAN_LABELS[planKey];
          const features = PLAN_FEATURES[planKey];
          const isPopular = planKey === "growth";
          const isLoading = loadingPlan === planKey;

          return (
            <Card
              key={planKey}
              className={`relative ${isPopular ? "border-primary shadow-md" : ""}`}
              data-testid={`card-cr-plan-${planKey}`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground px-3">Most Popular</Badge>
                </div>
              )}
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{label}</CardTitle>
                  <Zap className="h-4 w-4 text-primary" />
                </div>
                <CardDescription>
                  <span className="text-2xl font-bold text-foreground">${price}</span>
                  <span className="text-muted-foreground">/mo</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {features.map((f) => (
                    <li key={f.label} className="flex items-center gap-2 text-sm">
                      {f.included ? (
                        <Check className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                      ) : (
                        <X className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className={f.included ? "" : "text-muted-foreground"}>{f.label}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  variant={isPopular ? "default" : "outline"}
                  onClick={() => handleSubscribe(planKey)}
                  disabled={isLoading || plansLoading}
                  data-testid={`button-cr-subscribe-${planKey}`}
                >
                  {isLoading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Redirecting...</>
                  ) : (
                    `Get ${label}`
                  )}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-3 pt-4">
        {[
          { icon: Phone, title: "Instant Response", desc: "AI texts the caller within seconds of a missed call" },
          { icon: MessageSquare, title: "Smart Conversations", desc: "Collects service type, location, and urgency automatically" },
          { icon: Briefcase, title: "Auto CRM Entry", desc: "Creates customer and job lead in your TradeFlow CRM" },
        ].map((item) => (
          <div key={item.title} className="flex gap-3 p-4 rounded-lg bg-muted/40">
            <item.icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
