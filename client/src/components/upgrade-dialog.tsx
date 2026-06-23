import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";
import type { FeatureNotInPlanError } from "@/lib/queryClient";

const FEATURE_LABELS: Record<string, string> = {
  audit_log: "Audit Log",
  accounting_export: "Accounting Exports",
  customer_portal: "Customer Portal",
  review_requests: "Review Requests",
  recurring_invoices: "Recurring Invoices",
  stripe_connect: "Stripe Payments",
  automations: "Automations",
  recurring_jobs: "Recurring Jobs",
  analytics: "Analytics",
  team_invites: "Team Invites",
  unlimited_entities: "Unlimited Records",
  call_recovery: "Call Recovery",
  lead_conversion_center: "Lead Conversion Center",
};

function featureLabel(key: string): string {
  return FEATURE_LABELS[key] ?? key.replace(/_/g, " ");
}

export function UpgradeDialog() {
  const [detail, setDetail] = useState<FeatureNotInPlanError | null>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    function handler(e: Event) {
      const ce = e as CustomEvent<FeatureNotInPlanError>;
      if (ce.detail) setDetail(ce.detail);
    }
    window.addEventListener("tfk:feature-not-in-plan", handler as EventListener);
    return () =>
      window.removeEventListener(
        "tfk:feature-not-in-plan",
        handler as EventListener,
      );
  }, []);

  if (!detail) return null;

  const label = featureLabel(detail.feature);
  const operatorosBase =
    import.meta.env.VITE_OPERATOROS_BASE_URL || "https://operatoros.net";

  return (
    <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
      <DialogContent data-testid="dialog-upgrade-prompt">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 mb-2">
            <Sparkles className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <DialogTitle
            className="text-center"
            data-testid="text-upgrade-dialog-title"
          >
            {label} isn't in your plan
          </DialogTitle>
          <DialogDescription
            className="text-center"
            data-testid="text-upgrade-dialog-body"
          >
            {detail.message ??
              `Your current plan doesn't include ${label}.`}
            {detail.linked
              ? " This organization is managed by OperatorOS — your admin can enable it from the hub."
              : " Upgrade your plan to unlock this feature."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center gap-2">
          <Button
            variant="outline"
            onClick={() => setDetail(null)}
            data-testid="button-upgrade-dialog-close"
          >
            Not now
          </Button>
          {detail.linked ? (
            <Button asChild data-testid="button-upgrade-dialog-operatoros">
              <a
                href={operatorosBase}
                target="_blank"
                rel="noreferrer"
              >
                Open OperatorOS
                <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
              </a>
            </Button>
          ) : (
            <Button
              onClick={() => {
                setDetail(null);
                navigate("/subscription");
              }}
              data-testid="button-upgrade-dialog-upgrade"
            >
              View plans
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
