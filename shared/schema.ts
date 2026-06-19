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
  index,
  uniqueIndex,
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

export const jobPriorityEnum = pgEnum("job_priority", ["low", "normal", "urgent"]);

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
  "processing",
  "paid",
  "void",
]);

export const recurringIntervalEnum = pgEnum("recurring_interval", [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "annually",
]);

export type CallRecoveryPlan = "starter" | "growth" | "pro";
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
  totpSecret: text("totp_secret"),
  totpEnabledAt: timestamp("totp_enabled_at"),
  isSsoProvisioned: boolean("is_sso_provisioned").default(false).notNull(),
  operatorosUserId: text("operatoros_user_id"),
  operatorosRole: text("operatoros_role"),
  operatorosPlanSlug: text("operatoros_plan_slug"),
  operatorosOrganizationId: text("operatoros_organization_id"),
}, (t) => [
  uniqueIndex("users_email_unique_idx")
    .on(sql`lower(trim(${t.email}))`)
    .where(sql`length(trim(${t.email})) > 0`),
  uniqueIndex("users_operatoros_user_id_idx")
    .on(t.operatorosUserId)
    .where(sql`${t.operatorosUserId} IS NOT NULL`),
]);

export function normalizeEmail(email: string | null | undefined): string {
  if (email == null) return "";
  return String(email).trim().toLowerCase();
}

export const userRecoveryCodes = pgTable("user_recovery_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("user_recovery_codes_user_idx").on(t.userId),
]);

export const auditLog = pgTable("audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => orgs.id),
  userId: varchar("user_id").references(() => users.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: varchar("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("audit_log_org_created_idx").on(t.orgId, t.createdAt),
  index("audit_log_org_entity_idx").on(t.orgId, t.entity, t.entityId),
  index("audit_log_org_user_idx").on(t.orgId, t.userId),
]);

export type UserRecoveryCode = typeof userRecoveryCodes.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;

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
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  callRecoveryPlan: callRecoveryPlanEnum("call_recovery_plan"),
  callRecoveryStripeSubId: text("call_recovery_stripe_sub_id"),
  callRecoverySubscriptionId: varchar("call_recovery_subscription_id"),
  callRecoveryStatus: text("call_recovery_status"),
  callRecoveryPhone: text("call_recovery_phone"),
  callRecoveryEnabled: boolean("call_recovery_enabled").default(true).notNull(),
  callRecoveryCustomMessage: text("call_recovery_custom_message"),
  callRecoveryQuietStart: text("call_recovery_quiet_start"),
  callRecoveryQuietEnd: text("call_recovery_quiet_end"),
  logoUrl: text("logo_url"),
  website: text("website"),
  businessHours: text("business_hours"),
  stripeConnectAccountId: varchar("stripe_connect_account_id"),
  stripeConnectOnboarded: boolean("stripe_connect_onboarded").default(false),
  reviewRequestEnabled: boolean("review_request_enabled").default(false).notNull(),
  reviewRequestUrl: varchar("review_request_url"),
  reviewRequestTemplate: text("review_request_template"),
  operatorosOrganizationId: text("operatoros_organization_id"),
  operatorosTenantId: text("operatoros_tenant_id"),
  operatorosPlanSlug: text("operatoros_plan_slug"),
  operatorosSubscriptionStatus: text("operatoros_subscription_status"),
  operatorosAccessLevel: text("operatoros_access_level"),
  entitlementSnapshot: jsonb("entitlement_snapshot"),
  lastEntitlementSyncAt: timestamp("last_entitlement_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("orgs_operatoros_organization_id_idx")
    .on(t.operatorosOrganizationId)
    .where(sql`${t.operatorosOrganizationId} IS NOT NULL`),
  uniqueIndex("orgs_operatoros_tenant_id_idx")
    .on(t.operatorosTenantId)
    .where(sql`${t.operatorosTenantId} IS NOT NULL`),
]);

export const memberships = pgTable("memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id")
    .notNull()
    .references(() => orgs.id),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  role: membershipRoleEnum("role").notNull().default("tech"),
  operatorosUserId: text("operatoros_user_id"),
  tenantRole: text("tenant_role"),
  moduleRole: text("module_role"),
  enabled: boolean("enabled").notNull().default(true),
  userEntitlementSnapshot: jsonb("user_entitlement_snapshot"),
  lastSsoLoginAt: timestamp("last_sso_login_at"),
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
  notesUpdatedAt: timestamp("notes_updated_at"),
  smsOptOut: boolean("sms_opt_out").default(false).notNull(),
  portalToken: text("portal_token").unique().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
}, (t) => [
  index("customers_org_created_idx").on(t.orgId, t.createdAt),
]);

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
  priority: jobPriorityEnum("priority").notNull().default("normal"),
  internalNotes: text("internal_notes").default(""),
  isRecurring: boolean("is_recurring").default(false).notNull(),
  recurringFrequency: varchar("recurring_frequency"),
  parentJobId: varchar("parent_job_id"),
  recurringSeriesId: varchar("recurring_series_id"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
}, (t) => [
  index("jobs_org_status_idx").on(t.orgId, t.status),
  index("jobs_org_customer_idx").on(t.orgId, t.customerId),
  index("jobs_org_scheduled_idx").on(t.orgId, t.scheduledStart),
  index("jobs_org_created_idx").on(t.orgId, t.createdAt),
]);

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
}, (t) => [
  index("job_events_org_job_idx").on(t.orgId, t.jobId),
]);

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
  expiresAt: timestamp("expires_at"),
  sentAt: timestamp("sent_at"),
  publicToken: text("public_token").default(sql`gen_random_uuid()`),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("quotes_org_status_idx").on(t.orgId, t.status),
  index("quotes_org_customer_idx").on(t.orgId, t.customerId),
  index("quotes_org_created_idx").on(t.orgId, t.createdAt),
]);

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
}, (t) => [
  index("quote_items_quote_idx").on(t.quoteId),
]);

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
  paidViaStripe: boolean("paid_via_stripe").default(false),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  notes: text("notes").default(""),
  paymentNotes: text("payment_notes").default(""),
  publicToken: text("public_token").default(sql`gen_random_uuid()`),
  recurringInterval: recurringIntervalEnum("recurring_interval"),
  nextRunAt: timestamp("next_run_at"),
  parentInvoiceId: varchar("parent_invoice_id"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
}, (t) => [
  index("invoices_org_status_idx").on(t.orgId, t.status),
  index("invoices_recurring_next_run_idx").on(t.nextRunAt),
  index("invoices_org_due_idx").on(t.orgId, t.dueDate),
  index("invoices_org_customer_idx").on(t.orgId, t.customerId),
  index("invoices_org_paid_idx").on(t.orgId, t.paidAt),
  index("invoices_org_created_idx").on(t.orgId, t.createdAt),
]);

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
}, (t) => [
  index("invoice_items_invoice_idx").on(t.invoiceId),
]);

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
}, (t) => [
  index("missed_calls_org_status_created_idx").on(t.orgId, t.status, t.createdAt),
]);

export const reviewRequests = pgTable("review_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id")
    .notNull()
    .references(() => orgs.id),
  jobId: varchar("job_id")
    .notNull()
    .references(() => jobs.id),
  customerId: varchar("customer_id").references(() => customers.id),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  phoneNumber: text("phone_number").notNull(),
  reviewUrl: text("review_url").notNull(),
}, (t) => [
  index("review_requests_org_sent_idx").on(t.orgId, t.sentAt),
  index("review_requests_org_job_idx").on(t.orgId, t.jobId),
]);

export const aiMessages = pgTable("ai_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  missedCallId: varchar("missed_call_id")
    .notNull()
    .references(() => missedCalls.id, { onDelete: "cascade" }),
  role: aiMessageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const leads = pgTable("leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => orgs.id),
  source: text("source").notNull().default("manual"),
  sourceDetail: text("source_detail"),
  status: text("status").notNull().default("new"),
  score: integer("score").notNull().default(0),
  scoreBreakdown: jsonb("score_breakdown"),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  serviceType: text("service_type"),
  description: text("description"),
  urgency: text("urgency").notNull().default("normal"),
  estimatedValue: numeric("estimated_value", { precision: 10, scale: 2 }),
  preferredContact: text("preferred_contact"),
  preferredTime: text("preferred_time"),
  consentToSms: boolean("consent_to_sms").notNull().default(false),
  consentSource: text("consent_source"),
  consentAt: timestamp("consent_at"),
  assignedUserId: varchar("assigned_user_id").references(() => users.id),
  customerId: varchar("customer_id").references(() => customers.id),
  jobId: varchar("job_id").references(() => jobs.id),
  quoteId: varchar("quote_id").references(() => quotes.id),
  invoiceId: varchar("invoice_id").references(() => invoices.id),
  missedCallId: varchar("missed_call_id").references(() => missedCalls.id),
  aiSummary: text("ai_summary"),
  aiQualification: jsonb("ai_qualification"),
  lastContactedAt: timestamp("last_contacted_at"),
  nextFollowUpAt: timestamp("next_follow_up_at"),
  convertedAt: timestamp("converted_at"),
  lostReason: text("lost_reason"),
  metadata: jsonb("metadata"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
}, (t) => [
  index("leads_org_status_created_idx").on(t.orgId, t.status, t.createdAt),
  index("leads_org_source_created_idx").on(t.orgId, t.source, t.createdAt),
  index("leads_org_followup_idx").on(t.orgId, t.nextFollowUpAt),
  index("leads_org_phone_idx").on(t.orgId, t.phone),
  index("leads_org_email_idx").on(t.orgId, t.email),
  index("leads_org_customer_idx").on(t.orgId, t.customerId),
  index("leads_org_job_idx").on(t.orgId, t.jobId),
  index("leads_org_missed_call_idx").on(t.orgId, t.missedCallId),
  uniqueIndex("leads_missed_call_unique_idx").on(t.missedCallId),
]);

export const leadActivities = pgTable("lead_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => orgs.id),
  leadId: varchar("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  channel: text("channel"),
  direction: text("direction"),
  subject: text("subject"),
  body: text("body"),
  status: text("status"),
  error: text("error"),
  metadata: jsonb("metadata"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("lead_activities_org_lead_created_idx").on(t.orgId, t.leadId, t.createdAt),
]);

export const leadCaptureForms = pgTable("lead_capture_forms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => orgs.id),
  name: text("name").notNull(),
  publicToken: text("public_token").notNull().unique(),
  sourceLabel: text("source_label").notNull().default("Website Form"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  defaultServiceType: text("default_service_type"),
  successMessage: text("success_message").notNull().default("Thanks. We received your request and will follow up shortly."),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("lead_capture_forms_org_idx").on(t.orgId),
  index("lead_capture_forms_token_idx").on(t.publicToken),
]);

export const leadFollowupTasks = pgTable("lead_followup_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => orgs.id),
  leadId: varchar("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  stepNumber: integer("step_number").notNull(),
  channel: text("channel").notNull(),
  dueAt: timestamp("due_at").notNull(),
  status: text("status").notNull().default("pending"),
  messageTemplate: text("message_template").notNull(),
  lastAttemptAt: timestamp("last_attempt_at"),
  completedAt: timestamp("completed_at"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("lead_followup_tasks_due_idx").on(t.status, t.dueAt),
  index("lead_followup_tasks_org_lead_idx").on(t.orgId, t.leadId),
]);

export const leadSourceEvents = pgTable("lead_source_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => orgs.id),
  captureFormId: varchar("capture_form_id").references(() => leadCaptureForms.id),
  adapterKey: text("adapter_key").notNull(),
  status: text("status").notNull(),
  leadId: varchar("lead_id").references(() => leads.id),
  error: text("error"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("lead_source_events_org_created_idx").on(t.orgId, t.createdAt),
  index("lead_source_events_org_adapter_idx").on(t.orgId, t.adapterKey),
  index("lead_source_events_capture_form_idx").on(t.captureFormId),
]);

export const leadSettings = pgTable("lead_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().unique().references(() => orgs.id),
  autoRespond: boolean("auto_respond").notNull().default(true),
  followUpEnabled: boolean("follow_up_enabled").notNull().default(true),
  hotLeadThreshold: integer("hot_lead_threshold").notNull().default(75),
  dryRun: boolean("dry_run").notNull().default(true),
  smsEnabled: boolean("sms_enabled").notNull().default(false),
  emailEnabled: boolean("email_enabled").notNull().default(false),
  defaultSmsTemplate: text("default_sms_template"),
  defaultEmailSubject: text("default_email_subject"),
  defaultEmailTemplate: text("default_email_template"),
  smsComplianceFooter: text("sms_compliance_footer"),
  notificationPhone: text("notification_phone"),
  notificationEmail: text("notification_email"),
  tradeTemplateKey: text("trade_template_key"),
  serviceArea: text("service_area"),
  leadSources: jsonb("lead_sources").$type<string[]>().default(sql`'[]'::jsonb`),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("lead_settings_org_idx").on(t.orgId),
]);

export const insertReviewRequestSchema = createInsertSchema(reviewRequests).omit({ id: true, sentAt: true });
export type ReviewRequest = typeof reviewRequests.$inferSelect;
export type InsertReviewRequest = z.infer<typeof insertReviewRequestSchema>;
export type ReviewRequestWithDetails = ReviewRequest & {
  jobTitle: string | null;
  customerName: string | null;
};

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

export type MissedCallStatus = "new" | "in_progress" | "recovered" | "failed" | "expired";
export type MissedCall = typeof missedCalls.$inferSelect;
export type InsertMissedCall = z.infer<typeof insertMissedCallSchema>;
export type AiMessage = typeof aiMessages.$inferSelect;
export type InsertAiMessage = z.infer<typeof insertAiMessageSchema>;

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  orgId: true,
  score: true,
  scoreBreakdown: true,
  customerId: true,
  jobId: true,
  quoteId: true,
  invoiceId: true,
  convertedAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export const insertLeadActivitySchema = createInsertSchema(leadActivities).omit({
  id: true,
  orgId: true,
  leadId: true,
  createdAt: true,
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type LeadActivity = typeof leadActivities.$inferSelect;
export type InsertLeadActivity = z.infer<typeof insertLeadActivitySchema>;

export const insertLeadCaptureFormSchema = createInsertSchema(leadCaptureForms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLeadFollowupTaskSchema = createInsertSchema(leadFollowupTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLeadSourceEventSchema = createInsertSchema(leadSourceEvents).omit({
  id: true,
  createdAt: true,
});

export const insertLeadSettingsSchema = createInsertSchema(leadSettings).omit({
  id: true,
  updatedAt: true,
});

export type LeadCaptureForm = typeof leadCaptureForms.$inferSelect;
export type InsertLeadCaptureForm = z.infer<typeof insertLeadCaptureFormSchema>;
export type LeadFollowupTask = typeof leadFollowupTasks.$inferSelect;
export type InsertLeadFollowupTask = z.infer<typeof insertLeadFollowupTaskSchema>;
export type LeadSourceEvent = typeof leadSourceEvents.$inferSelect;
export type InsertLeadSourceEvent = z.infer<typeof insertLeadSourceEventSchema>;
export type LeadSettings = typeof leadSettings.$inferSelect;
export type InsertLeadSettings = z.infer<typeof insertLeadSettingsSchema>;

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  fullName: true,
  phone: true,
  email: true,
  isSsoProvisioned: true,
  operatorosUserId: true,
  operatorosRole: true,
  operatorosPlanSlug: true,
  operatorosOrganizationId: true,
});

export const insertOrgSchema = createInsertSchema(orgs).pick({
  name: true,
  slug: true,
  phone: true,
  email: true,
  address: true,
  operatorosOrganizationId: true,
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
  smsOptOut: true,
});

export const insertJobSchema = createInsertSchema(jobs).pick({
  customerId: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  scheduledStart: true,
  scheduledEnd: true,
  assignedUserIds: true,
  internalNotes: true,
  isRecurring: true,
  recurringFrequency: true,
  parentJobId: true,
  recurringSeriesId: true,
});

export const RECURRING_FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Bi-weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
};

export const insertQuoteSchema = createInsertSchema(quotes).pick({
  customerId: true,
  jobId: true,
  status: true,
  taxRate: true,
  discount: true,
  notes: true,
  expiresAt: true,
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
  recurringInterval: true,
  nextRunAt: true,
});

export const RECURRING_INTERVAL_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Bi-weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
};

export type RecurringInterval = "weekly" | "biweekly" | "monthly" | "quarterly" | "annually";

export function advanceRecurringDate(from: Date, interval: RecurringInterval): Date {
  const d = new Date(from);
  switch (interval) {
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "biweekly":
      d.setDate(d.getDate() + 14);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "annually":
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d;
}

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

export const JOB_PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  urgent: "Urgent",
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

export const orgAutomations = pgTable("org_automations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id")
    .notNull()
    .unique()
    .references(() => orgs.id),
  invoiceReminder: boolean("invoice_reminder").notNull().default(false),
  invoiceReminderDays: integer("invoice_reminder_days").array().notNull().default(sql`'{3,7,14}'::int[]`),
  quoteFollowUp: boolean("quote_follow_up").notNull().default(false),
  quoteFollowUpDays: integer("quote_follow_up_days").array().notNull().default(sql`'{3,5,7}'::int[]`),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const reminderLog = pgTable("reminder_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id")
    .notNull()
    .references(() => orgs.id),
  targetType: text("target_type").notNull(),
  targetId: varchar("target_id").notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  phoneNumber: text("phone_number").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("sent"),
  error: text("error"),
}, (t) => [
  index("reminder_log_org_target_sent_idx").on(t.orgId, t.targetType, t.targetId, t.sentAt),
]);

export const insertOrgAutomationsSchema = createInsertSchema(orgAutomations).omit({ id: true, updatedAt: true });
export type OrgAutomations = typeof orgAutomations.$inferSelect;
export type InsertOrgAutomations = z.infer<typeof insertOrgAutomationsSchema>;

export const insertReminderLogSchema = createInsertSchema(reminderLog).omit({ id: true, sentAt: true });
export type ReminderLog = typeof reminderLog.$inferSelect;
export type InsertReminderLog = z.infer<typeof insertReminderLogSchema>;

export const processedStripeEvents = pgTable("processed_stripe_events", {
  eventId: text("event_id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
});

export type ProcessedStripeEvent = typeof processedStripeEvents.$inferSelect;

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
