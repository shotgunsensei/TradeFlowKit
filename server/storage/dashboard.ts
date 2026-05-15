import { eq, count, sql, and, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  customers,
  jobs,
  quotes,
  invoices,
  memberships,
} from "@shared/schema";

export const dashboardStorage = {
  async getOrgCounts(orgId: string): Promise<{ customers: number; jobs: number; quotes: number; invoices: number; members: number }> {
    const [custCount] = await db.select({ c: count() }).from(customers).where(and(eq(customers.orgId, orgId), isNull(customers.deletedAt)));
    const [jobCount] = await db.select({ c: count() }).from(jobs).where(and(eq(jobs.orgId, orgId), isNull(jobs.deletedAt)));
    const [quoteCount] = await db.select({ c: count() }).from(quotes).where(eq(quotes.orgId, orgId));
    const [invoiceCount] = await db.select({ c: count() }).from(invoices).where(and(eq(invoices.orgId, orgId), isNull(invoices.deletedAt)));
    const [memberCount] = await db.select({ c: count() }).from(memberships).where(eq(memberships.orgId, orgId));
    return {
      customers: custCount.c,
      jobs: jobCount.c,
      quotes: quoteCount.c,
      invoices: invoiceCount.c,
      members: memberCount.c,
    };
  },

  async getDashboardStats(orgId: string): Promise<Record<string, unknown>> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    type DashboardAggRow = {
      customer_count: string | number;
      job_counts: Record<string, number> | null;
      total_jobs: string | number;
      active_jobs: string | number;
      quote_count: string | number;
      quotes_awaiting_count: string | number;
      quotes_awaiting_value: string | number;
      invoice_count: string | number;
      revenue: string | number;
      outstanding: string | number;
      revenue_this_month: string | number;
      revenue_last_month: string | number;
      overdue_count: string | number;
      overdue_amount: string | number;
      stripe_revenue: string | number;
      stripe_revenue_this_month: string | number;
      stripe_paid_count: string | number;
      manual_revenue_this_month: string | number;
      avg_time_to_pay: string | number;
    };

    type DashboardListsRow = {
      members: { user_id: string; user_name: string }[] | null;
      todays_jobs: TodaysJobRow[] | null;
      recent_jobs: JobWithCustomerRow[] | null;
      recent_invoices: InvoiceWithCustomerRow[] | null;
      activity_jobs: { id: string; title: string; status: string; created_at: string }[] | null;
      activity_invoices: { id: string; status: string; customer_name: string | null; paid_at: string | null; sent_at: string | null; created_at: string }[] | null;
      activity_quotes: { id: string; status: string; customer_name: string | null; created_at: string }[] | null;
      chart_rows: { paid_at: string; amount: string | number }[] | null;
      workload: { user_id: string; active_count: string | number }[] | null;
    };

    type TodaysJobRow = {
      id: string;
      title: string;
      status: string;
      scheduled_start: string | null;
      scheduled_end: string | null;
      address: string | null;
      assigned_user_ids: string[] | null;
      customer_id: string | null;
      customer_name: string | null;
      created_at: string;
      priority: string;
      is_recurring: boolean;
      recurring_frequency: string | null;
    };
    type JobWithCustomerRow = TodaysJobRow;
    type InvoiceWithCustomerRow = {
      id: string;
      status: string;
      customer_id: string | null;
      customer_name: string | null;
      due_date: string | null;
      paid_at: string | null;
      sent_at: string | null;
      created_at: string;
      paid_via_stripe: boolean | null;
    };

    const [aggRes, listsRes] = await Promise.all([
      db.execute(sql`
        WITH inv_data AS (
          SELECT
            inv.status, inv.paid_at, inv.sent_at, inv.created_at,
            inv.due_date, inv.paid_via_stripe,
            (COALESCE((SELECT SUM(qty::numeric * unit_price::numeric) FROM invoice_items ii WHERE ii.invoice_id = inv.id), 0)
              * (1 + COALESCE(inv.tax_rate::numeric, 0) / 100)
              - COALESCE(inv.discount::numeric, 0)) AS total
          FROM invoices inv WHERE inv.org_id = ${orgId} AND inv.deleted_at IS NULL
        ),
        quote_data AS (
          SELECT q.status,
            (COALESCE((SELECT SUM(qty::numeric * unit_price::numeric) FROM quote_items qi WHERE qi.quote_id = q.id), 0)
              * (1 + COALESCE(q.tax_rate::numeric, 0) / 100)
              - COALESCE(q.discount::numeric, 0)) AS total
          FROM quotes q WHERE q.org_id = ${orgId}
        )
        SELECT
          (SELECT COUNT(*)::int FROM customers WHERE org_id = ${orgId} AND deleted_at IS NULL) AS customer_count,
          (SELECT COALESCE(json_object_agg(status, c), '{}'::json) FROM (SELECT status, COUNT(*)::int AS c FROM jobs WHERE org_id = ${orgId} AND deleted_at IS NULL GROUP BY status) x) AS job_counts,
          (SELECT COUNT(*)::int FROM jobs WHERE org_id = ${orgId} AND deleted_at IS NULL) AS total_jobs,
          (SELECT COUNT(*)::int FROM jobs WHERE org_id = ${orgId} AND deleted_at IS NULL AND status IN ('lead','quoted','scheduled','in_progress')) AS active_jobs,
          (SELECT COUNT(*)::int FROM quote_data) AS quote_count,
          (SELECT COUNT(*)::int FROM quote_data WHERE status = 'sent') AS quotes_awaiting_count,
          COALESCE((SELECT SUM(total) FROM quote_data WHERE status = 'sent'), 0) AS quotes_awaiting_value,
          (SELECT COUNT(*)::int FROM inv_data) AS invoice_count,
          COALESCE((SELECT SUM(total) FROM inv_data WHERE status = 'paid'), 0) AS revenue,
          COALESCE((SELECT SUM(total) FROM inv_data WHERE status = 'sent'), 0) AS outstanding,
          COALESCE((SELECT SUM(total) FROM inv_data WHERE status = 'paid' AND paid_at >= ${thisMonthStart}), 0) AS revenue_this_month,
          COALESCE((SELECT SUM(total) FROM inv_data WHERE status = 'paid' AND paid_at >= ${lastMonthStart} AND paid_at < ${thisMonthStart}), 0) AS revenue_last_month,
          (SELECT COUNT(*)::int FROM inv_data WHERE status = 'sent' AND due_date IS NOT NULL AND due_date < ${now}) AS overdue_count,
          COALESCE((SELECT SUM(total) FROM inv_data WHERE status = 'sent' AND due_date IS NOT NULL AND due_date < ${now}), 0) AS overdue_amount,
          COALESCE((SELECT SUM(total) FROM inv_data WHERE status = 'paid' AND paid_via_stripe = true), 0) AS stripe_revenue,
          COALESCE((SELECT SUM(total) FROM inv_data WHERE status = 'paid' AND paid_via_stripe = true AND paid_at >= ${thisMonthStart}), 0) AS stripe_revenue_this_month,
          (SELECT COUNT(*)::int FROM inv_data WHERE status = 'paid' AND paid_via_stripe = true) AS stripe_paid_count,
          COALESCE((SELECT SUM(total) FROM inv_data WHERE status = 'paid' AND (paid_via_stripe = false OR paid_via_stripe IS NULL) AND paid_at >= ${thisMonthStart}), 0) AS manual_revenue_this_month,
          COALESCE((SELECT AVG(EXTRACT(EPOCH FROM (paid_at - COALESCE(sent_at, created_at))) / 86400) FROM inv_data WHERE status = 'paid' AND paid_at IS NOT NULL AND paid_at >= COALESCE(sent_at, created_at)), 0) AS avg_time_to_pay
      `),
      db.execute(sql`
        SELECT
          (SELECT COALESCE(json_agg(t), '[]'::json) FROM (
            SELECT m.user_id, COALESCE(u.full_name, m.user_id) AS user_name
            FROM memberships m LEFT JOIN users u ON u.id = m.user_id
            WHERE m.org_id = ${orgId}
          ) t) AS members,
          (SELECT COALESCE(json_agg(t), '[]'::json) FROM (
            SELECT j.id, j.title, j.status, j.scheduled_start, j.scheduled_end, c.address,
                   j.assigned_user_ids, j.customer_id, c.name AS customer_name, j.created_at,
                   j.priority, j.is_recurring, j.recurring_frequency
            FROM jobs j LEFT JOIN customers c ON c.id = j.customer_id
            WHERE j.org_id = ${orgId}
              AND j.deleted_at IS NULL
              AND j.scheduled_start >= ${todayStart}
              AND j.scheduled_start < ${todayEnd}
            ORDER BY j.created_at DESC
          ) t) AS todays_jobs,
          (SELECT COALESCE(json_agg(t), '[]'::json) FROM (
            SELECT j.id, j.title, j.status, j.scheduled_start, j.scheduled_end, c.address,
                   j.assigned_user_ids, j.customer_id, c.name AS customer_name, j.created_at,
                   j.priority, j.is_recurring, j.recurring_frequency
            FROM jobs j LEFT JOIN customers c ON c.id = j.customer_id
            WHERE j.org_id = ${orgId} AND j.deleted_at IS NULL
            ORDER BY j.created_at DESC LIMIT 5
          ) t) AS recent_jobs,
          (SELECT COALESCE(json_agg(t), '[]'::json) FROM (
            SELECT inv.id, inv.status, inv.customer_id, c.name AS customer_name,
                   inv.due_date, inv.paid_at, inv.sent_at, inv.created_at, inv.paid_via_stripe
            FROM invoices inv LEFT JOIN customers c ON c.id = inv.customer_id
            WHERE inv.org_id = ${orgId} AND inv.deleted_at IS NULL
            ORDER BY inv.created_at DESC LIMIT 5
          ) t) AS recent_invoices,
          (SELECT COALESCE(json_agg(t), '[]'::json) FROM (
            SELECT id, title, status, created_at FROM jobs
            WHERE org_id = ${orgId} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 10
          ) t) AS activity_jobs,
          (SELECT COALESCE(json_agg(t), '[]'::json) FROM (
            SELECT inv.id, inv.status, c.name AS customer_name, inv.paid_at, inv.sent_at, inv.created_at
            FROM invoices inv LEFT JOIN customers c ON c.id = inv.customer_id
            WHERE inv.org_id = ${orgId} AND inv.deleted_at IS NULL AND inv.status IN ('paid','sent')
            ORDER BY inv.created_at DESC LIMIT 5
          ) t) AS activity_invoices,
          (SELECT COALESCE(json_agg(t), '[]'::json) FROM (
            SELECT q.id, q.status, c.name AS customer_name, q.created_at
            FROM quotes q LEFT JOIN customers c ON c.id = q.customer_id
            WHERE q.org_id = ${orgId} AND q.status IN ('accepted','sent','declined')
            ORDER BY q.created_at DESC LIMIT 5
          ) t) AS activity_quotes,
          (SELECT COALESCE(json_agg(t), '[]'::json) FROM (
            SELECT inv.paid_at,
              (COALESCE((SELECT SUM(qty::numeric * unit_price::numeric) FROM invoice_items ii WHERE ii.invoice_id = inv.id), 0)
                * (1 + COALESCE(inv.tax_rate::numeric, 0) / 100)
                - COALESCE(inv.discount::numeric, 0)) AS amount
            FROM invoices inv
            WHERE inv.org_id = ${orgId} AND inv.deleted_at IS NULL AND inv.status = 'paid' AND inv.paid_at >= ${thirtyDaysAgo}
          ) t) AS chart_rows,
          (SELECT COALESCE(json_agg(t), '[]'::json) FROM (
            SELECT uid AS user_id, COUNT(DISTINCT j.id)::int AS active_count
            FROM jobs j, UNNEST(COALESCE(j.assigned_user_ids, ARRAY[]::varchar[])) AS uid
            WHERE j.org_id = ${orgId}
              AND j.deleted_at IS NULL
              AND j.status IN ('scheduled','in_progress','lead','quoted')
            GROUP BY uid
          ) t) AS workload
      `),
    ]);

    const a = aggRes.rows[0] as DashboardAggRow;
    const l = listsRes.rows[0] as DashboardListsRow;

    const customerCount = Number(a.customer_count || 0);
    const totalJobs = Number(a.total_jobs || 0);
    const activeJobs = Number(a.active_jobs || 0);
    const jobCounts: Record<string, number> = {
      lead: 0, quoted: 0, scheduled: 0, in_progress: 0,
      done: 0, invoiced: 0, paid: 0, canceled: 0,
    };
    if (a.job_counts) {
      for (const [status, c] of Object.entries(a.job_counts)) {
        jobCounts[status] = Number(c);
      }
    }
    const quoteCount = Number(a.quote_count || 0);
    const quotesAwaitingCount = Number(a.quotes_awaiting_count || 0);
    const quotesAwaitingValue = Number(a.quotes_awaiting_value || 0);
    const invoiceCount = Number(a.invoice_count || 0);
    const revenue = Number(a.revenue || 0);
    const outstanding = Number(a.outstanding || 0);
    const revenueThisMonth = Number(a.revenue_this_month || 0);
    const revenueLastMonth = Number(a.revenue_last_month || 0);
    const overdueCount = Number(a.overdue_count || 0);
    const overdueAmount = Number(a.overdue_amount || 0);
    const stripeRevenue = Number(a.stripe_revenue || 0);
    const stripeRevenueThisMonth = Number(a.stripe_revenue_this_month || 0);
    const stripePaidCount = Number(a.stripe_paid_count || 0);
    const manualRevenueThisMonth = Number(a.manual_revenue_this_month || 0);
    const avgTimeToPay = Math.round(Number(a.avg_time_to_pay || 0));

    const members = l.members ?? [];
    const userNameMap: Record<string, string> = {};
    for (const m of members) userNameMap[m.user_id] = m.user_name;

    const mapJob = (j: JobWithCustomerRow) => ({
      id: j.id,
      title: j.title,
      status: j.status,
      scheduledStart: j.scheduled_start ? new Date(j.scheduled_start) : null,
      scheduledEnd: j.scheduled_end ? new Date(j.scheduled_end) : null,
      address: j.address,
      assignedUserIds: j.assigned_user_ids ?? [],
      customerId: j.customer_id,
      customerName: j.customer_name ?? undefined,
      createdAt: new Date(j.created_at),
      priority: j.priority,
      isRecurring: j.is_recurring,
      recurringFrequency: j.recurring_frequency,
    });

    const todaysJobs = (l.todays_jobs ?? []).map((j) => ({
      ...mapJob(j),
      assignedUserNames: (j.assigned_user_ids ?? []).map((uid) => userNameMap[uid] || uid).filter(Boolean),
    }));
    const recentJobs = (l.recent_jobs ?? []).map(mapJob);
    const recentInvoices = (l.recent_invoices ?? []).map((inv) => ({
      id: inv.id,
      status: inv.status,
      customerId: inv.customer_id,
      customerName: inv.customer_name ?? undefined,
      dueDate: inv.due_date ? new Date(inv.due_date) : null,
      paidAt: inv.paid_at ? new Date(inv.paid_at) : null,
      sentAt: inv.sent_at ? new Date(inv.sent_at) : null,
      createdAt: new Date(inv.created_at),
      paidViaStripe: inv.paid_via_stripe,
    }));

    const chartMap: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      chartMap[key] = 0;
    }
    for (const row of l.chart_rows ?? []) {
      const paidAt = new Date(row.paid_at);
      const key = `${paidAt.getFullYear()}-${String(paidAt.getMonth() + 1).padStart(2, "0")}-${String(paidAt.getDate()).padStart(2, "0")}`;
      if (key in chartMap) chartMap[key] += Number(row.amount || 0);
    }
    const revenueChartData = Object.entries(chartMap)
      .map(([date, amount]) => ({ date, amount }))
      .sort((x, y) => x.date.localeCompare(y.date));

    const activityFeed: { type: string; id: string; label: string; link: string; time: Date }[] = [];
    for (const j of l.activity_jobs ?? []) {
      activityFeed.push({
        type: "job",
        id: j.id,
        label: `Job "${j.title}" is ${j.status.replace("_", " ")}`,
        link: `/jobs/${j.id}`,
        time: new Date(j.created_at),
      });
    }
    for (const inv of l.activity_invoices ?? []) {
      const customer = inv.customer_name ?? "Unknown";
      const label = inv.status === "paid" ? `Invoice paid by ${customer}` : `Invoice sent to ${customer}`;
      const time = inv.status === "paid" && inv.paid_at
        ? new Date(inv.paid_at)
        : inv.sent_at ? new Date(inv.sent_at) : new Date(inv.created_at);
      activityFeed.push({ type: "invoice", id: inv.id, label, link: `/invoices/${inv.id}`, time });
    }
    for (const q of l.activity_quotes ?? []) {
      const customer = q.customer_name ?? "Unknown";
      const verb = q.status === "accepted" ? "accepted" : q.status === "declined" ? "declined" : "sent";
      activityFeed.push({
        type: "quote", id: q.id, label: `Quote ${verb} for ${customer}`,
        link: `/quotes/${q.id}`, time: new Date(q.created_at),
      });
    }
    activityFeed.sort((x, y) => y.time.getTime() - x.time.getTime());

    const workloadMap: Record<string, number> = {};
    for (const row of l.workload ?? []) {
      workloadMap[row.user_id] = Number(row.active_count || 0);
    }
    const memberWorkload: { userId: string; userName: string; activeJobCount: number }[] = [];
    if (members.length > 1) {
      for (const m of members) {
        memberWorkload.push({
          userId: m.user_id,
          userName: m.user_name,
          activeJobCount: workloadMap[m.user_id] || 0,
        });
      }
    }

    const isEmpty = totalJobs === 0 && customerCount === 0 && invoiceCount === 0;

    return {
      customerCount,
      jobCounts,
      totalJobs,
      activeJobs,
      quoteCount,
      invoiceCount,
      revenue,
      outstanding,
      revenueThisMonth,
      revenueLastMonth,
      overdueCount,
      overdueAmount,
      stripeRevenue,
      stripeRevenueThisMonth,
      stripePaidCount,
      manualRevenueThisMonth,
      avgTimeToPay,
      quotesAwaitingCount,
      quotesAwaitingValue,
      todaysJobs,
      revenueChartData,
      activityFeed: activityFeed.slice(0, 15),
      memberWorkload,
      recentJobs,
      recentInvoices,
      isEmpty,
    };
  },
};
