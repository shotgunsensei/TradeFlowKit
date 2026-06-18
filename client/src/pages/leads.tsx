import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow, isThisMonth } from "date-fns";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Copy,
  DollarSign,
  ExternalLink,
  FileText,
  Flame,
  Globe2,
  KanbanSquare,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Target,
  UserCheck,
  UserPlus,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Lead, LeadActivity, LeadCaptureForm, LeadFollowupTask, LeadSettings } from "@shared/schema";

type LeadStats = {
  newLeads: number;
  hotLeads: number;
  needsFollowUp: number;
  converted: number;
  totalOpen: number;
};

type LeadSettingsResponse = {
  settings: LeadSettings;
  captureForm: LeadCaptureForm;
};

type ProviderStatus = {
  twilio: { configured: boolean };
  sendgrid: { configured: boolean };
  openai: { configured: boolean; mode: string };
};

type OperatorDashboard = {
  hotLeads: Lead[];
  needsContact?: Lead[];
  followUpsDueToday: Lead[];
  overdueFollowUps?: Lead[];
  recentlyCaptured: Lead[];
  recentlyConverted: Lead[];
  failedAttempts: Array<{
    id: string;
    leadId: string;
    leadName: string;
    channel: string | null;
    reason: string;
    createdAt: string | Date;
  }>;
};

type LeadForm = {
  name: string;
  phone: string;
  email: string;
  source: string;
  sourceDetail: string;
  serviceType: string;
  urgency: string;
  address: string;
  description: string;
  estimatedValue: string;
  preferredContact: string;
  preferredTime: string;
  consentToSms: boolean;
  nextFollowUpAt: string;
  status: string;
  lostReason: string;
  aiSummary: string;
};

const emptyForm: LeadForm = {
  name: "",
  phone: "",
  email: "",
  source: "manual",
  sourceDetail: "",
  serviceType: "",
  urgency: "normal",
  address: "",
  description: "",
  estimatedValue: "",
  preferredContact: "phone",
  preferredTime: "",
  consentToSms: false,
  nextFollowUpAt: "",
  status: "new",
  lostReason: "",
  aiSummary: "",
};

const statusOptions = ["new", "contacted", "qualified", "follow_up", "converted", "lost", "spam"];
const sourceOptions = ["manual", "website_form", "missed_call", "import"];
const urgencyOptions = ["low", "normal", "urgent", "emergency"];
const flowStages = [
  { key: "new", label: "Captured" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "follow_up", label: "Follow-Up" },
  { key: "converted", label: "Converted" },
];
const pipelineStages = [
  { key: "new", label: "Captured" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "follow_up", label: "Follow-Up" },
  { key: "converted", label: "Converted" },
  { key: "lost", label: "Lost" },
];

function labelize(value: string) {
  return value.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function money(value: number) {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function scoreColor(score: number) {
  if (score >= 85) return "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/30 dark:border-red-900";
  if (score >= 70) return "text-orange-700 bg-orange-50 border-orange-200 dark:text-orange-300 dark:bg-orange-950/30 dark:border-orange-900";
  if (score >= 40) return "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/30 dark:border-amber-900";
  return "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-900";
}

function scoreLabel(score: number) {
  if (score >= 85) return "Call Now";
  if (score >= 70) return "Hot";
  if (score >= 40) return "Warm";
  return "Low";
}

function stageIndex(status: string) {
  if (status === "converted") return 4;
  if (status === "follow_up") return 3;
  if (status === "qualified") return 2;
  if (status === "contacted") return 1;
  return 0;
}

function isClosedLead(lead: Lead) {
  return ["converted", "lost", "spam"].includes(lead.status);
}

function isOverdue(lead: Lead) {
  return !!lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() <= Date.now() && !["converted", "lost", "spam"].includes(lead.status);
}

function isDueToday(lead: Lead) {
  if (!lead.nextFollowUpAt || isClosedLead(lead)) return false;
  const due = new Date(lead.nextFollowUpAt);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return due >= start && due < end;
}

function hasResponse(lead: Lead) {
  const withOptionalFirstResponse = lead as Lead & { firstResponseAt?: string | Date | null };
  return !!(withOptionalFirstResponse.firstResponseAt || lead.lastContactedAt);
}

function needsContact(lead: Lead) {
  return lead.status === "new" && !hasResponse(lead) && !isClosedLead(lead);
}

function isDemoLead(lead: Lead) {
  return !!(lead.metadata && typeof lead.metadata === "object" && (lead.metadata as Record<string, unknown>).demoLeadSeed);
}

function pipelineStageForLead(lead: Lead) {
  if (lead.status === "lost" || lead.status === "spam") return "lost";
  if (lead.status === "converted") return "converted";
  if (lead.quoteId || lead.invoiceId) return "qualified";
  if (lead.status === "follow_up") return "follow_up";
  if (lead.status === "qualified") return "qualified";
  if (lead.status === "contacted") return "contacted";
  return "new";
}

function firstResponseAt(lead: Lead, activities: LeadActivity[] = []) {
  const withOptionalFirstResponse = lead as Lead & { firstResponseAt?: string | Date | null };
  if (withOptionalFirstResponse.firstResponseAt) return new Date(withOptionalFirstResponse.firstResponseAt);
  if (lead.lastContactedAt) return new Date(lead.lastContactedAt);
  const firstOutbound = [...activities]
    .filter((activity) => activity.direction === "outbound" && (activity.channel === "sms" || activity.channel === "email"))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
  return firstOutbound ? new Date(firstOutbound.createdAt) : null;
}

function slaInfo(lead: Lead, activities: LeadActivity[] = []) {
  if (lead.status === "converted") {
    return {
      label: "Converted",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
      icon: CheckCircle2,
    };
  }
  if (lead.status === "lost" || lead.status === "spam") {
    return {
      label: lead.status === "spam" ? "Closed" : "Lost",
      className: "border-muted bg-muted/50 text-muted-foreground",
      icon: XCircle,
    };
  }
  if (isOverdue(lead)) {
    return {
      label: "Overdue",
      className: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",
      icon: AlertTriangle,
    };
  }
  if (isDueToday(lead)) {
    return {
      label: "Due today",
      className: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-300",
      icon: Clock,
    };
  }
  const respondedAt = firstResponseAt(lead, activities);
  if (!respondedAt) {
    return {
      label: "Not contacted",
      className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
      icon: Clock,
    };
  }
  const ageMs = respondedAt.getTime() - new Date(lead.createdAt).getTime();
  if (ageMs <= 60 * 1000) {
    return {
      label: "Fast response",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
      icon: CheckCircle2,
    };
  }
  if (ageMs <= 5 * 60 * 1000) {
    return {
      label: "Fast response",
      className: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300",
      icon: UserCheck,
    };
  }
  return {
    label: "Late response",
    className: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-300",
    icon: AlertTriangle,
  };
}

function activityDisplay(activity: LeadActivity) {
  const text = `${activity.type} ${activity.channel || ""} ${activity.subject || ""} ${activity.status || ""}`.toLowerCase();
  if (activity.error || activity.status === "failed") return { label: "Error", icon: XCircle, color: "text-red-600" };
  if (text.includes("conversion") || text.includes("convert")) return { label: "Customer and job created", icon: Target, color: "text-emerald-600" };
  if (text.includes("score")) return { label: "Score changed", icon: Flame, color: "text-amber-600" };
  if (text.includes("status")) return { label: "Status changed", icon: Activity, color: "text-sky-600" };
  if (text.includes("sms")) return { label: activity.status === "dry_run" ? "SMS prepared" : "SMS sent", icon: MessageSquare, color: "text-blue-600" };
  if (text.includes("email")) return { label: activity.status === "dry_run" ? "Email prepared" : "Email sent", icon: Mail, color: "text-indigo-600" };
  if (text.includes("completed")) return { label: "Follow-up completed", icon: CheckCircle2, color: "text-emerald-600" };
  if (text.includes("follow")) return { label: "Follow-up created", icon: Clock, color: "text-orange-600" };
  if (text.includes("ai")) return { label: "AI summary", icon: Bot, color: "text-purple-600" };
  if (text.includes("public") || text.includes("website") || text.includes("captured")) return { label: "Lead captured", icon: Globe2, color: "text-emerald-600" };
  if (text.includes("manual") || text.includes("created")) return { label: "Lead captured", icon: UserPlus, color: "text-primary" };
  if (text.includes("note")) return { label: "Manual note", icon: FileText, color: "text-muted-foreground" };
  return { label: activity.subject || labelize(activity.type), icon: Activity, color: "text-muted-foreground" };
}

function formFromLead(lead: Lead): LeadForm {
  return {
    name: lead.name || "",
    phone: lead.phone || "",
    email: lead.email || "",
    source: lead.source || "manual",
    sourceDetail: lead.sourceDetail || "",
    serviceType: lead.serviceType || "",
    urgency: lead.urgency || "normal",
    address: lead.address || "",
    description: lead.description || "",
    estimatedValue: lead.estimatedValue ? String(lead.estimatedValue) : "",
    preferredContact: lead.preferredContact || "phone",
    preferredTime: lead.preferredTime || "",
    consentToSms: !!lead.consentToSms,
    nextFollowUpAt: lead.nextFollowUpAt ? format(new Date(lead.nextFollowUpAt), "yyyy-MM-dd'T'HH:mm") : "",
    status: lead.status || "new",
    lostReason: lead.lostReason || "",
    aiSummary: lead.aiSummary || "",
  };
}

function payloadFromForm(form: LeadForm) {
  return {
    ...form,
    estimatedValue: form.estimatedValue || null,
    nextFollowUpAt: form.nextFollowUpAt || null,
  };
}

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold truncate">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function LeadSlaBadge({ lead, activities = [] }: { lead: Lead; activities?: LeadActivity[] }) {
  const info = slaInfo(lead, activities);
  const Icon = info.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${info.className}`}>
      <Icon className="h-3 w-3" />
      {info.label}
    </span>
  );
}

function LeadScoreBadge({ lead, breakdown }: { lead: Lead; breakdown?: Record<string, unknown> }) {
  const entries = breakdown ? Object.entries(breakdown).slice(0, 4) : [];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${scoreColor(lead.score)}`}>
          {lead.score}
          <span className="font-medium">{scoreLabel(lead.score)}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-1">
          <p className="font-medium">Lead score: {scoreLabel(lead.score)}</p>
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">No score breakdown recorded yet.</p>
          ) : (
            entries.map(([key, value]) => (
              <div key={key} className="flex justify-between gap-3 text-xs">
                <span>{labelize(key)}</span>
                <span className="font-medium">{String(value)}</span>
              </div>
            ))
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function LeadSummaryCard({
  lead,
  onOpen,
  onStatusChange,
  compact = false,
}: {
  lead: Lead;
  onOpen: (lead: Lead) => void;
  onStatusChange?: (lead: Lead, status: string) => void;
  compact?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-3 space-y-2 hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={() => onOpen(lead)} className="min-w-0 text-left">
          <p className="font-medium truncate">{lead.name}</p>
          <p className="text-xs text-muted-foreground truncate">{lead.serviceType || "Service not specified"}</p>
        </button>
        <LeadScoreBadge lead={lead} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {lead.phone && <Badge variant="outline" className="gap-1"><Phone className="h-3 w-3" />Phone</Badge>}
        {lead.email && <Badge variant="outline" className="gap-1"><Mail className="h-3 w-3" />Email</Badge>}
        <Badge variant="secondary">{labelize(lead.source)}</Badge>
        <Badge variant={lead.urgency === "urgent" || lead.urgency === "emergency" ? "destructive" : "outline"}>{labelize(lead.urgency)}</Badge>
      </div>

      <LeadSlaBadge lead={lead} />

      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div>
          <span className="block">Age</span>
          <span className="font-medium text-foreground">{formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}</span>
        </div>
        <div>
          <span className="block">Next follow-up</span>
          <span className="font-medium text-foreground">{lead.nextFollowUpAt ? format(new Date(lead.nextFollowUpAt), "MMM d, h:mm a") : "Not set"}</span>
        </div>
      </div>

      {!compact && (
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" variant="outline" className="h-8 flex-1" onClick={() => onOpen(lead)}>Open</Button>
          {onStatusChange && lead.status !== "converted" && (
            <Select value={lead.status} onValueChange={(value) => onStatusChange(lead, value)}>
              <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {statusOptions.filter((status) => status !== "spam").map((status) => (
                  <SelectItem key={status} value={status}>{labelize(status)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
    </div>
  );
}

function OperatorLeadCard({
  lead,
  actionLabel,
  onOpen,
  onMarkContacted,
  onScore,
  onSms,
  onConvert,
}: {
  lead: Lead;
  actionLabel: string;
  onOpen: (lead: Lead) => void;
  onMarkContacted: (lead: Lead) => void;
  onScore: (lead: Lead) => void;
  onSms: (lead: Lead) => void;
  onConvert: (lead: Lead) => void;
}) {
  const canConvert = lead.status === "qualified" || lead.status === "follow_up";
  return (
    <div className="rounded-lg border bg-card p-3 space-y-2 hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={() => onOpen(lead)} className="min-w-0 text-left">
          <p className="font-medium truncate">{lead.name}</p>
          <p className="text-xs text-muted-foreground truncate">{lead.serviceType || "Service not specified"}</p>
        </button>
        <LeadScoreBadge lead={lead} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary">{labelize(lead.source)}</Badge>
        <Badge variant={lead.urgency === "urgent" || lead.urgency === "emergency" ? "destructive" : "outline"}>{labelize(lead.urgency)}</Badge>
        {lead.phone && <Badge variant="outline" className="gap-1"><Phone className="h-3 w-3" />Phone</Badge>}
        {lead.email && <Badge variant="outline" className="gap-1"><Mail className="h-3 w-3" />Email</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div>
          <span className="block">Age</span>
          <span className="font-medium text-foreground">{formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}</span>
        </div>
        <div>
          <span className="block">Next follow-up</span>
          <span className="font-medium text-foreground">{lead.nextFollowUpAt ? format(new Date(lead.nextFollowUpAt), "MMM d, h:mm a") : "Not set"}</span>
        </div>
      </div>
      <LeadSlaBadge lead={lead} />
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button size="sm" className="h-8" onClick={() => onOpen(lead)}>{actionLabel}</Button>
        {needsContact(lead) ? (
          <Button size="sm" variant="outline" className="h-8" onClick={() => onMarkContacted(lead)}>Call Now</Button>
        ) : canConvert ? (
          <Button size="sm" variant="outline" className="h-8" onClick={() => onConvert(lead)}>Convert to Job</Button>
        ) : (
          <Button size="sm" variant="outline" className="h-8" onClick={() => onSms(lead)}>Follow Up</Button>
        )}
        <Button size="sm" variant="ghost" className="h-8" onClick={() => onScore(lead)}>Re-score</Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={() => onSms(lead)}>Message Prepared</Button>
      </div>
    </div>
  );
}

function OperatorList({
  title,
  icon: Icon,
  leads,
  empty,
  onOpen,
  onMarkContacted,
  onScore,
  onSms,
  onConvert,
  actionLabel = "Review Lead",
  loading = false,
  error = null,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  leads: Lead[];
  empty: string;
  onOpen: (lead: Lead) => void;
  onMarkContacted: (lead: Lead) => void;
  onScore: (lead: Lead) => void;
  onSms: (lead: Lead) => void;
  onConvert: (lead: Lead) => void;
  actionLabel?: string;
  loading?: boolean;
  error?: unknown;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <>
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
          </>
        ) : error ? (
          <p className="text-sm text-muted-foreground">This lead list is temporarily unavailable.</p>
        ) : leads.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          leads.slice(0, 4).map((lead) => (
            <OperatorLeadCard
              key={lead.id}
              lead={lead}
              actionLabel={actionLabel}
              onOpen={onOpen}
              onMarkContacted={onMarkContacted}
              onScore={onScore}
              onSms={onSms}
              onConvert={onConvert}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function LeadFlow({ status }: { status: string }) {
  if (status === "lost" || status === "spam") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
        <div className="flex items-center gap-2 text-sm font-medium">
          <XCircle className="h-4 w-4" />
          {status === "spam" ? "Not a real lead" : "Lead lost"}
        </div>
        <p className="mt-1 text-xs">This lead is closed and is no longer in the active follow-up pipeline.</p>
      </div>
    );
  }
  const active = stageIndex(status);
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {flowStages.map((stage, index) => {
        const complete = index <= active;
        return (
          <div key={stage.key} className="min-w-0">
            <div className={`h-2 rounded-full ${complete ? "bg-primary" : "bg-muted"}`} />
            <p className={`mt-1 text-[11px] truncate ${complete ? "font-medium text-foreground" : "text-muted-foreground"}`}>{stage.label}</p>
          </div>
        );
      })}
    </div>
  );
}

function LeadFields({ form, setForm }: { form: LeadForm; setForm: (next: LeadForm) => void }) {
  const update = (key: keyof LeadForm, value: string | boolean) => setForm({ ...form, [key]: value });
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={form.name} onChange={(e) => update("name", e.target.value)} data-testid="input-lead-name" />
        </div>
        <div className="space-y-1.5">
          <Label>Service Requested</Label>
          <Input value={form.serviceType} onChange={(e) => update("serviceType", e.target.value)} data-testid="input-lead-service" />
        </div>
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} data-testid="input-lead-phone" />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={form.email} onChange={(e) => update("email", e.target.value)} data-testid="input-lead-email" />
        </div>
        <div className="space-y-1.5">
          <Label>Source</Label>
          <Select value={form.source} onValueChange={(v) => update("source", v)}>
            <SelectTrigger data-testid="select-lead-source"><SelectValue /></SelectTrigger>
            <SelectContent>{sourceOptions.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Source Detail</Label>
          <Input value={form.sourceDetail} onChange={(e) => update("sourceDetail", e.target.value)} placeholder="Website form, referral, campaign..." />
        </div>
        <div className="space-y-1.5">
          <Label>Urgency</Label>
          <Select value={form.urgency} onValueChange={(v) => update("urgency", v)}>
            <SelectTrigger data-testid="select-lead-urgency"><SelectValue /></SelectTrigger>
            <SelectContent>{urgencyOptions.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Preferred Contact</Label>
          <Select value={form.preferredContact} onValueChange={(v) => update("preferredContact", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="phone">Phone</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="any">Any</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Estimated Value</Label>
          <Input value={form.estimatedValue} onChange={(e) => update("estimatedValue", e.target.value)} placeholder="0.00" />
        </div>
        <div className="space-y-1.5">
          <Label>Preferred Time</Label>
          <Input value={form.preferredTime} onChange={(e) => update("preferredTime", e.target.value)} placeholder="Morning, afternoon, after 5..." />
        </div>
        <div className="space-y-1.5">
          <Label>Next Follow-Up</Label>
          <Input type="datetime-local" value={form.nextFollowUpAt} onChange={(e) => update("nextFollowUpAt", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Address</Label>
        <Input value={form.address} onChange={(e) => update("address", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Request Details</Label>
        <Textarea value={form.description} onChange={(e) => update("description", e.target.value)} rows={4} data-testid="input-lead-description" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.consentToSms} onChange={(e) => update("consentToSms", e.target.checked)} />
        Customer consented to SMS follow-up
      </label>
    </div>
  );
}

export default function LeadsPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [hotOnly, setHotOnly] = useState(false);
  const [dueOnly, setDueOnly] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [createForm, setCreateForm] = useState<LeadForm>(emptyForm);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<LeadForm>(emptyForm);
  const [settingsForm, setSettingsForm] = useState({
    autoRespond: true,
    followUpEnabled: true,
    hotLeadThreshold: 75,
    dryRun: true,
    defaultSmsTemplate: "",
    defaultEmailSubject: "",
    defaultEmailTemplate: "",
    notificationPhone: "",
    notificationEmail: "",
  });
  const [captureForm, setCaptureForm] = useState({
    id: "",
    name: "Website Lead Form",
    sourceLabel: "Website Form",
    isEnabled: true,
    defaultServiceType: "",
    successMessage: "Thanks. We received your request and will follow up shortly.",
    publicToken: "",
  });

  const { data: allLeads = [], isLoading, error: leadsError } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { data: stats } = useQuery<LeadStats>({ queryKey: ["/api/leads/stats"] });
  const { data: leadSettings, error: settingsError } = useQuery<LeadSettingsResponse>({ queryKey: ["/api/leads/settings"] });
  const { data: providerStatus } = useQuery<ProviderStatus>({ queryKey: ["/api/leads/provider-status"] });
  const {
    data: operatorDashboard,
    isLoading: operatorDashboardLoading,
    error: operatorDashboardError,
  } = useQuery<OperatorDashboard>({ queryKey: ["/api/leads/operator-dashboard"] });
  const selectedLead = useMemo(() => allLeads.find((l) => l.id === selectedLeadId) || null, [allLeads, selectedLeadId]);
  const { data: activities = [], isLoading: activitiesLoading } = useQuery<LeadActivity[]>({
    queryKey: selectedLeadId ? [`/api/leads/${selectedLeadId}/activities`] : ["/api/leads/none/activities"],
    enabled: !!selectedLeadId,
  });
  const { data: followups = [], isLoading: followupsLoading } = useQuery<LeadFollowupTask[]>({
    queryKey: selectedLeadId ? [`/api/leads/${selectedLeadId}/followups`] : ["/api/leads/none/followups"],
    enabled: !!selectedLeadId,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") setShowCreate(true);
  }, []);

  useEffect(() => {
    if (!leadSettings) return;
    setSettingsForm({
      autoRespond: leadSettings.settings.autoRespond,
      followUpEnabled: leadSettings.settings.followUpEnabled,
      hotLeadThreshold: leadSettings.settings.hotLeadThreshold,
      dryRun: leadSettings.settings.dryRun,
      defaultSmsTemplate: leadSettings.settings.defaultSmsTemplate || "",
      defaultEmailSubject: leadSettings.settings.defaultEmailSubject || "",
      defaultEmailTemplate: leadSettings.settings.defaultEmailTemplate || "",
      notificationPhone: leadSettings.settings.notificationPhone || "",
      notificationEmail: leadSettings.settings.notificationEmail || "",
    });
    setCaptureForm({
      id: leadSettings.captureForm.id,
      name: leadSettings.captureForm.name,
      sourceLabel: leadSettings.captureForm.sourceLabel,
      isEnabled: leadSettings.captureForm.isEnabled,
      defaultServiceType: leadSettings.captureForm.defaultServiceType || "",
      successMessage: leadSettings.captureForm.successMessage,
      publicToken: leadSettings.captureForm.publicToken,
    });
  }, [leadSettings]);

  const leads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allLeads.filter((lead) => {
      if (statusFilter !== "all") {
        if (lead.status !== statusFilter && pipelineStageForLead(lead) !== statusFilter) {
          return false;
        }
      }
      if (sourceFilter !== "all" && lead.source !== sourceFilter) return false;
      if (urgencyFilter !== "all" && lead.urgency !== urgencyFilter) return false;
      if (hotOnly && lead.score < settingsForm.hotLeadThreshold) return false;
      if (dueOnly && !isDueToday(lead) && !isOverdue(lead)) return false;
      if (overdueOnly && !isOverdue(lead)) return false;
      if (!q) return true;
      return [lead.name, lead.phone, lead.email, lead.address, lead.serviceType, lead.description]
        .some((value) => (value || "").toLowerCase().includes(q));
    });
  }, [allLeads, dueOnly, hotOnly, overdueOnly, search, settingsForm.hotLeadThreshold, sourceFilter, statusFilter, urgencyFilter]);

  const pipelineCounts = useMemo(() => {
    return pipelineStages.map((stage) => ({
      ...stage,
      count: allLeads.filter((lead) => pipelineStageForLead(lead) === stage.key).length,
    }));
  }, [allLeads]);

  const convertedThisMonth = allLeads.filter((lead) => lead.convertedAt && isThisMonth(new Date(lead.convertedAt))).length;
  const pipelineValue = allLeads
    .filter((lead) => !["converted", "lost", "spam"].includes(lead.status))
    .reduce((sum, lead) => sum + Number(lead.estimatedValue || 0), 0);
  const hotThreshold = Math.max(70, settingsForm.hotLeadThreshold || 0);
  const activeLeads = allLeads.filter((lead) => !isClosedLead(lead));
  const hotOperatorLeads = [...activeLeads]
    .filter((lead) => lead.score >= hotThreshold)
    .sort((a, b) => b.score - a.score || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const needsContactLeads = [...activeLeads]
    .filter(needsContact)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const dueTodayLeads = [...activeLeads]
    .filter(isDueToday)
    .sort((a, b) => new Date(a.nextFollowUpAt || 0).getTime() - new Date(b.nextFollowUpAt || 0).getTime());
  const overdueLeads = [...activeLeads]
    .filter(isOverdue)
    .sort((a, b) => new Date(a.nextFollowUpAt || 0).getTime() - new Date(b.nextFollowUpAt || 0).getTime());
  const convertedOperatorLeads = (operatorDashboard?.recentlyConverted || allLeads.filter((lead) => lead.status === "converted" || lead.convertedAt))
    .slice(0, 6);
  const hasDemoData = allLeads.some(isDemoLead);
  const dryRunActive = settingsForm.dryRun;
  const captureEndpoint = captureForm.publicToken && typeof window !== "undefined"
    ? `${window.location.origin}/api/public/lead-capture/${captureForm.publicToken}`
    : "";
  const embedSnippet = captureEndpoint
    ? `<form id="tradeflow-lead-form">
  <input name="name" placeholder="Name" required />
  <input name="phone" placeholder="Phone" />
  <input name="email" placeholder="Email" />
  <input name="address" placeholder="Address" />
  <input name="serviceType" placeholder="Service requested" />
  <textarea name="description" placeholder="How can we help?"></textarea>
  <label><input type="checkbox" name="consentToSms" /> I agree to SMS follow-up</label>
  <button type="submit">Request Follow-up</button>
  <p id="tradeflow-lead-result" role="status"></p>
</form>
<script>
document.getElementById("tradeflow-lead-form").addEventListener("submit", async function (event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  data.consentToSms = form.elements.consentToSms.checked;
  const response = await fetch("${captureEndpoint}", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const payload = await response.json();
  document.getElementById("tradeflow-lead-result").textContent = payload.message || payload.error || "Thanks. We received your request.";
  if (response.ok) form.reset();
});
</script>`
    : "";

  const refresh = () => {
    queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/leads") });
  };

  const copyText = async (text: string, title: string) => {
    await navigator.clipboard?.writeText(text);
    toast({ title });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/leads", payloadFromForm(createForm));
      return res.json() as Promise<Lead>;
    },
    onSuccess: (lead) => {
      refresh();
      setShowCreate(false);
      setCreateForm(emptyForm);
      setSelectedLeadId(lead.id);
      setEditForm(formFromLead(lead));
      toast({ title: "Lead created", description: "The lead is ready to qualify and convert." });
    },
    onError: (err: Error) => toast({ title: "Create failed", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (override?: Partial<LeadForm>) => {
      if (!selectedLeadId) return null;
      const res = await apiRequest("PATCH", `/api/leads/${selectedLeadId}`, payloadFromForm({ ...editForm, ...(override || {}) }));
      return res.json() as Promise<Lead>;
    },
    onSuccess: () => {
      refresh();
      toast({ title: "Lead updated" });
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ lead, status }: { lead: Lead; status: string }) => {
      const res = await apiRequest("PATCH", `/api/leads/${lead.id}`, { status });
      return res.json() as Promise<Lead>;
    },
    onSuccess: () => {
      refresh();
      toast({ title: "Lead stage updated" });
    },
    onError: (err: Error) => toast({ title: "Stage update failed", description: err.message, variant: "destructive" }),
  });

  const actionMutation = useMutation({
    mutationFn: async ({ action, body, leadId }: { action: string; body?: unknown; leadId?: string }) => {
      const targetLeadId = leadId || selectedLeadId;
      if (!targetLeadId) return null;
      const res = await apiRequest("POST", `/api/leads/${targetLeadId}/${action}`, body || {});
      return res.json();
    },
    onSuccess: (_data, vars) => {
      refresh();
      if (vars.action === "convert") toast({ title: "Lead converted", description: "Customer and job lead were created." });
      else if (vars.action === "send-sms") toast({ title: "Dry-run SMS logged" });
      else if (vars.action === "send-email") toast({ title: "Dry-run email logged" });
      else toast({ title: "Lead activity recorded" });
    },
    onError: (err: Error) => toast({ title: "Action failed", description: err.message, variant: "destructive" }),
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/leads/settings", { settings: settingsForm });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads/settings"] });
      toast({ title: "Lead settings saved" });
    },
    onError: (err: Error) => toast({ title: "Settings failed", description: err.message, variant: "destructive" }),
  });

  const saveCaptureFormMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/leads/capture-form/${captureForm.id}`, captureForm);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads/settings"] });
      toast({ title: "Capture form saved" });
    },
    onError: (err: Error) => toast({ title: "Form save failed", description: err.message, variant: "destructive" }),
  });

  const openLead = (lead: Lead) => {
    setSelectedLeadId(lead.id);
    setEditForm(formFromLead(lead));
  };

  const markContacted = (lead: Lead) => {
    statusMutation.mutate({ lead, status: "contacted" });
  };

  const reScoreLead = (lead: Lead) => {
    actionMutation.mutate({ action: "score", leadId: lead.id });
  };

  const prepareSms = (lead: Lead) => {
    actionMutation.mutate({ action: "send-sms", leadId: lead.id });
  };

  const convertLead = (lead: Lead) => {
    actionMutation.mutate({ action: "convert", leadId: lead.id });
  };

  const changeLeadStatus = (lead: Lead, status: string) => {
    statusMutation.mutate({ lead, status });
  };

  const selectedStage = selectedLead ? stageIndex(selectedLead.status) : 0;
  const breakdown = selectedLead?.scoreBreakdown && typeof selectedLead.scoreBreakdown === "object"
    ? selectedLead.scoreBreakdown as Record<string, unknown>
    : {};
  const aiQualification = selectedLead?.aiQualification && typeof selectedLead.aiQualification === "object"
    ? selectedLead.aiQualification as Record<string, unknown>
    : {};
  const sortedActivities = [...activities].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const messageHistory = sortedActivities.filter((activity) => activity.channel === "sms" || activity.channel === "email");
  const pendingFollowups = followups.filter((task) => task.status === "pending");
  const completedFollowups = followups.filter((task) => task.status === "completed");
  const failedFollowups = followups.filter((task) => task.status === "failed");

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Lead Conversion Center"
        description="Capture, qualify, follow up, and convert new opportunities into booked jobs."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-create-lead">
              <Plus className="h-4 w-4 mr-1" />
              New Lead
            </Button>
            <Button size="sm" variant="outline" onClick={() => copyText(captureEndpoint, "Public form link copied")} disabled={!captureEndpoint}>
              <Copy className="h-4 w-4 mr-1" />
              Copy Public Form Link
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowCapture(true)}>
              <Globe2 className="h-4 w-4 mr-1" />
              View Embed Code
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowSettings(true)}>
              <Settings className="h-4 w-4 mr-1" />
              Lead Settings
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4">
        {dryRunActive && (
          <Alert>
            <MessageSquare className="h-4 w-4" />
            <AlertTitle>Dry-run mode is active</AlertTitle>
            <AlertDescription>Lead SMS and email actions are logged to the timeline but are not sent.</AlertDescription>
          </Alert>
        )}

        {(leadsError || settingsError) && (
          <Alert variant="destructive">
            <AlertTitle>Lead Center could not load completely</AlertTitle>
            <AlertDescription>{String((leadsError || settingsError) instanceof Error ? (leadsError || settingsError as Error).message : "Check the server logs.")}</AlertDescription>
          </Alert>
        )}

        {providerStatus && dryRunActive && !providerStatus.twilio.configured && !providerStatus.sendgrid.configured && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Provider not configured</AlertTitle>
            <AlertDescription>Dry-run mode is active, so messages are prepared in the timeline without sending SMS or email.</AlertDescription>
          </Alert>
        )}

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          <OperatorList
            title="Hot Leads"
            icon={Flame}
            leads={hotOperatorLeads.length > 0 ? hotOperatorLeads : operatorDashboard?.hotLeads || []}
            empty="No hot leads right now. Urgent leads with high scores will appear here so your team knows who to call first."
            onOpen={openLead}
            onMarkContacted={markContacted}
            onScore={reScoreLead}
            onSms={prepareSms}
            onConvert={convertLead}
            actionLabel="Review Lead"
            loading={operatorDashboardLoading && allLeads.length === 0}
            error={operatorDashboardError}
          />
          <OperatorList
            title="Needs Contact"
            icon={Clock}
            leads={needsContactLeads.length > 0 ? needsContactLeads : operatorDashboard?.needsContact || []}
            empty="Every new lead has been contacted or is already moving through the pipeline."
            onOpen={openLead}
            onMarkContacted={markContacted}
            onScore={reScoreLead}
            onSms={prepareSms}
            onConvert={convertLead}
            actionLabel="Call Now"
            loading={isLoading}
            error={leadsError}
          />
          <OperatorList
            title="Follow Up Today"
            icon={UserCheck}
            leads={dueTodayLeads.length > 0 ? dueTodayLeads : operatorDashboard?.followUpsDueToday || []}
            empty="No follow-ups due today. New due follow-ups will show here before they get missed."
            onOpen={openLead}
            onMarkContacted={markContacted}
            onScore={reScoreLead}
            onSms={prepareSms}
            onConvert={convertLead}
            actionLabel="Follow Up"
            loading={operatorDashboardLoading && allLeads.length === 0}
            error={operatorDashboardError}
          />
          <OperatorList
            title="Overdue"
            icon={AlertTriangle}
            leads={overdueLeads.length > 0 ? overdueLeads : operatorDashboard?.overdueFollowUps || []}
            empty="No overdue follow-ups. Your lead follow-up queue is caught up."
            onOpen={openLead}
            onMarkContacted={markContacted}
            onScore={reScoreLead}
            onSms={prepareSms}
            onConvert={convertLead}
            actionLabel="Follow Up"
            loading={isLoading}
            error={leadsError}
          />
          <OperatorList
            title="Recently Converted"
            icon={Target}
            leads={convertedOperatorLeads}
            empty="No converted leads yet. Won leads will appear here once they become customers and jobs."
            onOpen={openLead}
            onMarkContacted={markContacted}
            onScore={reScoreLead}
            onSms={prepareSms}
            onConvert={convertLead}
            actionLabel="Review Lead"
            loading={operatorDashboardLoading && allLeads.length === 0}
            error={operatorDashboardError}
          />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                Needs Attention
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {operatorDashboardLoading ? (
                <>
                  <Skeleton className="h-20 rounded-lg" />
                  <Skeleton className="h-20 rounded-lg" />
                </>
              ) : operatorDashboardError ? (
                <p className="text-sm text-muted-foreground">Message attempt status is temporarily unavailable.</p>
              ) : (operatorDashboard?.failedAttempts || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No failed follow-up or message attempts. Message issues will appear here so they can be fixed quickly.</p>
              ) : (
                operatorDashboard!.failedAttempts.slice(0, 4).map((attempt) => {
                  const lead = allLeads.find((item) => item.id === attempt.leadId);
                  return (
                    <button
                      key={attempt.id}
                      type="button"
                      onClick={() => lead && openLead(lead)}
                      className="w-full rounded-lg border p-3 text-left hover:bg-muted/40"
                    >
                      <p className="text-sm font-medium truncate">{attempt.leadName}</p>
                      <p className="text-xs text-destructive truncate">{attempt.reason}</p>
                      <p className="text-xs text-muted-foreground">{attempt.channel ? attempt.channel.toUpperCase() : "Follow-up"} · {formatDistanceToNow(new Date(attempt.createdAt), { addSuffix: true })}</p>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <StatCard icon={UserPlus} label="New Leads" value={stats?.newLeads || 0} />
          <StatCard icon={Flame} label="Hot Leads" value={stats?.hotLeads || 0} sub={`Threshold ${settingsForm.hotLeadThreshold}`} />
          <StatCard icon={Activity} label="Due Follow-Up" value={stats?.needsFollowUp || 0} />
          <StatCard icon={Target} label="Converted This Month" value={convertedThisMonth} sub={`${stats?.converted || 0} all-time`} />
          <StatCard icon={RefreshCw} label="Average Response Time" value="Dry-run" sub="Tracked in activity log" />
          <StatCard icon={DollarSign} label="Pipeline Value" value={money(pipelineValue)} />
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold">Lead Conversion Center</h2>
                  <Badge variant="secondary">Add-on module</Badge>
                  {hasDemoData && <Badge variant="outline">Demo data</Badge>}
                </div>
                <p className="text-sm text-muted-foreground max-w-3xl">
                  Capture new opportunities, prioritize who to contact first, and move qualified leads into the customer and job workflow.
                </p>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-2 lg:min-w-[520px]">
                {[
                  "Capture website, call, and manual leads",
                  "Prioritize hot leads automatically",
                  "Track follow-ups before they fall through the cracks",
                  "Convert qualified leads into customers and jobs",
                  "Keep outreach in dry-run until messaging is enabled",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <KanbanSquare className="h-4 w-4 text-primary" />
                  Lead-to-Cash Pipeline
                </h2>
                <p className="text-xs text-muted-foreground">Captured leads move from fast contact into booked jobs.</p>
              </div>
              <Badge variant="outline">Lead Conversion Center</Badge>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {pipelineCounts.map((stage, index) => (
                <button
                  key={stage.key}
                  type="button"
                  onClick={() => setStatusFilter(stage.key)}
                  className="rounded-lg border p-3 text-left hover:bg-muted/40 transition-colors"
                >
                  <div className={`h-1.5 rounded-full mb-2 ${index <= selectedStage ? "bg-primary" : "bg-muted"}`} />
                  <p className="text-xl font-bold">{stage.count}</p>
                  <p className="text-xs text-muted-foreground truncate">{stage.label}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search name, phone, email, address, service..." value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-leads" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {pipelineStages.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                  <SelectItem value="spam">Spam</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  {sourceOptions.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Urgency</SelectItem>
                  {urgencyOptions.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant={hotOnly ? "default" : "outline"} size="sm" onClick={() => setHotOnly(!hotOnly)}>
                <Flame className="h-4 w-4 mr-1" />
                Hot
              </Button>
              <Button variant={dueOnly ? "default" : "outline"} size="sm" onClick={() => setDueOnly(!dueOnly)}>
                <Activity className="h-4 w-4 mr-1" />
                Needs follow-up
              </Button>
              <Button variant={overdueOnly ? "default" : "outline"} size="sm" onClick={() => setOverdueOnly(!overdueOnly)}>
                <AlertTriangle className="h-4 w-4 mr-1" />
                Overdue
              </Button>
              <span className="text-sm text-muted-foreground">{leads.length} lead{leads.length !== 1 ? "s" : ""}</span>
            </div>

            <Tabs defaultValue="table">
              <TabsList>
                <TabsTrigger value="table">Table View</TabsTrigger>
                <TabsTrigger value="pipeline">Pipeline View</TabsTrigger>
              </TabsList>
              <TabsContent value="table" className="mt-3">
                <div className="md:hidden space-y-2">
                  {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
                  {!isLoading && leads.length === 0 && (
                    <Card>
                      <CardContent className="p-6 text-center space-y-3">
                        <UserPlus className="h-9 w-9 mx-auto text-muted-foreground" />
                        <div>
                          <p className="font-medium">No leads yet</p>
                          <p className="text-sm text-muted-foreground">Add your first lead or load demo leads to preview the full lead-to-job workflow.</p>
                          <p className="mt-2 rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">npm run seed:lead-demo -- --org-id=&lt;org_id&gt;</p>
                        </div>
                        <Button size="sm" onClick={() => setShowCreate(true)}>Add Lead</Button>
                      </CardContent>
                    </Card>
                  )}
                  {leads.map((lead) => (
                    <LeadSummaryCard key={lead.id} lead={lead} onOpen={openLead} onStatusChange={changeLeadStatus} />
                  ))}
                </div>

                <div className="hidden md:block rounded-lg border overflow-hidden bg-card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs text-muted-foreground">
                        <tr>
                          <th className="text-left font-medium p-3">Lead</th>
                          <th className="text-left font-medium p-3">Contact</th>
                          <th className="text-left font-medium p-3">Service Requested</th>
                          <th className="text-left font-medium p-3">Source</th>
                          <th className="text-left font-medium p-3">Urgency</th>
                          <th className="text-left font-medium p-3">Score</th>
                          <th className="text-left font-medium p-3">Status</th>
                          <th className="text-left font-medium p-3">SLA</th>
                          <th className="text-left font-medium p-3">Next Follow-Up</th>
                          <th className="text-left font-medium p-3">Created</th>
                          <th className="text-right font-medium p-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {isLoading && Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i}><td colSpan={11} className="p-3"><Skeleton className="h-8 w-full" /></td></tr>
                        ))}
                        {!isLoading && leads.length === 0 && (
                          <tr>
                            <td colSpan={11} className="p-8 text-center">
                              <div className="max-w-md mx-auto space-y-3">
                                <UserPlus className="h-9 w-9 mx-auto text-muted-foreground" />
                                <div>
                                  <p className="font-medium">No leads yet</p>
                                  <p className="text-sm text-muted-foreground">Add your first lead or load demo leads to preview the full lead-to-job workflow. Your public lead form is ready when you copy the link.</p>
                                  <p className="mt-2 rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">npm run seed:lead-demo -- --org-id=&lt;org_id&gt;</p>
                                </div>
                                <div className="flex justify-center gap-2">
                                  <Button size="sm" onClick={() => setShowCreate(true)}>Add Lead</Button>
                                  <Button size="sm" variant="outline" onClick={() => setShowCapture(true)}>Website Form</Button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        {leads.map((lead) => (
                          <tr key={lead.id} className="border-t hover:bg-muted/40" data-testid={`lead-row-${lead.id}`}>
                            <td className="p-3 font-medium cursor-pointer" onClick={() => openLead(lead)}>{lead.name}</td>
                            <td className="p-3 text-muted-foreground">
                              <div className="space-y-0.5">
                                {lead.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</div>}
                                {lead.email && <div className="flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</div>}
                              </div>
                            </td>
                            <td className="p-3">{lead.serviceType || "Unspecified"}</td>
                            <td className="p-3">{labelize(lead.source)}</td>
                            <td className="p-3"><Badge variant={lead.urgency === "emergency" || lead.urgency === "urgent" ? "destructive" : "secondary"}>{labelize(lead.urgency)}</Badge></td>
                            <td className="p-3"><LeadScoreBadge lead={lead} /></td>
                            <td className="p-3"><Badge variant={lead.status === "converted" ? "default" : "outline"}>{labelize(lead.status)}</Badge></td>
                            <td className="p-3"><LeadSlaBadge lead={lead} /></td>
                            <td className="p-3 text-muted-foreground">{lead.nextFollowUpAt ? format(new Date(lead.nextFollowUpAt), "MMM d, h:mm a") : "-"}</td>
                            <td className="p-3 text-muted-foreground">{formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}</td>
                            <td className="p-3 text-right">
                              <Button size="sm" variant="ghost" onClick={() => openLead(lead)}>Open</Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="pipeline" className="mt-3">
                <div className="grid md:grid-cols-2 xl:grid-cols-7 gap-3">
                  {pipelineStages.map((stage) => {
                    const stageLeads = leads.filter((lead) => pipelineStageForLead(lead) === stage.key);
                    return (
                    <div key={stage.key} className="rounded-lg border bg-card min-h-40">
                      <div className="p-3 border-b">
                        <p className="font-medium text-sm">{stage.label}</p>
                        <p className="text-xs text-muted-foreground">{stageLeads.length} leads</p>
                      </div>
                      <div className="p-2 space-y-2">
                        {stageLeads.slice(0, 10).map((lead) => (
                          <LeadSummaryCard key={lead.id} lead={lead} onOpen={openLead} onStatusChange={changeLeadStatus} />
                        ))}
                        {stageLeads.length === 0 && <p className="p-2 text-xs text-muted-foreground">No leads in this stage.</p>}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle>New Lead</DialogTitle></DialogHeader>
          <LeadFields form={createForm} setForm={setCreateForm} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !createForm.name.trim()} data-testid="button-save-lead">
              {createMutation.isPending ? "Creating..." : "Create Lead"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCapture} onOpenChange={setShowCapture}>
        <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-auto">
          <DialogHeader><DialogTitle>Lead Capture Form</DialogTitle></DialogHeader>
          <div className="grid lg:grid-cols-[1fr_0.9fr] gap-4">
            <div className="space-y-3">
              <Alert>
                <Globe2 className="h-4 w-4" />
                <AlertTitle>Your public lead form is ready</AlertTitle>
                <AlertDescription>Copy this link to your website. Public responses only return the safe success message.</AlertDescription>
              </Alert>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Form Name</Label>
                  <Input value={captureForm.name} onChange={(e) => setCaptureForm({ ...captureForm, name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Source Label</Label>
                  <Input value={captureForm.sourceLabel} onChange={(e) => setCaptureForm({ ...captureForm, sourceLabel: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Default Service</Label>
                  <Input value={captureForm.defaultServiceType} onChange={(e) => setCaptureForm({ ...captureForm, defaultServiceType: e.target.value })} />
                </div>
                <label className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-sm font-medium">Enabled</span>
                  <Switch checked={captureForm.isEnabled} onCheckedChange={(v) => setCaptureForm({ ...captureForm, isEnabled: v })} />
                </label>
              </div>
              <div className="space-y-1.5">
                <Label>Public Form URL</Label>
                <div className="flex gap-2">
                  <Input readOnly value={captureEndpoint} />
                  <Button variant="outline" onClick={() => copyText(captureEndpoint, "Public form link copied")} disabled={!captureEndpoint}><Copy className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Public Token Status</Label>
                <div className="flex gap-2">
                  <Badge variant={captureForm.publicToken ? "default" : "destructive"}>{captureForm.publicToken ? "Token active" : "Missing token"}</Badge>
                  <Badge variant={captureForm.isEnabled ? "secondary" : "outline"}>{captureForm.isEnabled ? "Enabled" : "Disabled"}</Badge>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Success Message</Label>
                <Textarea rows={2} value={captureForm.successMessage} onChange={(e) => setCaptureForm({ ...captureForm, successMessage: e.target.value })} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => saveCaptureFormMutation.mutate()} disabled={!captureForm.id || saveCaptureFormMutation.isPending}>Save Form</Button>
                <Button size="sm" variant="outline" onClick={() => copyText(embedSnippet, "Embed code copied")} disabled={!embedSnippet}>Copy Embed Code</Button>
              </div>
            </div>
            <div className="space-y-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Preview</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <Input readOnly placeholder="Name" />
                  <Input readOnly placeholder="Phone" />
                  <Input readOnly placeholder="Email" />
                  <Input readOnly placeholder="Address" />
                  <Input readOnly placeholder="Service requested" value={captureForm.defaultServiceType} />
                  <Textarea readOnly placeholder="How can we help?" />
                  <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" readOnly /> I agree to SMS follow-up</label>
                </CardContent>
              </Card>
              <div className="space-y-1.5">
                <Label>Embed Snippet</Label>
                <Textarea readOnly rows={12} value={embedSnippet} className="font-mono text-xs" />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-auto">
          <DialogHeader><DialogTitle>Lead Settings</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
              <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Twilio</p><Badge variant={providerStatus?.twilio.configured ? "default" : "outline"}>{providerStatus?.twilio.configured ? "Configured" : "Not configured"}</Badge></CardContent></Card>
              <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">SendGrid</p><Badge variant={providerStatus?.sendgrid.configured ? "default" : "outline"}>{providerStatus?.sendgrid.configured ? "Configured" : "Not configured"}</Badge></CardContent></Card>
              <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">OpenAI</p><Badge variant={providerStatus?.openai.configured ? "default" : "secondary"}>{providerStatus?.openai.configured ? "Configured" : "Fallback mode"}</Badge></CardContent></Card>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="flex items-center justify-between rounded-md border px-3 py-2"><span className="text-sm font-medium">Auto-response enabled</span><Switch checked={settingsForm.autoRespond} onCheckedChange={(v) => setSettingsForm({ ...settingsForm, autoRespond: v })} /></label>
              <label className="flex items-center justify-between rounded-md border px-3 py-2"><span className="text-sm font-medium">Follow-up enabled</span><Switch checked={settingsForm.followUpEnabled} onCheckedChange={(v) => setSettingsForm({ ...settingsForm, followUpEnabled: v })} /></label>
              <div className="space-y-1.5">
                <Label>Hot Lead Threshold</Label>
                <Input type="number" min={0} max={100} value={settingsForm.hotLeadThreshold} onChange={(e) => setSettingsForm({ ...settingsForm, hotLeadThreshold: Number(e.target.value) })} />
              </div>
              <label className="flex items-center justify-between rounded-md border px-3 py-2"><span className="text-sm font-medium">Dry-run mode</span><Switch checked={settingsForm.dryRun} onCheckedChange={(v) => setSettingsForm({ ...settingsForm, dryRun: v })} /></label>
              <div className="space-y-1.5">
                <Label>Notification Phone</Label>
                <Input value={settingsForm.notificationPhone} onChange={(e) => setSettingsForm({ ...settingsForm, notificationPhone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Notification Email</Label>
                <Input value={settingsForm.notificationEmail} onChange={(e) => setSettingsForm({ ...settingsForm, notificationEmail: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Default SMS Template</Label>
              <Textarea rows={2} value={settingsForm.defaultSmsTemplate} onChange={(e) => setSettingsForm({ ...settingsForm, defaultSmsTemplate: e.target.value })} placeholder="Hi {name}, this is {business}..." />
            </div>
            <div className="space-y-1.5">
              <Label>Default Email Subject</Label>
              <Input value={settingsForm.defaultEmailSubject} onChange={(e) => setSettingsForm({ ...settingsForm, defaultEmailSubject: e.target.value })} placeholder="Thanks for contacting {business}" />
            </div>
            <div className="space-y-1.5">
              <Label>Default Email Template</Label>
              <Textarea rows={3} value={settingsForm.defaultEmailTemplate} onChange={(e) => setSettingsForm({ ...settingsForm, defaultEmailTemplate: e.target.value })} placeholder="Hi {name}, thanks for reaching out..." />
            </div>
            <Button onClick={() => saveSettingsMutation.mutate()} disabled={saveSettingsMutation.isPending}>Save Settings</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedLeadId} onOpenChange={(open) => !open && setSelectedLeadId(null)}>
        <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center justify-between gap-3">
              <span>{selectedLead?.name || "Lead Detail"}</span>
              {selectedLead && <LeadScoreBadge lead={selectedLead} breakdown={breakdown} />}
            </DialogTitle>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-5">
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Current status</p>
                      <Badge className="mt-1" variant={selectedLead.status === "converted" ? "default" : "outline"}>{labelize(selectedLead.status)}</Badge>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Next follow-up</p>
                      <p className="mt-1 text-sm font-medium">
                        {selectedLead.nextFollowUpAt ? format(new Date(selectedLead.nextFollowUpAt), "MMM d, h:mm a") : "No follow-up scheduled"}
                      </p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Response status</p>
                      <div className="mt-1"><LeadSlaBadge lead={selectedLead} activities={activities} /></div>
                    </div>
                  </div>
                  <LeadFlow status={selectedLead.status} />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ action: "score" })}><RefreshCw className="h-4 w-4 mr-1" />Re-score</Button>
                    <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ status: "contacted" })}>Mark Contacted</Button>
                    <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ status: "qualified" })}>Mark Qualified</Button>
                    <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ action: "send-sms" })}><MessageSquare className="h-4 w-4 mr-1" />Dry-run SMS</Button>
                    <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ action: "send-email" })}><Mail className="h-4 w-4 mr-1" />Dry-run Email</Button>
                    <Button size="sm" onClick={() => actionMutation.mutate({ action: "convert" })} disabled={selectedLead.status === "converted"}><Target className="h-4 w-4 mr-1" />Convert</Button>
                    <Button size="sm" variant="destructive" onClick={() => updateMutation.mutate({ status: "lost", lostReason: editForm.lostReason || "Marked lost by user" })} disabled={selectedLead.status === "converted"}>Mark Lost</Button>
                  </div>
                </CardContent>
              </Card>

              <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-5">
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Lead Details</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{labelize(selectedLead.source)}</Badge>
                          {selectedLead.sourceDetail && <Badge variant="secondary">{selectedLead.sourceDetail}</Badge>}
                          <Badge variant={selectedLead.consentToSms ? "default" : "outline"}>{selectedLead.consentToSms ? "SMS consent" : "No SMS consent"}</Badge>
                        </div>
                        <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                          <SelectContent>{statusOptions.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <LeadFields form={editForm} setForm={setEditForm} />
                      <div className="space-y-1.5">
                        <Label>AI Summary</Label>
                        <Textarea value={editForm.aiSummary} onChange={(e) => setEditForm({ ...editForm, aiSummary: e.target.value })} rows={3} />
                      </div>
                      <Button onClick={() => updateMutation.mutate(undefined)} disabled={updateMutation.isPending}>{updateMutation.isPending ? "Saving..." : "Save Changes"}</Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between gap-2">
                        <span>Conversion</span>
                        <Badge variant={selectedLead.status === "converted" ? "default" : "outline"}>
                          {selectedLead.status === "converted" ? "Customer/job created" : "Ready when qualified"}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {selectedLead.status !== "converted" ? (
                        <div className="rounded-lg border p-3">
                          <p className="text-sm font-medium">Convert this lead into the job workflow</p>
                          <p className="text-xs text-muted-foreground mt-1">Creates or reuses a customer and opens a job lead without sending any messages.</p>
                          <Button className="mt-3" size="sm" onClick={() => actionMutation.mutate({ action: "convert" })}>
                            <Target className="h-4 w-4 mr-1" />
                            Convert to Customer/Job
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">This lead has been converted into the lead-to-cash workflow.</p>
                      )}
                      <div className="grid sm:grid-cols-4 gap-2">
                        {selectedLead.customerId ? <Link href={`/customers/${selectedLead.customerId}`}><Button variant="outline" className="w-full">Open Customer <ExternalLink className="h-3 w-3 ml-1" /></Button></Link> : <Button variant="outline" disabled>No Customer</Button>}
                        {selectedLead.jobId ? <Link href={`/jobs/${selectedLead.jobId}`}><Button variant="outline" className="w-full">Open Job <ExternalLink className="h-3 w-3 ml-1" /></Button></Link> : <Button variant="outline" disabled>No Job</Button>}
                        {selectedLead.quoteId ? <Link href={`/quotes/${selectedLead.quoteId}`}><Button variant="outline" className="w-full">Open Quote <ExternalLink className="h-3 w-3 ml-1" /></Button></Link> : selectedLead.jobId ? <Link href="/quotes/new"><Button variant="outline" className="w-full">Create Quote</Button></Link> : <Button variant="outline" disabled>No Quote</Button>}
                        {selectedLead.invoiceId ? <Link href={`/invoices/${selectedLead.invoiceId}`}><Button variant="outline" className="w-full">Open Invoice <ExternalLink className="h-3 w-3 ml-1" /></Button></Link> : <Button variant="outline" disabled>No Invoice</Button>}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Score Breakdown</CardTitle></CardHeader>
                    <CardContent>
                      {Object.keys(breakdown).length === 0 ? <p className="text-sm text-muted-foreground">No score breakdown yet.</p> : (
                        <div className="space-y-1.5">
                          {Object.entries(breakdown).map(([key, value]) => (
                            <div key={key} className="flex items-center justify-between gap-2 text-sm">
                              <span className="text-muted-foreground">{labelize(key)}</span>
                              <span className="font-medium text-right">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">AI Qualification</CardTitle></CardHeader>
                    <CardContent>
                      {Object.keys(aiQualification).length === 0 ? <p className="text-sm text-muted-foreground">No AI qualification data yet.</p> : (
                        <div className="space-y-1.5">
                          {Object.entries(aiQualification).map(([key, value]) => (
                            <div key={key} className="flex items-center justify-between gap-2 text-sm">
                              <span className="text-muted-foreground">{labelize(key)}</span>
                              <span className="font-medium text-right">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Follow-Up Tasks</CardTitle></CardHeader>
                    <CardContent>
                      {followupsLoading ? <Skeleton className="h-16" /> : followups.length === 0 ? <p className="text-sm text-muted-foreground">No follow-ups scheduled yet.</p> : (
                        <div className="space-y-3">
                          {[
                            ["Pending", pendingFollowups],
                            ["Completed", completedFollowups],
                            ["Failed", failedFollowups],
                          ].map(([label, tasks]) => (
                            <div key={label as string} className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground">{label as string}</p>
                              {(tasks as LeadFollowupTask[]).length === 0 ? (
                                <p className="text-xs text-muted-foreground">None</p>
                              ) : (
                                (tasks as LeadFollowupTask[]).map((task) => (
                                  <div key={task.id} className="rounded-md border p-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-sm font-medium">Step {task.stepNumber} · {task.channel.toUpperCase()}</p>
                                      <Badge variant={task.status === "pending" ? "secondary" : task.status === "failed" ? "destructive" : "outline"}>{labelize(task.status)}</Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">Due {format(new Date(task.dueAt), "MMM d, h:mm a")}</p>
                                    {task.completedAt && <p className="text-xs text-muted-foreground">Completed {formatDistanceToNow(new Date(task.completedAt), { addSuffix: true })}</p>}
                                    {task.error && <p className="text-xs text-destructive mt-1">{task.error}</p>}
                                  </div>
                                ))
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Message History</CardTitle></CardHeader>
                    <CardContent>
                      {messageHistory.length === 0 ? <p className="text-sm text-muted-foreground">No dry-run messages logged yet.</p> : (
                        <div className="space-y-2">
                          {messageHistory.map((activity) => (
                            <div key={activity.id} className="rounded-md border p-2">
                              <p className="text-sm font-medium">{activityDisplay(activity).label}</p>
                              <p className="text-xs text-muted-foreground">{activity.channel?.toUpperCase()} · {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}</p>
                              {activity.body && <p className="text-sm mt-1 whitespace-pre-wrap">{activity.body}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Timeline</CardTitle></CardHeader>
                    <CardContent>
                      {activitiesLoading ? <Skeleton className="h-20" /> : activities.length === 0 ? <p className="text-sm text-muted-foreground">No activity yet.</p> : (
                        <div className="space-y-3">
                          {sortedActivities.map((activity) => {
                            const item = activityDisplay(activity);
                            const Icon = item.icon;
                            return (
                              <div key={activity.id} className="flex gap-3">
                                <div className="mt-0.5 h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                                  <Icon className={`h-4 w-4 ${item.color}`} />
                                </div>
                                <div className="min-w-0 flex-1 border-b pb-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-medium">{item.label}</p>
                                    <span className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}</span>
                                  </div>
                                  {activity.subject && <p className="text-xs text-muted-foreground">{activity.subject}</p>}
                                  {activity.body && <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{activity.body}</p>}
                                  {activity.status && <Badge variant={activity.error ? "destructive" : "outline"} className="mt-1">{activity.status === "dry_run" ? "Prepared only" : labelize(activity.status)}</Badge>}
                                  {activity.metadata != null && (
                                    <details className="mt-2">
                                      <summary className="cursor-pointer text-xs text-muted-foreground">Technical details</summary>
                                      <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted p-2 text-[11px] text-muted-foreground">
                                        {JSON.stringify(activity.metadata, null, 2)}
                                      </pre>
                                    </details>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
