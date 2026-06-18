import { useState, useEffect, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronRight, Download, Lock, ScrollText, Search, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, ApiError } from "@/lib/queryClient";

function isFeatureGateError(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 403 &&
    !!err.data &&
    typeof err.data === "object" &&
    (err.data as { error?: string }).error === "feature_not_in_plan"
  );
}

interface AuditEntry {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  createdAt: string;
  userName: string | null;
  userUsername: string | null;
}

const ENTITY_OPTIONS = [
  { value: "customer", label: "Customer" },
  { value: "invoice", label: "Invoice" },
  { value: "job", label: "Job" },
  { value: "quote", label: "Quote" },
  { value: "organization", label: "Organization" },
  { value: "org", label: "Organization (SSO)" },
  { value: "membership", label: "Team membership" },
];

const ACTION_OPTIONS = [
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "paid", label: "Paid" },
  { value: "payment_failed", label: "Payment failed" },
  { value: "sso_auto_join", label: "SSO auto-join" },
  { value: "sso_auto_provision", label: "SSO auto-provision" },
  { value: "link_operatoros", label: "Link OperatorOS org" },
  { value: "unlink_operatoros", label: "Unlink OperatorOS org" },
];

const ALL = "__all__";

const SENSITIVE_FIELDS = new Set([
  "password",
  "passwordhash",
  "password_hash",
  "passwordsalt",
  "salt",
  "token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "sessiontoken",
  "session_token",
  "apikey",
  "api_key",
  "secret",
  "client_secret",
  "clientsecret",
  "recoverycodehash",
  "recovery_code_hash",
  "codehash",
  "code_hash",
  "totpsecret",
  "totp_secret",
  "stripecustomerid",
  "stripesubscriptionid",
]);

const COMMON_LABELS: Record<string, string> = {
  id: "ID",
  orgId: "Organization",
  org_id: "Organization",
  userId: "User",
  user_id: "User",
  createdAt: "Created",
  created_at: "Created",
  updatedAt: "Updated",
  updated_at: "Updated",
  deletedAt: "Deleted",
  deleted_at: "Deleted",
  notes: "Notes",
  status: "Status",
  name: "Name",
};

const ENTITY_FIELD_LABELS: Record<string, Record<string, string>> = {
  customer: {
    fullName: "Full name",
    full_name: "Full name",
    firstName: "First name",
    first_name: "First name",
    lastName: "Last name",
    last_name: "Last name",
    email: "Email",
    phone: "Phone",
    address: "Address",
    city: "City",
    state: "State",
    zip: "ZIP code",
    postalCode: "Postal code",
    postal_code: "Postal code",
    company: "Company",
    tags: "Tags",
  },
  job: {
    title: "Title",
    description: "Description",
    customerId: "Customer",
    customer_id: "Customer",
    assignedTo: "Assigned to",
    assigned_to: "Assigned to",
    scheduledAt: "Scheduled for",
    scheduled_at: "Scheduled for",
    startedAt: "Started",
    started_at: "Started",
    completedAt: "Completed",
    completed_at: "Completed",
    priority: "Priority",
    address: "Address",
    recurring: "Recurring",
    recurringInterval: "Recurring interval",
    recurring_interval: "Recurring interval",
    recurringParentId: "Recurring parent",
    recurring_parent_id: "Recurring parent",
  },
  quote: {
    number: "Quote number",
    customerId: "Customer",
    customer_id: "Customer",
    jobId: "Job",
    job_id: "Job",
    subtotal: "Subtotal",
    tax: "Tax",
    taxRate: "Tax rate",
    tax_rate: "Tax rate",
    discount: "Discount",
    total: "Total",
    validUntil: "Valid until",
    valid_until: "Valid until",
    sentAt: "Sent",
    sent_at: "Sent",
    acceptedAt: "Accepted",
    accepted_at: "Accepted",
  },
  invoice: {
    number: "Invoice number",
    customerId: "Customer",
    customer_id: "Customer",
    jobId: "Job",
    job_id: "Job",
    quoteId: "Quote",
    quote_id: "Quote",
    subtotal: "Subtotal",
    tax: "Tax",
    taxRate: "Tax rate",
    tax_rate: "Tax rate",
    discount: "Discount",
    total: "Total",
    amountPaid: "Amount paid",
    amount_paid: "Amount paid",
    dueDate: "Due date",
    due_date: "Due date",
    sentAt: "Sent",
    sent_at: "Sent",
    paidAt: "Paid",
    paid_at: "Paid",
    stripePaymentIntentId: "Stripe payment",
    stripe_payment_intent_id: "Stripe payment",
  },
  membership: {
    userId: "User",
    user_id: "User",
    orgId: "Organization",
    org_id: "Organization",
    role: "Role",
    invitedBy: "Invited by",
    invited_by: "Invited by",
    acceptedAt: "Accepted",
    accepted_at: "Accepted",
  },
  organization: {
    name: "Name",
    slug: "URL slug",
    logoUrl: "Logo URL",
    logo_url: "Logo URL",
    website: "Website",
    businessHours: "Business hours",
    business_hours: "Business hours",
    phone: "Phone",
    email: "Email",
    address: "Address",
    plan: "Plan",
    planSlug: "Plan",
    plan_slug: "Plan",
    subscriptionStatus: "Subscription status",
    subscription_status: "Subscription status",
    smsRemindersEnabled: "SMS reminders enabled",
    sms_reminders_enabled: "SMS reminders enabled",
    overdueReminderDays: "Overdue reminder days",
    overdue_reminder_days: "Overdue reminder days",
    pendingQuoteReminderDays: "Pending quote reminder days",
    pending_quote_reminder_days: "Pending quote reminder days",
    callRecoveryEnabled: "Call recovery enabled",
    call_recovery_enabled: "Call recovery enabled",
    callRecoveryMessage: "Call recovery message",
    call_recovery_message: "Call recovery message",
    quietHoursStart: "Quiet hours start",
    quiet_hours_start: "Quiet hours start",
    quietHoursEnd: "Quiet hours end",
    quiet_hours_end: "Quiet hours end",
  },
  org: {
    name: "Name",
    operatorosOrgId: "OperatorOS organization",
    operatoros_org_id: "OperatorOS organization",
  },
};

function fieldLabel(entity: string, key: string): string {
  const entityMap = ENTITY_FIELD_LABELS[entity?.toLowerCase()];
  return entityMap?.[key] ?? COMMON_LABELS[key] ?? key;
}

function isSensitive(key: string): boolean {
  const k = key.toLowerCase();
  if (SENSITIVE_FIELDS.has(k)) return true;
  return /password|secret|token|apikey|api_key|hash/.test(k);
}

function sanitizeValue(v: any): any {
  if (v == null) return v;
  if (Array.isArray(v)) return v.map(sanitizeValue);
  if (typeof v === "object") {
    const out: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) {
      if (isSensitive(k)) continue;
      out[k] = sanitizeValue(val);
    }
    return out;
  }
  return v;
}

function sanitize(obj: Record<string, any> | null | undefined): Record<string, any> {
  if (!obj || typeof obj !== "object") return {};
  const result = sanitizeValue(obj);
  return (result && typeof result === "object" && !Array.isArray(result)) ? result : {};
}

function formatValue(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function valuesEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

interface DiffField {
  key: string;
  before: any;
  after: any;
}

function computeDiff(before: Record<string, any>, after: Record<string, any>): DiffField[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diffs: DiffField[] = [];
  for (const key of keys) {
    if (!valuesEqual(before[key], after[key])) {
      diffs.push({ key, before: before[key], after: after[key] });
    }
  }
  return diffs.sort((a, b) => a.key.localeCompare(b.key));
}

function AuditDetail({ entry }: { entry: AuditEntry }) {
  const before = sanitize(entry.before);
  const after = sanitize(entry.after);
  const action = entry.action.toLowerCase();
  const isCreate = !entry.before && !!entry.after;
  const isDelete = !!entry.before && !entry.after;
  const explicitCreate = /create|insert|add/.test(action);
  const explicitDelete = /delete|remove/.test(action);

  if (isCreate || (explicitCreate && Object.keys(after).length > 0 && Object.keys(before).length === 0)) {
    const entries = Object.entries(after);
    if (entries.length === 0) {
      return <p className="text-xs text-muted-foreground">No additional details recorded.</p>;
    }
    return (
      <div data-testid={`audit-detail-create-${entry.id}`}>
        <p className="text-xs font-medium mb-2">New {entry.entity} record:</p>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
          {entries.map(([k, v]) => (
            <Fragment key={k}>
              <dt className="text-muted-foreground">{fieldLabel(entry.entity, k)}</dt>
              <dd className="font-mono break-all">{formatValue(v)}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
    );
  }

  if (isDelete || (explicitDelete && Object.keys(before).length > 0 && Object.keys(after).length === 0)) {
    const entries = Object.entries(before);
    if (entries.length === 0) {
      return <p className="text-xs text-muted-foreground">No additional details recorded.</p>;
    }
    return (
      <div data-testid={`audit-detail-delete-${entry.id}`}>
        <p className="text-xs font-medium mb-2">Deleted {entry.entity} record:</p>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
          {entries.map(([k, v]) => (
            <Fragment key={k}>
              <dt className="text-muted-foreground">{fieldLabel(entry.entity, k)}</dt>
              <dd className="font-mono break-all line-through opacity-70">{formatValue(v)}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
    );
  }

  const diffs = computeDiff(before, after);
  if (diffs.length === 0) {
    return <p className="text-xs text-muted-foreground" data-testid={`audit-detail-empty-${entry.id}`}>No field changes recorded.</p>;
  }
  return (
    <div data-testid={`audit-detail-diff-${entry.id}`}>
      <p className="text-xs font-medium mb-2">Changed fields:</p>
      <div className="grid grid-cols-[max-content_1fr_1fr] gap-x-4 gap-y-1 text-xs">
        <div className="font-medium text-muted-foreground">Field</div>
        <div className="font-medium text-muted-foreground">Before</div>
        <div className="font-medium text-muted-foreground">After</div>
        {diffs.map((d) => (
          <Fragment key={d.key}>
            <div>{fieldLabel(entry.entity, d.key)}</div>
            <div className="font-mono break-all text-red-700 dark:text-red-400">{formatValue(d.before)}</div>
            <div className="font-mono break-all text-green-700 dark:text-green-400">{formatValue(d.after)}</div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

const FILTER_STORAGE_KEY = "audit-log-filters-v1";

interface PersistedFilters {
  entity?: string;
  action?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  activePreset?: string | null;
}

function loadPersistedFilters(): PersistedFilters {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // ignore
  }
  return {};
}

export default function AuditTab({ plan }: { plan: string }) {
  const isEnterprise = plan === "enterprise";
  const persisted = loadPersistedFilters();
  const [limit, setLimit] = useState(50);
  const [entity, setEntity] = useState<string>(persisted.entity ?? ALL);
  const [action, setAction] = useState<string>(persisted.action ?? ALL);
  const [fromDate, setFromDate] = useState<string>(persisted.fromDate ?? "");
  const [toDate, setToDate] = useState<string>(persisted.toDate ?? "");
  const [search, setSearch] = useState<string>(persisted.search ?? "");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const dateRangeInvalid = !!fromDate && !!toDate && fromDate > toDate;

  const toIsoDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const DATE_PRESETS: { value: string; label: string; range: () => { from: string; to: string } }[] = [
    {
      value: "today",
      label: "Today",
      range: () => { const t = toIsoDate(new Date()); return { from: t, to: t }; },
    },
    {
      value: "yesterday",
      label: "Yesterday",
      range: () => { const d = new Date(); d.setDate(d.getDate() - 1); const t = toIsoDate(d); return { from: t, to: t }; },
    },
    {
      value: "last7",
      label: "Last 7 days",
      range: () => { const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 6); return { from: toIsoDate(from), to: toIsoDate(to) }; },
    },
    {
      value: "last30",
      label: "Last 30 days",
      range: () => { const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 29); return { from: toIsoDate(from), to: toIsoDate(to) }; },
    },
    {
      value: "this_month",
      label: "This month",
      range: () => { const now = new Date(); const from = new Date(now.getFullYear(), now.getMonth(), 1); return { from: toIsoDate(from), to: toIsoDate(now) }; },
    },
  ];

  const [activePreset, setActivePreset] = useState<string | null>(persisted.activePreset ?? null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const hasAny = entity !== ALL || action !== ALL || !!fromDate || !!toDate || !!activePreset || search.trim() !== "";
      if (hasAny) {
        window.localStorage.setItem(
          FILTER_STORAGE_KEY,
          JSON.stringify({ entity, action, fromDate, toDate, search, activePreset })
        );
      } else {
        window.localStorage.removeItem(FILTER_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }, [entity, action, fromDate, toDate, search, activePreset]);

  const applyPreset = (preset: typeof DATE_PRESETS[number]) => {
    const { from, to } = preset.range();
    setFromDate(from);
    setToDate(to);
    setActivePreset(preset.value);
    setLimit(50);
  };

  const params = new URLSearchParams({ limit: String(limit) });
  if (entity !== ALL) params.set("entity", entity);
  if (action !== ALL) params.set("action", action);
  if (fromDate && !dateRangeInvalid) {
    params.set("from", new Date(fromDate + "T00:00:00").toISOString());
  }
  if (toDate && !dateRangeInvalid) {
    params.set("to", new Date(toDate + "T23:59:59.999").toISOString());
  }

  const exportCsv = async () => {
    setIsExporting(true);
    try {
      const exportParams = new URLSearchParams();
      if (entity !== ALL) exportParams.set("entity", entity);
      if (action !== ALL) exportParams.set("action", action);
      const qs = exportParams.toString();
      const res = await apiRequest("GET", `/api/audit-log/export.csv${qs ? `?${qs}` : ""}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      link.download = `audit-log-${stamp}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      if (!isFeatureGateError(err)) {
        const message = err instanceof Error ? err.message : "Could not export audit log.";
        toast({ title: "Export failed", description: message, variant: "destructive" });
      }
    } finally {
      setIsExporting(false);
    }
  };

  const { data, isLoading } = useQuery<{ items: AuditEntry[]; total: number }>({
    queryKey: ["/api/audit-log", limit, entity, action, fromDate, toDate],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/audit-log?${params.toString()}`);
      return res.json();
    },
    enabled: isEnterprise && !dateRangeInvalid,
  });

  const hasActiveFilters = entity !== ALL || action !== ALL || !!fromDate || !!toDate || search.trim() !== "";
  const clearFilters = () => {
    setEntity(ALL);
    setAction(ALL);
    setFromDate("");
    setToDate("");
    setActivePreset(null);
    setSearch("");
    setLimit(50);
  };

  const searchTerm = search.trim().toLowerCase();
  const matchesSearch = (entry: AuditEntry): boolean => {
    if (!searchTerm) return true;
    const before = sanitize(entry.before);
    const after = sanitize(entry.after);
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      if (key.toLowerCase().includes(searchTerm)) return true;
      const b = before[key];
      const a = after[key];
      if (b !== undefined && formatValue(b).toLowerCase().includes(searchTerm)) return true;
      if (a !== undefined && formatValue(a).toLowerCase().includes(searchTerm)) return true;
    }
    return false;
  };

  const filteredItems = data?.items.filter(matchesSearch) ?? [];

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (!isEnterprise) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ScrollText className="h-4 w-4" /> Audit log
          </CardTitle>
          <CardDescription>Track every change in your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-5 text-center space-y-3" data-testid="audit-locked">
            <Lock className="h-5 w-5 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">Audit log access is an Enterprise feature.</p>
            <p className="text-xs text-muted-foreground">Activity is being recorded — upgrade to view it here.</p>
            <a href="/subscription">
              <Button size="sm" data-testid="button-upgrade-for-audit">Upgrade Plan</Button>
            </a>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ScrollText className="h-4 w-4" /> Audit log
        </CardTitle>
        <CardDescription>Recent changes recorded across your organization. Click a row to see what changed.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div className="space-y-1">
            <Label htmlFor="audit-filter-entity" className="text-xs">Entity</Label>
            <Select
              value={entity}
              onValueChange={(v) => { setEntity(v); setLimit(50); }}
            >
              <SelectTrigger id="audit-filter-entity" className="h-8 w-[180px]" data-testid="select-audit-entity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL} data-testid="option-audit-entity-all">All entities</SelectItem>
                {ENTITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} data-testid={`option-audit-entity-${o.value}`}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-filter-action" className="text-xs">Action</Label>
            <Select
              value={action}
              onValueChange={(v) => { setAction(v); setLimit(50); }}
            >
              <SelectTrigger id="audit-filter-action" className="h-8 w-[180px]" data-testid="select-audit-action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL} data-testid="option-audit-action-all">All actions</SelectItem>
                {ACTION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} data-testid={`option-audit-action-${o.value}`}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-filter-from" className="text-xs">From</Label>
            <Input
              id="audit-filter-from"
              type="date"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setActivePreset(null); setLimit(50); }}
              max={toDate || undefined}
              className="h-8 w-[160px]"
              data-testid="input-audit-from"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-filter-to" className="text-xs">To</Label>
            <Input
              id="audit-filter-to"
              type="date"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setActivePreset(null); setLimit(50); }}
              min={fromDate || undefined}
              className="h-8 w-[160px]"
              data-testid="input-audit-to"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Quick range</Label>
            <div className="flex flex-wrap gap-1" data-testid="audit-date-presets">
              {DATE_PRESETS.map((preset) => (
                <Button
                  key={preset.value}
                  type="button"
                  size="sm"
                  variant={activePreset === preset.value ? "default" : "outline"}
                  onClick={() => applyPreset(preset)}
                  className="h-8"
                  data-testid={`button-audit-preset-${preset.value}`}
                  aria-pressed={activePreset === preset.value}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1 flex-1 min-w-[200px] max-w-xs">
            <Label htmlFor="audit-filter-search" className="text-xs">Search changes</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                id="audit-filter-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Field name or value..."
                className="h-8 pl-7"
                data-testid="input-audit-search"
              />
            </div>
          </div>
          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-8"
              data-testid="button-clear-audit-filters"
            >
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          )}
          <div className="ml-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={isExporting || !data || data.total === 0}
              className="h-8"
              data-testid="button-export-audit-csv"
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              {isExporting ? "Exporting..." : "Export CSV"}
            </Button>
          </div>
        </div>
        {dateRangeInvalid && (
          <p className="text-xs text-destructive mb-3" data-testid="text-audit-date-error">
            "From" date must be on or before "To" date.
          </p>
        )}
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
        ) : !data || filteredItems.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-audit-empty">
            {hasActiveFilters ? "No activity matches these filters." : "No activity yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table data-testid="table-audit">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((row) => {
                  const isOpen = expanded.has(row.id);
                  return (
                    <Fragment key={row.id}>
                      <TableRow
                        data-testid={`row-audit-${row.id}`}
                        className="cursor-pointer hover-elevate"
                        onClick={() => toggle(row.id)}
                        aria-expanded={isOpen}
                      >
                        <TableCell className="w-8">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={(e) => { e.stopPropagation(); toggle(row.id); }}
                            data-testid={`button-toggle-audit-${row.id}`}
                            aria-label={isOpen ? "Collapse" : "Expand"}
                          >
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</TableCell>
                        <TableCell className="text-xs">{row.userName || row.userUsername || <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{row.action}</Badge></TableCell>
                        <TableCell className="text-xs">{row.entity}</TableCell>
                        <TableCell className="font-mono text-xs">{row.entityId?.slice(0, 8) || "—"}</TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow data-testid={`row-audit-detail-${row.id}`}>
                          <TableCell></TableCell>
                          <TableCell colSpan={5} className="bg-muted/30">
                            <div className="py-2">
                              <AuditDetail entry={row} />
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-muted-foreground" data-testid="text-audit-count">
                {searchTerm
                  ? `Showing ${filteredItems.length} of ${data.items.length} loaded (${data.total} total)`
                  : `Showing ${filteredItems.length} of ${data.total}`}
              </p>
              {data.total > data.items.length && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLimit(Math.min(limit + 50, 200))}
                  disabled={limit >= 200}
                  data-testid="button-load-more-audit"
                >
                  {limit >= 200 ? "Max 200 shown" : "Load more"}
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
