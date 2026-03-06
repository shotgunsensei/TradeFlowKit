import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
import { pool } from "./db";
import connectPgSimple from "connect-pg-simple";
import crypto from "crypto";
import { PLAN_LIMITS } from "@shared/schema";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { db } from "./db";
import { sql } from "drizzle-orm";

const PgSession = connectPgSimple(session);

declare module "express-session" {
  interface SessionData {
    userId?: string;
    orgId?: string;
  }
}

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).send("Unauthorized");
  }
  next();
}

function requireOrg(req: Request, res: Response, next: NextFunction) {
  if (!req.session.orgId) {
    return res.status(400).send("No organization selected");
  }
  next();
}

async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).send("Unauthorized");
  }
  const user = await storage.getUser(req.session.userId);
  if (!user?.isSuperAdmin) {
    return res.status(403).send("Forbidden: Super admin access required");
  }
  next();
}

async function checkPlanLimit(orgId: string, resource: "customers" | "jobs" | "quotes" | "invoices"): Promise<{ allowed: boolean; limit: number; current: number }> {
  const org = await storage.getOrg(orgId);
  if (!org) return { allowed: false, limit: 0, current: 0 };

  const limits = PLAN_LIMITS[org.plan] || PLAN_LIMITS.free;
  const maxAllowed = limits[resource];

  if (maxAllowed === -1) return { allowed: true, limit: -1, current: 0 };

  const counts = await storage.getOrgCounts(orgId);
  const current = counts[resource];

  return { allowed: current < maxAllowed, limit: maxAllowed, current };
}

async function checkTeamLimit(orgId: string): Promise<{ allowed: boolean; limit: number; current: number; canInvite: boolean }> {
  const org = await storage.getOrg(orgId);
  if (!org) return { allowed: false, limit: 0, current: 0, canInvite: false };

  const limits = PLAN_LIMITS[org.plan] || PLAN_LIMITS.free;

  if (!limits.canInvite) return { allowed: false, limit: limits.teamMembers, current: 0, canInvite: false };

  if (limits.teamMembers === -1) return { allowed: true, limit: -1, current: 0, canInvite: true };

  const counts = await storage.getOrgCounts(orgId);
  return { allowed: counts.members < limits.teamMembers, limit: limits.teamMembers, current: counts.members, canInvite: true };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use(
    session({
      store: new PgSession({
        pool: pool as any,
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "tradeflow-dev-secret-change-me",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: false,
        sameSite: "lax",
      },
    })
  );

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { username, password, fullName } = req.body;
      if (!username || !password) {
        return res.status(400).send("Username and password required");
      }
      if (password.length < 6) {
        return res.status(400).send("Password must be at least 6 characters");
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).send("Username already taken");
      }

      const user = await storage.createUser({
        username,
        password: hashPassword(password),
        fullName: fullName || username,
        phone: "",
        email: "",
      });

      req.session.userId = user.id;
      res.json({ user: { ...user, password: undefined } });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username);
      if (!user || user.password !== hashPassword(password)) {
        return res.status(401).send("Invalid credentials");
      }

      req.session.userId = user.id;

      const userOrgs = await storage.getUserOrgs(user.id);
      if (userOrgs.length > 0) {
        req.session.orgId = userOrgs[0].id;
      }

      res.json({ user: { ...user, password: undefined } });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  app.delete("/api/auth/delete-account", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      await storage.deleteUser(userId);
      req.session.destroy(() => {
        res.json({ ok: true });
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to delete account" });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).send("User not found");

      const userOrgs = await storage.getUserOrgs(user.id);

      let org = null;
      let membership = null;

      if (req.session.orgId) {
        org = await storage.getOrg(req.session.orgId);
        membership = await storage.getMembership(req.session.orgId, user.id);
      }

      if (!org && userOrgs.length > 0) {
        org = userOrgs[0];
        req.session.orgId = org.id;
        membership = await storage.getMembership(org.id, user.id);
      }

      let planLimits = null;
      let orgCounts = null;
      if (org) {
        planLimits = PLAN_LIMITS[org.plan] || PLAN_LIMITS.free;
        orgCounts = await storage.getOrgCounts(org.id);
      }

      res.json({
        user: { ...user, password: undefined },
        org,
        membership,
        orgs: userOrgs,
        planLimits,
        orgCounts,
      });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/auth/switch-org", requireAuth, async (req: Request, res: Response) => {
    try {
      const { orgId } = req.body;
      const membership = await storage.getMembership(orgId, req.session.userId!);
      if (!membership) return res.status(403).send("Not a member of this organization");
      req.session.orgId = orgId;
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.patch("/api/auth/profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const { fullName, phone, email } = req.body;
      const user = await storage.updateUser(req.session.userId!, { fullName, phone, email });
      res.json({ ...user, password: undefined });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/orgs", requireAuth, async (req: Request, res: Response) => {
    try {
      const { name, slug, phone, email, address } = req.body;
      if (!name) return res.status(400).send("Organization name required");

      const org = await storage.createOrg({
        name,
        slug: slug || name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        phone: phone || "",
        email: email || "",
        address: address || "",
      });

      await storage.createMembership(org.id, req.session.userId!, "owner");
      req.session.orgId = org.id;
      res.json(org);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.patch("/api/orgs/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      if (req.params.id !== req.session.orgId) {
        return res.status(403).send("Cannot edit another organization");
      }
      const { plan, stripeCustomerId, stripeSubscriptionId, subscriptionStatus, currentPeriodEnd, ...safeData } = req.body;
      const org = await storage.updateOrg(req.params.id as string, safeData);
      res.json(org);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/orgs/join", requireAuth, async (req: Request, res: Response) => {
    try {
      const { code } = req.body;
      const invite = await storage.getInviteCodeByCode(code);
      if (!invite) return res.status(400).send("Invalid invite code");

      const existing = await storage.getMembership(invite.orgId, req.session.userId!);
      if (existing) return res.status(400).send("Already a member");

      const teamCheck = await checkTeamLimit(invite.orgId);
      if (!teamCheck.canInvite) {
        return res.status(403).send("This organization's plan does not allow team invitations. Upgrade to Small Business or Enterprise plan.");
      }
      if (!teamCheck.allowed) {
        return res.status(403).send(`Team member limit reached (${teamCheck.limit}). Upgrade your plan to add more members.`);
      }

      await storage.createMembership(invite.orgId, req.session.userId!, invite.role);
      req.session.orgId = invite.orgId;
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/invite-codes", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const codes = await storage.getOrgInviteCodes(req.session.orgId!);
      res.json(codes);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/invite-codes", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const teamCheck = await checkTeamLimit(req.session.orgId!);
      if (!teamCheck.canInvite) {
        return res.status(403).send("Your plan does not allow team invitations. Upgrade to Small Business or Enterprise plan.");
      }

      const { role } = req.body;
      const code = await storage.createInviteCode(
        req.session.orgId!,
        role || "tech",
        req.session.userId!
      );
      res.json(code);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/plan-info", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const org = await storage.getOrg(req.session.orgId!);
      if (!org) return res.status(404).send("Organization not found");
      const limits = PLAN_LIMITS[org.plan] || PLAN_LIMITS.free;
      const counts = await storage.getOrgCounts(org.id);
      res.json({ plan: org.plan, limits, counts, subscriptionStatus: org.subscriptionStatus });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // Stripe subscription routes
  app.get("/api/stripe/publishable-key", requireAuth, async (_req: Request, res: Response) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/stripe/plans", requireAuth, async (_req: Request, res: Response) => {
    try {
      const result = await db.execute(sql`
        SELECT
          p.id as product_id,
          p.name as product_name,
          p.description as product_description,
          p.metadata as product_metadata,
          pr.id as price_id,
          pr.unit_amount,
          pr.currency,
          pr.recurring
        FROM stripe.products p
        JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.active = true
        ORDER BY pr.unit_amount ASC
      `);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/stripe/create-checkout", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const { priceId, plan } = req.body;
      if (!priceId || !plan) return res.status(400).send("Price ID and plan required");

      const org = await storage.getOrg(req.session.orgId!);
      if (!org) return res.status(404).send("Organization not found");

      const stripe = await getUncachableStripeClient();

      let customerId = org.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          name: org.name,
          metadata: { orgId: org.id },
        });
        customerId = customer.id;
        await storage.updateOrg(org.id, { stripeCustomerId: customerId });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        success_url: `${baseUrl}/subscription?subscription=success`,
        cancel_url: `${baseUrl}/subscription?subscription=cancelled`,
        metadata: { orgId: org.id, plan },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/stripe/create-portal", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const org = await storage.getOrg(req.session.orgId!);
      if (!org?.stripeCustomerId) return res.status(400).send("No subscription found");

      const stripe = await getUncachableStripeClient();
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: org.stripeCustomerId,
        return_url: `${baseUrl}/subscription`,
      });

      res.json({ url: portalSession.url });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/stripe/handle-subscription-change", async (req: Request, res: Response) => {
    try {
      const { customerId, subscriptionId, status, plan, currentPeriodEnd } = req.body;
      if (!customerId) return res.status(400).send("Customer ID required");

      const org = await storage.getOrgByStripeCustomerId(customerId);
      if (!org) return res.status(404).send("Organization not found for this customer");

      const updateData: any = {
        stripeSubscriptionId: subscriptionId || null,
        subscriptionStatus: status || null,
      };

      if (currentPeriodEnd) {
        updateData.currentPeriodEnd = new Date(currentPeriodEnd * 1000);
      }

      if (plan && (status === "active" || status === "trialing")) {
        updateData.plan = plan;
      }

      if (status === "canceled" || status === "unpaid" || status === "past_due") {
        updateData.plan = "free";
      }

      await storage.updateOrg(org.id, updateData);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // Customers CRUD with plan limits
  app.get("/api/customers", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const result = await storage.getCustomers(req.session.orgId!);
      res.json(result);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/customers/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const c = await storage.getCustomer(req.session.orgId!, req.params.id as string);
      if (!c) return res.status(404).send("Customer not found");
      res.json(c);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/customers/:id/jobs", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const result = await storage.getCustomerJobs(req.session.orgId!, req.params.id as string);
      res.json(result);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/customers/:id/invoices", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const result = await storage.getCustomerInvoices(req.session.orgId!, req.params.id as string);
      res.json(result);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/customers", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const planCheck = await checkPlanLimit(req.session.orgId!, "customers");
      if (!planCheck.allowed) {
        return res.status(403).json({
          error: `Customer limit reached (${planCheck.limit}). Upgrade your plan to add more customers.`,
          limitReached: true,
          resource: "customers",
          current: planCheck.current,
          limit: planCheck.limit,
        });
      }
      const c = await storage.createCustomer(req.session.orgId!, req.body);
      res.json(c);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.patch("/api/customers/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const c = await storage.updateCustomer(req.session.orgId!, req.params.id as string, req.body);
      if (!c) return res.status(404).send("Customer not found");
      res.json(c);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.delete("/api/customers/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      await storage.deleteCustomer(req.session.orgId!, req.params.id as string);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // Jobs CRUD with plan limits
  app.get("/api/jobs", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const result = await storage.getJobs(req.session.orgId!);
      res.json(result);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/jobs/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const j = await storage.getJob(req.session.orgId!, req.params.id as string);
      if (!j) return res.status(404).send("Job not found");
      res.json(j);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/jobs/:id/events", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const events = await storage.getJobEvents(req.session.orgId!, req.params.id as string);
      res.json(events);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/jobs", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const planCheck = await checkPlanLimit(req.session.orgId!, "jobs");
      if (!planCheck.allowed) {
        return res.status(403).json({
          error: `Job limit reached (${planCheck.limit}). Upgrade your plan to add more jobs.`,
          limitReached: true,
          resource: "jobs",
          current: planCheck.current,
          limit: planCheck.limit,
        });
      }
      const data = { ...req.body };
      data.customerId = data.customerId || null;
      data.scheduledStart = data.scheduledStart ? new Date(data.scheduledStart) : null;
      data.scheduledEnd = data.scheduledEnd ? new Date(data.scheduledEnd) : null;
      const j = await storage.createJob(req.session.orgId!, data, req.session.userId!);
      res.json(j);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.patch("/api/jobs/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const data = { ...req.body };
      if ("scheduledStart" in data) data.scheduledStart = data.scheduledStart ? new Date(data.scheduledStart) : null;
      if ("scheduledEnd" in data) data.scheduledEnd = data.scheduledEnd ? new Date(data.scheduledEnd) : null;
      if ("customerId" in data) data.customerId = data.customerId || null;
      const j = await storage.updateJob(req.session.orgId!, req.params.id as string, data);
      if (!j) return res.status(404).send("Job not found");
      res.json(j);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.delete("/api/jobs/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      await storage.deleteJob(req.session.orgId!, req.params.id as string);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // Quotes CRUD with plan limits
  app.get("/api/quotes", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const result = await storage.getQuotes(req.session.orgId!);
      res.json(result);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/quotes/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const q = await storage.getQuote(req.session.orgId!, req.params.id as string);
      if (!q) return res.status(404).send("Quote not found");
      const org = await storage.getOrg(req.session.orgId!);
      res.json({ ...q, org });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/quotes", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const planCheck = await checkPlanLimit(req.session.orgId!, "quotes");
      if (!planCheck.allowed) {
        return res.status(403).json({
          error: `Quote limit reached (${planCheck.limit}). Upgrade your plan to add more quotes.`,
          limitReached: true,
          resource: "quotes",
          current: planCheck.current,
          limit: planCheck.limit,
        });
      }
      const q = await storage.createQuote(req.session.orgId!, req.body, req.session.userId!);
      res.json(q);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.patch("/api/quotes/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const q = await storage.updateQuote(req.session.orgId!, req.params.id as string, req.body);
      if (!q) return res.status(404).send("Quote not found");
      res.json(q);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.delete("/api/quotes/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      await storage.deleteQuote(req.session.orgId!, req.params.id as string);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/quotes/:id/convert-to-job", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const planCheck = await checkPlanLimit(req.session.orgId!, "jobs");
      if (!planCheck.allowed) {
        return res.status(403).json({
          error: `Job limit reached (${planCheck.limit}). Upgrade your plan to add more jobs.`,
          limitReached: true,
        });
      }

      const quote = await storage.getQuote(req.session.orgId!, req.params.id as string);
      if (!quote) return res.status(404).send("Quote not found");

      const job = await storage.createJob(
        req.session.orgId!,
        {
          title: `Job from Quote #${quote.id.slice(0, 8)}`,
          description: quote.notes || "",
          customerId: quote.customerId || null,
          status: "scheduled",
        },
        req.session.userId!
      );

      await storage.updateQuote(req.session.orgId!, req.params.id as string, {
        status: "accepted",
        jobId: job.id,
      });

      res.json(job);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // Invoices CRUD with plan limits
  app.get("/api/invoices", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const result = await storage.getInvoices(req.session.orgId!);
      res.json(result);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/invoices/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const inv = await storage.getInvoice(req.session.orgId!, req.params.id as string);
      if (!inv) return res.status(404).send("Invoice not found");
      const org = await storage.getOrg(req.session.orgId!);
      res.json({ ...inv, org });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/invoices", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const planCheck = await checkPlanLimit(req.session.orgId!, "invoices");
      if (!planCheck.allowed) {
        return res.status(403).json({
          error: `Invoice limit reached (${planCheck.limit}). Upgrade your plan to add more invoices.`,
          limitReached: true,
          resource: "invoices",
          current: planCheck.current,
          limit: planCheck.limit,
        });
      }
      const inv = await storage.createInvoice(req.session.orgId!, req.body, req.session.userId!);
      res.json(inv);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.patch("/api/invoices/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const inv = await storage.updateInvoice(req.session.orgId!, req.params.id as string, req.body);
      if (!inv) return res.status(404).send("Invoice not found");
      res.json(inv);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.delete("/api/invoices/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      await storage.deleteInvoice(req.session.orgId!, req.params.id as string);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/dashboard", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const stats = await storage.getDashboardStats(req.session.orgId!);
      res.json(stats);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // ========================
  // Master Admin Routes
  // ========================
  app.get("/api/admin/orgs", requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
      const allOrgs = await storage.getAllOrgs();
      const orgsWithCounts = await Promise.all(
        allOrgs.map(async (org) => {
          const counts = await storage.getOrgCounts(org.id);
          const mems = await storage.getOrgMemberships(org.id);
          return { ...org, counts, memberCount: mems.length };
        })
      );
      res.json(orgsWithCounts);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.patch("/api/admin/orgs/:id", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const { plan, subscriptionStatus, ...otherData } = req.body;
      const updateData: any = { ...otherData };
      if (plan) updateData.plan = plan;
      if (subscriptionStatus !== undefined) updateData.subscriptionStatus = subscriptionStatus;

      const org = await storage.updateOrg(req.params.id as string, updateData);
      if (!org) return res.status(404).send("Organization not found");
      res.json(org);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.delete("/api/admin/orgs/:id", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      await storage.deleteOrg(req.params.id as string);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/admin/orgs/:id/members", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const mems = await storage.getOrgMemberships(req.params.id as string);
      const membersWithUsers = await Promise.all(
        mems.map(async (m) => {
          const user = await storage.getUser(m.userId);
          return { ...m, user: user ? { ...user, password: undefined } : null };
        })
      );
      res.json(membersWithUsers);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.delete("/api/admin/orgs/:orgId/members/:userId", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      await storage.deleteMembership(req.params.orgId as string, req.params.userId as string);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/admin/users", requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
      const allUsers = await storage.getAllUsers();
      res.json(allUsers.map((u) => ({ ...u, password: undefined })));
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/memberships", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const mems = await storage.getOrgMemberships(req.session.orgId!);
      const membersWithUsers = await Promise.all(
        mems.map(async (m) => {
          const user = await storage.getUser(m.userId);
          return { ...m, user: user ? { ...user, password: undefined } : null };
        })
      );
      res.json(membersWithUsers);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  return httpServer;
}
