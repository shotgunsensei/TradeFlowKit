import { Router, type Request, type Response } from "express";
import { eq, and, or, ilike, desc } from "drizzle-orm";
import { db } from "../db";
import { customers, jobs, quotes, invoices } from "@shared/schema";
import { requireAuth, requireOrg } from "../middleware";

const router = Router();

const LIMIT_PER_TYPE = 5;

router.get("/api/search", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    if (!q) {
      return res.json({ customers: [], jobs: [], quotes: [], invoices: [] });
    }

    const like = `%${q}%`;
    const prefix = `${q}%`;

    const [custRows, jobRows, quoteRows, invoiceRows] = await Promise.all([
      db
        .select({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email })
        .from(customers)
        .where(
          and(
            eq(customers.orgId, orgId),
            or(
              ilike(customers.name, like),
              ilike(customers.phone, like),
              ilike(customers.email, like),
            ),
          ),
        )
        .orderBy(desc(customers.createdAt))
        .limit(LIMIT_PER_TYPE),

      db
        .select({
          id: jobs.id,
          title: jobs.title,
          status: jobs.status,
          customerId: jobs.customerId,
          customerName: customers.name,
        })
        .from(jobs)
        .leftJoin(customers, eq(customers.id, jobs.customerId))
        .where(
          and(
            eq(jobs.orgId, orgId),
            or(
              ilike(jobs.title, like),
              ilike(customers.name, like),
            ),
          ),
        )
        .orderBy(desc(jobs.createdAt))
        .limit(LIMIT_PER_TYPE),

      db
        .select({
          id: quotes.id,
          status: quotes.status,
          customerId: quotes.customerId,
          customerName: customers.name,
        })
        .from(quotes)
        .leftJoin(customers, eq(customers.id, quotes.customerId))
        .where(
          and(
            eq(quotes.orgId, orgId),
            or(
              ilike(quotes.id, prefix),
              ilike(customers.name, like),
            ),
          ),
        )
        .orderBy(desc(quotes.createdAt))
        .limit(LIMIT_PER_TYPE),

      db
        .select({
          id: invoices.id,
          status: invoices.status,
          customerId: invoices.customerId,
          customerName: customers.name,
        })
        .from(invoices)
        .leftJoin(customers, eq(customers.id, invoices.customerId))
        .where(
          and(
            eq(invoices.orgId, orgId),
            or(
              ilike(invoices.id, prefix),
              ilike(customers.name, like),
            ),
          ),
        )
        .orderBy(desc(invoices.createdAt))
        .limit(LIMIT_PER_TYPE),
    ]);

    res.json({
      customers: custRows,
      jobs: jobRows,
      quotes: quoteRows,
      invoices: invoiceRows,
    });
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

export default router;
