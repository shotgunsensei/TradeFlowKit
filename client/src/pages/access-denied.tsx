import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ExternalLink } from "lucide-react";

const REASON_TITLE: Record<string, string> = {
  tenant_inactive: "Your organization's subscription is paused",
  user_disabled: "Your access has been disabled",
  no_module_role: "You don't have a role in this module",
  feature_not_in_plan: "This feature is not in your plan",
  not_a_member: "You're not a member of any organization",
};

const SPEC_COPY =
  "Access to this module is managed by OperatorOS. Contact your tenant administrator or upgrade your OperatorOS plan.";

export default function AccessDeniedPage() {
  const { org } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const reason = params.get("reason") || "no_module_role";
  const title = REASON_TITLE[reason] || REASON_TITLE.no_module_role;
  const operatorosBase =
    (import.meta as any).env?.VITE_OPERATOROS_BASE_URL || "https://operatoros.net";
  const linked = Boolean(
    (org as any)?.operatorosTenantId || (org as any)?.operatorosOrganizationId,
  );

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Access Denied" />
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <ShieldAlert className="h-12 w-12 mx-auto text-amber-500" />
            <h2
              className="text-lg font-semibold"
              data-testid="text-access-denied-title"
            >
              {title}
            </h2>
            <p
              className="text-sm text-muted-foreground"
              data-testid="text-access-denied-body"
            >
              {SPEC_COPY}
            </p>
            {linked ? (
              <Button asChild className="w-full" data-testid="button-return-operatoros">
                <a href={operatorosBase} target="_blank" rel="noreferrer">
                  Return to OperatorOS
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
