import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
import { pool } from "./db";
import connectPgSimple from "connect-pg-simple";
import crypto from "crypto";
import { PLAN_LIMITS, CALL_RECOVERY_PLAN_LIMITS, type CallRecoveryPlan } from "@shared/schema";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { processConversation, generateInitialMessage, completeRecovery } from "./callRecoveryAI";
import { sendSMS, validateTwilioWebhook, isTwilioConfigured } from "./twilioClient";

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

  app.post("/api/customers/import", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const { customers: rows } = req.body;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "No customers provided" });
      }

      const orgId = req.session.orgId!;
      const planCheck = await checkPlanLimit(orgId, "customers");
      if (planCheck.limit !== -1) {
        const remaining = planCheck.limit - planCheck.current;
        if (remaining <= 0) {
          return res.status(403).json({
            error: `Customer limit reached (${planCheck.limit}). Upgrade your plan to add more customers.`,
            limitReached: true,
          });
        }
        if (rows.length > remaining) {
          return res.status(403).json({
            error: `Import would exceed your plan limit. You can add ${remaining} more customer(s) on your current plan.`,
            limitReached: true,
          });
        }
      }

      let imported = 0;
      const errors: { row: number; error: string }[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const name = (row.name || "").trim();
        if (!name) {
          errors.push({ row: i + 2, error: "Name is required" });
          continue;
        }
        try {
          await storage.createCustomer(orgId, {
            name,
            phone: (row.phone || "").trim(),
            email: (row.email || "").trim(),
            address: (row.address || "").trim(),
            notes: (row.notes || "").trim(),
          });
          imported++;
        } catch (err: any) {
          errors.push({ row: i + 2, error: err.message });
        }
      }

      res.json({ imported, errors });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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

  // ========================
  // Call Recovery AI Routes
  // ========================

  app.get("/api/call-recovery/subscription", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const org = await storage.getOrg(req.session.orgId!);
      if (!org) return res.status(404).send("Organization not found");

      const plan = org.callRecoveryPlan;
      const limits = plan ? CALL_RECOVERY_PLAN_LIMITS[plan] : null;

      const crSub = await storage.getCallRecoverySubscription(org.id);
      let usage = 0;
      if (crSub) {
        usage = await storage.getMissedCallCount(org.id, crSub.currentPeriodStart);
      }

      res.json({
        plan,
        status: org.callRecoveryStatus,
        phone: org.callRecoveryPhone,
        limits,
        usage,
        stripeSubscriptionId: org.callRecoveryStripeSubId,
        subscription: crSub || null,
        periodStart: crSub?.currentPeriodStart || null,
        periodEnd: crSub?.currentPeriodEnd || null,
      });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/call-recovery/plans", requireAuth, async (_req: Request, res: Response) => {
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
        WHERE p.active = true AND p.metadata->>'feature' = 'call_recovery'
        ORDER BY pr.unit_amount ASC
      `);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/call-recovery/checkout", requireAuth, requireOrg, async (req: Request, res: Response) => {
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
        success_url: `${baseUrl}/call-recovery?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/call-recovery?subscription=cancelled`,
        metadata: { orgId: org.id, feature: 'call_recovery', callRecoveryPlan: plan },
        subscription_data: {
          metadata: { orgId: org.id, feature: 'call_recovery', callRecoveryPlan: plan },
        },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/call-recovery/verify-checkout", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const { session_id } = req.query;
      if (!session_id || typeof session_id !== 'string') {
        return res.status(400).send("session_id required");
      }

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(session_id);

      if (session.payment_status !== 'paid' && session.status !== 'complete') {
        return res.status(400).send("Checkout session not completed");
      }

      const { orgId, callRecoveryPlan } = session.metadata || {};
      if (!orgId || !callRecoveryPlan || orgId !== req.session.orgId) {
        return res.status(400).send("Invalid session metadata");
      }

      if (session.metadata?.feature !== 'call_recovery') {
        return res.status(400).send("Not a call recovery session");
      }

      const existingSub = await storage.getCallRecoverySubscription(orgId);
      let subId: string;
      if (existingSub) {
        await storage.updateCallRecoverySubscription(existingSub.id, {
          plan: callRecoveryPlan as CallRecoveryPlan,
          status: 'active',
          stripeSubscriptionId: session.subscription as string,
          stripeCustomerId: session.customer as string,
          usageCount: 0,
        });
        subId = existingSub.id;
      } else {
        const newSub = await storage.createCallRecoverySubscription({
          orgId,
          plan: callRecoveryPlan,
          stripeSubscriptionId: session.subscription as string,
          stripeCustomerId: session.customer as string,
        });
        subId = newSub.id;
      }

      await storage.updateOrg(orgId, {
        callRecoveryPlan: callRecoveryPlan as CallRecoveryPlan,
        callRecoveryStatus: 'active',
        callRecoveryStripeSubId: session.subscription as string || null,
        callRecoverySubscriptionId: subId,
      });

      res.json({ ok: true, plan: callRecoveryPlan });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/call-recovery/portal", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const org = await storage.getOrg(req.session.orgId!);
      if (!org?.stripeCustomerId) return res.status(400).send("No subscription found");

      const stripe = await getUncachableStripeClient();
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: org.stripeCustomerId,
        return_url: `${baseUrl}/call-recovery`,
      });

      res.json({ url: portalSession.url });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/call-recovery/configure", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).send("Phone number required");

      const org = await storage.getOrg(req.session.orgId!);
      if (!org) return res.status(404).send("Organization not found");

      if (!org.callRecoveryPlan) {
        return res.status(403).send("No call recovery subscription active. Subscribe first.");
      }

      await storage.updateOrg(org.id, { callRecoveryPhone: phone });
      res.json({ ok: true, phone });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/call-recovery/missed-calls", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const calls = await storage.getMissedCalls(req.session.orgId!, limit, offset);
      res.json(calls);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/call-recovery/missed-calls/:id/messages", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const mc = await storage.getMissedCall(req.params.id as string);
      if (!mc || mc.orgId !== req.session.orgId) {
        return res.status(404).send("Missed call not found");
      }
      const messages = await storage.getAiMessages(req.params.id as string);
      res.json({ missedCall: mc, messages });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/call-recovery/webhook/missed-call", async (req: Request, res: Response) => {
    // Twilio Voice URL webhooks require TwiML XML responses — never return plain text or JSON
    const twiml = (inner: string) => {
      res.set("Content-Type", "text/xml");
      return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`);
    };

    try {
      const { Called, From, CallSid, CallStatus } = req.body;

      if (!From || !Called) {
        return twiml("<Hangup/>");
      }

      // Validate Twilio signature only when credentials are configured.
      // Without credentials we cannot sign outbound SMS either, so we log the
      // warning but still respond with valid TwiML so the caller isn't greeted
      // with Twilio's "application error" recording.
      const twilioConfigured = await isTwilioConfigured();
      if (twilioConfigured) {
        const twilioSig = req.headers["x-twilio-signature"] as string | undefined;
        // Use the actual host from the incoming request so the URL we validate
        // against matches what Twilio signed (handles custom domains like
        // tradeflowkit.com vs the internal .replit.app domain).
        const host = req.headers["x-forwarded-host"] || req.headers["host"];
        const webhookUrl = host
          ? `https://${host}/api/call-recovery/webhook/missed-call`
          : "";
        const isValid = await validateTwilioWebhook(twilioSig, webhookUrl, req.body as Record<string, string>);
        if (!isValid) {
          console.warn(`Twilio signature mismatch for missed-call. URL used: ${webhookUrl}`);
          return twiml("<Hangup/>");
        }
      } else {
        console.warn("Twilio not configured — skipping webhook signature validation for missed-call");
      }

      // Status callback path: only process calls that were actually missed
      if (CallStatus && !["no-answer", "busy", "failed", "canceled"].includes(CallStatus)) {
        res.set("Content-Type", "text/xml");
        return res.status(200).send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>");
      }

      const org = await storage.getOrgByCallRecoveryPhone(Called);
      if (!org) {
        return twiml("<Hangup/>");
      }

      if (!org.callRecoveryPlan || org.callRecoveryStatus !== "active") {
        return twiml("<Hangup/>");
      }

      const crSub = await storage.getCallRecoverySubscription(org.id);
      if (!crSub) {
        console.log(`No call_recovery_subscriptions row for org ${org.id} — rejecting`);
        return twiml("<Hangup/>");
      }

      const limits = CALL_RECOVERY_PLAN_LIMITS[org.callRecoveryPlan];
      if (limits && limits.recoveriesPerMonth !== -1) {
        const periodStart = crSub.currentPeriodStart;
        const currentUsage = await storage.getMissedCallCount(org.id, periodStart);
        if (currentUsage >= limits.recoveriesPerMonth) {
          console.log(`Call recovery limit reached for org ${org.id} (${currentUsage}/${limits.recoveriesPerMonth} since ${periodStart.toISOString()})`);
          return twiml("<Say voice=\"alice\">We received your call. Please try again later.</Say><Hangup/>");
        }
      }

      const existing = await storage.getMissedCallByPhone(org.id, From);
      if (existing) {
        return twiml("<Say voice=\"alice\">We received your call and will follow up with you shortly.</Say><Hangup/>");
      }

      const missedCall = await storage.createMissedCall(org.id, {
        callerPhone: From,
        twilioCallSid: CallSid,
      });

      await storage.incrementCallRecoveryUsage(org.id);

      const initialMessage = generateInitialMessage(org.name);
      await storage.createAiMessage(missedCall.id, "assistant", initialMessage);
      await storage.updateMissedCall(missedCall.id, { status: "in_progress" });

      const smsSent = await sendSMS(From, Called, initialMessage);
      if (!smsSent) {
        console.warn(`Failed to send initial SMS to ${From} for missed call ${missedCall.id}`);
      }

      // Voice URL path: return a friendly spoken message before hanging up
      // Status callback path: just return an empty TwiML response
      if (CallStatus) {
        return twiml("");
      }
      return twiml("<Say voice=\"alice\">We just missed your call. We'll send you a text message shortly. Thank you for calling.</Say><Hangup/>");
    } catch (err: any) {
      console.error("Missed call webhook error:", err.message);
      res.set("Content-Type", "text/xml");
      return res.status(200).send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");
    }
  });

  app.post("/api/call-recovery/webhook/sms", async (req: Request, res: Response) => {
    const twiml = (inner: string) => {
      res.set("Content-Type", "text/xml");
      return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`);
    };

    try {
      const { From, Body, To } = req.body;

      if (!From || Body === undefined) {
        return twiml("");
      }

      const twilioConfigured = await isTwilioConfigured();
      if (twilioConfigured) {
        const twilioSig = req.headers["x-twilio-signature"] as string | undefined;
        const host = req.headers["x-forwarded-host"] || req.headers["host"];
        const webhookUrl = host
          ? `https://${host}/api/call-recovery/webhook/sms`
          : "";
        const isValid = await validateTwilioWebhook(twilioSig, webhookUrl, req.body as Record<string, string>);
        if (!isValid) {
          console.warn(`Twilio signature mismatch for sms. URL used: ${webhookUrl}`);
          return twiml("");
        }
      } else {
        console.warn("Twilio not configured — skipping webhook signature validation for sms");
      }

      const org = await storage.getOrgByCallRecoveryPhone(To);
      if (!org) {
        return twiml("");
      }

      const missedCall = await storage.getMissedCallByPhone(org.id, From);
      if (!missedCall) {
        return twiml("");
      }

      const result = await processConversation(missedCall.id, Body);

      await sendSMS(From, To, result.responseText);

      if (result.isComplete && result.serviceType && result.location && result.urgency) {
        try {
          await completeRecovery(
            missedCall.id,
            result.serviceType,
            result.location,
            result.urgency
          );
        } catch (err: any) {
          console.error("Failed to complete recovery:", err.message);
          await storage.updateMissedCall(missedCall.id, { status: "failed" });
        }
      }

      return twiml("");
    } catch (err: any) {
      console.error("SMS webhook error:", err.message);
      res.set("Content-Type", "text/xml");
      return res.status(200).send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>");
    }
  });

  app.post("/api/call-recovery/handle-subscription-change", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const expectedToken = process.env.SESSION_SECRET || 'internal-secret';
      if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
        return res.status(401).send("Unauthorized");
      }

      const { customerId, subscriptionId, status, callRecoveryPlan, periodStart, periodEnd } = req.body;
      if (!customerId) return res.status(400).send("Customer ID required");

      const org = await storage.getOrgByStripeCustomerId(customerId);
      if (!org) return res.status(404).send("Organization not found");

      const updateData: any = {
        callRecoveryStripeSubId: subscriptionId || null,
        callRecoveryStatus: status || null,
      };

      if (callRecoveryPlan && (status === "active" || status === "trialing")) {
        updateData.callRecoveryPlan = callRecoveryPlan;

        const existingSub = await storage.getCallRecoverySubscription(org.id);
        if (existingSub) {
          await storage.updateCallRecoverySubscription(existingSub.id, {
            plan: callRecoveryPlan,
            status: "active",
            stripeSubscriptionId: subscriptionId,
            currentPeriodStart: periodStart ? new Date(periodStart * 1000) : existingSub.currentPeriodStart,
            currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : existingSub.currentPeriodEnd,
            usageCount: 0,
          });
        } else {
          await storage.createCallRecoverySubscription({
            orgId: org.id,
            plan: callRecoveryPlan,
            stripeSubscriptionId: subscriptionId,
            stripeCustomerId: customerId,
            currentPeriodStart: periodStart ? new Date(periodStart * 1000) : new Date(),
            currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : undefined,
          });
        }
      }

      if (status === "canceled" || status === "unpaid" || status === "past_due") {
        updateData.callRecoveryPlan = null;
        updateData.callRecoveryStatus = status;
        const existingSub = await storage.getCallRecoverySubscription(org.id);
        if (existingSub) {
          await storage.updateCallRecoverySubscription(existingSub.id, { status: "canceled" });
        }
      }

      await storage.updateOrg(org.id, updateData);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/call-recovery/stats", requireAuth, requireOrg, async (req: Request, res: Response) => {
    try {
      const org = await storage.getOrg(req.session.orgId!);
      if (!org) return res.status(404).send("Organization not found");

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const allCalls = await storage.getMissedCalls(req.session.orgId!, 1000, 0);
      const thisMonthCalls = allCalls.filter(c => new Date(c.createdAt) >= startOfMonth);
      const recovered = thisMonthCalls.filter(c => c.status === "recovered");
      const inProgress = thisMonthCalls.filter(c => c.status === "in_progress" || c.status === "new");
      const failed = thisMonthCalls.filter(c => c.status === "failed" || c.status === "expired");

      res.json({
        totalThisMonth: thisMonthCalls.length,
        recovered: recovered.length,
        inProgress: inProgress.length,
        failed: failed.length,
        recoveryRate: thisMonthCalls.length > 0
          ? Math.round((recovered.length / thisMonthCalls.length) * 100)
          : 0,
      });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  return httpServer;
}
