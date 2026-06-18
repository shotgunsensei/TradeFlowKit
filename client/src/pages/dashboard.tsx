import { lazy, Suspense, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { PwaInstallBanner } from "@/components/pwa-install-banner";

const RevenueChart = lazy(() =>
  import("@/components/dashboard/revenue-chart").then((m) => ({
    default: m.RevenueChart,
  })),
);
import {
  Users,
  Wrench,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  FileText,
  Clock,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Star,
  UserPlus,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { parseSsoNotice, stripSsoFromUrl } from "@/lib/sso-notice";
import { Link } from "wouter";
import { format, isThisMonth } from "date-fns";

interface TodayJob {
  id: string;
  title: string;
  status: string;
  scheduledStart: string | null;
  customerName?: string;
  assignedUserNames?: string[];
}

interface MemberWorkload {
  userId: string;
  userName: string;
  activeJobCount: number;
}

interface ActivityItem {
  type: string;
  id: string;
  label: string;
  link: string;
  time: string | Date;
}

interface DashboardStats {
  customerCount: number;
  jobCounts: Record<string, number>;
  totalJobs: number;
  activeJobs: number;
  quoteCount: number;
  invoiceCount: number;
  revenue: number;
  outstanding: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
  overdueCount: number;
  overdueAmount: number;
  quotesAwaitingCount: number;
  quotesAwaitingValue: number;
  todaysJobs: TodayJob[];
  revenueChartData: { date: string; amount: number }[];
  activityFeed: ActivityItem[];
  memberWorkload: MemberWorkload[];
  recentJobs: (TodayJob & { customerName?: string })[];
  recentInvoices: {
    id: string;
    customerName?: string;
    dueDate: string | null;
    status: string;
  }[];
  isEmpty: boolean;
}

interface LeadStats {
  newLeads: number;
  hotLeads: number;
  needsFollowUp: number;
  converted: number;
  totalOpen: number;
}

interface DashboardLead {
  id: string;
  convertedAt: string | Date | null;
  status: string;
}

function fmt(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function TrendBadge({ thisMonth, lastMonth }: { thisMonth: number; lastMonth: number }) {
  if (lastMonth === 0) return null;
  const pct = ((thisMonth - lastMonth) / lastMonth) * 100;
  const up = pct >= 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${up ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
      {up ? <TrendingUp className="h-3 w-3" aria-hidden="true" /> : <TrendingDown className="h-3 w-3" aria-hidden="true" />}
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

function EmptyState() {
  const steps = [
    { label: "Add your first customer", href: "/customers?new=1", done: false },
    { label: "Create a job", href: "/jobs?new=1", done: false },
    { label: "Send a quote", href: "/quotes/new", done: false },
    { label: "Send an invoice", href: "/invoices/new", done: false },
  ];

  return (
    <Card data-testid="empty-state">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          Welcome to TradeFlow — let's get set up
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Complete these steps to start running your business from TradeFlow.
        </p>
        <div className="space-y-2">
          {steps.map((s) => (
            <Link key={s.label} href={s.href}>
              <div className="flex items-center justify-between gap-3 rounded-md border px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer group">
                <div className="flex items-center gap-3">
                  <div className={`h-5 w-5 rounded-full border-2 shrink-0 ${s.done ? "bg-emerald-500 border-emerald-500" : "border-gray-300"}`}>
                    {s.done && <CheckCircle2 className="h-4 w-4 text-white" />}
                  </div>
                  <span className={`text-sm font-medium ${s.done ? "line-through text-muted-foreground" : ""}`}>
                    {s.label}
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const STATUS_COLORS: Record<string, string> = {
  lead: "bg-gray-100 text-gray-700",
  quoted: "bg-primary/10 text-primary",
  scheduled: "bg-indigo-100 text-indigo-700",
  in_progress: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
  invoiced: "bg-orange-100 text-orange-700",
  paid: "bg-green-100 text-green-700",
  canceled: "bg-red-100 text-red-700",
};

export default function Dashboard() {
  const { org } = useAuth();
  const { toast } = useToast();
  const ssoNoticeShown = useRef(false);

  useEffect(() => {
    if (ssoNoticeShown.current) return;
    if (typeof window === "undefined") return;
    const notice = parseSsoNotice(window.location.search);
    if (!notice) return;
    if (!org) return;
    ssoNoticeShown.current = true;

    if (notice === "provisioned") {
      toast({
        title: `Signed in to ${org.name} via OperatorOS`,
        description: "We created this organization for you.",
      });
    } else if (notice === "joined") {
      toast({
        title: `Signed in to ${org.name} via OperatorOS`,
        description: "You've been added to this organization.",
      });
    } else if (notice === "signed_in") {
      toast({
        title: `Signed in to ${org.name} via OperatorOS`,
      });
    }

    const newUrl = stripSsoFromUrl({
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
    });
    window.history.replaceState({}, "", newUrl);
  }, [org, toast]);

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard"],
    enabled: !!org,
  });

  const { data: reviewStats } = useQuery<{ countThisMonth: number }>({
    queryKey: ["/api/review-requests/stats"],
    enabled: !!org,
  });

  const { data: leadStats, isLoading: leadStatsLoading, error: leadStatsError } = useQuery<LeadStats>({
    queryKey: ["/api/leads/stats"],
    enabled: !!org,
  });

  const {
    data: dashboardLeads = [],
    isLoading: dashboardLeadsLoading,
    error: dashboardLeadsError,
  } = useQuery<DashboardLead[]>({
    queryKey: ["/api/leads"],
    enabled: !!org,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Dashboard" description="Loading..." />
        <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Skeleton className="h-64 lg:col-span-2" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const revTrend = stats.revenueLastMonth > 0
    ? ((stats.revenueThisMonth - stats.revenueLastMonth) / stats.revenueLastMonth) * 100
    : null;
  const convertedLeadsThisMonth = dashboardLeads.filter((lead) => {
    if (!lead.convertedAt) return false;
    return isThisMonth(new Date(lead.convertedAt));
  }).length;
  const leadWidgetLoading = leadStatsLoading || dashboardLeadsLoading;
  const leadWidgetError = leadStatsError || dashboardLeadsError;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Dashboard"
        description={org ? `Overview for ${org.name}` : "Welcome to TradeFlow"}
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4">
        <PwaInstallBanner />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Link href="/jobs?status=scheduled">
            <div className="rounded-xl border bg-card p-4 hover-elevate cursor-pointer" data-testid="kpi-todays-jobs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground font-medium">Today's Jobs</span>
                <CalendarCheck className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-bold">{stats.todaysJobs.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">scheduled today</p>
            </div>
          </Link>

          <Link href="/invoices?status=sent">
            <div className={`rounded-xl border p-4 hover-elevate cursor-pointer ${stats.overdueCount > 0 ? "border-red-200 bg-red-50 dark:bg-red-950/20" : "bg-card"}`} data-testid="kpi-overdue">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-medium ${stats.overdueCount > 0 ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}`}>Overdue</span>
                <AlertTriangle aria-hidden="true" className={`h-4 w-4 ${stats.overdueCount > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`} />
              </div>
              <p className={`text-2xl font-bold ${stats.overdueCount > 0 ? "text-red-700 dark:text-red-400" : ""}`}>{stats.overdueCount}</p>
              {stats.overdueAmount > 0 && (
                <p className="text-xs text-red-700 dark:text-red-400 mt-0.5 font-medium">{fmt(stats.overdueAmount)}</p>
              )}
              {stats.overdueCount === 0 && <p className="text-xs text-muted-foreground mt-0.5">all current</p>}
            </div>
          </Link>

          <Link href="/quotes?status=sent">
            <div className="rounded-xl border bg-card p-4 hover-elevate cursor-pointer" data-testid="kpi-quotes-awaiting">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground font-medium">Awaiting Approval</span>
                <FileText aria-hidden="true" className="h-4 w-4 text-amber-700 dark:text-amber-400" />
              </div>
              <p className="text-2xl font-bold">{stats.quotesAwaitingCount}</p>
              {stats.quotesAwaitingValue > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 font-medium">{fmt(stats.quotesAwaitingValue)}</p>
              )}
              {stats.quotesAwaitingCount === 0 && <p className="text-xs text-muted-foreground mt-0.5">quotes pending</p>}
            </div>
          </Link>

          <Link href="/invoices">
            <div className="rounded-xl border bg-card p-4 hover-elevate cursor-pointer" data-testid="kpi-outstanding">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground font-medium">Unpaid Balance</span>
                <DollarSign className="h-4 w-4 text-orange-600" />
              </div>
              <p className="text-lg font-bold truncate">{fmt(stats.outstanding)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">open invoices</p>
            </div>
          </Link>

          <div className="rounded-xl border bg-card p-4" data-testid="kpi-revenue">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">This Month</span>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-lg font-bold truncate">{fmt(stats.revenueThisMonth)}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <TrendBadge thisMonth={stats.revenueThisMonth} lastMonth={stats.revenueLastMonth} />
              {stats.revenueLastMonth > 0 && (
                <span className="text-xs text-muted-foreground">vs last month</span>
              )}
              {stats.revenueLastMonth === 0 && (
                <span className="text-xs text-muted-foreground">revenue</span>
              )}
            </div>
          </div>

          {reviewStats !== undefined && (
            <Link href="/settings">
              <div className="rounded-xl border bg-card p-4 hover-elevate cursor-pointer col-span-1" data-testid="kpi-review-requests">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground font-medium">Reviews Sent</span>
                  <Star aria-hidden="true" className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                </div>
                <p className="text-2xl font-bold">{reviewStats.countThisMonth}</p>
                <p className="text-xs text-muted-foreground mt-0.5">this month</p>
              </div>
            </Link>
          )}
        </div>

        {stats.isEmpty && <EmptyState />}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    Revenue — Last 30 Days
                  </span>
                  <span className="text-muted-foreground font-normal text-xs">{fmt(stats.revenue)} all-time</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<Skeleton className="h-[260px] w-full" />}>
                  <RevenueChart data={stats.revenueChartData} />
                </Suspense>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4 text-muted-foreground" />
                  Today's Schedule
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.todaysJobs.length === 0 ? (
                  <div className="text-center py-5">
                    <p className="text-sm text-muted-foreground">No jobs scheduled today</p>
                    <Link href="/jobs?new=1">
                      <button className="mt-2 text-xs text-primary hover:underline">+ Add a job</button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {stats.todaysJobs.map((job) => (
                      <Link key={job.id} href={`/jobs/${job.id}`}>
                        <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 hover-elevate cursor-pointer" data-testid={`today-job-${job.id}`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{job.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {job.customerName || "No customer"}
                              {job.scheduledStart && ` · ${format(new Date(job.scheduledStart), "h:mm a")}`}
                              {job.assignedUserNames && job.assignedUserNames.length > 0 && (
                                <> · <span className="text-primary">{job.assignedUserNames.join(", ")}</span></>
                              )}
                            </p>
                          </div>
                          <StatusBadge status={job.status} type="job" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                  Pipeline Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {Object.entries(stats.jobCounts).map(([status, count]) => (
                    <Link key={status} href={`/jobs?status=${status}`}>
                      <div
                        className="text-center rounded-lg border p-2 hover-elevate cursor-pointer"
                        data-testid={`job-count-${status}`}
                      >
                        <p className="text-base font-bold">{count}</p>
                        <div className={`text-[10px] font-medium px-1 py-0.5 rounded mt-1 ${STATUS_COLORS[status] || "bg-gray-100 text-gray-600"}`}>
                          {status.replace("_", " ")}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-muted-foreground" />
                    Lead Conversion
                  </span>
                  <Link href="/leads" className="text-xs text-primary hover:underline">Open</Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {leadWidgetLoading ? (
                  <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-[74px] rounded-lg" />
                    ))}
                  </div>
                ) : leadWidgetError ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
                    <div className="flex items-center gap-2 font-medium">
                      <AlertTriangle className="h-4 w-4" />
                      Lead counts unavailable
                    </div>
                    <p className="mt-1 text-xs">Open the Lead Conversion Center to continue working leads.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <Link href="/leads">
                      <div className="rounded-lg border p-3 hover-elevate cursor-pointer" data-testid="lead-widget-new">
                        <p className="text-xl font-bold">{leadStats?.newLeads || 0}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">New Leads</p>
                      </div>
                    </Link>
                    <Link href="/leads">
                      <div className="rounded-lg border p-3 hover-elevate cursor-pointer" data-testid="lead-widget-hot">
                        <p className="text-xl font-bold">{leadStats?.hotLeads || 0}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Hot Leads</p>
                      </div>
                    </Link>
                    <Link href="/leads">
                      <div className="rounded-lg border p-3 hover-elevate cursor-pointer" data-testid="lead-widget-followup">
                        <p className="text-xl font-bold">{leadStats?.needsFollowUp || 0}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Due Follow-Up</p>
                      </div>
                    </Link>
                    <Link href="/leads">
                      <div className="rounded-lg border p-3 hover-elevate cursor-pointer" data-testid="lead-widget-converted">
                        <p className="text-xl font-bold">{convertedLeadsThisMonth}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Converted This Month</p>
                      </div>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <QuickActions />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3">
                <ActivityFeed items={stats.activityFeed} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Summary
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <Link href="/customers">
                    <div className="rounded-lg border p-3 hover-elevate cursor-pointer" data-testid="summary-customers">
                      <p className="text-xl font-bold">{stats.customerCount}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Customers</p>
                    </div>
                  </Link>
                  <Link href="/jobs">
                    <div className="rounded-lg border p-3 hover-elevate cursor-pointer" data-testid="summary-jobs">
                      <p className="text-xl font-bold">{stats.activeJobs}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Active Jobs</p>
                    </div>
                  </Link>
                  <Link href="/quotes">
                    <div className="rounded-lg border p-3 hover-elevate cursor-pointer" data-testid="summary-quotes">
                      <p className="text-xl font-bold">{stats.quoteCount}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Quotes</p>
                    </div>
                  </Link>
                  <Link href="/invoices">
                    <div className="rounded-lg border p-3 hover-elevate cursor-pointer" data-testid="summary-invoices">
                      <p className="text-xl font-bold">{stats.invoiceCount}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Invoices</p>
                    </div>
                  </Link>
                </div>
              </CardContent>
            </Card>

            {stats.memberWorkload.length > 0 && (
              <Card data-testid="technician-workload">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Team Workload
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {stats.memberWorkload.map((m) => (
                      <div key={m.userId} className="flex items-center justify-between gap-2" data-testid={`workload-${m.userId}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                            {m.userName.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="text-sm truncate">{m.userName}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden w-16">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${Math.min((m.activeJobCount / 10) * 100, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-6 text-right">{m.activeJobCount}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
