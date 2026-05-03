import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PhoneMissed, Settings2 } from "lucide-react";
import { PlanCard } from "./PlanCard";
import { AnalyticsCard } from "./AnalyticsCard";
import { MissedCallsList } from "./MissedCallsList";
import { SetupTab } from "./SetupTab";
import { AdminSettingsTab } from "./AdminSettingsTab";
import type { CRSubscription, CRStats } from "./types";

export function DashboardPage({
  subscription,
  onRefresh,
}: {
  subscription: CRSubscription;
  onRefresh: () => void;
}) {
  const { data: stats } = useQuery<CRStats>({
    queryKey: ["/api/call-recovery/stats"],
    enabled: subscription.limits?.analytics === true,
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <PlanCard subscription={subscription} />
        <AnalyticsCard stats={stats} hasAnalytics={subscription.limits?.analytics === true} />
      </div>

      <Tabs defaultValue="calls">
        <TabsList data-testid="tabs-cr">
          <TabsTrigger value="calls" data-testid="tab-missed-calls">
            <PhoneMissed className="h-4 w-4 mr-2" />
            Missed Calls
          </TabsTrigger>
          <TabsTrigger value="setup" data-testid="tab-setup">
            <Settings2 className="h-4 w-4 mr-2" />
            Setup
          </TabsTrigger>
          <TabsTrigger value="admin-settings" data-testid="tab-admin-settings">
            <Settings2 className="h-4 w-4 mr-2" />
            AI Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calls" className="mt-4">
          <MissedCallsList subscription={subscription} />
        </TabsContent>

        <TabsContent value="setup" className="mt-4">
          <SetupTab subscription={subscription} onRefresh={onRefresh} />
        </TabsContent>

        <TabsContent value="admin-settings" className="mt-4">
          <AdminSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
