import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardPage } from "@/components/call-recovery/DashboardPage";
import { UpgradePage } from "@/components/call-recovery/UpgradePage";
import type { CRSubscription, StripePlan } from "@/components/call-recovery/types";

export default function CallRecoveryPage() {
  const { refreshAuth } = useAuth();
  const { toast } = useToast();
  const search = useSearch();
  const [, setLocation] = useLocation();

  const { data: subscription, isLoading: subLoading, refetch: refetchSub } = useQuery<CRSubscription>({
    queryKey: ["/api/call-recovery/subscription"],
  });

  const { data: stripePlans, isLoading: plansLoading } = useQuery<StripePlan[]>({
    queryKey: ["/api/call-recovery/plans"],
    enabled: !subscription?.plan,
  });

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("subscription") === "success") {
      const sessionId = params.get("session_id");
      const activate = async () => {
        if (sessionId) {
          try {
            await apiRequest("GET", `/api/call-recovery/verify-checkout?session_id=${encodeURIComponent(sessionId)}`);
          } catch (e) {
            console.warn("Checkout verification failed, webhook will handle it:", e);
          }
        }
        await refreshAuth();
        await refetchSub();
        toast({ title: "Call Recovery activated!", description: "Your add-on subscription is now active." });
        setLocation("/call-recovery", { replace: true });
      };
      activate();
    } else if (params.get("subscription") === "cancelled") {
      toast({ title: "Checkout cancelled", description: "You can subscribe anytime.", variant: "destructive" });
      setLocation("/call-recovery", { replace: true });
    }
  }, [search]);

  if (subLoading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Call Recovery AI" description="AI-powered missed call recovery for contractors" />
        <div className="flex-1 overflow-auto p-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-44" />
            <Skeleton className="h-44" />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-72" />)}
          </div>
        </div>
      </div>
    );
  }

  const hasSubscription = !!subscription?.plan;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Call Recovery AI"
        description={
          hasSubscription
            ? "AI-powered missed call recovery — converting missed calls into booked jobs"
            : "Turn every missed call into a booked job with AI"
        }
      />
      <div className="flex-1 overflow-auto p-6">
        {hasSubscription ? (
          <DashboardPage subscription={subscription!} onRefresh={refetchSub} />
        ) : (
          <UpgradePage stripePlans={stripePlans} plansLoading={plansLoading} />
        )}
      </div>
    </div>
  );
}
