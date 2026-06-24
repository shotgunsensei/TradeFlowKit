import type {
  User,
  InsertUser,
  Org,
  InsertOrg,
  Membership,
  Customer,
  InsertCustomer,
  Job,
  InsertJob,
  JobEvent,
  Quote,
  QuoteItem,
  Invoice,
  InvoiceItem,
  InviteCode,
  MissedCall,
  AiMessage,
  CallRecoverySubscription,
  CallRecoveryPlan,
  ReviewRequest,
  ReviewRequestWithDetails,
  OrgAutomations,
  ReminderLog,
  UserRecoveryCode,
  AuditLogEntry,
  Lead,
  InsertLead,
  LeadActivity,
  InsertLeadActivity,
  LeadCaptureForm,
  InsertLeadCaptureForm,
  LeadFollowupTask,
  InsertLeadFollowupTask,
  LeadSettings,
  InsertLeadSettings,
  LeadSourceEvent,
  InsertLeadSourceEvent,
} from "@shared/schema";

import { usersStorage } from "./storage/users";
import { orgsStorage, membershipsStorage } from "./storage/orgs";
import { customersStorage } from "./storage/customers";
import { jobsStorage } from "./storage/jobs";
import { quotesStorage, type QuoteInput, type QuoteItemInput } from "./storage/quotes";
import { invoicesStorage, type InvoiceInput } from "./storage/invoices";
import { callRecoveryStorage } from "./storage/callRecovery";
import { reviewRequestsStorage } from "./storage/reviewRequests";
import { automationsStorage } from "./storage/automations";
import { billingStorage } from "./storage/billing";
import { auditStorage } from "./storage/audit";
import { dashboardStorage } from "./storage/dashboard";
import { leadsStorage, type LeadFilters, type LeadOperationalMetrics, type LeadStats } from "./storage/leads";

export type { QuoteInput, QuoteItemInput, InvoiceInput };
export type { LeadFilters, LeadOperationalMetrics, LeadStats };

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByOperatorosUserId(operatorosUserId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;

  createOrg(org: InsertOrg): Promise<Org>;
  getOrg(id: string): Promise<Org | undefined>;
  updateOrg(id: string, data: Partial<Org>): Promise<Org | undefined>;
  getUserOrgs(userId: string): Promise<Org[]>;
  getAllOrgs(): Promise<Org[]>;
  deleteOrg(id: string): Promise<void>;
  getOrgByStripeCustomerId(stripeCustomerId: string): Promise<Org | undefined>;
  getOrgByOperatorosOrganizationId(operatorosOrganizationId: string): Promise<Org | undefined>;
  getOrgByOperatorosTenantId(operatorosTenantId: string): Promise<Org | undefined>;

  createMembership(orgId: string, userId: string, role: string): Promise<Membership>;
  getMembership(orgId: string, userId: string): Promise<Membership | undefined>;
  getOrgMemberships(orgId: string): Promise<Membership[]>;
  deleteMembership(orgId: string, userId: string): Promise<void>;
  updateMembershipRole(orgId: string, userId: string, role: string): Promise<void>;
  updateMembershipEntitlements(
    orgId: string,
    userId: string,
    data: {
      operatorosUserId?: string | null;
      tenantRole?: string | null;
      moduleRole?: string | null;
      enabled?: boolean;
      userEntitlementSnapshot?: unknown;
      lastSsoLoginAt?: Date;
      role?: string;
    },
  ): Promise<void>;

  createInviteCode(orgId: string, role: string, createdBy: string): Promise<InviteCode>;
  getInviteCodeByCode(code: string): Promise<InviteCode | undefined>;
  getOrgInviteCodes(orgId: string): Promise<InviteCode[]>;

  getCustomers(orgId: string, search?: string): Promise<Customer[]>;
  getCustomer(orgId: string, id: string): Promise<Customer | undefined>;
  createCustomer(orgId: string, data: InsertCustomer): Promise<Customer>;
  updateCustomer(orgId: string, id: string, data: Partial<Customer>): Promise<Customer | undefined>;
  deleteCustomer(orgId: string, id: string): Promise<void>;

  getJobs(orgId: string, recurringOnly?: boolean): Promise<(Job & { customerName?: string })[]>;
  getJob(orgId: string, id: string): Promise<(Job & { customerName?: string }) | undefined>;
  getCustomerJobs(orgId: string, customerId: string): Promise<Job[]>;
  createJob(orgId: string, data: InsertJob, createdBy: string | null): Promise<Job>;
  updateJob(orgId: string, id: string, data: Partial<Job>): Promise<Job | undefined>;
  deleteJob(orgId: string, id: string): Promise<void>;

  getJobEvents(orgId: string, jobId: string): Promise<JobEvent[]>;
  createJobEvent(orgId: string, jobId: string, type: string, payload: Record<string, unknown> | null, createdBy: string | null): Promise<JobEvent>;

  getQuotes(orgId: string): Promise<(Quote & { customerName?: string; total?: number })[]>;
  getQuote(orgId: string, id: string): Promise<(Quote & { items?: QuoteItem[]; customerName?: string; customer?: Customer }) | undefined>;
  getQuotePublic(id: string): Promise<(Quote & { items?: QuoteItem[]; customerName?: string; customer?: Customer; org?: Org }) | undefined>;
  createQuote(orgId: string, data: QuoteInput, createdBy: string): Promise<Quote>;
  updateQuote(orgId: string, id: string, data: Partial<QuoteInput>): Promise<Quote | undefined>;
  deleteQuote(orgId: string, id: string): Promise<void>;

  getInvoices(orgId: string): Promise<(Invoice & { customerName?: string; total?: number })[]>;
  getInvoice(orgId: string, id: string): Promise<(Invoice & { items?: InvoiceItem[]; customerName?: string; customer?: Customer }) | undefined>;
  getInvoicePublic(id: string): Promise<(Invoice & { items?: InvoiceItem[]; customerName?: string; customer?: Customer; org?: Org }) | undefined>;
  getCustomerInvoices(orgId: string, customerId: string): Promise<Invoice[]>;
  createInvoice(orgId: string, data: InvoiceInput, createdBy: string): Promise<Invoice>;
  updateInvoice(orgId: string, id: string, data: Partial<InvoiceInput>): Promise<Invoice | undefined>;
  deleteInvoice(orgId: string, id: string): Promise<void>;

  getInvoicesDueForRecurring(now: Date): Promise<Invoice[]>;
  generateInvoiceFromTemplate(templateId: string): Promise<Invoice | undefined>;
  convertQuoteToInvoice(orgId: string, quoteId: string, createdBy: string): Promise<Invoice | undefined>;
  getInvoiceByStripePaymentIntentId(paymentIntentId: string): Promise<Invoice | undefined>;

  getCustomerByPortalToken(token: string): Promise<Customer | undefined>;
  getCustomerPortalData(customerId: string): Promise<{
    customer: Customer;
    org: Org | undefined;
    quotes: (Quote & { total: number })[];
    invoices: (Invoice & { total: number })[];
    recentJobs: Job[];
  } | undefined>;

  getDashboardStats(orgId: string): Promise<Record<string, unknown>>;

  getOrgCounts(orgId: string): Promise<{ customers: number; jobs: number; quotes: number; invoices: number; members: number }>;

  deleteUser(userId: string): Promise<void>;

  getLeads(orgId: string, filters?: LeadFilters): Promise<Lead[]>;
  getLead(orgId: string, id: string): Promise<Lead | undefined>;
  getLeadByMissedCall(orgId: string, missedCallId: string): Promise<Lead | undefined>;
  createLead(orgId: string, data: InsertLead & { score?: number; scoreBreakdown?: unknown }, createdBy?: string | null): Promise<Lead>;
  updateLead(orgId: string, id: string, data: Partial<Lead>): Promise<Lead | undefined>;
  softDeleteLead(orgId: string, id: string): Promise<void>;
  getLeadActivities(orgId: string, leadId: string): Promise<LeadActivity[]>;
  createLeadActivity(orgId: string, leadId: string, data: InsertLeadActivity): Promise<LeadActivity>;
  getLeadStats(orgId: string): Promise<LeadStats>;
  getLeadOperationalMetrics(orgId: string): Promise<LeadOperationalMetrics>;
  convertLeadToCustomerAndJob(orgId: string, leadId: string, options?: { createdBy?: string | null }): Promise<{ lead: Lead; customer: Customer; job: Job }>;
  getLeadCaptureForms(orgId: string): Promise<LeadCaptureForm[]>;
  getLeadCaptureFormByToken(publicToken: string): Promise<LeadCaptureForm | undefined>;
  createLeadCaptureForm(orgId: string, data?: Partial<InsertLeadCaptureForm>): Promise<LeadCaptureForm>;
  updateLeadCaptureForm(orgId: string, id: string, data: Partial<LeadCaptureForm>): Promise<LeadCaptureForm | undefined>;
  ensureDefaultLeadCaptureForm(orgId: string): Promise<LeadCaptureForm>;
  getLeadSettings(orgId: string): Promise<LeadSettings | undefined>;
  upsertLeadSettings(orgId: string, data: Partial<InsertLeadSettings>): Promise<LeadSettings>;
  createLeadFollowupTask(orgId: string, leadId: string, data: Omit<InsertLeadFollowupTask, "orgId" | "leadId">): Promise<LeadFollowupTask>;
  getLeadFollowupTasks(orgId: string, leadId: string): Promise<LeadFollowupTask[]>;
  getDueLeadFollowupTasks(now: Date, limit?: number): Promise<LeadFollowupTask[]>;
  updateLeadFollowupTask(orgId: string, id: string, data: Partial<LeadFollowupTask>): Promise<LeadFollowupTask | undefined>;
  createLeadSourceEvent(orgId: string, data: Omit<InsertLeadSourceEvent, "orgId">): Promise<LeadSourceEvent>;
  getLeadSourceEvents(orgId: string, limit?: number): Promise<LeadSourceEvent[]>;

  createMissedCall(orgId: string, data: { callerPhone: string; callerName?: string; twilioCallSid?: string }): Promise<MissedCall>;
  getMissedCall(id: string): Promise<MissedCall | undefined>;
  getMissedCallByPhone(orgId: string, phone: string): Promise<MissedCall | undefined>;
  getMissedCalls(orgId: string, limit?: number, offset?: number): Promise<MissedCall[]>;
  updateMissedCall(id: string, data: Partial<MissedCall>): Promise<MissedCall | undefined>;
  getMissedCallCount(orgId: string, since: Date): Promise<number>;

  createAiMessage(missedCallId: string, role: "system" | "assistant" | "user", content: string): Promise<AiMessage>;
  getAiMessages(missedCallId: string): Promise<AiMessage[]>;

  getOrgByCallRecoveryPhone(phone: string): Promise<Org | undefined>;
  findMissedCallByCallerPhone(phone: string): Promise<(MissedCall & { orgId: string }) | undefined>;

  createCallRecoverySubscription(data: {
    orgId: string;
    plan: CallRecoveryPlan;
    stripeSubscriptionId?: string;
    stripeCustomerId?: string;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
  }): Promise<CallRecoverySubscription>;
  getCallRecoverySubscription(orgId: string): Promise<CallRecoverySubscription | undefined>;
  updateCallRecoverySubscription(id: string, data: Partial<CallRecoverySubscription>): Promise<CallRecoverySubscription | undefined>;
  incrementCallRecoveryUsage(orgId: string): Promise<void>;

  createReviewRequest(data: { orgId: string; jobId: string; customerId: string | null; phoneNumber: string; reviewUrl: string }): Promise<ReviewRequest>;
  getReviewRequestByJobId(orgId: string, jobId: string): Promise<ReviewRequest | undefined>;
  getReviewRequestCountThisMonth(orgId: string): Promise<number>;
  getReviewRequests(orgId: string, opts: { limit: number; offset: number; sort?: "asc" | "desc"; from?: Date; to?: Date }): Promise<{ items: ReviewRequestWithDetails[]; total: number }>;

  getOrgAutomations(orgId: string): Promise<OrgAutomations | undefined>;
  upsertOrgAutomations(orgId: string, data: Partial<OrgAutomations>): Promise<OrgAutomations>;

  createReminderLog(data: { orgId: string; targetType: string; targetId: string; phoneNumber: string; message: string; status?: string; error?: string }): Promise<ReminderLog>;
  getReminderLogs(orgId: string, targetType?: string, targetId?: string): Promise<ReminderLog[]>;
  getCustomerReminderLogs(orgId: string, customerId: string): Promise<ReminderLog[]>;
  getRecentReminderLog(orgId: string, targetType: string, targetId: string, since: Date): Promise<ReminderLog | undefined>;
  getAllOrgsWithAutomations(): Promise<(OrgAutomations & { org: Org })[]>;

  recordProcessedStripeEvent(eventId: string, type: string): Promise<boolean>;
  deleteProcessedStripeEvent(eventId: string): Promise<void>;

  bulkDeleteCustomers(orgId: string, ids: string[]): Promise<number>;
  bulkRestoreCustomers(orgId: string, ids: string[]): Promise<number>;
  getDeletedCustomers(orgId: string): Promise<Customer[]>;
  hardDeleteCustomer(orgId: string, id: string): Promise<boolean>;
  bulkDeleteJobs(orgId: string, ids: string[]): Promise<number>;
  bulkRestoreJobs(orgId: string, ids: string[]): Promise<number>;
  getDeletedJobs(orgId: string): Promise<(Job & { customerName?: string })[]>;
  hardDeleteJob(orgId: string, id: string): Promise<boolean>;
  bulkUpdateJobStatus(orgId: string, ids: string[], status: string, userId: string | null): Promise<number>;
  bulkDeleteInvoices(orgId: string, ids: string[]): Promise<number>;
  bulkRestoreInvoices(orgId: string, ids: string[]): Promise<number>;
  getDeletedInvoices(orgId: string): Promise<(Invoice & { customerName?: string; total?: number })[]>;
  hardDeleteInvoice(orgId: string, id: string): Promise<boolean>;
  bulkMarkInvoicesPaid(orgId: string, ids: string[]): Promise<number>;

  purgeSoftDeletedCustomers(cutoff: Date): Promise<number>;
  purgeSoftDeletedJobs(cutoff: Date): Promise<number>;
  purgeSoftDeletedInvoices(cutoff: Date): Promise<number>;

  setUserTotpSecret(userId: string, secret: string): Promise<void>;
  enableUserTotp(userId: string): Promise<void>;
  disableUserTotp(userId: string): Promise<void>;
  replaceRecoveryCodes(userId: string, hashes: string[]): Promise<void>;
  getActiveRecoveryCodes(userId: string): Promise<UserRecoveryCode[]>;
  markRecoveryCodeUsed(id: string): Promise<void>;
  recordAudit(entry: {
    orgId: string;
    userId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    before?: any;
    after?: any;
  }): Promise<void>;
  getAuditLog(orgId: string, opts: { limit: number; offset: number; entity?: string; action?: string; userId?: string; from?: Date; to?: Date }): Promise<{ items: (AuditLogEntry & { userName: string | null; userUsername: string | null })[]; total: number }>;
  getAuditLogForExport(orgId: string, opts: { entity?: string; action?: string; userId?: string; from?: Date; to?: Date }): Promise<(AuditLogEntry & { userName: string | null; userUsername: string | null })[]>;

  getLeads(orgId: string, filters?: LeadFilters): Promise<Lead[]>;
  getLead(orgId: string, id: string): Promise<Lead | undefined>;
  getLeadByMissedCall(orgId: string, missedCallId: string): Promise<Lead | undefined>;
  createLead(orgId: string, data: InsertLead & { score?: number; scoreBreakdown?: unknown }, createdBy?: string | null): Promise<Lead>;
  updateLead(orgId: string, id: string, data: Partial<Lead>): Promise<Lead | undefined>;
  softDeleteLead(orgId: string, id: string): Promise<void>;
  getLeadActivities(orgId: string, leadId: string): Promise<LeadActivity[]>;
  createLeadActivity(orgId: string, leadId: string, data: InsertLeadActivity): Promise<LeadActivity>;
  getLeadStats(orgId: string): Promise<LeadStats>;
  convertLeadToCustomerAndJob(orgId: string, leadId: string, options?: { createdBy?: string | null }): Promise<{ lead: Lead; customer: Customer; job: Job }>;
  getLeadCaptureForms(orgId: string): Promise<LeadCaptureForm[]>;
  getLeadCaptureFormByToken(publicToken: string): Promise<LeadCaptureForm | undefined>;
  createLeadCaptureForm(orgId: string, data?: Partial<InsertLeadCaptureForm>): Promise<LeadCaptureForm>;
  updateLeadCaptureForm(orgId: string, id: string, data: Partial<LeadCaptureForm>): Promise<LeadCaptureForm | undefined>;
  ensureDefaultLeadCaptureForm(orgId: string): Promise<LeadCaptureForm>;
  getLeadSettings(orgId: string): Promise<LeadSettings | undefined>;
  upsertLeadSettings(orgId: string, data: Partial<InsertLeadSettings>): Promise<LeadSettings>;
  createLeadFollowupTask(orgId: string, leadId: string, data: Omit<InsertLeadFollowupTask, "orgId" | "leadId">): Promise<LeadFollowupTask>;
  getLeadFollowupTasks(orgId: string, leadId: string): Promise<LeadFollowupTask[]>;
  getDueLeadFollowupTasks(now: Date, limit?: number): Promise<LeadFollowupTask[]>;
  updateLeadFollowupTask(orgId: string, id: string, data: Partial<LeadFollowupTask>): Promise<LeadFollowupTask | undefined>;
}

export const storage: IStorage = {
  ...usersStorage,
  ...orgsStorage,
  ...membershipsStorage,
  ...customersStorage,
  ...jobsStorage,
  ...quotesStorage,
  ...invoicesStorage,
  ...callRecoveryStorage,
  ...reviewRequestsStorage,
  ...automationsStorage,
  ...billingStorage,
  ...auditStorage,
  ...dashboardStorage,
  ...leadsStorage,
} as IStorage;
