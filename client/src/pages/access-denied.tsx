import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ExternalLink } from "lucide-react";

const REASON_COPY: Record<string, { title: string; body: string }> = {
  tenant_inactive: {
    title: "Your organization's subscription is paused",
    body: "Access is paused because the organization's subscription is not currently active. The organization owner can resolve this from OperatorOS.",
  },
  user_disabled: {
    title: "Your access has been disabled",
    body: "An OperatorOS administrator has disabled your access to this workspace. Reach out to them to be re-enabled.",
  },
  no_module_role: {
    title: "You don't have a role in this module",
    body: "Your OperatorOS account does not have a TradeFlowKit role assigned. Ask your administrator to grant you access.",
  },
  feature_not_in_plan: {
    title: "This feature is not in your plan",
    body: "Upgrade your OperatorOS plan to unlock this feature.",
  },
  not_a_member: {
    title: "You're not a member of any organization",
    body: "Ask an administrator to add you to an organization in OperatorOS.",
  },
};

export default function AccessDeniedPage() {
  const { org } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const reason = params.get("reason") || "no_module_role";
  const copy = REASON_COPY[reason] || REASON_COPY.no_module_role;
  const operatorosBase =
    (import.meta as any).env?.VITE_OPERATOROS_BASE_URL || "https://operatoros.net";

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Access Denied" />
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <ShieldAlert className="h-12 w-12 mx-auto text-amber-500" />
            <h2 className="text-lg font-semibold" data-testid="text-access-denied-title">
              {copy.title}
            </h2>
            <p className="text-sm text-muted-foreground" data-testid="text-access-denied-body">
              {copy.body}
            </p>
            {org?.operatorosTenantId ? (
              <Button asChild className="w-full" data-testid="button-open-operatoros">
                <a href={operatorosBase} target="_blank" rel="noreferrer">
                  Open OperatorOS
                  <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                </a>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
