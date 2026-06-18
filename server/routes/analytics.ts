import { errMsg } from "../errors";
import { Router, type Request, type Response } from "express";
import { requireAuth, requireOrg, requireFeature } from "../middleware";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = Router();

type QuotesAnalyticsRow = {
  total: string | number;
  accepted: string | number;
  sent: string | number;
  draft: string | number;
  declined: string | number;
  total_30d: string | number;
  accepted_30d: string | number;
  sent_or_accepted_30d: string | number;
  avg_value: string | number;
  by_status: { status: string; count: string | number; total_value: string | number }[] | null;
  weekly: { week: string; count: string | number; accepted: string | number }[] | null;
};

type InvoicesAnalyticsRow = {
  total: string | number;
  paid_count: string | number;
  collected: string | number;
  total_value: string | number;
  overdue_value: string | number;
  avg_days_to_payment: string | number;
  avg_days_sent_to_paid: string | number;
  stripe_collected: string | number;
  stripe_paid_count: string | number;
  stripe_collected_this_month: string | number;
  avg_days_to_payment_stripe: string | number;
  avg_days_to_payment_manual: string | number;
  weekly: { week: string; revenue: string | number; stripe_revenue: string | number; manual_revenue: string | number }[] | null;
  aging: { bucket: string; count: string | number; value: string | number }[] | null;
};

type JobsAnalyticsRow = {
  by_status: { status: string; count: string | number }[] | null;
  weekly: { week: string; created: string | number; completed: string | number }[] | null;
  by_priority: { priority: string; count: string | number }[] | null;
  busiest_days: { day_name: string; day_num: string | number; count: string | number }[] | null;
  completed_total: string | number;
  total: string | number;
};

type CustomersAnalyticsRow = {
  total: string | number;
  repeat_customers: string | number;
  total_with_jobs: string | number;
  monthly: { month: string; count: string | number }[] | null;
  top_by_value: { id: string; name: string; job_count: string | number; lifetime_value: string | number }[] | null;
};

router.get("/api/analytics/quotes", requireAuth, requireOrg, requireFeature("analytics"), async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await db.execute(sql`
      WITH quote_data AS (
        SELECT q.id, q.status, q.created_at,
          (COALESCE((SELECT SUM(qty::numeric * unit_price::numeric) FROM quote_items qi WHERE qi.quote_id = q.id), 0)
            * (1 + COALESCE(q.tax_rate::numeric, 0) / 100)
            - COALESCE(q.discount::numeric, 0)) AS total
        FROM quotes q
        WHERE q.org_id = ${orgId}
      )
      SELECT
        (SELECT COUNT(*)::int FROM quote_data) AS total,
        (SELECT COUNT(*)::int FROM quote_data WHERE status = 'accepted') AS accepted,
        (SELECT COUNT(*)::int FROM quote_data WHERE status = 'sent') AS sent,
        (SELECT COUNT(*)::int FROM quote_data WHERE status = 'draft') AS draft,
        (SELECT COUNT(*)::int FROM quote_data WHERE status = 'declined') AS declined,
        (SELECT COUNT(*)::int FROM quote_data WHERE created_at >= ${thirtyDaysAgo}) AS total_30d,
        (SELECT COUNT(*)::int FROM quote_data WHERE status = 'accepted' AND created_at >= ${thirtyDaysAgo}) AS accepted_30d,
        (SELECT COUNT(*)::int FROM quote_data WHERE status IN ('accepted','sent') AND created_at >= ${thirtyDaysAgo}) AS sent_or_accepted_30d,
        COALESCE((SELECT AVG(total) FROM quote_data WHERE status != 'draft'), 0) AS avg_value,
        (SELECT COALESCE(json_agg(t), '[]'::json) FROM (
          SELECT status, COUNT(*)::int AS count, COALESCE(SUM(total), 0) AS total_value
          FROM quote_data GROUP BY status
        ) t) AS by_status,
        (SELECT COALESCE(json_agg(t ORDER BY t.week ASC), '[]'::json) FROM (
          SELECT DATE_TRUNC('week', created_at) AS week,
                 COUNT(*)::int AS count,
                 COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted
          FROM quote_data
          WHERE created_at >= NOW() - INTERVAL '12 weeks'
          GROUP BY DATE_TRUNC('week', created_at)
        ) t) AS weekly
    `);

    const r = result.rows[0] as QuotesAnalyticsRow;
    const total = Number(r.total || 0);
    const accepted = Number(r.accepted || 0);
    const sent = Number(r.sent || 0);
    const accepted30d = Number(r.accepted_30d || 0);
    const sentOrAccepted30d = Number(r.sent_or_accepted_30d || 0);

    res.json({
      total,
      accepted,
      sent,
      draft: Number(r.draft || 0),
      declined: Number(r.declined || 0),
      avgValue: Number(Number(r.avg_value || 0).toFixed(2)),
      acceptanceRate: sent + accepted > 0 ? Math.round((accepted / (accepted + sent)) * 100) : 0,
      acceptanceRate30d: sentOrAccepted30d > 0 ? Math.round((accepted30d / sentOrAccepted30d) * 100) : 0,
      total30d: Number(r.total_30d || 0),
      byStatus: (r.by_status ?? []).map((s) => ({
        status: s.status,
        count: Number(s.count),
        totalValue: Number(Number(s.total_value).toFixed(2)),
      })),
      weekly: (r.weekly ?? []).map((w) => ({
        week: w.week,
        count: Number(w.count),
        accepted: Number(w.accepted),
      })),
    });
  } catch (err) {
    res.status(500).send(err instanceof Error ? err.message : String(err));
  }
});

router.get("/api/analytics/invoices", requireAuth, requireOrg, requireFeature("analytics"), async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;

    const result = await db.execute(sql`
      WITH inv_data AS (
        SELECT inv.id, inv.status, inv.due_date, inv.paid_at, inv.sent_at, inv.created_at,
          inv.paid_via_stripe,
          (COALESCE((SELECT SUM(qty::numeric * unit_price::numeric) FROM invoice_items ii WHERE ii.invoice_id = inv.id), 0)
            * (1 + COALESCE(inv.tax_rate::numeric, 0) / 100)
            - COALESCE(inv.discount::numeric, 0)) AS total
        FROM invoices inv
        WHERE inv.org_id = ${orgId}
      )
      SELECT
        (SELECT COUNT(*)::int FROM inv_data) AS total,
        (SELECT COUNT(*)::int FROM inv_data WHERE status = 'paid') AS paid_count,
        COALESCE((SELECT SUM(total) FROM inv_data WHERE status = 'paid'), 0) AS collected,
        COALESCE((SELECT SUM(total) FROM inv_data), 0) AS total_value,
        COALESCE((SELECT SUM(total) FROM inv_data WHERE status = 'sent' AND due_date < NOW()), 0) AS overdue_value,
        COALESCE((SELECT AVG(EXTRACT(EPOCH FROM (paid_at - created_at)) / 86400) FROM inv_data WHERE status = 'paid' AND paid_at IS NOT NULL), 0) AS avg_days_to_payment,
        COALESCE((SELECT AVG(EXTRACT(EPOCH FROM (paid_at - COALESCE(sent_at, created_at))) / 86400) FROM inv_data WHERE status = 'paid' AND paid_at IS NOT NULL AND paid_at >= COALESCE(sent_at, created_at)), 0) AS avg_days_sent_to_paid,
        COALESCE((SELECT SUM(total) FROM inv_data WHERE status = 'paid' AND paid_via_stripe = true), 0) AS stripe_collected,
        (SELECT COUNT(*)::int FROM inv_data WHERE status = 'paid' AND paid_via_stripe = true) AS stripe_paid_count,
        COALESCE((SELECT SUM(total) FROM inv_data WHERE status = 'paid' AND paid_via_stripe = true AND paid_at >= DATE_TRUNC('month', NOW())), 0) AS stripe_collected_this_month,
        COALESCE((SELECT AVG(EXTRACT(EPOCH FROM (paid_at - COALESCE(sent_at, created_at))) / 86400) FROM inv_data WHERE status = 'paid' AND paid_at IS NOT NULL AND paid_via_stripe = true AND paid_at >= COALESCE(sent_at, created_at)), 0) AS avg_days_to_payment_stripe,
        COALESCE((SELECT AVG(EXTRACT(EPOCH FROM (paid_at - COALESCE(sent_at, created_at))) / 86400) FROM inv_data WHERE status = 'paid' AND paid_at IS NOT NULL AND (paid_via_stripe = false OR paid_via_stripe IS NULL) AND paid_at >= COALESCE(sent_at, created_at)), 0) AS avg_days_to_payment_manual,
        (SELECT COALESCE(json_agg(t ORDER BY t.week ASC), '[]'::json) FROM (
          SELECT DATE_TRUNC('week', paid_at) AS week,
                 COALESCE(SUM(total), 0) AS revenue,
                 COALESCE(SUM(total) FILTER (WHERE paid_via_stripe = true), 0) AS stripe_revenue,
                 COALESCE(SUM(total) FILTER (WHERE paid_via_stripe = false OR paid_via_stripe IS NULL), 0) AS manual_revenue
          FROM inv_data
          WHERE status = 'paid' AND paid_at >= NOW() - INTERVAL '12 weeks'
          GROUP BY DATE_TRUNC('week', paid_at)
        ) t) AS weekly,
        (SELECT COALESCE(json_agg(t), '[]'::json) FROM (
          SELECT
            CASE
              WHEN due_date IS NULL THEN 'no_due_date'
              WHEN due_date >= NOW() THEN 'current'
              WHEN NOW() - due_date <= INTERVAL '30 days' THEN '1_30'
              WHEN NOW() - due_date <= INTERVAL '60 days' THEN '31_60'
              WHEN NOW() - due_date <= INTERVAL '90 days' THEN '61_90'
              ELSE 'over_90'
            END AS bucket,
            COUNT(*)::int AS count,
            COALESCE(SUM(total), 0) AS value
          FROM inv_data
          WHERE status = 'sent'
          GROUP BY 1
        ) t) AS aging
    `);

    const r = result.rows[0] as InvoicesAnalyticsRow;
    const totalValue = Number(r.total_value || 0);
    const collected = Number(r.collected || 0);

    res.json({
      total: Number(r.total || 0),
      paidCount: Number(r.paid_count || 0),
      collected: Number(collected.toFixed(2)),
      totalValue: Number(totalValue.toFixed(2)),
      overdueValue: Number(Number(r.overdue_value || 0).toFixed(2)),
      collectionRate: totalValue > 0 ? Math.round((collected / totalValue) * 100) : 0,
      avgDaysToPayment: Math.round(Number(r.avg_days_to_payment || 0)),
      avgDaysSentToPaid: Math.round(Number(r.avg_days_sent_to_paid || 0)),
      stripeCollected: Number(Number(r.stripe_collected || 0).toFixed(2)),
      stripePaidCount: Number(r.stripe_paid_count || 0),
      stripeCollectedThisMonth: Number(Number(r.stripe_collected_this_month || 0).toFixed(2)),
      avgDaysToPaymentStripe: Math.round(Number(r.avg_days_to_payment_stripe || 0)),
      avgDaysToPaymentManual: Math.round(Number(r.avg_days_to_payment_manual || 0)),
      weekly: (r.weekly ?? []).map((w) => ({
        week: w.week,
        revenue: Number(Number(w.revenue).toFixed(2)),
        stripeRevenue: Number(Number(w.stripe_revenue).toFixed(2)),
        manualRevenue: Number(Number(w.manual_revenue).toFixed(2)),
      })),
      aging: (r.aging ?? []).map((row) => ({
        bucket: row.bucket,
        count: Number(row.count),
        value: Number(Number(row.value).toFixed(2)),
      })),
    });
  } catch (err) {
    res.status(500).send(err instanceof Error ? err.message : String(err));
  }
});

router.get("/api/analytics/jobs", requireAuth, requireOrg, requireFeature("analytics"), async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;

    const result = await db.execute(sql`
      SELECT
        (SELECT COALESCE(json_agg(t), '[]'::json) FROM (
          SELECT status, COUNT(*)::int AS count FROM jobs WHERE org_id = ${orgId} GROUP BY status
        ) t) AS by_status,
        (SELECT COALESCE(json_agg(t ORDER BY t.week ASC), '[]'::json) FROM (
          SELECT DATE_TRUNC('week', created_at) AS week,
                 COUNT(*)::int AS created,
                 COUNT(*) FILTER (WHERE status IN ('done','invoiced','paid'))::int AS completed
          FROM jobs
          WHERE org_id = ${orgId} AND created_at >= NOW() - INTERVAL '12 weeks'
          GROUP BY DATE_TRUNC('week', created_at)
        ) t) AS weekly,
        (SELECT COALESCE(json_agg(t), '[]'::json) FROM (
          SELECT priority, COUNT(*)::int AS count FROM jobs WHERE org_id = ${orgId} GROUP BY priority
        ) t) AS by_priority,
        (SELECT COALESCE(json_agg(t ORDER BY t.day_num ASC), '[]'::json) FROM (
          SELECT TO_CHAR(created_at, 'Day') AS day_name,
                 EXTRACT(DOW FROM created_at)::int AS day_num,
                 COUNT(*)::int AS count
          FROM jobs WHERE org_id = ${orgId}
          GROUP BY day_name, day_num
        ) t) AS busiest_days,
        (SELECT COUNT(*) FILTER (WHERE status IN ('done','invoiced','paid'))::int FROM jobs WHERE org_id = ${orgId}) AS completed_total,
        (SELECT COUNT(*)::int FROM jobs WHERE org_id = ${orgId}) AS total
    `);

    const r = result.rows[0] as JobsAnalyticsRow;
    const totalJobs = Number(r.total || 0);
    const completed = Number(r.completed_total || 0);
    const completionRate = totalJobs > 0 ? Math.round((completed / totalJobs) * 100) : 0;

    res.json({
      byStatus: (r.by_status ?? []).map((row) => ({
        status: row.status,
        count: Number(row.count),
      })),
      weekly: (r.weekly ?? []).map((row) => ({
        week: row.week,
        created: Number(row.created),
        completed: Number(row.completed),
      })),
      byPriority: (r.by_priority ?? []).map((row) => ({
        priority: row.priority,
        count: Number(row.count),
      })),
      completionRate,
      busiestDays: (r.busiest_days ?? []).map((row) => ({
        day: row.day_name?.trim(),
        count: Number(row.count),
      })),
    });
  } catch (err) {
    res.status(500).send(err instanceof Error ? err.message : String(err));
  }
});

router.get("/api/analytics/customers", requireAuth, requireOrg, requireFeature("analytics"), async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;

    const result = await db.execute(sql`
      WITH cust_jobs AS (
        SELECT c.id, COUNT(j.id)::int AS job_count
        FROM customers c
        LEFT JOIN jobs j ON j.customer_id = c.id AND j.org_id = ${orgId}
        WHERE c.org_id = ${orgId}
        GROUP BY c.id
      )
      SELECT
        (SELECT COUNT(*)::int FROM customers WHERE org_id = ${orgId}) AS total,
        (SELECT COUNT(*)::int FROM cust_jobs WHERE job_count > 1) AS repeat_customers,
        (SELECT COUNT(*)::int FROM cust_jobs WHERE job_count > 0) AS total_with_jobs,
        (SELECT COALESCE(json_agg(t ORDER BY t.month ASC), '[]'::json) FROM (
          SELECT DATE_TRUNC('month', created_at) AS month, COUNT(*)::int AS count
          FROM customers
          WHERE org_id = ${orgId} AND created_at >= NOW() - INTERVAL '12 months'
          GROUP BY DATE_TRUNC('month', created_at)
        ) t) AS monthly,
        (SELECT COALESCE(json_agg(t ORDER BY t.lifetime_value DESC), '[]'::json) FROM (
          SELECT c.id, c.name,
                 COUNT(DISTINCT j.id)::int AS job_count,
                 COALESCE(SUM(
                   COALESCE((SELECT SUM(qty::numeric * unit_price::numeric) FROM invoice_items ii WHERE ii.invoice_id = inv.id), 0)
                   * (1 + COALESCE(inv.tax_rate::numeric, 0) / 100)
                   - COALESCE(inv.discount::numeric, 0)
                 ) FILTER (WHERE inv.status = 'paid'), 0) AS lifetime_value
          FROM customers c
          LEFT JOIN jobs j ON j.customer_id = c.id AND j.org_id = ${orgId}
          LEFT JOIN invoices inv ON inv.customer_id = c.id AND inv.org_id = ${orgId}
          WHERE c.org_id = ${orgId}
          GROUP BY c.id, c.name
          ORDER BY lifetime_value DESC
          LIMIT 10
        ) t) AS top_by_value
    `);

    const r = result.rows[0] as CustomersAnalyticsRow;
    const repeatCustomers = Number(r.repeat_customers || 0);
    const totalWithJobs = Number(r.total_with_jobs || 0);
    const repeatRatio = totalWithJobs > 0 ? Math.round((repeatCustomers / totalWithJobs) * 100) : 0;

    res.json({
      total: Number(r.total || 0),
      repeatCustomers,
      oneTimeCustomers: totalWithJobs - repeatCustomers,
      repeatRatio,
      monthly: (r.monthly ?? []).map((row) => ({
        month: row.month,
        count: Number(row.count),
      })),
      topByValue: (r.top_by_value ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        jobCount: Number(row.job_count),
        lifetimeValue: Number(Number(row.lifetime_value).toFixed(2)),
      })),
    });
  } catch (err) {
    res.status(500).send(err instanceof Error ? err.message : String(err));
  }
});

export default router;
