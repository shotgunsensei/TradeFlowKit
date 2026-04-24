import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { MobileActionBar } from "@/components/mobile-action-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Edit,
  Trash2,
  Clock,
  Calendar,
  FileText,
  Receipt,
  ChevronRight,
  AlertTriangle,
  User,
  CheckCircle2,
  Circle,
  RefreshCw,
  Star,
  History,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { format, formatDistanceToNow } from "date-fns";
import { JOB_STATUS_LABELS, JOB_PRIORITY_LABELS, RECURRING_FREQUENCY_LABELS } from "@shared/schema";
import { Switch } from "@/components/ui/switch";
import type { Job, Customer, JobEvent, ReviewRequest } from "@shared/schema";

const EVENT_ICONS: Record<string, React.ReactNode> = {
  created: <Circle className="h-3.5 w-3.5 text-blue-500" />,
  status_changed: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  updated: <Edit className="h-3.5 w-3.5 text-amber-500" />,
  note_added: <FileText className="h-3.5 w-3.5 text-purple-500" />,
};

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  normal: "bg-muted text-muted-foreground",
  low: "bg-muted text-muted-foreground",
};

function eventLabel(event: JobEvent): string {
  const type = event.type;
  const payload = (event.payload || {}) as Record<string, any>;
  if (type === "status_changed") {
    return `Status changed to ${JOB_STATUS_LABELS[payload.to] || payload.to}`;
  }
  if (type === "created") return "Job created";
  if (type === "updated") return "Job updated";
  if (type === "note_added") return "Note added";
  return type.replace(/_/g, " ");
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { org } = useAuth();
  const canUseRecurring = org?.plan === "small_business" || org?.plan === "enterprise";
  const [showEdit, setShowEdit] = useState(false);
  const [showStatusChange, setShowStatusChange] = useState(false);
  const [editIsRecurring, setEditIsRecurring] = useState(false);
  const [editRecurringFrequency, setEditRecurringFrequency] = useState("monthly");

  const { data: job, isLoading } = useQuery<Job & { customerName?: string }>({
    queryKey: ["/api/jobs", id],
  });

  const { data: events = [] } = useQuery<JobEvent[]>({
    queryKey: ["/api/jobs", id, "events"],
    enabled: !!id,
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: reviewRequest } = useQuery<ReviewRequest | null>({
    queryKey: ["/api/review-requests/job", id],
    queryFn: async () => {
      const res = await fetch(`/api/review-requests/job/${id}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PATCH", `/api/jobs/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", id, "events"] });
      setShowEdit(false);
      toast({ title: "Job updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/jobs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      navigate("/jobs");
      toast({ title: "Job deleted" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      await apiRequest("PATCH", `/api/jobs/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", id, "events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/review-requests/job", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/review-requests/stats"] });
      toast({ title: "Status updated" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!job) {
    return <div className="p-6 text-center text-muted-foreground">Job not found</div>;
  }

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    updateMutation.mutate({
      title: fd.get("title"),
      description: fd.get("description") || "",
      customerId: fd.get("customerId") || null,
      priority: fd.get("priority") || "normal",
      scheduledStart: fd.get("scheduledStart") || null,
      scheduledEnd: fd.get("scheduledEnd") || null,
      internalNotes: fd.get("internalNotes") || "",
      isRecurring: canUseRecurring ? editIsRecurring : job?.isRecurring ?? false,
      recurringFrequency: canUseRecurring && editIsRecurring ? editRecurringFrequency : null,
    });
  };

  const openEditDialog = () => {
    setEditIsRecurring(job?.isRecurring ?? false);
    setEditRecurringFrequency(job?.recurringFrequency || "monthly");
    setShowEdit(true);
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={job.title}
        description={job.customerName ? `Customer: ${job.customerName}` : undefined}
        actions={
          <div className="hidden md:flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => navigate("/jobs")} data-testid="button-back-jobs">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/quotes/new?jobId=${id}&customerId=${job.customerId || ""}`)} data-testid="button-create-quote">
              <FileText className="h-4 w-4 mr-1" />
              Quote
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/invoices/new?jobId=${id}&customerId=${job.customerId || ""}`)} data-testid="button-create-invoice">
              <Receipt className="h-4 w-4 mr-1" />
              Invoice
            </Button>
            <Button variant="outline" size="sm" onClick={openEditDialog} data-testid="button-edit-job">
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { if (confirm("Delete this job?")) deleteMutation.mutate(); }}
              data-testid="button-delete-job"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-4 md:p-6 pb-24 md:pb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          <div className="md:col-span-2 space-y-4">
            <Card>
              <CardContent className="pt-4 space-y-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Status</p>
                    <Select value={job.status} onValueChange={(v) => statusMutation.mutate(v)}>
                      <SelectTrigger className="w-[180px]" data-testid="select-job-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(JOB_STATUS_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {reviewRequest && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Review</p>
                      <Badge
                        variant="outline"
                        className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800 gap-1"
                        data-testid="badge-review-requested"
                      >
                        <Star className="h-3 w-3" />
                        Review Requested
                      </Badge>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Priority</p>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium gap-1 ${PRIORITY_STYLES[job.priority || "normal"]}`}>
                      {job.priority === "urgent" && <AlertTriangle className="h-3 w-3" />}
                      {JOB_PRIORITY_LABELS[job.priority || "normal"]}
                    </span>
                  </div>
                  {job.isRecurring && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Recurring</p>
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2.5 py-1 text-xs font-medium" data-testid="badge-recurring-detail">
                        <RefreshCw className="h-3 w-3" />
                        {job.recurringFrequency ? RECURRING_FREQUENCY_LABELS[job.recurringFrequency] || "Recurring" : "Recurring"}
                      </span>
                    </div>
                  )}
                  {job.scheduledStart && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Scheduled</p>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        {format(new Date(job.scheduledStart), "MMM d, yyyy h:mm a")}
                        {job.scheduledEnd && (
                          <>
                            <ChevronRight className="h-3 w-3" />
                            {format(new Date(job.scheduledEnd), "h:mm a")}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-1 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => navigate(`/quotes/new?jobId=${id}&customerId=${job.customerId || ""}`)}
                    data-testid="button-new-quote-from-job"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    New Quote
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => navigate(`/invoices/new?jobId=${id}&customerId=${job.customerId || ""}`)}
                    data-testid="button-new-invoice-from-job"
                  >
                    <Receipt className="h-3.5 w-3.5" />
                    New Invoice
                  </Button>
                </div>
              </CardContent>
            </Card>

            {job.description && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{job.description}</p>
                </CardContent>
              </Card>
            )}

            {job.internalNotes && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Internal Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{job.internalNotes}</p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Activity Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No events yet</p>
                ) : (
                  <div className="space-y-4">
                    {events.map((event) => (
                      <div key={event.id} className="flex items-start gap-3">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted mt-0.5">
                          {EVENT_ICONS[event.type] || <Clock className="h-3 w-3 text-muted-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">{eventLabel(event)}</p>
                          <p className="text-xs text-muted-foreground">
                            {event.createdAt
                              ? formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })
                              : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {job.customerId && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    Customer
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Link href={`/customers/${job.customerId}`}>
                    <p className="text-sm font-medium text-primary hover:underline cursor-pointer">
                      {job.customerName}
                    </p>
                  </Link>
                </CardContent>
              </Card>
            )}

            {(job.isRecurring || job.parentJobId || job.recurringSeriesId) && (
              <Card data-testid="card-recurring-series">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <History className="h-4 w-4 text-muted-foreground" />
                    Recurring Series
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    This job is part of a recurring series scheduled{" "}
                    <span className="font-medium text-foreground">
                      {job.recurringFrequency ? RECURRING_FREQUENCY_LABELS[job.recurringFrequency] : ""}
                    </span>.
                  </p>
                  {job.parentJobId && (
                    <Link href={`/jobs/${job.parentJobId}`}>
                      <p className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1">
                        <ArrowLeft className="h-3 w-3" />
                        View previous job
                      </p>
                    </Link>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Mark this job as <span className="font-medium text-foreground">Done</span> or <span className="font-medium text-foreground">Invoiced</span> to auto-schedule the next visit.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <MobileActionBar
        actions={[
          {
            label: "Status",
            icon: <RefreshCw className="h-3.5 w-3.5" />,
            onClick: () => setShowStatusChange(true),
            testId: "mobile-action-status",
          },
          {
            label: "Edit",
            icon: <Edit className="h-3.5 w-3.5" />,
            onClick: openEditDialog,
            testId: "mobile-action-edit",
          },
          {
            label: "Quote",
            icon: <FileText className="h-3.5 w-3.5" />,
            onClick: () => navigate(`/quotes/new?jobId=${id}&customerId=${job.customerId || ""}`),
            testId: "mobile-action-quote",
          },
          {
            label: "Invoice",
            icon: <Receipt className="h-3.5 w-3.5" />,
            onClick: () => navigate(`/invoices/new?jobId=${id}&customerId=${job.customerId || ""}`),
            testId: "mobile-action-invoice",
          },
        ]}
      />

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Job</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input name="title" defaultValue={job.title} required data-testid="input-edit-job-title" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Customer</Label>
                <select
                  name="customerId"
                  defaultValue={job.customerId || ""}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">No customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <select
                  name="priority"
                  defaultValue={job.priority || "normal"}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  data-testid="select-edit-job-priority"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea name="description" defaultValue={job.description || ""} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start</Label>
                <Input
                  name="scheduledStart"
                  type="datetime-local"
                  defaultValue={job.scheduledStart ? format(new Date(job.scheduledStart), "yyyy-MM-dd'T'HH:mm") : ""}
                />
              </div>
              <div className="space-y-2">
                <Label>End</Label>
                <Input
                  name="scheduledEnd"
                  type="datetime-local"
                  defaultValue={job.scheduledEnd ? format(new Date(job.scheduledEnd), "yyyy-MM-dd'T'HH:mm") : ""}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Internal Notes</Label>
              <Textarea name="internalNotes" defaultValue={job.internalNotes || ""} rows={2} />
            </div>
            {canUseRecurring && (
              <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Recurring Job</Label>
                    <p className="text-xs text-muted-foreground">Auto-schedule the next visit when done</p>
                  </div>
                  <Switch
                    checked={editIsRecurring}
                    onCheckedChange={setEditIsRecurring}
                    data-testid="switch-edit-recurring"
                  />
                </div>
                {editIsRecurring && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Frequency</Label>
                    <Select value={editRecurringFrequency} onValueChange={setEditRecurringFrequency}>
                      <SelectTrigger data-testid="select-edit-recurring-frequency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(RECURRING_FREQUENCY_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
              <Button type="submit" disabled={updateMutation.isPending} data-testid="button-update-job">
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showStatusChange} onOpenChange={setShowStatusChange}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Change Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">
              Current: <span className="font-medium text-foreground">{JOB_STATUS_LABELS[job.status]}</span>
            </p>
            <div className="grid gap-2">
              {Object.entries(JOB_STATUS_LABELS).map(([value, label]) => (
                <Button
                  key={value}
                  variant={job.status === value ? "default" : "outline"}
                  size="sm"
                  className="justify-start"
                  disabled={job.status === value || statusMutation.isPending}
                  onClick={() => {
                    statusMutation.mutate(value);
                    setShowStatusChange(false);
                  }}
                  data-testid={`status-option-mobile-${value}`}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
