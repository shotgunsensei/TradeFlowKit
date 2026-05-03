import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import {
  FileText,
  Receipt,
  Wrench,
  Users,
  TrendingUp,
  DollarSign,
  CheckCircle,
  Clock,
  Repeat,
  Timer,
  CreditCard,
} from "lucide-react";

interface QuoteAnalytics {
  total: number;
  accepted: number;
  sent: number;
  draft: number;
  declined: number;
  avgValue: number;
  acceptanceRate: number;
  acceptanceRate30d: number;
  total30d: number;
  byStatus: { status: string; count: number; totalValue: number }[];
  weekly: { week: string; count: number; accepted: number }[];
}

interface InvoiceAnalytics {
  total: number;
  paidCount: number;
  collected: number;
  totalValue: number;
  overdueValue: number;
  collectionRate: number;
  avgDaysToPayment: number;
  avgDaysSentToPaid: number;
  stripeCollected: number;
  stripePaidCount: number;
  stripeCollectedThisMonth: number;
  avgDaysToPaymentStripe: number;
  avgDaysToPaymentManual: number;
  weekly: { week: string; revenue: number; stripeRevenue: number; manualRevenue: number }[];
  aging: { bucket: string; count: number; value: number }[];
}

interface JobAnalytics {
  byStatus: { status: string; count: number }[];
  weekly: { week: string; created: number; completed: number }[];
  byPriority: { priority: string; count: number }[];
  completionRate: number;
  busiestDays: { day: string; count: number }[];
}

interface CustomerAnalytics {
  total: number;
  monthly: { month: string; count: number }[];
  topByValue: { id: string; name: string; jobCount: number; lifetimeValue: number }[];
  repeatRatio: number;
  repeatCustomers: number;
  oneTimeCustomers: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "#94a3b8",
  sent: "#3b82f6",
  accepted: "#22c55e",
  declined: "#ef4444",
  expired: "#f97316",
  lead: "#94a3b8",
  quoted: "#3b82f6",
  scheduled: "#a855f7",
  in_progress: "#f59e0b",
  done: "#22c55e",
  invoiced: "#06b6d4",
  paid: "#16a34a",
  canceled: "#ef4444",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "#94a3b8",
  normal: "#3b82f6",
  urgent: "#ef4444",
};

const AGING_LABELS: Record<string, string> = {
  current: "Current",
  "1_30": "1–30 days",
  "31_60": "31–60 days",
  "61_90": "61–90 days",
  over_90: "90+ days",
  no_due_date: "No due date",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-foreground",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-lg border bg-card">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-xl font-bold ${color}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function QuotesTab() {
  const { data, isLoading } = useQuery<QuoteAnalytics>({ queryKey: ["/api/analytics/quotes"] });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;
  if (!data) return null;

  const weeklyData = data.weekly.map((w) => ({
    week: format(parseISO(String(w.week)), "MMM d"),
    Quotes: w.count,
    Accepted: w.accepted,
  }));

  const pieData = data.byStatus.map((s) => ({
    name: s.status.charAt(0).toUpperCase() + s.status.slice(1),
    value: s.count,
    color: STATUS_COLORS[s.status] || "#94a3b8",
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={FileText} label="Total Quotes" value={data.total} />
        <StatCard
          icon={CheckCircle}
          label="Acceptance Rate"
          value={`${data.acceptanceRate}%`}
          sub="all-time"
          color={data.acceptanceRate >= 50 ? "text-green-600" : "text-amber-600"}
        />
        <StatCard
          icon={TrendingUp}
          label="30-Day Acceptance"
          value={`${data.acceptanceRate30d}%`}
          sub={`${data.total30d} quotes`}
          color={data.acceptanceRate30d >= 50 ? "text-green-600" : "text-amber-600"}
        />
        <StatCard icon={DollarSign} label="Avg. Quote Value" value={fmt(data.avgValue)} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quotes vs. Accepted (12 weeks)</CardTitle>
          </CardHeader>
          <CardContent>
            {weeklyData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No quote data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weeklyData} barSize={12}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Quotes" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Accepted" fill="#22c55e" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={2}>
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [v, "Quotes"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 flex-1">
                  {pieData.map((entry) => (
                    <div key={entry.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ background: entry.color }} />
                        <span className="text-muted-foreground">{entry.name}</span>
                      </div>
                      <span className="font-medium">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InvoicesTab() {
  const { data, isLoading } = useQuery<InvoiceAnalytics>({ queryKey: ["/api/analytics/invoices"] });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;
  if (!data) return null;

  const weeklyData = data.weekly.map((w) => ({
    week: format(parseISO(String(w.week)), "MMM d"),
    Revenue: w.revenue,
    Stripe: w.stripeRevenue,
    Manual: w.manualRevenue,
  }));

  const hasStripe = data.weekly.some((w) => w.stripeRevenue > 0);

  const agingData = data.aging
    .filter((a) => a.bucket !== "no_due_date" && a.bucket !== "current")
    .map((a) => ({
      name: AGING_LABELS[a.bucket] || a.bucket,
      Count: a.count,
      Value: a.value,
    }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Receipt} label="Total Invoices" value={data.total} />
        <StatCard
          icon={CheckCircle}
          label="Collection Rate"
          value={`${data.collectionRate}%`}
          color={data.collectionRate >= 70 ? "text-green-600" : "text-amber-600"}
        />
        <StatCard icon={DollarSign} label="Revenue Collected" value={fmt(data.collected)} />
        <StatCard
          icon={Timer}
          label="Time to Pay"
          value={data.avgDaysSentToPaid > 0 ? `${data.avgDaysSentToPaid}d` : "—"}
          sub="avg invoice sent → paid"
          color={data.avgDaysSentToPaid > 0 && data.avgDaysSentToPaid <= 30 ? "text-green-600" : data.avgDaysSentToPaid > 60 ? "text-red-600" : "text-foreground"}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div data-testid="card-stripe-this-month">
          <StatCard
            icon={CreditCard}
            label="Card Payments (This Month)"
            value={fmt(data.stripeCollectedThisMonth)}
            sub="paid via Stripe"
            color="text-violet-600"
          />
        </div>
        <div data-testid="card-stripe-total">
          <StatCard
            icon={CreditCard}
            label="Card Payments (All Time)"
            value={fmt(data.stripeCollected)}
            sub={`${data.stripePaidCount} invoice${data.stripePaidCount !== 1 ? "s" : ""}`}
            color="text-violet-600"
          />
        </div>
        <StatCard
          icon={Timer}
          label="Time to Pay (Card)"
          value={data.avgDaysToPaymentStripe > 0 ? `${data.avgDaysToPaymentStripe}d` : "—"}
          sub="Stripe-paid invoices"
          color={data.avgDaysToPaymentStripe > 0 && data.avgDaysToPaymentStripe <= 7 ? "text-green-600" : "text-foreground"}
        />
        <StatCard
          icon={Timer}
          label="Time to Pay (Manual)"
          value={data.avgDaysToPaymentManual > 0 ? `${data.avgDaysToPaymentManual}d` : "—"}
          sub="manually-marked paid"
          color="text-foreground"
        />
      </div>

      {data.overdueValue > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
          <Clock className="h-4 w-4 text-red-600 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400">
            <strong>{fmt(data.overdueValue)}</strong> overdue across unpaid invoices
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Weekly Revenue (12 weeks)</CardTitle>
            {hasStripe && (
              <CardDescription>Stripe (card) vs. manually-marked paid</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {weeklyData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No paid invoices yet</p>
            ) : hasStripe ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weeklyData} barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number, name) => [fmt(v), name]} />
                  <Legend />
                  <Bar dataKey="Stripe" stackId="rev" fill="#8b5cf6" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Manual" stackId="rev" fill="#22c55e" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [fmt(v), "Revenue"]} />
                  <Line type="monotone" dataKey="Revenue" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aging Report (overdue only)</CardTitle>
            <CardDescription>Outstanding invoices past due date</CardDescription>
          </CardHeader>
          <CardContent>
            {agingData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No overdue invoices</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={agingData} barSize={24}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(v: number, name) => [name === "Value" ? fmt(v) : v, name]} />
                  <Legend />
                  <Bar dataKey="Count" fill="#ef4444" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function JobsTab() {
  const { data, isLoading } = useQuery<JobAnalytics>({ queryKey: ["/api/analytics/jobs"] });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;
  if (!data) return null;

  const total = data.byStatus.reduce((sum, s) => sum + s.count, 0);
  const completed = data.byStatus.filter((s) => ["done", "invoiced", "paid"].includes(s.status)).reduce((sum, s) => sum + s.count, 0);
  const active = data.byStatus.filter((s) => ["in_progress", "scheduled"].includes(s.status)).reduce((sum, s) => sum + s.count, 0);

  const weeklyData = data.weekly.map((w) => ({
    week: format(parseISO(String(w.week)), "MMM d"),
    Created: w.created,
    Completed: w.completed,
  }));

  const statusPie = data.byStatus.map((s) => ({
    name: s.status.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    value: s.count,
    color: STATUS_COLORS[s.status] || "#94a3b8",
  }));

  const busiestDay = data.busiestDays?.length > 0
    ? data.busiestDays.reduce((a, b) => (a.count > b.count ? a : b))
    : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Wrench} label="Total Jobs" value={total} />
        <StatCard icon={TrendingUp} label="Active" value={active} color="text-amber-600" />
        <StatCard
          icon={CheckCircle}
          label="Completion Rate"
          value={`${data.completionRate ?? 0}%`}
          color={(data.completionRate ?? 0) >= 70 ? "text-green-600" : "text-amber-600"}
        />
        <StatCard
          icon={Clock}
          label="Busiest Day"
          value={busiestDay ? busiestDay.day : "—"}
          sub={busiestDay ? `${busiestDay.count} jobs` : "no data yet"}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Jobs Created vs. Completed (12 weeks)</CardTitle>
          </CardHeader>
          <CardContent>
            {weeklyData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No job data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weeklyData} barSize={12}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Created" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Completed" fill="#22c55e" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Jobs by Day of Week</CardTitle>
            <CardDescription>Which days are busiest</CardDescription>
          </CardHeader>
          <CardContent>
            {!data.busiestDays || data.busiestDays.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.busiestDays} barSize={24}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="Jobs" fill="#a855f7" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CustomersTab() {
  const { data, isLoading } = useQuery<CustomerAnalytics>({ queryKey: ["/api/analytics/customers"] });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;
  if (!data) return null;

  const monthlyData = data.monthly.map((m) => ({
    month: format(parseISO(String(m.month)), "MMM yy"),
    New: m.count,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total Customers" value={data.total} />
        <StatCard
          icon={TrendingUp}
          label="Avg. New / Month"
          value={
            data.monthly.length > 0
              ? Math.round(data.monthly.reduce((s, m) => s + m.count, 0) / data.monthly.length)
              : 0
          }
        />
        <StatCard
          icon={Repeat}
          label="Repeat Rate"
          value={`${data.repeatRatio ?? 0}%`}
          sub={`${data.repeatCustomers ?? 0} repeat customers`}
          color={(data.repeatRatio ?? 0) >= 30 ? "text-green-600" : "text-foreground"}
        />
        <StatCard
          icon={CheckCircle}
          label="One-Time Customers"
          value={data.oneTimeCustomers ?? 0}
          sub="single job only"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Customers per Month (12 months)</CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No customer data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyData} barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="New" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Customers by Lifetime Value</CardTitle>
            <CardDescription>Based on paid invoices</CardDescription>
          </CardHeader>
          <CardContent>
            {data.topByValue.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No paid invoices yet</p>
            ) : (
              <div className="space-y-2">
                {data.topByValue.slice(0, 8).map((c, i) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <a href={`/customers/${c.id}`} className="text-sm font-medium hover:underline text-foreground truncate block">
                        {c.name}
                      </a>
                      <p className="text-xs text-muted-foreground">{c.jobCount} job{c.jobCount !== 1 ? "s" : ""}</p>
                    </div>
                    <span className="text-sm font-semibold text-green-700 dark:text-green-400 shrink-0">
                      {fmt(c.lifetimeValue)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Analytics" description="Business performance insights across quotes, invoices, jobs, and customers" />
      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="quotes">
          <TabsList className="mb-6">
            <TabsTrigger value="quotes" data-testid="tab-analytics-quotes">
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Quotes
            </TabsTrigger>
            <TabsTrigger value="invoices" data-testid="tab-analytics-invoices">
              <Receipt className="h-3.5 w-3.5 mr-1.5" />
              Invoices
            </TabsTrigger>
            <TabsTrigger value="jobs" data-testid="tab-analytics-jobs">
              <Wrench className="h-3.5 w-3.5 mr-1.5" />
              Jobs
            </TabsTrigger>
            <TabsTrigger value="customers" data-testid="tab-analytics-customers">
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Customers
            </TabsTrigger>
          </TabsList>
          <TabsContent value="quotes"><QuotesTab /></TabsContent>
          <TabsContent value="invoices"><InvoicesTab /></TabsContent>
          <TabsContent value="jobs"><JobsTab /></TabsContent>
          <TabsContent value="customers"><CustomersTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
