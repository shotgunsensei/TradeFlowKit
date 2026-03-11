import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  numeric,
  jsonb,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const orgPlanEnum = pgEnum("org_plan", [
  "free",
  "individual",
  "small_business",
  "enterprise",
]);

export const membershipRoleEnum = pgEnum("membership_role", [
  "owner",
  "admin",
  "tech",
  "viewer",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "lead",
  "quoted",
  "scheduled",
  "in_progress",
  "done",
  "invoiced",
  "paid",
  "canceled",
]);

export const quoteStatusEnum = pgEnum("quote_status", [
  "draft",
  "sent",
  "accepted",
  "declined",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
  "void",
]);

export const callRecoveryPlanEnum = pgEnum("call_recovery_plan", [
  "starter",
  "growth",
  "pro",
]);

export const missedCallStatusEnum = pgEnum("missed_call_status", [
  "new",
  "in_progress",
  "recovered",
  "failed",
  "expired",
]);

export const aiMessageRoleEnum = pgEnum("ai_message_role", [
  "system",
  "assistant",
  "user",
]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull().default(""),
  phone: text("phone").default(""),
  email: text("email").default(""),
  isSuperAdmin: boolean("is_super_admin").default(false).notNull(),
});

export const orgs = pgTable("orgs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  phone: text("phone").default(""),
  email: text("email").default(""),
  address: text("address").default(""),
  plan: orgPlanEnum("plan").notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status"),
  currentPeriodEnd: timestamp("current_period_end"),
  callRecoveryPlan: callRecoveryPlanEnum("call_recovery_plan"),
  callRecoveryStripeSubId: text("call_recovery_stripe_sub_id"),
  callRecoveryStatus: text("call_recovery_status"),
  callRecoveryPhone: text("call_recovery_phone"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const memberships = pgTable("memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id")
    .notNull()
    .references(() => orgs.id),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  role: membershipRoleEnum("role").notNull().default("tech"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const inviteCodes = pgTable("invite_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id")
    .notNull()
    .references(() => orgs.id),
  code: text("code").notNull().unique(),
  role: membershipRoleEnum("role").notNull().default("tech"),
  expiresAt: timestamp("expires_at"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id")
    .notNull()
    .references(() => orgs.id),
  name: text("name").notNull(),
  phone: text("phone").default(""),
  email: text("email").default(""),
  address: text("address").default(""),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const jobs = pgTable("jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id")
    .notNull()
    .references(() => orgs.id),
  customerId: varchar("customer_id").references(() => customers.id),
  title: text("title").notNull(),
  description: text("description").default(""),
  status: jobStatusEnum("status").notNull().default("lead"),
  scheduledStart: timestamp("scheduled_start"),
  scheduledEnd: timestamp("scheduled_end"),
  assignedUserIds: text("assigned_user_ids")
    .array()
    .default(sql`'{}'::text[]`),
  internalNotes: text("internal_notes").default(""),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const jobEvents = pgTable("job_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id")
    .notNull()
    .references(() => orgs.id),
  jobId: varchar("job_id")
    .notNull()
    .references(() => jobs.id),
  type: text("type").notNull(),
  payload: jsonb("payload").default({}),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const quotes = pgTable("quotes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id")
    .notNull()
    .references(() => orgs.id),
  customerId: varchar("customer_id").references(() => customers.id),
  jobId: varchar("job_id").references(() => jobs.id),
  status: quoteStatusEnum("status").notNull().default("draft"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).default("0"),
  discount: numeric("discount", { precision: 10, scale: 2 }).default("0"),
  notes: text("notes").default(""),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const quoteItems = pgTable("quote_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id")
    .notNull()
    .references(() => orgs.id),
  quoteId: varchar("quote_id")
    .notNull()
    .references(() => quotes.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  qty: numeric("qty", { precision: 10, scale: 2 }).notNull().default("1"),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
});

export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id")
    .notNull()
    .references(() => orgs.id),
  customerId: varchar("customer_id").references(() => customers.id),
  jobId: varchar("job_id").references(() => jobs.id),
  status: invoiceStatusEnum("status").notNull().default("draft"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).default("0"),
  discount: numeric("discount", { precision: 10, scale: 2 }).default("0"),
  dueDate: timestamp("due_date"),
  sentAt: timestamp("sent_at"),
  paidAt: timestamp("paid_at"),
  notes: text("notes").default(""),
  publicToken: text("public_token").default(sql`gen_random_uuid()`),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const invoiceItems = pgTable("invoice_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id")
    .notNull()
    .references(() => orgs.id),
  invoiceId: varchar("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  qty: numeric("qty", { precision: 10, scale: 2 }).notNull().default("1"),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
});

export const callRecoverySubscriptions = pgTable("call_recovery_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id")
    .notNull()
    .references(() => orgs.id),
  plan: callRecoveryPlanEnum("plan").notNull(),
  status: text("status").notNull().default("active"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeCustomerId: text("stripe_customer_id"),
  currentPeriodStart: timestamp("current_period_start").notNull().defaultNow(),
  currentPeriodEnd: timestamp("current_period_end"),
  usageCount: integer("usage_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const missedCalls = pgTable("missed_calls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id")
    .notNull()
    .references(() => orgs.id),
  callerPhone: text("caller_phone").notNull(),
  callerName: text("caller_name"),
  status: missedCallStatusEnum("status").notNull().default("new"),
  serviceType: text("service_type"),
  location: text("location"),
  urgency: text("urgency"),
  customerId: varchar("customer_id").references(() => customers.id),
  jobId: varchar("job_id").references(() => jobs.id),
  twilioCallSid: text("twilio_call_sid"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const aiMessages = pgTable("ai_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  missedCallId: varchar("missed_call_id")
    .notNull()
    .references(() => missedCalls.id, { onDelete: "cascade" }),
  role: aiMessageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCallRecoverySubscriptionSchema = createInsertSchema(callRecoverySubscriptions).pick({
  orgId: true,
  plan: true,
  stripeSubscriptionId: true,
  stripeCustomerId: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
});

export type CallRecoverySubscription = typeof callRecoverySubscriptions.$inferSelect;
export type InsertCallRecoverySubscription = z.infer<typeof insertCallRecoverySubscriptionSchema>;

export const insertMissedCallSchema = createInsertSchema(missedCalls).pick({
  callerPhone: true,
  callerName: true,
  twilioCallSid: true,
});

export const insertAiMessageSchema = createInsertSchema(aiMessages).pick({
  missedCallId: true,
  role: true,
  content: true,
});

export type MissedCall = typeof missedCalls.$inferSelect;
export type InsertMissedCall = z.infer<typeof insertMissedCallSchema>;
export type AiMessage = typeof aiMessages.$inferSelect;
export type InsertAiMessage = z.infer<typeof insertAiMessageSchema>;

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  fullName: true,
  phone: true,
  email: true,
});

export const insertOrgSchema = createInsertSchema(orgs).pick({
  name: true,
  slug: true,
  phone: true,
  email: true,
  address: true,
});

export const insertMembershipSchema = createInsertSchema(memberships).pick({
  orgId: true,
  userId: true,
  role: true,
});

export const insertCustomerSchema = createInsertSchema(customers).pick({
  name: true,
  phone: true,
  email: true,
  address: true,
  notes: true,
});

export const insertJobSchema = createInsertSchema(jobs).pick({
  customerId: true,
  title: true,
  description: true,
  status: true,
  scheduledStart: true,
  scheduledEnd: true,
  internalNotes: true,
});

export const insertQuoteSchema = createInsertSchema(quotes).pick({
  customerId: true,
  jobId: true,
  status: true,
  taxRate: true,
  discount: true,
  notes: true,
});

export const insertQuoteItemSchema = createInsertSchema(quoteItems).pick({
  quoteId: true,
  description: true,
  qty: true,
  unitPrice: true,
});

export const insertInvoiceSchema = createInsertSchema(invoices).pick({
  customerId: true,
  jobId: true,
  status: true,
  taxRate: true,
  discount: true,
  dueDate: true,
  notes: true,
});

export const insertInvoiceItemSchema = createInsertSchema(invoiceItems).pick({
  invoiceId: true,
  description: true,
  qty: true,
  unitPrice: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Org = typeof orgs.$inferSelect;
export type InsertOrg = z.infer<typeof insertOrgSchema>;
export type Membership = typeof memberships.$inferSelect;
export type InsertMembership = z.infer<typeof insertMembershipSchema>;
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type JobEvent = typeof jobEvents.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type QuoteItem = typeof quoteItems.$inferSelect;
export type InsertQuoteItem = z.infer<typeof insertQuoteItemSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;
export type InviteCode = typeof inviteCodes.$inferSelect;

export function calcLineItemsTotal(
  items: Array<{ qty: string | number; unitPrice: string | number }>
): number {
  return items.reduce((sum, item) => {
    return sum + Number(item.qty) * Number(item.unitPrice);
  }, 0);
}

export function calcTotalWithTaxDiscount(
  subtotal: number,
  taxRate: string | number,
  discount: string | number
): { subtotal: number; tax: number; discount: number; total: number } {
  const taxAmt = subtotal * (Number(taxRate) / 100);
  const discountAmt = Number(discount);
  return {
    subtotal,
    tax: taxAmt,
    discount: discountAmt,
    total: subtotal + taxAmt - discountAmt,
  };
}

export const PLAN_LIMITS: Record<string, { customers: number; jobs: number; quotes: number; invoices: number; teamMembers: number; canInvite: boolean }> = {
  free: { customers: 5, jobs: 5, quotes: 5, invoices: 5, teamMembers: 1, canInvite: false },
  individual: { customers: -1, jobs: -1, quotes: -1, invoices: -1, teamMembers: 1, canInvite: false },
  small_business: { customers: -1, jobs: -1, quotes: -1, invoices: -1, teamMembers: 25, canInvite: true },
  enterprise: { customers: -1, jobs: -1, quotes: -1, invoices: -1, teamMembers: -1, canInvite: true },
};

export const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  individual: "Individual",
  small_business: "Small Business",
  enterprise: "Enterprise",
};

export const PLAN_PRICES: Record<string, number> = {
  free: 0,
  individual: 20,
  small_business: 100,
  enterprise: 200,
};

export const JOB_STATUS_LABELS: Record<string, string> = {
  lead: "Lead",
  quoted: "Quoted",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  done: "Done",
  invoiced: "Invoiced",
  paid: "Paid",
  canceled: "Canceled",
};

export const CALL_RECOVERY_PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
};

export const CALL_RECOVERY_PLAN_PRICES: Record<string, number> = {
  starter: 29,
  growth: 79,
  pro: 149,
};

export const CALL_RECOVERY_PLAN_LIMITS: Record<string, { recoveriesPerMonth: number; analytics: boolean }> = {
  starter: { recoveriesPerMonth: 50, analytics: false },
  growth: { recoveriesPerMonth: -1, analytics: false },
  pro: { recoveriesPerMonth: -1, analytics: true },
};

export const JOB_STATUS_COLORS: Record<string, string> = {
  lead: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  quoted:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  scheduled:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  in_progress:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  done: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  invoiced:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  canceled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};
