import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow, isThisMonth } from "date-fns";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
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
  ListChecks,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Sparkles,
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Lead, LeadActivity, LeadCaptureForm, LeadFollowupTask, LeadSettings, LeadSourceEvent } from "@shared/schema";
import { LEAD_CONVERSION_CENTER_MODULE } from "@shared/modules";
import {
  LIVE_LEADS_CONFIRMATION_PHRASE,
  type LeadProductionReadiness,
} from "@shared/leadProductionReadiness";
import { deploymentChecklistStatus } from "@shared/leadDeployment";
import {
  LEAD_DEMO_WALKTHROUGH_STEPS,
  LEAD_FIRST_RUN_CHECKLIST,
  type LeadDemoWalkthroughStep,
} from "@shared/leadDemo";
import {
  LEAD_TRADE_TEMPLATES,
  getLeadTradeTemplate,
  type LeadTradeTemplate,
} from "@shared/leadTradeTemplates";

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
  tradeTemplate?: LeadTradeTemplate | null;
};

type ProviderStatus = {
  twilio: { configured: boolean; fromPhoneConfigured?: boolean };
  sendgrid: { configured: boolean; fromEmailConfigured?: boolean };
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

type LeadModuleStatus = {
  module: typeof LEAD_CONVERSION_CENTER_MODULE;
  enabled: boolean;
  setupComplete: boolean;
  mode: "demo" | "dry_run" | "live" | "needs_attention";
  activeTradeTemplate: { key: string; name: string } | null;
  businessInfoConfigured?: boolean;
  publicFormsConfigured: boolean;
  leadSourcesConfigured: boolean;
  smsReady: boolean;
  emailReady: boolean;
  messagingLive: boolean;
  followUpEnabled: boolean;
  autoResponseEnabled: boolean;
  demoDataPresent: boolean;
  totalLeads: number;
  hotLeads: number;
  overdueFollowUps: number;
  convertedThisMonth: number;
  blockers: string[];
  nextSteps: string[];
  usageSummary: {
    leadsThisMonth: number;
    activeLeadSources: number;
    publicForms: number;
    followupsScheduled: number;
    messagesPrepared: number;
    messagesSent: number;
    messagesDryRun: number;
    failedMessageAttempts: number;
    conversionsThisMonth: number;
  };
  plan: {
    source: string;
    linked: boolean;
    planSlug: string | null;
  };
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

type LeadSourceAdapterSummary = {
  key: string;
  label: string;
  description: string;
  examplePayload: Record<string, unknown>;
};

type LeadSettingsForm = {
  autoRespond: boolean;
  followUpEnabled: boolean;
  hotLeadThreshold: number;
  dryRun: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  defaultSmsTemplate: string;
  defaultEmailSubject: string;
  defaultEmailTemplate: string;
  smsComplianceFooter: string;
  notificationPhone: string;
  notificationEmail: string;
  tradeTemplateKey: string;
  serviceArea: string;
  leadSources: string[];
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
const sourceOptions = ["manual", "website_form", "external_webhook", "missed_call", "import"];
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

function validDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatLeadDate(value: string | Date | null | undefined, pattern: string, fallback = "Not set") {
  const date = validDate(value);
  return date ? format(date, pattern) : fallback;
}

function modePresentation(mode: LeadModuleStatus["mode"] | undefined, dryRun: boolean) {
  if (mode === "live" && !dryRun) {
    return {
      label: "Live Mode",
      description: "Live mode is active. Messages may be sent to real leads based on your settings.",
      className: "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100",
      iconClassName: "text-emerald-700 dark:text-emerald-300",
      icon: CheckCircle2,
    };
  }
  if (mode === "needs_attention") {
    return {
      label: "Needs Attention",
      description: "Lead capture remains available, but setup or messaging checks need review.",
      className: "border-red-300 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100",
      iconClassName: "text-red-700 dark:text-red-300",
      icon: AlertTriangle,
    };
  }
  if (mode === "demo") {
    return {
      label: "Demo Mode",
      description: "Demo mode is active. Sample leads are for walkthroughs and messages are not sent.",
      className: "border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100",
      iconClassName: "text-sky-700 dark:text-sky-300",
      icon: Sparkles,
    };
  }
  return {
    label: "Dry-Run Mode",
    description: "Dry-run mode is active. Messages are logged but not sent.",
    className: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
    iconClassName: "text-amber-700 dark:text-amber-300",
    icon: MessageSquare,
  };
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
  const dueAt = validDate(lead.nextFollowUpAt);
  return !!dueAt && dueAt.getTime() <= Date.now() && !["converted", "lost", "spam"].includes(lead.status);
}

function isDueToday(lead: Lead) {
  if (!lead.nextFollowUpAt || isClosedLead(lead)) return false;
  const due = validDate(lead.nextFollowUpAt);
  if (!due) return false;
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
    nextFollowUpAt: formatLeadDate(lead.nextFollowUpAt, "yyyy-MM-dd'T'HH:mm", ""),
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
          <span className="font-medium text-foreground">{validDate(lead.createdAt) ? formatDistanceToNow(validDate(lead.createdAt)!, { addSuffix: true }) : "Unknown"}</span>
        </div>
        <div>
          <span className="block">Next follow-up</span>
          <span className="font-medium text-foreground">{formatLeadDate(lead.nextFollowUpAt, "MMM d, h:mm a")}</span>
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
          <span className="font-medium text-foreground">{validDate(lead.createdAt) ? formatDistanceToNow(validDate(lead.createdAt)!, { addSuffix: true }) : "Unknown"}</span>
        </div>
        <div>
          <span className="block">Next follow-up</span>
          <span className="font-medium text-foreground">{formatLeadDate(lead.nextFollowUpAt, "MMM d, h:mm a")}</span>
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
        <Button size="sm" variant="ghost" className="h-8" onClick={() => onSms(lead)}>Prepare Message</Button>
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
  className = "",
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
  className?: string;
}) {
  return (
    <Card className={className}>
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

function LeadFields({ form, setForm, template }: { form: LeadForm; setForm: (next: LeadForm) => void; template?: LeadTradeTemplate | null }) {
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
          {template ? (
            <Select value={form.serviceType || undefined} onValueChange={(v) => update("serviceType", v)}>
              <SelectTrigger data-testid="input-lead-service"><SelectValue placeholder="Choose service type" /></SelectTrigger>
              <SelectContent>
                {template.serviceCategories.map((service) => <SelectItem key={service} value={service}>{service}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Input value={form.serviceType} onChange={(e) => update("serviceType", e.target.value)} data-testid="input-lead-service" />
          )}
          {template && <p className="text-xs text-muted-foreground">{template.exampleLeadText}</p>}
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
        <Textarea
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          rows={4}
          placeholder={template ? template.exampleLeadText : undefined}
          data-testid="input-lead-description"
        />
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
  const { org } = useAuth();
  const [location, navigate] = useLocation();
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
  const [showSetup, setShowSetup] = useState(false);
  const [showLiveConfirm, setShowLiveConfirm] = useState(false);
  const [liveConfirmText, setLiveConfirmText] = useState("");
  const [showDemoWalkthrough, setShowDemoWalkthrough] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [firstRunDismissed, setFirstRunDismissed] = useState(false);
  const [setupStep, setSetupStep] = useState(0);
  const [workspaceView, setWorkspaceView] = useState<"work" | "performance">("work");
  const [reportRange, setReportRange] = useState<"30" | "90" | "all">("30");
  const [createForm, setCreateForm] = useState<LeadForm>(emptyForm);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<LeadForm>(emptyForm);
  const [settingsForm, setSettingsForm] = useState<LeadSettingsForm>({
    autoRespond: true,
    followUpEnabled: true,
    hotLeadThreshold: 75,
    dryRun: true,
    smsEnabled: false,
    emailEnabled: false,
    defaultSmsTemplate: "",
    defaultEmailSubject: "",
    defaultEmailTemplate: "",
    smsComplianceFooter: "Reply STOP to opt out.",
    notificationPhone: "",
    notificationEmail: "",
    tradeTemplateKey: "",
    serviceArea: "",
    leadSources: [],
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
  const [testMessage, setTestMessage] = useState({
    smsTo: "",
    emailTo: "",
    emailSubject: "TradeFlow test message",
  });
  const [selectedAdapterKey, setSelectedAdapterKey] = useState("genericJson");

  const { data: allLeads = [], isLoading, error: leadsError } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { data: stats } = useQuery<LeadStats>({ queryKey: ["/api/leads/stats"] });
  const { data: leadSettings, error: settingsError } = useQuery<LeadSettingsResponse>({ queryKey: ["/api/leads/settings"] });
  const { data: tradeTemplates = LEAD_TRADE_TEMPLATES } = useQuery<LeadTradeTemplate[]>({ queryKey: ["/api/leads/trade-templates"] });
  const { data: sourceAdapters = [] } = useQuery<LeadSourceAdapterSummary[]>({ queryKey: ["/api/leads/source-adapters"] });
  const { data: sourceEvents = [] } = useQuery<LeadSourceEvent[]>({ queryKey: ["/api/leads/source-events"] });
  const { data: providerStatus } = useQuery<ProviderStatus>({ queryKey: ["/api/leads/provider-status"] });
  const {
    data: moduleStatus,
    isLoading: moduleStatusLoading,
    error: moduleStatusError,
  } = useQuery<LeadModuleStatus>({ queryKey: ["/api/leads/module-status"] });
  const { data: productionReadiness } = useQuery<LeadProductionReadiness>({ queryKey: ["/api/leads/production-readiness"] });
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
    if (params.get("demo") === "1") setShowDemoWalkthrough(true);
    if (params.get("settings") === "1") setShowSettings(true);
    if (params.get("setup") === "1") setShowSetup(true);
    if (params.get("form") === "1") setShowCapture(true);
    if (params.get("view") === "performance") setWorkspaceView("performance");
  }, [location]);

  useEffect(() => {
    if (location === "/leads/demo") {
      setShowDemoWalkthrough(true);
      setDemoStep(0);
    }
  }, [location]);

  useEffect(() => {
    if (!leadSettings) return;
    setSettingsForm({
      autoRespond: leadSettings.settings.autoRespond,
      followUpEnabled: leadSettings.settings.followUpEnabled,
      hotLeadThreshold: leadSettings.settings.hotLeadThreshold,
      dryRun: leadSettings.settings.dryRun,
      smsEnabled: leadSettings.settings.smsEnabled || false,
      emailEnabled: leadSettings.settings.emailEnabled || false,
      defaultSmsTemplate: leadSettings.settings.defaultSmsTemplate || "",
      defaultEmailSubject: leadSettings.settings.defaultEmailSubject || "",
      defaultEmailTemplate: leadSettings.settings.defaultEmailTemplate || "",
      smsComplianceFooter: leadSettings.settings.smsComplianceFooter || "Reply STOP to opt out.",
      notificationPhone: leadSettings.settings.notificationPhone || "",
      notificationEmail: leadSettings.settings.notificationEmail || "",
      tradeTemplateKey: leadSettings.settings.tradeTemplateKey || "",
      serviceArea: leadSettings.settings.serviceArea || "",
      leadSources: Array.isArray(leadSettings.settings.leadSources) ? leadSettings.settings.leadSources : [],
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
  const reportCutoff = reportRange === "all"
    ? null
    : new Date(Date.now() - Number(reportRange) * 24 * 60 * 60 * 1000);
  const reportLeads = allLeads.filter((lead) => {
    const createdAt = validDate(lead.createdAt);
    return !reportCutoff || (!!createdAt && createdAt >= reportCutoff);
  });
  const reportConverted = reportLeads.filter((lead) => lead.status === "converted" || lead.convertedAt);
  const reportConversionRate = reportLeads.length > 0
    ? Math.round((reportConverted.length / reportLeads.length) * 100)
    : 0;
  const reportEstimatedValue = reportConverted.reduce((sum, lead) => sum + Number(lead.estimatedValue || 0), 0);
  const responseMinutes = reportLeads
    .map((lead) => {
      const createdAt = validDate(lead.createdAt);
      const respondedAt = validDate((lead as Lead & { firstResponseAt?: string | Date | null }).firstResponseAt || lead.lastContactedAt);
      if (!createdAt || !respondedAt) return null;
      return Math.max(0, (respondedAt.getTime() - createdAt.getTime()) / 60000);
    })
    .filter((value): value is number => value !== null);
  const averageResponseMinutes = responseMinutes.length
    ? Math.round(responseMinutes.reduce((sum, value) => sum + value, 0) / responseMinutes.length)
    : null;
  const sourcePerformance = Object.values(reportLeads.reduce((acc, lead) => {
    const key = lead.source || "unknown";
    const row = acc[key] || { source: key, captured: 0, converted: 0, estimatedValue: 0 };
    row.captured += 1;
    if (lead.status === "converted" || lead.convertedAt) {
      row.converted += 1;
      row.estimatedValue += Number(lead.estimatedValue || 0);
    }
    acc[key] = row;
    return acc;
  }, {} as Record<string, { source: string; captured: number; converted: number; estimatedValue: number }>))
    .sort((a, b) => b.converted - a.converted || b.captured - a.captured);
  const topSource = sourcePerformance[0] || null;
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
  const activeTemplate = useMemo(
    () => tradeTemplates.find((template) => template.tradeKey === settingsForm.tradeTemplateKey) || getLeadTradeTemplate(settingsForm.tradeTemplateKey) || null,
    [settingsForm.tradeTemplateKey, tradeTemplates],
  );
  const activeLeadSources = settingsForm.leadSources.length > 0
    ? settingsForm.leadSources
    : activeTemplate?.defaultLeadSources || [];
  const captureEndpoint = captureForm.publicToken && typeof window !== "undefined"
    ? `${window.location.origin}/api/public/lead-capture/${captureForm.publicToken}`
    : "";
  const selectedAdapter = sourceAdapters.find((adapter) => adapter.key === selectedAdapterKey) || sourceAdapters[0] || null;
  const adapterEndpoint = captureForm.publicToken && selectedAdapterKey && typeof window !== "undefined"
    ? `${window.location.origin}/api/public/lead-source/${captureForm.publicToken}/${selectedAdapterKey}`
    : "";
  const adapterExampleJson = selectedAdapter
    ? JSON.stringify(selectedAdapter.examplePayload, null, 2)
    : "";
  const serviceFieldSnippet = activeTemplate
    ? `<select name="serviceType">
${activeTemplate.serviceCategories.map((service) => `  <option value="${service}">${service}</option>`).join("\n")}
</select>`
    : `  <input name="serviceType" placeholder="Service requested" />`;
  const embedSnippet = captureEndpoint
    ? `<form id="tradeflow-lead-form">
  <input name="name" placeholder="Name" required />
  <input name="phone" placeholder="Phone" />
  <input name="email" placeholder="Email" />
  <input name="address" placeholder="Address" />
  ${serviceFieldSnippet}
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

  const settingsWithTemplate = (template: LeadTradeTemplate, base: LeadSettingsForm = settingsForm): LeadSettingsForm => ({
    ...base,
    tradeTemplateKey: template.tradeKey,
    leadSources: base.leadSources.length > 0 ? base.leadSources : template.defaultLeadSources,
    defaultSmsTemplate: template.defaultSmsTemplate,
    defaultEmailSubject: template.defaultEmailSubject,
    defaultEmailTemplate: template.defaultEmailTemplate,
    hotLeadThreshold: Math.max(base.hotLeadThreshold || 0, 75),
    dryRun: true,
    smsEnabled: false,
    emailEnabled: false,
    smsComplianceFooter: base.smsComplianceFooter || "Reply STOP to opt out.",
  });

  const selectTemplate = (tradeKey: string) => {
    const template = tradeTemplates.find((item) => item.tradeKey === tradeKey) || getLeadTradeTemplate(tradeKey);
    if (!template) return;
    setSettingsForm(settingsWithTemplate(template));
    if (!captureForm.defaultServiceType) {
      setCaptureForm({ ...captureForm, defaultServiceType: template.serviceCategories[0] || "" });
    }
  };

  const toggleLeadSource = (source: string) => {
    const exists = settingsForm.leadSources.includes(source);
    setSettingsForm({
      ...settingsForm,
      leadSources: exists
        ? settingsForm.leadSources.filter((item) => item !== source)
        : [...settingsForm.leadSources, source],
    });
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
      else if (vars.action === "send-sms") {
        const mode = typeof _data?.mode === "string" ? _data.mode : "dry-run";
        toast({ title: mode === "live" ? "SMS sent" : mode === "blocked" ? "SMS blocked" : "Dry-run SMS logged", description: _data?.reason ? String(_data.reason).replaceAll("_", " ") : undefined });
      }
      else if (vars.action === "send-email") {
        const mode = typeof _data?.mode === "string" ? _data.mode : "dry-run";
        toast({ title: mode === "live" ? "Email sent" : mode === "blocked" ? "Email blocked" : "Dry-run email logged", description: _data?.reason ? String(_data.reason).replaceAll("_", " ") : undefined });
      }
      else toast({ title: "Lead activity recorded" });
    },
    onError: (err: Error) => toast({ title: "Action failed", description: err.message, variant: "destructive" }),
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async (options?: { liveConfirmationPhrase?: string; settingsOverride?: LeadSettingsForm }) => {
      const res = await apiRequest("PATCH", "/api/leads/settings", {
        settings: options?.settingsOverride || settingsForm,
        liveConfirmationPhrase: options?.liveConfirmationPhrase,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/provider-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/module-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/production-readiness"] });
      setShowLiveConfirm(false);
      setLiveConfirmText("");
      toast({ title: "Lead settings saved" });
    },
    onError: (err: Error) => {
      setSettingsForm((current) => ({ ...current, dryRun: leadSettings?.settings.dryRun ?? true }));
      queryClient.invalidateQueries({ queryKey: ["/api/leads/production-readiness"] });
      toast({ title: "Settings failed", description: err.message, variant: "destructive" });
    },
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

  const sendTestMessageMutation = useMutation({
    mutationFn: async ({ channel }: { channel: "sms" | "email" }) => {
      const destination = channel === "sms" ? testMessage.smsTo : testMessage.emailTo;
      if (!destination.trim()) throw new Error("Enter a test destination first.");
      const confirmed = window.confirm(`Send a live ${channel.toUpperCase()} test message to ${destination}?`);
      if (!confirmed) throw new Error("Test message canceled.");
      const template = channel === "sms"
        ? settingsForm.defaultSmsTemplate || "This is a TradeFlow Lead Center SMS test. Reply STOP to opt out."
        : settingsForm.defaultEmailTemplate || "This is a TradeFlow Lead Center email test.";
      const res = await apiRequest("POST", "/api/leads/test-message", {
        channel,
        to: destination,
        subject: channel === "email" ? testMessage.emailSubject : undefined,
        template,
        confirm: true,
      });
      return res.json();
    },
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads/production-readiness"] });
      toast({
        title: result.ok ? `${vars.channel.toUpperCase()} test sent` : `${vars.channel.toUpperCase()} test blocked`,
        description: result.reason ? String(result.reason).replaceAll("_", " ") : undefined,
        variant: result.ok ? "default" : "destructive",
      });
    },
    onError: (err: Error) => toast({ title: "Test message not sent", description: err.message, variant: "destructive" }),
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
  const setupSteps = [
    "Choose your trade",
    "Confirm business and service area",
    "Choose lead sources",
    "Review service categories",
    "Review message templates",
    "Review follow-up sequence",
    "Finish setup",
  ];
  const finishSetup = () => {
    saveSettingsMutation.mutate(undefined);
    setShowSetup(false);
    setSetupStep(0);
  };
  const smsReady = settingsForm.smsEnabled
    && !!providerStatus?.twilio.configured
    && !!providerStatus?.twilio.fromPhoneConfigured
    && !!settingsForm.defaultSmsTemplate.trim()
    && !!settingsForm.smsComplianceFooter.trim();
  const emailReady = settingsForm.emailEnabled
    && !!providerStatus?.sendgrid.configured
    && !!providerStatus?.sendgrid.fromEmailConfigured
    && !!settingsForm.defaultEmailSubject.trim()
    && !!settingsForm.defaultEmailTemplate.trim();
  const productionChecks = productionReadiness?.requiredChecks || [];
  const productionCompleteCount = productionChecks.filter((item) => item.status === "complete").length;
  const productionCanGoLive = !!productionReadiness?.canGoLive;
  const deploymentChecks = deploymentChecklistStatus({
    activeTradeTemplate: !!moduleStatus?.activeTradeTemplate || !!settingsForm.tradeTemplateKey,
    businessInfoConfigured: !!moduleStatus?.businessInfoConfigured,
    publicFormsConfigured: !!moduleStatus?.publicFormsConfigured || !!captureForm.publicToken,
    leadSourcesConfigured: !!moduleStatus?.leadSourcesConfigured || activeLeadSources.length > 0,
    templatesReviewed: !!productionReadiness?.complianceStatus.templatesReviewed,
    followUpEnabled: !!moduleStatus?.followUpEnabled,
    totalLeads: moduleStatus?.totalLeads || allLeads.length,
    productionCanGoLive,
    convertedCount: moduleStatus?.convertedThisMonth || convertedThisMonth,
  });
  const deploymentCompleteCount = deploymentChecks.filter((item) => item.complete).length;
  const firstWeekLastSourceEvent = sourceEvents[0];
  const firstWeekSince = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const firstWeekLeads = allLeads.filter((lead) => new Date(lead.createdAt).getTime() >= firstWeekSince);
  const firstWeekConverted = allLeads.filter((lead) => lead.convertedAt && new Date(lead.convertedAt).getTime() >= firstWeekSince);
  const handleDryRunToggle = (checked: boolean) => {
    if (checked) {
      setSettingsForm({ ...settingsForm, dryRun: true });
      return;
    }
    setLiveConfirmText("");
    setShowLiveConfirm(true);
  };
  const confirmLiveMode = () => {
    const nextSettings = { ...settingsForm, dryRun: false };
    setSettingsForm(nextSettings);
    saveSettingsMutation.mutate({ liveConfirmationPhrase: liveConfirmText, settingsOverride: nextSettings });
  };
  const leadModule = moduleStatus?.module || LEAD_CONVERSION_CENTER_MODULE;
  const setupChecklist = [
    {
      label: "Choose trade template",
      complete: !!moduleStatus?.activeTradeTemplate || !!settingsForm.tradeTemplateKey,
      why: "Scoring, service labels, and follow-up defaults work better when the trade is known.",
      actionLabel: "Open setup",
      action: () => setShowSetup(true),
    },
    {
      label: "Add business/contact info",
      complete: !!moduleStatus?.businessInfoConfigured,
      why: "Lead replies and customer-facing messages need a recognizable business identity.",
      actionLabel: "Open settings",
      action: () => setShowSettings(true),
    },
    {
      label: "Configure lead capture form",
      complete: !!moduleStatus?.publicFormsConfigured || !!captureForm.publicToken,
      why: "Website visitors need a working form endpoint that creates internal leads.",
      actionLabel: "Open form",
      action: () => setShowCapture(true),
    },
    {
      label: "Connect at least one lead source",
      complete: !!moduleStatus?.leadSourcesConfigured || activeLeadSources.length > 0,
      why: "Source labels make it clear whether the lead came from web, phone, referral, or webhook.",
      actionLabel: "Lead settings",
      action: () => setShowSettings(true),
    },
    {
      label: "Review SMS/email templates",
      complete: !!settingsForm.defaultSmsTemplate.trim() && !!settingsForm.defaultEmailSubject.trim() && !!settingsForm.defaultEmailTemplate.trim(),
      why: "Prepared replies should sound like the contractor before dry-run or live use.",
      actionLabel: "Lead settings",
      action: () => setShowSettings(true),
    },
    {
      label: "Enable follow-up sequence",
      complete: !!moduleStatus?.followUpEnabled,
      why: "Follow-ups keep leads visible before they fall through the cracks.",
      actionLabel: "Lead settings",
      action: () => setShowSettings(true),
    },
    {
      label: "Confirm provider readiness",
      complete: !!moduleStatus?.smsReady || !!moduleStatus?.emailReady || settingsForm.dryRun,
      why: "Live messaging stays blocked until providers and sender details are ready.",
      actionLabel: "Lead settings",
      action: () => setShowSettings(true),
    },
    {
      label: "Send test message if going live",
      complete: settingsForm.dryRun || !!moduleStatus?.messagingLive,
      why: "A live test confirms the selected provider is working before messaging leads.",
      actionLabel: "Lead settings",
      action: () => setShowSettings(true),
    },
    {
      label: "Review dry-run/live mode",
      complete: !!moduleStatus,
      why: "Staff should always know whether messages are only logged or actually sent.",
      actionLabel: "Lead settings",
      action: () => setShowSettings(true),
    },
    {
      label: "Create or receive first lead",
      complete: (moduleStatus?.totalLeads || allLeads.length) > 0,
      why: "A real or demo lead proves the pipeline is usable from capture to follow-up.",
      actionLabel: "New lead",
      action: () => setShowCreate(true),
    },
    {
      label: "Convert first lead to customer/job",
      complete: (moduleStatus?.convertedThisMonth || convertedThisMonth) > 0 || allLeads.some((lead) => lead.status === "converted" || lead.convertedAt),
      why: "Conversion proves the Lead Center connects into the existing lead-to-cash workflow.",
      actionLabel: "Open leads",
      action: () => {
        const lead = allLeads.find((item) => item.status !== "converted") || allLeads[0];
        if (lead) openLead(lead);
      },
    },
  ];
  const setupCompleteCount = setupChecklist.filter((item) => item.complete).length;
  const setupProgress = Math.round((setupCompleteCount / setupChecklist.length) * 100);
  const moduleModeLabel = moduleStatus?.mode
    ? labelize(moduleStatus.mode)
    : "Checking";
  const operatingMode = modePresentation(moduleStatus?.mode, settingsForm.dryRun);
  const OperatingModeIcon = operatingMode.icon;
  const nextBestAction = moduleStatus?.blockers[0] || moduleStatus?.nextSteps[0] || "Lead Conversion Center is ready to use.";
  const loadError = leadsError || settingsError || moduleStatusError;
  const currentDemoStep = LEAD_DEMO_WALKTHROUGH_STEPS[demoStep];
  const isDemoRoute = location === "/leads/demo";
  const firstRunNeeded = !!moduleStatus && !moduleStatus.setupComplete && !firstRunDismissed;
  const demoHighlight = (focus: LeadDemoWalkthroughStep["focus"]) =>
    showDemoWalkthrough && currentDemoStep.focus === focus
      ? "ring-2 ring-primary/40 border-primary/60 shadow-sm"
      : "";
  const runDemoAction = () => {
    if (currentDemoStep.focus === "capture") setShowCapture(true);
    if (currentDemoStep.focus === "score") {
      const lead = hotOperatorLeads[0] || allLeads[0];
      if (lead) openLead(lead);
    }
    if (currentDemoStep.focus === "hot") setHotOnly(true);
    if (currentDemoStep.focus === "followup") setDueOnly(true);
    if (currentDemoStep.focus === "message") setShowSettings(true);
    if (currentDemoStep.focus === "convert") {
      const lead = allLeads.find((item) => item.status === "qualified" || item.status === "follow_up") || allLeads[0];
      if (lead) openLead(lead);
    }
  };
  const demoNext = () => setDemoStep((step) => Math.min(LEAD_DEMO_WALKTHROUGH_STEPS.length - 1, step + 1));
  const demoPrevious = () => setDemoStep((step) => Math.max(0, step - 1));
  const reportPeriodLabel = reportRange === "all" ? "All time" : `Last ${reportRange} days`;
  const reportSummary = [
    `${reportPeriodLabel} Lead Conversion Center summary`,
    `Leads captured: ${reportLeads.length}`,
    `Leads converted: ${reportConverted.length} (${reportConversionRate}%)`,
    `Estimated converted opportunity value: ${money(reportEstimatedValue)}`,
    `Average recorded response time: ${averageResponseMinutes == null ? "Not enough response data" : `${averageResponseMinutes} minutes`}`,
    `Overdue follow-ups now: ${overdueLeads.length}`,
    `Top source: ${topSource ? `${labelize(topSource.source)} (${topSource.converted} converted)` : "No source data yet"}`,
  ].join("\n");

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Lead Conversion Center"
        description="Know who to call first, follow up before leads go cold, and turn qualified work into jobs."
        actions={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-create-lead">
              <Plus className="h-4 w-4 mr-1" />
              New Lead
            </Button>
            <Button
              size="sm"
              variant={workspaceView === "performance" ? "secondary" : "outline"}
              onClick={() => {
                setWorkspaceView(workspaceView === "performance" ? "work" : "performance");
                navigate(workspaceView === "performance" ? "/leads" : "/leads?view=performance");
              }}
            >
              <BarChart3 className="h-4 w-4 mr-1" />
              {workspaceView === "performance" ? "Lead Center" : "Performance"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowSetup(true)}>
              <Sparkles className="h-4 w-4 mr-1" />
              Setup
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowSettings(true)}>
              <Settings className="h-4 w-4 mr-1" />
              Settings
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4">
        <div className={`flex flex-col gap-3 border-l-4 p-4 sm:flex-row sm:items-center sm:justify-between ${operatingMode.className}`} data-testid="lead-operating-mode">
          <div className="flex items-start gap-3">
            <OperatingModeIcon className={`mt-0.5 h-5 w-5 shrink-0 ${operatingMode.iconClassName}`} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{operatingMode.label}</p>
                <Badge variant="outline">{moduleStatusLoading ? "Checking setup" : moduleStatus?.setupComplete ? "Setup complete" : "Setup incomplete"}</Badge>
              </div>
              <p className="mt-1 text-sm">{operatingMode.description}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowSettings(true)}>Review readiness</Button>
            <Button size="sm" variant="outline" onClick={() => {
              setShowDemoWalkthrough(true);
              if (location !== "/leads/demo") navigate("/leads/demo");
            }}>Demo walkthrough</Button>
          </div>
        </div>

        {loadError && (
          <Alert variant="destructive">
            <AlertTitle>Lead Center could not load completely</AlertTitle>
            <AlertDescription>{loadError instanceof Error ? loadError.message : "Check the server logs."}</AlertDescription>
          </Alert>
        )}

        {providerStatus && dryRunActive && !providerStatus.twilio.configured && !providerStatus.sendgrid.configured && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Provider not configured</AlertTitle>
            <AlertDescription>Dry-run mode is active, so messages are prepared in the timeline without sending SMS or email.</AlertDescription>
          </Alert>
        )}

        {workspaceView === "performance" && (
          <div className="space-y-4" data-testid="lead-performance-report">
            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">Lead performance</Badge>
                      <Badge variant="outline">{reportPeriodLabel}</Badge>
                    </div>
                    <h2 className="mt-2 text-xl font-semibold">Are leads turning into real opportunities?</h2>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                      Review capture volume, response speed, source quality, follow-up risk, and estimated converted opportunity value.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Select value={reportRange} onValueChange={(value) => setReportRange(value as "30" | "90" | "all")}>
                      <SelectTrigger className="w-full sm:w-[160px]" aria-label="Report date range"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">Last 30 days</SelectItem>
                        <SelectItem value="90">Last 90 days</SelectItem>
                        <SelectItem value="all">All time</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={() => copyText(reportSummary, "Performance summary copied")}>
                      <Copy className="mr-1 h-4 w-4" />
                      Copy summary
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <StatCard icon={UserPlus} label="Leads Captured" value={reportLeads.length} sub={reportPeriodLabel} />
              <StatCard icon={Target} label="Converted" value={reportConverted.length} sub={`${reportConversionRate}% conversion rate`} />
              <StatCard icon={Clock} label="Average Response" value={averageResponseMinutes == null ? "No data" : `${averageResponseMinutes} min`} sub="Recorded contacts only" />
              <StatCard icon={AlertTriangle} label="Overdue Now" value={overdueLeads.length} sub="Needs follow-up" />
              <StatCard icon={DollarSign} label="Converted Value" value={money(reportEstimatedValue)} sub="Estimated opportunity value" />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Which lead sources are working?
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {sourcePerformance.length === 0 ? (
                    <div className="py-8 text-center">
                      <Globe2 className="mx-auto h-9 w-9 text-muted-foreground" />
                      <p className="mt-3 font-medium">No source performance yet</p>
                      <p className="mt-1 text-sm text-muted-foreground">Create or capture leads to compare which sources produce qualified work.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sourcePerformance.map((source) => {
                        const conversionRate = source.captured ? Math.round((source.converted / source.captured) * 100) : 0;
                        return (
                          <div key={source.source} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_repeat(3,minmax(90px,auto))] sm:items-center">
                            <div>
                              <p className="font-medium">{labelize(source.source)}</p>
                              <p className="text-xs text-muted-foreground">{conversionRate}% converted</p>
                            </div>
                            <div><p className="text-xs text-muted-foreground">Captured</p><p className="font-semibold">{source.captured}</p></div>
                            <div><p className="text-xs text-muted-foreground">Converted</p><p className="font-semibold">{source.converted}</p></div>
                            <div><p className="text-xs text-muted-foreground">Est. value</p><p className="font-semibold">{money(source.estimatedValue)}</p></div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">What should we fix next?</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {needsContactLeads.length > 0 && (
                    <button type="button" onClick={() => { setWorkspaceView("work"); setStatusFilter("new"); }} className="w-full rounded-md border p-3 text-left hover:bg-muted/40">
                      <p className="font-medium">{needsContactLeads.length} lead{needsContactLeads.length === 1 ? "" : "s"} still need first contact</p>
                      <p className="mt-1 text-xs text-muted-foreground">Open the Lead Center and call the oldest new leads first.</p>
                    </button>
                  )}
                  {overdueLeads.length > 0 && (
                    <button type="button" onClick={() => { setWorkspaceView("work"); setOverdueOnly(true); }} className="w-full rounded-md border border-red-200 p-3 text-left hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/20">
                      <p className="font-medium">{overdueLeads.length} overdue follow-up{overdueLeads.length === 1 ? "" : "s"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Follow up before these opportunities go cold.</p>
                    </button>
                  )}
                  {(operatorDashboard?.failedAttempts.length || 0) > 0 && (
                    <button type="button" onClick={() => setShowSettings(true)} className="w-full rounded-md border p-3 text-left hover:bg-muted/40">
                      <p className="font-medium">{operatorDashboard?.failedAttempts.length} message issue{operatorDashboard?.failedAttempts.length === 1 ? "" : "s"} need review</p>
                      <p className="mt-1 text-xs text-muted-foreground">Review message readiness and recent failures.</p>
                    </button>
                  )}
                  {needsContactLeads.length === 0 && overdueLeads.length === 0 && (operatorDashboard?.failedAttempts.length || 0) === 0 && (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
                      <p className="font-medium">No immediate lead risks</p>
                      <p className="mt-1 text-xs text-muted-foreground">New leads are contacted, follow-ups are current, and no message failures are waiting.</p>
                    </div>
                  )}
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Value note</p>
                    <p className="mt-1 text-sm">Converted value uses lead estimates. It is not booked revenue or a guaranteed return.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {workspaceView === "work" && (
          <>
        {firstRunNeeded && (
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <Badge variant="secondary">First run</Badge>
                  <h2 className="text-lg font-semibold">Set up your Lead Conversion Center</h2>
                  <p className="max-w-2xl text-sm text-muted-foreground">
                    Capture every lead, prioritize urgent opportunities, and convert qualified leads into booked jobs.
                  </p>
                  <div className="grid gap-2 pt-2 sm:grid-cols-2 lg:grid-cols-3">
                    {LEAD_FIRST_RUN_CHECKLIST.map((item) => (
                      <div key={item} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setShowSetup(true)}>Continue setup</Button>
                  <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>Create first lead</Button>
                  <Button size="sm" variant="ghost" onClick={() => setFirstRunDismissed(true)}>Dismiss</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {(showDemoWalkthrough || isDemoRoute) && (
          <Card className="border-primary/40">
            <CardContent className="p-4">
              <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Badge variant="secondary">Sales demo</Badge>
                    <h2 className="text-xl font-semibold">See the lead-to-job path in under a minute</h2>
                    <p className="text-sm text-muted-foreground">
                      Show how a contractor captures a request, knows who to call first, follows up before the lead goes cold, and turns qualified work into a customer and job.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      ["Problem solved", "No more lost forms, calls, or manual notes."],
                      ["Lead entry", "Website, call, manual, and source links feed the same pipeline."],
                      ["Priority", "Hot leads rise to the top for fast contact."],
                      ["Conversion", "Qualified leads become customers and jobs."],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="mt-1 text-sm font-medium">{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setShowSetup(true)}>Start setup</Button>
                    <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>Add first lead</Button>
                    {isDemoRoute && <Button size="sm" variant="ghost" onClick={() => navigate("/leads")}>Open Lead Center</Button>}
                  </div>
                </div>

                <div className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Step {demoStep + 1} of {LEAD_DEMO_WALKTHROUGH_STEPS.length}</p>
                      <h3 className="mt-1 text-lg font-semibold">{currentDemoStep.title}</h3>
                    </div>
                    <Badge variant="outline">{currentDemoStep.outcome}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{currentDemoStep.detail}</p>
                  <div className="mt-4 grid grid-cols-6 gap-1.5">
                    {LEAD_DEMO_WALKTHROUGH_STEPS.map((step, index) => (
                      <button
                        key={step.title}
                        type="button"
                        aria-label={step.title}
                        onClick={() => setDemoStep(index)}
                        className={`h-2 rounded-full ${index === demoStep ? "bg-primary" : "bg-muted"}`}
                      />
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={demoPrevious} disabled={demoStep === 0}>
                        <ArrowLeft className="mr-1 h-4 w-4" />
                        Previous
                      </Button>
                      <Button size="sm" variant="outline" onClick={demoNext} disabled={demoStep === LEAD_DEMO_WALKTHROUGH_STEPS.length - 1}>
                        Next
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={runDemoAction}>{currentDemoStep.actionLabel}</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (isDemoRoute) {
                            navigate("/leads");
                            return;
                          }
                          setShowDemoWalkthrough(false);
                        }}
                      >
                        Close walkthrough
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className={demoHighlight("capture")}>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={activeTemplate ? "default" : "outline"}>{activeTemplate?.tradeName || "No trade selected"}</Badge>
                  {settingsForm.serviceArea && <Badge variant="secondary"><MapPin className="mr-1 h-3 w-3" />{settingsForm.serviceArea}</Badge>}
                  <Badge variant="outline">Dry-run templates</Badge>
                </div>
                <h2 className="text-base font-semibold">Trade-specific lead setup</h2>
                <p className="max-w-3xl text-sm text-muted-foreground">
                  Choose a contractor template to tune service choices, hot lead signals, qualification prompts, and follow-up defaults for the trade.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowSetup(true)}>
                  <Sparkles className="mr-1 h-4 w-4" />
                  Run setup
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowSettings(true)}>Review settings</Button>
              </div>
            </div>
            {activeTemplate ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-medium text-muted-foreground">Service categories</p>
                  <p className="mt-1 text-sm">{activeTemplate.serviceCategories.slice(0, 4).join(", ")}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-medium text-muted-foreground">Hot lead keywords</p>
                  <p className="mt-1 text-sm">{activeTemplate.urgencyKeywords.slice(0, 4).join(", ")}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-medium text-muted-foreground">Follow-up rhythm</p>
                  <p className="mt-1 text-sm">{activeTemplate.defaultFollowUpSequence.map((step) => step.label).join(", ")}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-medium text-muted-foreground">Qualification prompts</p>
                  <p className="mt-1 text-sm">{activeTemplate.qualificationQuestions.slice(0, 2).join(" ")}</p>
                </div>
              </div>
            ) : (
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {tradeTemplates.slice(0, 4).map((template) => (
                  <button key={template.tradeKey} type="button" className="rounded-lg border p-3 text-left hover:bg-muted/40" onClick={() => selectTemplate(template.tradeKey)}>
                    <p className="text-sm font-medium">{template.tradeName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{template.serviceCategories.slice(0, 3).join(", ")}</p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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
            className={demoHighlight("hot")}
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
            className={demoHighlight("followup")}
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

        <div className={`grid grid-cols-2 lg:grid-cols-6 gap-3 rounded-lg ${demoHighlight("score")}`}>
          <StatCard icon={UserPlus} label="New Leads" value={stats?.newLeads || 0} />
          <StatCard icon={Flame} label="Hot Leads" value={stats?.hotLeads || 0} sub={`Threshold ${settingsForm.hotLeadThreshold}`} />
          <StatCard icon={Activity} label="Due Follow-Up" value={stats?.needsFollowUp || 0} />
          <StatCard icon={Target} label="Converted This Month" value={convertedThisMonth} sub={`${stats?.converted || 0} all-time`} />
          <StatCard icon={RefreshCw} label="Average Response Time" value="Dry-run" sub="Tracked in activity log" />
          <StatCard icon={DollarSign} label="Pipeline Value" value={money(pipelineValue)} />
        </div>

        <Card className={demoHighlight("message")}>
          <CardContent className="p-4">
            <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold">{leadModule.displayName}</h2>
                      <Badge variant="secondary">Add-on module</Badge>
                      <Badge variant={moduleStatus?.enabled === false ? "destructive" : "outline"}>
                        {moduleStatus?.enabled === false ? "Plan required" : moduleModeLabel}
                      </Badge>
                      {(hasDemoData || moduleStatus?.demoDataPresent) && <Badge variant="outline">Demo data</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground max-w-3xl">
                      Never lose another lead. Respond faster, follow up automatically, and convert opportunities into booked jobs.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setShowSetup(true)}>
                    <ListChecks className="mr-1 h-4 w-4" />
                    Continue setup
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Current status</p>
                    <p className="mt-1 text-lg font-semibold">{moduleStatusLoading ? "Checking..." : moduleModeLabel}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {settingsForm.dryRun ? "Messages are logged but not sent." : moduleStatus?.messagingLive ? "Live messaging is ready." : "Live mode needs attention."}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Setup progress</p>
                    <p className="mt-1 text-lg font-semibold">{setupProgress}%</p>
                    <div className="mt-2 h-2 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-primary" style={{ width: `${setupProgress}%` }} />
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Next best action</p>
                    <p className="mt-1 text-sm font-medium">{nextBestAction}</p>
                  </div>
                </div>

                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  {leadModule.valueBullets.map((item) => (
                    <div key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Connected lead sources</p>
                  <p className="mt-1 text-2xl font-bold">{moduleStatus?.usageSummary.activeLeadSources ?? activeLeadSources.length}</p>
                  <p className="text-xs text-muted-foreground">{moduleStatus?.publicFormsConfigured || captureForm.publicToken ? "Public form ready" : "Public form not ready"}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Messaging mode</p>
                  <p className="mt-1 text-2xl font-bold">{settingsForm.dryRun ? "Dry-run" : moduleStatus?.messagingLive ? "Live" : "Blocked"}</p>
                  <p className="text-xs text-muted-foreground">{moduleStatus?.smsReady ? "SMS ready" : "SMS not ready"} · {moduleStatus?.emailReady ? "Email ready" : "Email not ready"}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Leads captured this month</p>
                  <p className="mt-1 text-2xl font-bold">{moduleStatus?.usageSummary.leadsThisMonth ?? 0}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Leads converted this month</p>
                  <p className="mt-1 text-2xl font-bold">{moduleStatus?.convertedThisMonth ?? convertedThisMonth}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Follow-ups scheduled</p>
                  <p className="mt-1 text-2xl font-bold">{moduleStatus?.usageSummary.followupsScheduled ?? 0}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Messages prepared</p>
                  <p className="mt-1 text-2xl font-bold">{moduleStatus?.usageSummary.messagesPrepared ?? 0}</p>
                  <p className="text-xs text-muted-foreground">{moduleStatus?.usageSummary.messagesDryRun ?? 0} dry-run · {moduleStatus?.usageSummary.messagesSent ?? 0} sent</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-3 text-base">
              <span className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" />
                Setup Checklist
              </span>
              <Badge variant={moduleStatus?.setupComplete ? "default" : "outline"}>
                {setupCompleteCount}/{setupChecklist.length} complete
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {setupChecklist.map((item) => (
              <div key={item.label} className="rounded-lg border p-3">
                <div className="flex items-start gap-2">
                  {item.complete ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.why}</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="mt-3" onClick={item.action}>
                  {item.actionLabel}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between gap-3 text-base">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Deployment Checklist
                </span>
                <Badge variant="outline">{deploymentCompleteCount}/{deploymentChecks.length} ready</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {deploymentChecks.map((item) => (
                <div key={item.key} className="rounded-lg border p-3">
                  <div className="flex items-start gap-2">
                    {item.complete ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.explanation}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => {
                      if (item.key === "capture_form") setShowCapture(true);
                      else if (["trade_template", "business_settings", "lead_source", "templates", "followups", "dry_run_test"].includes(item.key)) setShowSetup(true);
                      else if (item.key === "production_readiness") setShowSettings(true);
                      else if (item.key === "handoff" || item.key === "first_week_review" || item.key === "go_live" || item.key === "discovery") setShowSettings(true);
                    }}
                  >
                    {item.action}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-primary" />
                First Week Monitor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Leads captured</p>
                  <p className="mt-1 text-2xl font-bold">{firstWeekLeads.length}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Hot leads</p>
                  <p className="mt-1 text-2xl font-bold">{moduleStatus?.hotLeads ?? stats?.hotLeads ?? 0}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Overdue follow-ups</p>
                  <p className="mt-1 text-2xl font-bold">{moduleStatus?.overdueFollowUps ?? overdueLeads.length}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Failed messages</p>
                  <p className="mt-1 text-2xl font-bold">{moduleStatus?.usageSummary.failedMessageAttempts ?? operatorDashboard?.failedAttempts.length ?? 0}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Converted leads</p>
                  <p className="mt-1 text-2xl font-bold">{firstWeekConverted.length}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Current mode</p>
                  <p className="mt-1 text-sm font-semibold">{productionReadiness ? labelize(productionReadiness.currentMode) : moduleModeLabel}</p>
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Last lead source event</p>
                <p className="mt-1 text-sm font-medium">
                  {firstWeekLastSourceEvent
                    ? `${labelize(firstWeekLastSourceEvent.adapterKey)} · ${labelize(firstWeekLastSourceEvent.status)}`
                    : "No source events yet"}
                </p>
                {firstWeekLastSourceEvent && (
                  <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(firstWeekLastSourceEvent.createdAt), { addSuffix: true })}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>Create test lead</Button>
                <Button size="sm" variant="outline" onClick={() => setShowSettings(true)}>Review readiness</Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className={demoHighlight("convert")}>
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
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
            <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
              <div className="relative w-full sm:min-w-[220px] sm:max-w-md sm:flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search name, phone, email, address, service..." value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-leads" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {pipelineStages.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                  <SelectItem value="spam">Spam</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  {sourceOptions.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
                <SelectTrigger className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Urgency</SelectItem>
                  {urgencyOptions.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button className="w-full sm:w-auto" variant={hotOnly ? "default" : "outline"} size="sm" onClick={() => setHotOnly(!hotOnly)}>
                <Flame className="h-4 w-4 mr-1" />
                Hot
              </Button>
              <Button className="w-full sm:w-auto" variant={dueOnly ? "default" : "outline"} size="sm" onClick={() => setDueOnly(!dueOnly)}>
                <Activity className="h-4 w-4 mr-1" />
                Needs follow-up
              </Button>
              <Button className="w-full sm:w-auto" variant={overdueOnly ? "default" : "outline"} size="sm" onClick={() => setOverdueOnly(!overdueOnly)}>
                <AlertTriangle className="h-4 w-4 mr-1" />
                Overdue
              </Button>
              <span className="text-center text-sm text-muted-foreground sm:text-left">{leads.length} lead{leads.length !== 1 ? "s" : ""}</span>
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
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
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
          </>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] overflow-auto p-4 sm:max-w-2xl sm:p-6">
          <DialogHeader>
            <DialogTitle>New Lead</DialogTitle>
            <DialogDescription>Add the contact and service request now. You can score, follow up, and convert it after saving.</DialogDescription>
          </DialogHeader>
          <LeadFields form={createForm} setForm={setCreateForm} template={activeTemplate} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button className="w-full sm:w-auto" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button className="w-full sm:w-auto" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !createForm.name.trim()} data-testid="button-save-lead">
              {createMutation.isPending ? "Creating..." : "Create Lead"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSetup} onOpenChange={setShowSetup}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] overflow-auto p-4 sm:max-w-5xl sm:p-6">
          <DialogHeader>
            <DialogTitle>Lead Conversion Setup</DialogTitle>
            <DialogDescription>Configure how leads are captured, prioritized, followed up, and prepared for launch.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
            <div className="space-y-2">
              {setupSteps.map((step, index) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setSetupStep(index)}
                  className={`w-full rounded-lg border p-3 text-left text-sm ${setupStep === index ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted/40"}`}
                >
                  <span className="text-xs text-muted-foreground">Step {index + 1}</span>
                  <span className="block font-medium">{step}</span>
                </button>
              ))}
            </div>
            <div className="space-y-4">
              {setupStep === 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Choose your trade</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {tradeTemplates.map((template) => (
                      <button
                        key={template.tradeKey}
                        type="button"
                        onClick={() => selectTemplate(template.tradeKey)}
                        className={`rounded-lg border p-3 text-left hover:bg-muted/40 ${settingsForm.tradeTemplateKey === template.tradeKey ? "border-primary bg-primary/5" : ""}`}
                      >
                        <p className="font-medium">{template.tradeName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{template.exampleLeadText}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {setupStep === 1 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Confirm business and service area</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Business name</Label>
                      <Input readOnly value={org?.name || ""} placeholder="Organization name" />
                      <p className="text-xs text-muted-foreground">Business name is managed in organization settings.</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Service area</Label>
                      <Input value={settingsForm.serviceArea} onChange={(e) => setSettingsForm({ ...settingsForm, serviceArea: e.target.value })} placeholder="Example: Charlotte metro, 25-mile radius" />
                    </div>
                  </div>
                </div>
              )}
              {setupStep === 2 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Choose lead sources</h3>
                  <div className="flex flex-wrap gap-2">
                    {(activeTemplate?.defaultLeadSources || ["Website Form", "Missed Call", "Referral", "Manual Entry"]).map((source) => (
                      <Button key={source} type="button" variant={settingsForm.leadSources.includes(source) ? "default" : "outline"} onClick={() => toggleLeadSource(source)}>
                        {source}
                      </Button>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">Selected sources help staff use consistent lead labels. They do not connect external platforms yet.</p>
                </div>
              )}
              {setupStep === 3 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Review service categories</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(activeTemplate?.serviceCategories || []).map((service) => (
                      <div key={service} className="rounded-lg border p-3 text-sm">{service}</div>
                    ))}
                  </div>
                  {!activeTemplate && <p className="text-sm text-muted-foreground">Choose a trade first to see service categories.</p>}
                </div>
              )}
              {setupStep === 4 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Review message templates</h3>
                  <div className="space-y-1.5">
                    <Label>SMS template</Label>
                    <Textarea rows={2} value={settingsForm.defaultSmsTemplate} onChange={(e) => setSettingsForm({ ...settingsForm, defaultSmsTemplate: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email subject</Label>
                    <Input value={settingsForm.defaultEmailSubject} onChange={(e) => setSettingsForm({ ...settingsForm, defaultEmailSubject: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email template</Label>
                    <Textarea rows={4} value={settingsForm.defaultEmailTemplate} onChange={(e) => setSettingsForm({ ...settingsForm, defaultEmailTemplate: e.target.value })} />
                  </div>
                  <Alert>
                    <MessageSquare className="h-4 w-4" />
                    <AlertTitle>Dry-run only</AlertTitle>
                    <AlertDescription>Setup prepares templates and follow-up tasks. It does not send SMS or email.</AlertDescription>
                  </Alert>
                </div>
              )}
              {setupStep === 5 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Review follow-up sequence</h3>
                  <div className="space-y-2">
                    {(activeTemplate?.defaultFollowUpSequence || []).map((step) => (
                      <div key={step.stepNumber} className="rounded-lg border p-3">
                        <p className="text-sm font-medium">{step.label}</p>
                        <p className="text-xs text-muted-foreground">Day {step.delayDays} · {step.channel.toUpperCase()} · {step.messageTemplate}</p>
                      </div>
                    ))}
                  </div>
                  {!activeTemplate && <p className="text-sm text-muted-foreground">Choose a trade first to see follow-up defaults.</p>}
                </div>
              )}
              {setupStep === 6 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold">Launch plan</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Confirm what is ready, what stays in dry-run, and what to do next before the team uses this with real leads.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Trade</p>
                      <p className="font-medium">{activeTemplate?.tradeName || "Not selected"}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Service area</p>
                      <p className="font-medium">{settingsForm.serviceArea || "Not set"}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Lead capture link</p>
                      <p className="font-medium">{captureForm.publicToken ? "Ready to copy" : "Not ready"}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Lead sources</p>
                      <p className="font-medium">{activeLeadSources.length > 0 ? `${activeLeadSources.length} selected` : "Not set"}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Follow-up sequence</p>
                      <p className="font-medium">{settingsForm.followUpEnabled ? "Enabled" : "Not enabled"}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Messaging</p>
                      <p className="font-medium">{settingsForm.dryRun ? "Dry-run" : moduleStatus?.messagingLive ? "Live" : "Needs attention"}</p>
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Next best action</p>
                    <p className="mt-1 text-sm font-medium">{nextBestAction}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>Add first lead</Button>
                      <Button size="sm" variant="outline" onClick={() => setShowCapture(true)}>Copy website form link</Button>
                      <Button size="sm" variant="outline" onClick={() => setSetupStep(5)}>Review follow-up sequence</Button>
                      <Button size="sm" variant="outline" onClick={() => setShowSetup(false)}>Open operator dashboard</Button>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between border-t pt-4">
                <Button variant="outline" disabled={setupStep === 0} onClick={() => setSetupStep(Math.max(0, setupStep - 1))}>Back</Button>
                {setupStep < setupSteps.length - 1 ? (
                  <Button onClick={() => setSetupStep(Math.min(setupSteps.length - 1, setupStep + 1))}>Next</Button>
                ) : (
                  <Button onClick={finishSetup} disabled={!settingsForm.tradeTemplateKey || saveSettingsMutation.isPending}>
                    {saveSettingsMutation.isPending ? "Saving..." : "Finish setup"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCapture} onOpenChange={setShowCapture}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] overflow-auto p-4 sm:max-w-4xl sm:p-6">
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
                  {activeTemplate ? (
                    <Select value={captureForm.defaultServiceType || undefined} onValueChange={(v) => setCaptureForm({ ...captureForm, defaultServiceType: v })}>
                      <SelectTrigger><SelectValue placeholder="Choose default service" /></SelectTrigger>
                      <SelectContent>
                        {activeTemplate.serviceCategories.map((service) => <SelectItem key={service} value={service}>{service}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={captureForm.defaultServiceType} onChange={(e) => setCaptureForm({ ...captureForm, defaultServiceType: e.target.value })} />
                  )}
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
                  <Button aria-label="Copy public form link" title="Copy public form link" variant="outline" onClick={() => copyText(captureEndpoint, "Public form link copied")} disabled={!captureEndpoint}><Copy className="h-4 w-4" /></Button>
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
                  {activeTemplate ? (
                    <Select value={captureForm.defaultServiceType || activeTemplate.serviceCategories[0]}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {activeTemplate.serviceCategories.map((service) => <SelectItem key={service} value={service}>{service}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input readOnly placeholder="Service requested" value={captureForm.defaultServiceType} />
                  )}
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
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] overflow-auto p-4 sm:max-w-3xl sm:p-6">
          <DialogHeader>
            <DialogTitle>Lead Settings and Readiness</DialogTitle>
            <DialogDescription>Review lead sources, message safety, templates, follow-ups, and the go-live checklist.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ListChecks className="h-4 w-4 text-primary" />
                  Trade template
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Active trade</Label>
                    <Select value={settingsForm.tradeTemplateKey || undefined} onValueChange={selectTemplate}>
                      <SelectTrigger><SelectValue placeholder="Choose trade" /></SelectTrigger>
                      <SelectContent>
                        {tradeTemplates.map((template) => (
                          <SelectItem key={template.tradeKey} value={template.tradeKey}>{template.tradeName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Service area</Label>
                    <Input value={settingsForm.serviceArea} onChange={(e) => setSettingsForm({ ...settingsForm, serviceArea: e.target.value })} placeholder="City, county, or service radius" />
                  </div>
                </div>
                {activeTemplate && (
                  <div className="space-y-2">
                    <Label>Lead sources</Label>
                    <div className="flex flex-wrap gap-2">
                      {activeTemplate.defaultLeadSources.map((source) => (
                        <Button
                          key={source}
                          type="button"
                          size="sm"
                          variant={settingsForm.leadSources.includes(source) ? "default" : "outline"}
                          onClick={() => toggleLeadSource(source)}
                        >
                          {source}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">These labels tune setup defaults and public-form copy. They do not expose org IDs or secrets.</p>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Globe2 className="h-4 w-4 text-primary" />
                  Lead sources
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
                  <div className="space-y-1.5">
                    <Label>Connection type</Label>
                    <Select value={selectedAdapterKey} onValueChange={setSelectedAdapterKey}>
                      <SelectTrigger><SelectValue placeholder="Choose adapter" /></SelectTrigger>
                      <SelectContent>
                        {sourceAdapters.map((adapter) => (
                          <SelectItem key={adapter.key} value={adapter.key}>{adapter.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Lead source URL</Label>
                    <div className="flex gap-2">
                      <Input readOnly value={adapterEndpoint} />
                      <Button aria-label="Copy lead source URL" title="Copy lead source URL" variant="outline" onClick={() => copyText(adapterEndpoint, "Lead source URL copied")} disabled={!adapterEndpoint}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={captureForm.isEnabled ? "default" : "outline"}>{captureForm.isEnabled ? "Enabled" : "Disabled"}</Badge>
                  <Badge variant="secondary">{selectedAdapter?.label || "Lead source"}</Badge>
                  <Badge variant="outline">{operatingMode.label}</Badge>
                  <span className="text-xs text-muted-foreground">Submissions received through this URL become leads in this org.</span>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Example submission</Label>
                      <Button size="sm" variant="outline" onClick={() => copyText(adapterExampleJson, "Example payload copied")} disabled={!adapterExampleJson}>
                        <Copy className="mr-1 h-3 w-3" />
                        Copy JSON
                      </Button>
                    </div>
                    <Textarea readOnly rows={10} value={adapterExampleJson} className="font-mono text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Recent lead source activity</Label>
                    <div className="space-y-2 rounded-lg border p-2">
                      {sourceEvents.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">No lead source activity yet. New submissions and blocked requests will appear here.</p>
                      ) : sourceEvents.slice(0, 5).map((event) => (
                        <div key={event.id} className="rounded-md border p-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium">{event.adapterKey}</p>
                            <Badge variant={event.status === "success" ? "default" : "destructive"}>{labelize(event.status)}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}</p>
                          {event.error && <p className="text-xs text-destructive">{event.error}</p>}
                          {event.leadId && <p className="text-xs text-muted-foreground">Lead captured</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="grid sm:grid-cols-3 gap-3">
              <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Twilio</p><Badge variant={providerStatus?.twilio.configured ? "default" : "outline"}>{providerStatus?.twilio.configured ? "Configured" : "Not configured"}</Badge><p className="mt-1 text-xs text-muted-foreground">{providerStatus?.twilio.fromPhoneConfigured ? "From phone ready" : "From phone missing"}</p></CardContent></Card>
              <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">SendGrid</p><Badge variant={providerStatus?.sendgrid.configured ? "default" : "outline"}>{providerStatus?.sendgrid.configured ? "Configured" : "Not configured"}</Badge><p className="mt-1 text-xs text-muted-foreground">{providerStatus?.sendgrid.fromEmailConfigured ? "From email ready" : "From email missing"}</p></CardContent></Card>
              <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">OpenAI</p><Badge variant={providerStatus?.openai.configured ? "default" : "secondary"}>{providerStatus?.openai.configured ? "Configured" : "Fallback mode"}</Badge></CardContent></Card>
            </div>
            <Alert variant={settingsForm.dryRun ? "default" : "destructive"}>
              <MessageSquare className="h-4 w-4" />
              <AlertTitle>{settingsForm.dryRun ? "Dry-run: messages are logged but not sent" : "Live: messages may be sent to leads"}</AlertTitle>
              <AlertDescription>
                Live SMS and email still require channel enablement, provider readiness, valid recipients, and consent checks before any message is sent.
              </AlertDescription>
            </Alert>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-primary" />
                    Go Live Checklist
                  </span>
                  <Badge variant={productionCanGoLive ? "default" : "outline"}>
                    {productionCompleteCount}/{productionChecks.length || 13} ready
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Current mode</p>
                    <p className="mt-1 text-sm font-semibold">{productionReadiness ? labelize(productionReadiness.currentMode) : "Checking"}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Lead sources</p>
                    <p className="mt-1 text-sm font-semibold">{productionReadiness?.leadSourceStatus.activeLeadSources ?? 0} active</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Provider tests</p>
                    <p className="mt-1 text-sm font-semibold">
                      SMS {productionReadiness?.messagingStatus.testSmsSent ? "passed" : "not passed"} · Email {productionReadiness?.messagingStatus.testEmailSent ? "passed" : "not passed"}
                    </p>
                  </div>
                </div>
                {productionReadiness?.blockers.length ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Live mode is blocked</AlertTitle>
                    <AlertDescription>{productionReadiness.blockers[0]}</AlertDescription>
                  </Alert>
                ) : productionReadiness?.warnings.length ? (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Review before launch</AlertTitle>
                    <AlertDescription>{productionReadiness.warnings[0]}</AlertDescription>
                  </Alert>
                ) : (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>Production checks are ready</AlertTitle>
                    <AlertDescription>Use the live confirmation when the contractor is ready for real lead messages.</AlertDescription>
                  </Alert>
                )}
                <div className="grid gap-2">
                  {productionChecks.map((item) => (
                    <div key={item.key} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-2">
                        {item.status === "complete" ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        ) : item.status === "warning" ? (
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        ) : (
                          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                        )}
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">{item.label}</p>
                            <Badge variant={item.status === "blocked" ? "destructive" : item.status === "warning" ? "outline" : "secondary"}>
                              {item.status === "complete" ? "Ready" : labelize(item.status)}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{item.explanation}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (item.key.includes("capture")) setShowCapture(true);
                          else if (item.key.includes("trade") || item.key.includes("business") || item.key.includes("lead_source") || item.key.includes("templates") || item.key.includes("followups")) setShowSetup(true);
                          else if (item.key.includes("provider") || item.key.includes("test") || item.key.includes("compliance") || item.key.includes("dry_run") || item.key.includes("live")) setShowSettings(true);
                        }}
                      >
                        {item.action}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="flex items-center justify-between rounded-md border px-3 py-2"><span className="text-sm font-medium">Auto-response enabled</span><Switch checked={settingsForm.autoRespond} onCheckedChange={(v) => setSettingsForm({ ...settingsForm, autoRespond: v })} /></label>
              <label className="flex items-center justify-between rounded-md border px-3 py-2"><span className="text-sm font-medium">Follow-up enabled</span><Switch checked={settingsForm.followUpEnabled} onCheckedChange={(v) => setSettingsForm({ ...settingsForm, followUpEnabled: v })} /></label>
              <div className="space-y-1.5">
                <Label>Hot Lead Threshold</Label>
                <Input type="number" min={0} max={100} value={settingsForm.hotLeadThreshold} onChange={(e) => setSettingsForm({ ...settingsForm, hotLeadThreshold: Number(e.target.value) })} />
              </div>
              <label className="flex items-center justify-between rounded-md border px-3 py-2"><span className="text-sm font-medium">Dry-run mode</span><Switch checked={settingsForm.dryRun} onCheckedChange={handleDryRunToggle} /></label>
              <label className="flex items-center justify-between rounded-md border px-3 py-2"><span className="text-sm font-medium">SMS enabled</span><Switch checked={settingsForm.smsEnabled} onCheckedChange={(v) => setSettingsForm({ ...settingsForm, smsEnabled: v })} /></label>
              <label className="flex items-center justify-between rounded-md border px-3 py-2"><span className="text-sm font-medium">Email enabled</span><Switch checked={settingsForm.emailEnabled} onCheckedChange={(v) => setSettingsForm({ ...settingsForm, emailEnabled: v })} /></label>
              <div className="space-y-1.5">
                <Label>Notification Phone</Label>
                <Input value={settingsForm.notificationPhone} onChange={(e) => setSettingsForm({ ...settingsForm, notificationPhone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Notification Email</Label>
                <Input value={settingsForm.notificationEmail} onChange={(e) => setSettingsForm({ ...settingsForm, notificationEmail: e.target.value })} />
              </div>
            </div>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Provider readiness checklist</CardTitle></CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                {[
                  ["Dry-run is off", !settingsForm.dryRun],
                  ["SMS channel enabled", settingsForm.smsEnabled],
                  ["Twilio and from phone ready", !!providerStatus?.twilio.configured && !!providerStatus?.twilio.fromPhoneConfigured],
                  ["SMS opt-out wording present", !!settingsForm.smsComplianceFooter.trim()],
                  ["Email channel enabled", settingsForm.emailEnabled],
                  ["SendGrid and from email ready", !!providerStatus?.sendgrid.configured && !!providerStatus?.sendgrid.fromEmailConfigured],
                  ["Email subject/body present", !!settingsForm.defaultEmailSubject.trim() && !!settingsForm.defaultEmailTemplate.trim()],
                ].map(([label, ready]) => (
                  <div key={String(label)} className="flex items-center gap-2 text-sm">
                    {ready ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
                    <span>{label}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <div className="space-y-1.5">
              <Label>Default SMS Template</Label>
              <Textarea rows={2} value={settingsForm.defaultSmsTemplate} onChange={(e) => setSettingsForm({ ...settingsForm, defaultSmsTemplate: e.target.value })} placeholder="Hi {name}, this is {business}..." />
            </div>
            <div className="space-y-1.5">
              <Label>SMS Compliance Footer</Label>
              <Input value={settingsForm.smsComplianceFooter} onChange={(e) => setSettingsForm({ ...settingsForm, smsComplianceFooter: e.target.value })} placeholder="Reply STOP to opt out." />
              <p className="text-xs text-muted-foreground">Required before live SMS can send. Keep opt-out wording visible and plain.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Default Email Subject</Label>
              <Input value={settingsForm.defaultEmailSubject} onChange={(e) => setSettingsForm({ ...settingsForm, defaultEmailSubject: e.target.value })} placeholder="Thanks for contacting {business}" />
            </div>
            <div className="space-y-1.5">
              <Label>Default Email Template</Label>
              <Textarea rows={3} value={settingsForm.defaultEmailTemplate} onChange={(e) => setSettingsForm({ ...settingsForm, defaultEmailTemplate: e.target.value })} placeholder="Hi {name}, thanks for reaching out..." />
            </div>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Send test messages</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Test SMS destination</Label>
                  <Input value={testMessage.smsTo} onChange={(e) => setTestMessage({ ...testMessage, smsTo: e.target.value })} placeholder="+15551234567" />
                  <Button size="sm" variant="outline" onClick={() => sendTestMessageMutation.mutate({ channel: "sms" })} disabled={!smsReady || sendTestMessageMutation.isPending}>
                    Send test SMS
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>Test email destination</Label>
                  <Input value={testMessage.emailTo} onChange={(e) => setTestMessage({ ...testMessage, emailTo: e.target.value })} placeholder="owner@example.com" />
                  <Input value={testMessage.emailSubject} onChange={(e) => setTestMessage({ ...testMessage, emailSubject: e.target.value })} placeholder="Test email subject" />
                  <Button size="sm" variant="outline" onClick={() => sendTestMessageMutation.mutate({ channel: "email" })} disabled={!emailReady || sendTestMessageMutation.isPending}>
                    Send test email
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Button onClick={() => saveSettingsMutation.mutate(undefined)} disabled={saveSettingsMutation.isPending}>Save Settings</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showLiveConfirm} onOpenChange={(open) => {
        setShowLiveConfirm(open);
        if (!open) setLiveConfirmText("");
      }}>
        <DialogContent className="w-[calc(100vw-1rem)] p-4 sm:max-w-lg sm:p-6">
          <DialogHeader>
            <DialogTitle>Enable live lead messaging?</DialogTitle>
            <DialogDescription>
              Messages may be sent to real leads once dry-run is off. SMS requires consent, provider settings must be correct, templates should be reviewed, and compliance is your responsibility.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Live messages are controlled but real</AlertTitle>
              <AlertDescription>
                TradeFlowKit will still block sends without consent, provider readiness, templates, and valid recipients. This confirmation only allows the org to leave dry-run mode.
              </AlertDescription>
            </Alert>
            {productionReadiness && !productionReadiness.canGoLive && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Checklist needs attention</AlertTitle>
                <AlertDescription>{productionReadiness.blockers[0] || productionReadiness.warnings[0] || "Review the Go Live Checklist before enabling live mode."}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label>
                Type <span className="font-mono">{LIVE_LEADS_CONFIRMATION_PHRASE}</span> to continue
              </Label>
              <Input
                value={liveConfirmText}
                onChange={(event) => setLiveConfirmText(event.target.value)}
                placeholder={LIVE_LEADS_CONFIRMATION_PHRASE}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowLiveConfirm(false);
                setLiveConfirmText("");
              }}
            >
              Keep dry-run on
            </Button>
            <Button
              variant="destructive"
              onClick={confirmLiveMode}
              disabled={liveConfirmText !== LIVE_LEADS_CONFIRMATION_PHRASE || saveSettingsMutation.isPending}
            >
              Enable live mode
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedLeadId} onOpenChange={(open) => !open && setSelectedLeadId(null)}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] overflow-auto p-4 sm:max-w-5xl sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center justify-between gap-3">
              <span>{selectedLead?.name || "Lead Detail"}</span>
              {selectedLead && <LeadScoreBadge lead={selectedLead} breakdown={breakdown} />}
            </DialogTitle>
            <DialogDescription>Review the service request, contact the lead, prepare follow-up, or convert qualified work into a job.</DialogDescription>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-5">
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-col gap-3 rounded-md bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Next best action</p>
                      <p className="mt-1 font-semibold">
                        {needsContact(selectedLead)
                          ? "Call this lead now"
                          : isOverdue(selectedLead)
                            ? "Complete the overdue follow-up"
                            : selectedLead.status === "qualified" || selectedLead.status === "follow_up"
                              ? "Convert qualified work into a job"
                              : selectedLead.status === "converted"
                                ? "Open the linked customer or job"
                                : "Review the request and move the lead forward"}
                      </p>
                    </div>
                    <Badge variant={settingsForm.dryRun ? "outline" : "default"}>{operatingMode.label}</Badge>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Current status</p>
                      <Badge className="mt-1" variant={selectedLead.status === "converted" ? "default" : "outline"}>{labelize(selectedLead.status)}</Badge>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Next follow-up</p>
                      <p className="mt-1 text-sm font-medium">
                        {formatLeadDate(selectedLead.nextFollowUpAt, "MMM d, h:mm a", "No follow-up scheduled")}
                      </p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Response status</p>
                      <div className="mt-1"><LeadSlaBadge lead={selectedLead} activities={activities} /></div>
                    </div>
                  </div>
                  <LeadFlow status={selectedLead.status} />
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    {selectedLead.phone && (
                      <Button asChild size="sm">
                        <a href={`tel:${selectedLead.phone}`}><Phone className="mr-1 h-4 w-4" />Call Now</a>
                      </Button>
                    )}
                    <Button size="sm" variant={selectedLead.phone ? "outline" : "default"} onClick={() => updateMutation.mutate({ status: "contacted" })}>Mark Contacted</Button>
                    <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ status: "qualified" })}>Mark Qualified</Button>
                    <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ action: "score" })}><RefreshCw className="h-4 w-4 mr-1" />Re-score</Button>
                    <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ action: "send-sms" })} disabled={!selectedLead.phone}><MessageSquare className="h-4 w-4 mr-1" />{settingsForm.dryRun ? "Prepare SMS" : "Send SMS"}</Button>
                    <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ action: "send-email" })} disabled={!selectedLead.email}><Mail className="h-4 w-4 mr-1" />{settingsForm.dryRun ? "Prepare Email" : "Send Email"}</Button>
                    <Button size="sm" onClick={() => actionMutation.mutate({ action: "convert" })} disabled={selectedLead.status === "converted"}><Target className="h-4 w-4 mr-1" />Convert to Job</Button>
                    <Button size="sm" variant="destructive" onClick={() => updateMutation.mutate({ status: "lost", lostReason: editForm.lostReason || "Marked lost by user" })} disabled={selectedLead.status === "converted"}>Mark Lost</Button>
                    <Button size="sm" variant="ghost" onClick={() => updateMutation.mutate({ status: "spam", lostReason: editForm.lostReason || "Marked as spam by user" })} disabled={selectedLead.status === "converted"}>Mark Spam</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {settingsForm.dryRun
                      ? "Prepared messages are added to the timeline and are not sent."
                      : "Live messages may be sent only when the channel, provider, recipient, and consent checks pass."}
                  </p>
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
                      <LeadFields form={editForm} setForm={setEditForm} template={activeTemplate} />
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
                                      <summary className="cursor-pointer text-xs text-muted-foreground">Message details</summary>
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
