import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  Activity,
  Copy,
  Flame,
  Globe2,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Target,
  UserPlus,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Lead, LeadActivity, LeadCaptureForm, LeadSettings } from "@shared/schema";

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

function statusLabel(value: string) {
  return value.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function sourceLabel(value: string) {
  return value.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function scoreColor(score: number) {
  if (score >= 80) return "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/30 dark:border-red-900";
  if (score >= 60) return "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/30 dark:border-amber-900";
  return "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-900";
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

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
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
          <Label>Service Type</Label>
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
            <SelectContent>{sourceOptions.map((s) => <SelectItem key={s} value={s}>{sourceLabel(s)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Urgency</Label>
          <Select value={form.urgency} onValueChange={(v) => update("urgency", v)}>
            <SelectTrigger data-testid="select-lead-urgency"><SelectValue /></SelectTrigger>
            <SelectContent>{urgencyOptions.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Estimated Value</Label>
          <Input value={form.estimatedValue} onChange={(e) => update("estimatedValue", e.target.value)} placeholder="0.00" />
        </div>
        <div className="space-y-1.5">
          <Label>Next Follow-up</Label>
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
  const [hotOnly, setHotOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
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

  const query = new URLSearchParams();
  if (statusFilter !== "all") query.set("status", statusFilter);
  if (sourceFilter !== "all") query.set("source", sourceFilter);
  if (hotOnly) query.set("hot", "true");
  if (search.trim()) query.set("q", search.trim());
  const leadsUrl = `/api/leads${query.toString() ? `?${query.toString()}` : ""}`;

  const { data: leads = [], isLoading } = useQuery<Lead[]>({ queryKey: [leadsUrl] });
  const { data: stats } = useQuery<LeadStats>({ queryKey: ["/api/leads/stats"] });
  const { data: leadSettings } = useQuery<LeadSettingsResponse>({ queryKey: ["/api/leads/settings"] });
  const selectedLead = useMemo(() => leads.find((l) => l.id === selectedLeadId) || null, [leads, selectedLeadId]);
  const { data: activities = [] } = useQuery<LeadActivity[]>({
    queryKey: selectedLeadId ? [`/api/leads/${selectedLeadId}/activities`] : ["/api/leads/none/activities"],
    enabled: !!selectedLeadId,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/leads/stats"] });
    queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/leads") });
  };

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

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/leads", payloadFromForm(createForm));
      return res.json() as Promise<Lead>;
    },
    onSuccess: () => {
      refresh();
      setShowCreate(false);
      setCreateForm(emptyForm);
      toast({ title: "Lead created" });
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

  const actionMutation = useMutation({
    mutationFn: async ({ action, body }: { action: string; body?: unknown }) => {
      if (!selectedLeadId) return null;
      const res = await apiRequest("POST", `/api/leads/${selectedLeadId}/${action}`, body || {});
      return res.json();
    },
    onSuccess: (_data, vars) => {
      refresh();
      if (vars.action === "convert") toast({ title: "Lead converted", description: "Customer and job lead were created." });
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

  const breakdown = selectedLead?.scoreBreakdown && typeof selectedLead.scoreBreakdown === "object"
    ? selectedLead.scoreBreakdown as Record<string, unknown>
    : {};
  const captureEndpoint = captureForm.publicToken ? `${window.location.origin}/api/public/lead-capture/${captureForm.publicToken}` : "";
  const embedSnippet = captureEndpoint
    ? `<form id="tradeflow-lead-form">
  <input name="name" placeholder="Name" required />
  <input name="phone" placeholder="Phone" />
  <input name="email" placeholder="Email" />
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
  const result = document.getElementById("tradeflow-lead-result");
  const response = await fetch("${captureEndpoint}", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const payload = await response.json();
  result.textContent = payload.message || payload.error || "Thanks. We received your request.";
  if (response.ok) form.reset();
});
</script>`
    : "";
  const copySnippet = async () => {
    await navigator.clipboard?.writeText(embedSnippet || captureEndpoint);
    toast({ title: "Embed snippet copied" });
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Lead Conversion Center"
        description="Capture, qualify, follow up, and convert new opportunities into booked jobs."
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-create-lead">
            <Plus className="h-4 w-4 mr-1" />
            Create Lead
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={UserPlus} label="New Leads" value={stats?.newLeads || 0} />
          <StatCard icon={Flame} label="Hot Leads" value={stats?.hotLeads || 0} />
          <StatCard icon={Activity} label="Needs Follow-up" value={stats?.needsFollowUp || 0} />
          <StatCard icon={Target} label="Converted" value={stats?.converted || 0} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search leads..." value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-leads" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {statusOptions.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {sourceOptions.map((s) => <SelectItem key={s} value={s}>{sourceLabel(s)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant={hotOnly ? "default" : "outline"} size="sm" onClick={() => setHotOnly(!hotOnly)}>
            <Flame className="h-4 w-4 mr-1" />
            Hot leads
          </Button>
          <span className="text-sm text-muted-foreground">{leads.length} lead{leads.length !== 1 ? "s" : ""}</span>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  <Globe2 className="h-4 w-4 text-primary" />
                  Public Lead Capture
                </h2>
                <p className="text-sm text-muted-foreground">Capture website leads into TradeFlow with dry-run auto-response and follow-up scheduling.</p>
              </div>
              <Badge variant={settingsForm.dryRun ? "secondary" : "destructive"}>
                {settingsForm.dryRun ? "Dry-run only" : "Live sending disabled in v1B"}
              </Badge>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <div className="space-y-3 rounded-lg border p-3">
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
                    <span className="text-sm font-medium">Form enabled</span>
                    <Switch checked={captureForm.isEnabled} onCheckedChange={(v) => setCaptureForm({ ...captureForm, isEnabled: v })} />
                  </label>
                </div>
                <div className="space-y-1.5">
                  <Label>Success Message</Label>
                  <Textarea rows={2} value={captureForm.successMessage} onChange={(e) => setCaptureForm({ ...captureForm, successMessage: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Public Endpoint</Label>
                  <Input readOnly value={captureEndpoint} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveCaptureFormMutation.mutate()} disabled={!captureForm.id || saveCaptureFormMutation.isPending}>Save Form</Button>
                  <Button size="sm" variant="outline" onClick={copySnippet} disabled={!embedSnippet}>
                    <Copy className="h-4 w-4 mr-1" />
                    Copy Snippet
                  </Button>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border p-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="text-sm font-medium">Auto respond</span>
                    <Switch checked={settingsForm.autoRespond} onCheckedChange={(v) => setSettingsForm({ ...settingsForm, autoRespond: v })} />
                  </label>
                  <label className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="text-sm font-medium">Follow-up enabled</span>
                    <Switch checked={settingsForm.followUpEnabled} onCheckedChange={(v) => setSettingsForm({ ...settingsForm, followUpEnabled: v })} />
                  </label>
                  <div className="space-y-1.5">
                    <Label>Hot Lead Threshold</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={settingsForm.hotLeadThreshold}
                      onChange={(e) => setSettingsForm({ ...settingsForm, hotLeadThreshold: Number(e.target.value) })}
                    />
                  </div>
                  <label className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="text-sm font-medium">Dry-run mode</span>
                    <Switch checked={settingsForm.dryRun} onCheckedChange={(v) => setSettingsForm({ ...settingsForm, dryRun: v })} />
                  </label>
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
                  <Textarea rows={2} value={settingsForm.defaultEmailTemplate} onChange={(e) => setSettingsForm({ ...settingsForm, defaultEmailTemplate: e.target.value })} placeholder="Hi {name}, thanks for reaching out..." />
                </div>
                <Button size="sm" onClick={() => saveSettingsMutation.mutate()} disabled={saveSettingsMutation.isPending}>Save Settings</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="rounded-lg border overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium p-3">Name</th>
                  <th className="text-left font-medium p-3">Contact</th>
                  <th className="text-left font-medium p-3">Source</th>
                  <th className="text-left font-medium p-3">Service</th>
                  <th className="text-left font-medium p-3">Urgency</th>
                  <th className="text-left font-medium p-3">Score</th>
                  <th className="text-left font-medium p-3">Status</th>
                  <th className="text-left font-medium p-3">Created</th>
                  <th className="text-left font-medium p-3">Follow-up</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}><td colSpan={9} className="p-3"><Skeleton className="h-8 w-full" /></td></tr>
                ))}
                {!isLoading && leads.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      No leads yet. Capture a manual lead to start the lead-to-cash workflow.
                    </td>
                  </tr>
                )}
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-t hover:bg-muted/40 cursor-pointer" onClick={() => openLead(lead)} data-testid={`lead-row-${lead.id}`}>
                    <td className="p-3 font-medium">{lead.name}</td>
                    <td className="p-3 text-muted-foreground">
                      <div className="space-y-0.5">
                        {lead.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</div>}
                        {lead.email && <div className="flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</div>}
                      </div>
                    </td>
                    <td className="p-3">{sourceLabel(lead.source)}</td>
                    <td className="p-3">{lead.serviceType || "Unspecified"}</td>
                    <td className="p-3"><Badge variant={lead.urgency === "emergency" || lead.urgency === "urgent" ? "destructive" : "secondary"}>{statusLabel(lead.urgency)}</Badge></td>
                    <td className="p-3"><span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${scoreColor(lead.score)}`}>{lead.score}</span></td>
                    <td className="p-3"><Badge variant={lead.status === "converted" ? "default" : "outline"}>{statusLabel(lead.status)}</Badge></td>
                    <td className="p-3 text-muted-foreground">{formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}</td>
                    <td className="p-3 text-muted-foreground">{lead.nextFollowUpAt ? format(new Date(lead.nextFollowUpAt), "MMM d, h:mm a") : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle>Create Lead</DialogTitle></DialogHeader>
          <LeadFields form={createForm} setForm={setCreateForm} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !createForm.name.trim()} data-testid="button-save-lead">
              {createMutation.isPending ? "Creating..." : "Create Lead"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedLeadId} onOpenChange={(open) => !open && setSelectedLeadId(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3">
              <span>{selectedLead?.name || "Lead Detail"}</span>
              {selectedLead && <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${scoreColor(selectedLead.score)}`}>Score {selectedLead.score}</span>}
            </DialogTitle>
          </DialogHeader>
          {selectedLead && (
            <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-5">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ action: "score" })}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Score
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ action: "send-sms" })}>
                    <MessageSquare className="h-4 w-4 mr-1" /> Dry-run SMS
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ action: "send-email" })}>
                    <Mail className="h-4 w-4 mr-1" /> Dry-run Email
                  </Button>
                  <Button size="sm" onClick={() => actionMutation.mutate({ action: "convert" })} disabled={selectedLead.status === "converted"}>
                    <Target className="h-4 w-4 mr-1" /> Convert
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => updateMutation.mutate({ status: "lost", lostReason: editForm.lostReason || "Marked lost by user" })}
                    disabled={selectedLead.status === "converted"}
                  >
                    Mark Lost
                  </Button>
                </div>

                <div className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Lead Details</h3>
                    <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                      <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{statusOptions.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <LeadFields form={editForm} setForm={setEditForm} />
                  <div className="space-y-1.5">
                    <Label>AI Summary</Label>
                    <Textarea value={editForm.aiSummary} onChange={(e) => setEditForm({ ...editForm, aiSummary: e.target.value })} rows={3} />
                  </div>
                  <Button onClick={() => updateMutation.mutate(undefined)} disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <h3 className="font-semibold">Score Breakdown</h3>
                    {Object.keys(breakdown).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No score breakdown yet.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {Object.entries(breakdown).map(([key, value]) => (
                          <div key={key} className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-muted-foreground">{statusLabel(key)}</span>
                            <span className="font-medium text-right">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 space-y-3">
                    <h3 className="font-semibold">Timeline</h3>
                    {activities.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No activity yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {activities.map((activity) => (
                          <div key={activity.id} className="border-l-2 pl-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium">{activity.subject || statusLabel(activity.type)}</p>
                              <span className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}</span>
                            </div>
                            {activity.body && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{activity.body}</p>}
                            {activity.status && <Badge variant="outline" className="mt-1">{activity.status}</Badge>}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
