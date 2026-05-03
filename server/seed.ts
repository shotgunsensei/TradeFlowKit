import { storage } from "./storage";
import { db } from "./db";
import { users, memberships } from "@shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { logger as rootLogger } from "./logger";

const log = rootLogger.child({ component: "seed" });

const BCRYPT_ROUNDS = 12;

async function hashPasswordBcrypt(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function ensureDemoAccount() {
  try {
    const existing = await storage.getUserByUsername("demo");
    if (existing) {
      const mems = await db.select().from(memberships).where(eq(memberships.userId, existing.id));
      if (mems.length > 0) {
        log.info("Demo account already exists with org, skipping");
        return;
      }
      const org = await storage.createOrg({
        name: "Demo Electrical Services",
        slug: "demo-electrical-" + Date.now(),
        phone: "(555) 100-2000",
        email: "demo@tradeflow.io",
        address: "123 Demo St, Austin, TX 78701",
      });
      await storage.createMembership(org.id, existing.id, "owner");
      log.info("Demo org created for existing demo user");
      return;
    }
    const demoUser = await storage.createUser({
      username: "demo",
      password: await hashPasswordBcrypt("demo123"),
      fullName: "Demo User",
      phone: "(555) 234-5678",
      email: "demo@tradeflow.io",
    });
    const org = await storage.createOrg({
      name: "Demo Electrical Services",
      slug: "demo-electrical-" + Date.now(),
      phone: "(555) 100-2000",
      email: "demo@tradeflow.io",
      address: "123 Demo St, Austin, TX 78701",
    });
    await storage.createMembership(org.id, demoUser.id, "owner");
    log.info("Demo account created: demo / demo123");
  } catch (err) {
    log.error({ err: (err as any)?.message || err }, "Error ensuring demo account");
  }
}


export async function ensureReviewerAccount() {
  try {
    const existing = await storage.getUserByUsername("reviewer");
    if (existing) {
      const mems = await db.select().from(memberships).where(eq(memberships.userId, existing.id));
      if (mems.length > 0) {
        log.info("Reviewer account already exists with org, skipping");
        return;
      }
      const demoUser = await storage.getUserByUsername("demo");
      if (demoUser) {
        const demoMems = await db.select().from(memberships).where(eq(memberships.userId, demoUser.id));
        if (demoMems.length > 0) {
          await storage.createMembership(demoMems[0].orgId, existing.id, "owner");
          log.info("Reviewer added as owner to demo org");
          return;
        }
      }
      return;
    }
    const reviewerUser = await db.insert(users).values({
      id: crypto.randomUUID(),
      username: "reviewer",
      password: await hashPasswordBcrypt("Reviewer2026!"),
      fullName: "App Reviewer",
      phone: "",
      email: "",
      isSuperAdmin: false,
    }).returning();
    const demoUser = await storage.getUserByUsername("demo");
    if (demoUser) {
      const demoMems = await db.select().from(memberships).where(eq(memberships.userId, demoUser.id));
      if (demoMems.length > 0) {
        await storage.createMembership(demoMems[0].orgId, reviewerUser[0].id, "owner");
      }
    }
    log.info("Reviewer account created: reviewer / Reviewer2026!");
  } catch (err) {
    log.error({ err: (err as any)?.message || err }, "Error ensuring reviewer account");
  }
}

export async function ensureSuperAdmin() {
  try {
    const existing = await storage.getUserByUsername("Johntwms355");
    if (!existing) {
      await db.insert(users).values({
        id: crypto.randomUUID(),
        username: "Johntwms355",
        password: await hashPasswordBcrypt("Admin2026!"),
        fullName: "John",
        phone: "",
        email: "",
        isSuperAdmin: true,
      });
      log.info("Super admin created: Johntwms355 / Admin2026!");
    }
  } catch (err) {
    log.error({ err: (err as any)?.message || err }, "Error ensuring super admin");
  }
}

export async function seedDatabase() {
  try {
    const existingUser = await storage.getUserByUsername("demo");
    if (existingUser) {
      log.info("Seed data already exists, skipping");
      return;
    }

    log.info("Seeding database with demo data");

    const demoUser = await storage.createUser({
      username: "demo",
      password: await hashPasswordBcrypt("demo123"),
      fullName: "Mike Johnson",
      phone: "(555) 234-5678",
      email: "mike@tradeflow.io",
    });

    const org = await storage.createOrg({
      name: "Johnson Electrical Services",
      slug: "johnson-electrical",
      phone: "(555) 100-2000",
      email: "office@johnsonelectric.com",
      address: "456 Commerce Blvd, Austin, TX 78701",
    });

    await storage.createMembership(org.id, demoUser.id, "owner");

    const customer1 = await storage.createCustomer(org.id, {
      name: "Sarah Martinez",
      phone: "(555) 301-4567",
      email: "sarah.martinez@email.com",
      address: "123 Oak Street, Austin, TX 78702",
      notes: "Prefers morning appointments. Has two dogs.",
    });

    const customer2 = await storage.createCustomer(org.id, {
      name: "Robert Chen",
      phone: "(555) 402-8901",
      email: "rchen@techcorp.com",
      address: "789 Business Park Dr, Suite 200, Austin, TX 78759",
      notes: "Commercial client. Key access required - call front desk.",
    });

    const customer3 = await storage.createCustomer(org.id, {
      name: "Emily & David Wilson",
      phone: "(555) 503-2345",
      email: "wilsonfamily@gmail.com",
      address: "2510 Sunset Ridge Ln, Austin, TX 78745",
      notes: "New construction home. Referred by Tom's Builders.",
    });

    const customer4 = await storage.createCustomer(org.id, {
      name: "Green Valley HOA",
      phone: "(555) 604-6789",
      email: "maintenance@greenvalleyhoa.org",
      address: "1 Green Valley Circle, Cedar Park, TX 78613",
      notes: "Quarterly maintenance contract. Contact: Lisa Park, Property Manager.",
    });

    const job1 = await storage.createJob(org.id, {
      title: "Panel upgrade - 100A to 200A",
      description: "Customer needs electrical panel upgrade from 100A to 200A service. Includes new breaker panel, meter base, and weatherhead.",
      customerId: customer1.id,
      status: "in_progress",
      scheduledStart: new Date(Date.now() + 86400000) as any,
      scheduledEnd: new Date(Date.now() + 86400000 + 28800000) as any,
      internalNotes: "Need to pull permit first. Check with city inspector.",
    }, demoUser.id);

    const job2 = await storage.createJob(org.id, {
      title: "Office lighting retrofit - LED",
      description: "Replace all fluorescent fixtures with LED panels in main office area. Approximately 40 fixtures.",
      customerId: customer2.id,
      status: "scheduled",
      scheduledStart: new Date(Date.now() + 172800000) as any,
      scheduledEnd: new Date(Date.now() + 172800000 + 28800000) as any,
      internalNotes: "Weekend work preferred. Building access card needed.",
    }, demoUser.id);

    const job3 = await storage.createJob(org.id, {
      title: "Whole-house wiring - new construction",
      description: "Complete electrical wiring for new 3,200 sq ft home. Includes service entrance, panel, all circuits, fixtures, and smart home pre-wire.",
      customerId: customer3.id,
      status: "quoted",
      internalNotes: "Coordinate with builder schedule. Phase 1: rough-in. Phase 2: trim-out.",
    }, demoUser.id);

    const job4 = await storage.createJob(org.id, {
      title: "Emergency outlet repair",
      description: "Multiple outlets in kitchen not working. Possible GFCI trip or circuit issue.",
      customerId: customer1.id,
      status: "done",
    }, demoUser.id);

    const job5 = await storage.createJob(org.id, {
      title: "Landscape lighting installation",
      description: "Install low-voltage LED landscape lighting package. 12 path lights, 6 up-lights, and 2 flood lights.",
      customerId: customer4.id,
      status: "lead",
    }, demoUser.id);

    const quote1 = await storage.createQuote(org.id, {
      customerId: customer3.id,
      jobId: job3.id,
      status: "sent",
      taxRate: "8.25",
      discount: "500",
      notes: "Price includes all materials and labor. Fixtures allowance of $3,000 included.",
      items: [
        { description: "Rough-in wiring (labor)", qty: "1", unitPrice: "8500" },
        { description: "Trim-out & fixtures (labor)", qty: "1", unitPrice: "4200" },
        { description: "Electrical materials package", qty: "1", unitPrice: "6800" },
        { description: "Smart home pre-wire (Cat6 + speaker wire)", qty: "1", unitPrice: "2200" },
        { description: "Permit & inspection fees", qty: "1", unitPrice: "450" },
      ],
    }, demoUser.id);

    const quote2 = await storage.createQuote(org.id, {
      customerId: customer4.id,
      jobId: job5.id,
      status: "draft",
      taxRate: "8.25",
      discount: "0",
      notes: "Landscape lighting estimate. Includes trenching and transformer.",
      items: [
        { description: "LED path lights (12 units)", qty: "12", unitPrice: "85" },
        { description: "LED up-lights (6 units)", qty: "6", unitPrice: "120" },
        { description: "LED flood lights (2 units)", qty: "2", unitPrice: "175" },
        { description: "Low-voltage transformer 600W", qty: "1", unitPrice: "350" },
        { description: "Installation labor", qty: "16", unitPrice: "95" },
        { description: "Trenching & wiring", qty: "1", unitPrice: "800" },
      ],
    }, demoUser.id);

    const inv1 = await storage.createInvoice(org.id, {
      customerId: customer1.id,
      jobId: job4.id,
      status: "paid",
      taxRate: "8.25",
      discount: "0",
      dueDate: new Date(Date.now() - 604800000).toISOString(),
      notes: "Emergency service call - kitchen outlets.",
      items: [
        { description: "Emergency service call", qty: "1", unitPrice: "150" },
        { description: "GFCI outlet replacement", qty: "2", unitPrice: "45" },
        { description: "Circuit troubleshooting (1 hr)", qty: "1", unitPrice: "95" },
      ],
    }, demoUser.id);

    await storage.updateInvoice(org.id, inv1.id, { status: "paid", paidAt: new Date(Date.now() - 432000000) });

    const inv2 = await storage.createInvoice(org.id, {
      customerId: customer1.id,
      jobId: job1.id,
      status: "sent",
      taxRate: "8.25",
      discount: "0",
      dueDate: new Date(Date.now() + 1209600000).toISOString(),
      notes: "Panel upgrade - deposit invoice (50%).",
      items: [
        { description: "200A panel upgrade (deposit - 50%)", qty: "1", unitPrice: "2250" },
        { description: "Permit fee", qty: "1", unitPrice: "175" },
      ],
    }, demoUser.id);

    const inv3 = await storage.createInvoice(org.id, {
      customerId: customer2.id,
      jobId: job2.id,
      status: "draft",
      taxRate: "8.25",
      discount: "200",
      dueDate: new Date(Date.now() + 2592000000).toISOString(),
      notes: "LED retrofit - full project invoice.",
      items: [
        { description: "LED panel fixtures (40 units)", qty: "40", unitPrice: "65" },
        { description: "Installation labor (est. 24 hrs)", qty: "24", unitPrice: "85" },
        { description: "Disposal of old fixtures", qty: "1", unitPrice: "200" },
      ],
    }, demoUser.id);

    log.info("Seed data created successfully");
    log.info("Demo login: username=demo, password=demo123");
  } catch (err) {
    log.error({ err: (err as any)?.message || err }, "Seed error");
  }
}
