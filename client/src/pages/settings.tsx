import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, User, CreditCard, Users, Shield, Zap, Bell, Download, ScrollText,
} from "lucide-react";
import ProfileTab from "@/pages/settings/profile";
import OrganizationTab from "@/pages/settings/organization";
import TeamTab from "@/pages/settings/team";
import AutomationsTab from "@/pages/settings/automations";
import BillingTab from "@/pages/settings/billing";
import PaymentsTab from "@/pages/settings/payments";
import SecurityTab from "@/pages/settings/security";
import IntegrationsTab from "@/pages/settings/integrations";
import AuditTab from "@/pages/settings/audit";

interface PlanInfo {
  plan: string;
  limits: { customers: number; jobs: number; quotes: number; invoices: number; teamMembers: number; canInvite: boolean };
  counts: { customers: number; jobs: number; quotes: number; invoices: number; members: number };
  subscriptionStatus: string | null;
}

export default function SettingsPage() {
  const { org, refreshAuth } = useAuth();
  const { toast } = useToast();
  const search = useSearch();

  const searchParams = new URLSearchParams(search);
  const defaultTab = searchParams.get("tab") || "profile";
  const justConnected = searchParams.get("connected") === "true";
  const connectError = searchParams.get("error");

  useEffect(() => {
    if (justConnected) {
      toast({ title: "Stripe account connected!", description: "You can now accept card payments on invoices." });
      refreshAuth();
    }
    if (connectError) {
      toast({ title: "Connection failed", description: decodeURIComponent(connectError), variant: "destructive" });
    }
  }, []);

  const { data: planInfo } = useQuery<PlanInfo>({
    queryKey: ["/api/plan-info"],
    enabled: !!org,
  });

  const plan = planInfo?.plan || org?.plan || "free";

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Settings" description="Manage your profile and organization" />

      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue={defaultTab} className="max-w-2xl">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="profile" data-testid="tab-profile">
              <User className="h-3.5 w-3.5 mr-1.5" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="org" data-testid="tab-org">
              <Building2 className="h-3.5 w-3.5 mr-1.5" />
              Organization
            </TabsTrigger>
            <TabsTrigger value="team" data-testid="tab-team">
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Team
            </TabsTrigger>
            <TabsTrigger value="automations" data-testid="tab-automations">
              <Bell className="h-3.5 w-3.5 mr-1.5" />
              Automations
            </TabsTrigger>
            <TabsTrigger value="billing" data-testid="tab-billing">
              <CreditCard className="h-3.5 w-3.5 mr-1.5" />
              Billing
            </TabsTrigger>
            <TabsTrigger value="payments" data-testid="tab-payments">
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              Payments
            </TabsTrigger>
            <TabsTrigger value="security" data-testid="tab-security">
              <Shield className="h-3.5 w-3.5 mr-1.5" />
              Security
            </TabsTrigger>
            <TabsTrigger value="integrations" data-testid="tab-integrations">
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Integrations
            </TabsTrigger>
            <TabsTrigger value="audit" data-testid="tab-audit">
              <ScrollText className="h-3.5 w-3.5 mr-1.5" />
              Audit Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-6">
            <ProfileTab />
          </TabsContent>

          <TabsContent value="org" className="mt-6">
            <OrganizationTab />
          </TabsContent>

          <TabsContent value="team" className="mt-6 space-y-6">
            <TeamTab />
          </TabsContent>

          <TabsContent value="automations" className="mt-6 space-y-6">
            <AutomationsTab plan={plan} />
          </TabsContent>

          <TabsContent value="billing" className="mt-6 space-y-4">
            <BillingTab />
          </TabsContent>

          <TabsContent value="payments" className="mt-6 space-y-4">
            <PaymentsTab plan={plan} />
          </TabsContent>

          <TabsContent value="security" className="mt-6">
            <SecurityTab />
          </TabsContent>

          <TabsContent value="integrations" className="mt-6 space-y-4">
            <IntegrationsTab plan={plan} />
          </TabsContent>

          <TabsContent value="audit" className="mt-6 space-y-4">
            <AuditTab plan={plan} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
