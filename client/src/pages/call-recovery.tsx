import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  CALL_RECOVERY_PLAN_LABELS,
  CALL_RECOVERY_PLAN_PRICES,
  CALL_RECOVERY_PLAN_LIMITS,
} from "@shared/schema";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Check,
  X,
  Phone,
  PhoneMissed,
  MessageSquare,
  Zap,
  BarChart3,
  Settings2,
  ExternalLink,
  Briefcase,
  User,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Lock,
} from "lucide-react";
import { format } from "date-fns";

interface CRSubscription {
  plan: string | null;
  status: string | null;
  phone: string | null;
  limits: { recoveriesPerMonth: number; analytics: boolean } | null;
  usage: number;
  stripeSubscriptionId: string | null;
}

interface StripePlan {
  product_id: string;
  product_name: string;
  product_description: string;
  product_metadata: Record<string, string> | string;
  price_id: string;
  unit_amount: number;
  currency: string;
  recurring: any;
}

interface MissedCall {
  id: string;
  callerPhone: string;
  callerName: string | null;
  status: "new" | "in_progress" | "recovered" | "failed" | "expired";
  serviceType: string | null;
  location: string | null;
  urgency: string | null;
  customerId: string | null;
  jobId: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface AiMessage {
  id: string;
  role: "system" | "assistant" | "user";
  content: string;
  createdAt: string;
}

interface CRStats {
  totalThisMonth: number;
  recovered: number;
  inProgress: number;
  failed: number;
  recoveryRate: number;
}

const PLAN_ORDER = ["starter", "growth", "pro"] as const;

const PLAN_FEATURES: Record<string, { label: string; included: boolean }[]> = {
  starter: [
    { label: "50 recoveries/month", included: true },
    { label: "AI SMS conversations", included: true },
    { label: "Auto-create leads in CRM", included: true },
    { label: "Unlimited recoveries", included: false },
    { label: "Analytics dashboard", included: false },
  ],
  growth: [
    { label: "Unlimited recoveries/month", included: true },
    { label: "AI SMS conversations", included: true },
    { label: "Auto-create leads in CRM", included: true },
    { label: "Unlimited recoveries", included: true },
    { label: "Analytics dashboard", included: false },
  ],
  pro: [
    { label: "Unlimited recoveries/month", included: true },
    { label: "AI SMS conversations", included: true },
    { label: "Auto-create leads in CRM", included: true },
    { label: "Unlimited recoveries", included: true },
    { label: "Analytics dashboard", included: true },
  ],
};

const PLAN_BADGES: Record<string, string> = {
  starter: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  growth: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  pro: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  new: { label: "New", icon: Phone, color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  in_progress: { label: "Contacting", icon: MessageSquare, color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  recovered: { label: "Recovered", icon: CheckCircle, color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  failed: { label: "Failed", icon: AlertCircle, color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  expired: { label: "Expired", icon: Clock, color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300" },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.new;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function ConversationSheet({
  callId,
  open,
  onClose,
}: {
  callId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<{ missedCall: MissedCall; messages: AiMessage[] }>({
    queryKey: ["/api/call-recovery/missed-calls", callId, "messages"],
    enabled: !!callId && open,
  });

  const messages = (data?.messages || []).filter((m) => m.role !== "system");
  const mc = data?.missedCall;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="p-6 pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <PhoneMissed className="h-4 w-4 text-muted-foreground" />
            Missed Call Recovery
          </SheetTitle>
          {mc && (
            <SheetDescription className="space-y-1 text-left">
              <span className="block font-medium text-foreground">{mc.callerPhone}</span>
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={mc.status} />
                {mc.serviceType && (
                  <span className="text-xs text-muted-foreground">
                    <Briefcase className="h-3 w-3 inline mr-1" />{mc.serviceType}
                  </span>
                )}
                {mc.urgency && (
                  <span className="text-xs text-muted-foreground capitalize">
                    <Clock className="h-3 w-3 inline mr-1" />{mc.urgency}
                  </span>
                )}
              </div>
              {mc.jobId && (
                <a
                  href={`/jobs/${mc.jobId}`}
                  className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                  data-testid="link-recovered-job"
                >
                  <Briefcase className="h-3 w-3" /> View auto-created job
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-auto p-4 space-y-3">
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-3/4" style={{ marginLeft: i % 2 === 0 ? "auto" : undefined }} />
              ))}
            </div>
          )}
          {!isLoading && messages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No messages yet.</p>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              data-testid={`message-${msg.id}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <p className={`text-[10px] mt-1 ${msg.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {format(new Date(msg.createdAt), "h:mm a")}
                </p>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function UpgradePage({
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

function DashboardPage({
  subscription,
  onRefresh,
}: {
  subscription: CRSubscription;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [phone, setPhone] = useState(subscription.phone || "");
  const [portalLoading, setPortalLoading] = useState(false);

  const { data: calls, isLoading: callsLoading } = useQuery<MissedCall[]>({
    queryKey: ["/api/call-recovery/missed-calls"],
  });

  const { data: stats } = useQuery<CRStats>({
    queryKey: ["/api/call-recovery/stats"],
    enabled: subscription.limits?.analytics === true,
  });

  const configureMutation = useMutation({
    mutationFn: (phoneNumber: string) =>
      apiRequest("POST", "/api/call-recovery/configure", { phone: phoneNumber }),
    onSuccess: () => {
      toast({ title: "Phone number saved", description: "Your Twilio forwarding number has been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/call-recovery/subscription"] });
      onRefresh();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save phone number", variant: "destructive" });
    },
  });

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

  const openConversation = (callId: string) => {
    setSelectedCallId(callId);
    setSheetOpen(true);
  };

  const plan = subscription.plan || "starter";
  const limits = CALL_RECOVERY_PLAN_LIMITS[plan];
  const usagePercent = limits?.recoveriesPerMonth === -1
    ? 0
    : limits?.recoveriesPerMonth
      ? Math.min((subscription.usage / limits.recoveriesPerMonth) * 100, 100)
      : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
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

        {stats && subscription.limits?.analytics && (
          <Card data-testid="card-cr-analytics">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                This Month's Performance
              </CardTitle>
              <CardDescription>Recovery analytics for the current billing period</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 rounded-lg bg-muted/40">
                  <p className="text-2xl font-bold text-foreground">{stats.recovered}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Recovered</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/40">
                  <p className="text-2xl font-bold text-foreground">{stats.recoveryRate}%</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Conversion Rate</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/40">
                  <p className="text-2xl font-bold text-foreground">{stats.inProgress}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">In Progress</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/40">
                  <p className="text-2xl font-bold text-foreground">{stats.totalThisMonth}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Total Calls</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!subscription.limits?.analytics && (
          <Card className="border-dashed" data-testid="card-cr-analytics-upsell">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Analytics Dashboard
              </CardTitle>
              <CardDescription>Recovery rate, conversion stats, and monthly trends</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-4 gap-3 text-center">
              <Lock className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Available on the Pro plan</p>
              <Badge variant="outline" className="text-xs">Pro only</Badge>
            </CardContent>
          </Card>
        )}
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
        </TabsList>

        <TabsContent value="calls" className="mt-4">
          <Card data-testid="card-missed-calls">
            <CardHeader>
              <CardTitle className="text-base">Missed Calls</CardTitle>
              <CardDescription>
                Calls that were automatically recovered by the AI. Click a row to view the conversation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {callsLoading && (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              )}
              {!callsLoading && (!calls || calls.length === 0) && (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                  <PhoneMissed className="h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No missed calls yet.</p>
                  <p className="text-xs text-muted-foreground">
                    {subscription.phone
                      ? "Forward missed calls to your Twilio number to start recovering leads."
                      : "Set up your Twilio number in the Setup tab to get started."}
                  </p>
                </div>
              )}
              {!callsLoading && calls && calls.length > 0 && (
                <div className="divide-y">
                  {calls.map((call) => (
                    <button
                      key={call.id}
                      className="w-full flex items-center gap-3 py-3 px-2 hover:bg-muted/40 rounded-md transition-colors text-left group"
                      onClick={() => openConversation(call.id)}
                      data-testid={`row-missed-call-${call.id}`}
                    >
                      <div className="flex-shrink-0 h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{call.callerPhone}</p>
                          <StatusBadge status={call.status} />
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {call.serviceType || "Service type pending"}
                          {call.location ? ` · ${call.location}` : ""}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(call.createdAt), "MMM d, h:mm a")}
                        </p>
                        {call.jobId && (
                          <p className="text-xs text-primary flex items-center gap-0.5 justify-end mt-0.5">
                            <Briefcase className="h-3 w-3" /> Job created
                          </p>
                        )}
                      </div>
                      <MessageSquare className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="setup" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card data-testid="card-cr-setup">
              <CardHeader>
                <CardTitle className="text-base">Twilio Phone Number</CardTitle>
                <CardDescription>
                  This is the number your customers text when the AI contacts them after a missed call.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="twilio-phone" data-testid="label-twilio-phone">
                    Your Twilio Number
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="twilio-phone"
                      placeholder="+15551234567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      data-testid="input-twilio-phone"
                    />
                    <Button
                      onClick={() => configureMutation.mutate(phone)}
                      disabled={!phone || configureMutation.isPending}
                      data-testid="button-save-phone"
                    >
                      {configureMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : "Save"}
                    </Button>
                  </div>
                </div>
                {subscription.phone && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                    Active number: <span className="font-medium text-foreground">{subscription.phone}</span>
                  </p>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-cr-instructions">
              <CardHeader>
                <CardTitle className="text-base">Setup Instructions</CardTitle>
                <CardDescription>How to forward missed calls to the AI</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ol className="space-y-3 text-sm">
                  {[
                    { step: "1", text: "Get a Twilio phone number from twilio.com — choose a local number for your area." },
                    { step: "2", text: "In Twilio Console, complete the A2P 10DLC registration for your brand and messaging campaign. Use the SMS Consent Policy link below as your opt-in documentation URL." },
                    { step: "3", text: "Configure the Twilio number's Voice webhook (for missed calls) and Messaging webhook (for SMS replies) to the URLs shown below." },
                    { step: "4", text: "Enter that Twilio number above and save it." },
                    { step: "5", text: "On your mobile carrier or phone system, set up call forwarding for unanswered calls to your Twilio number." },
                    { step: "6", text: "Test by calling your business number and letting it go unanswered. The caller should receive an AI SMS within seconds." },
                  ].map((item) => (
                    <li key={item.step} className="flex gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                        {item.step}
                      </span>
                      <span className="text-muted-foreground">{item.text}</span>
                    </li>
                  ))}
                </ol>

                <div className="p-3 rounded-lg bg-muted/40 text-xs space-y-1.5">
                  <div>
                    <strong className="text-foreground">Missed-call webhook URL:</strong>{" "}
                    <code className="text-primary break-all">
                      {window.location.origin}/api/call-recovery/webhook/missed-call
                    </code>
                  </div>
                  <div>
                    <strong className="text-foreground">SMS reply webhook URL:</strong>{" "}
                    <code className="text-primary break-all">
                      {window.location.origin}/api/call-recovery/webhook/sms
                    </code>
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 text-xs space-y-1.5" data-testid="card-sms-compliance">
                  <p className="font-semibold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Twilio Business Messaging Compliance
                  </p>
                  <p className="text-amber-800 dark:text-amber-400">
                    Twilio requires proof of consumer consent for A2P 10DLC registration. Use the link below as
                    your <strong>opt-in documentation URL</strong> when completing your campaign registration in the
                    Twilio Console.
                  </p>
                  <a
                    href="/sms-consent"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-amber-900 dark:text-amber-300 underline underline-offset-2 hover:opacity-80"
                    data-testid="link-sms-consent"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {window.location.origin}/sms-consent
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <ConversationSheet
        callId={selectedCallId}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}

export default function CallRecoveryPage() {
  const { org, refreshAuth } = useAuth();
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
