import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { KanbanBoard } from "@/components/jobs/kanban-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { Plus, Wrench, Search, Filter, LayoutGrid, List, RefreshCw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";
import { JOB_STATUS_LABELS, JOB_PRIORITY_LABELS, RECURRING_FREQUENCY_LABELS } from "@shared/schema";
import type { Job, Customer } from "@shared/schema";

const PRIORITY_BADGE: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  normal: "bg-muted text-muted-foreground",
  low: "bg-muted text-muted-foreground",
};

export default function JobsPage() {
  const [, navigate] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [recurringFilter, setRecurringFilter] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState("monthly");
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const { toast } = useToast();
  const { org } = useAuth();
  const canUseRecurring = org?.plan === "small_business" || org?.plan === "enterprise";

  const { data: jobs = [], isLoading } = useQuery<(Job & { customerName?: string })[]>({
    queryKey: ["/api/jobs"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: members = [] } = useQuery<{ userId: string; user?: { username: string; name?: string | null } | null }[]>({
    queryKey: ["/api/memberships"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/jobs", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setShowCreate(false);
      toast({ title: "Job created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filtered = jobs.filter((j) => {
    const matchesSearch =
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      (j.customerName || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || j.status === statusFilter;
    const matchesCustomer = customerFilter === "all" || j.customerId === customerFilter;
    const matchesRecurring = !recurringFilter || j.isRecurring;
    return matchesSearch && matchesStatus && matchesCustomer && matchesRecurring;
  });

  const getInitials = (name: string) =>
    name.split(/\s+/).slice(0, 2).map((n) => n[0]?.toUpperCase() || "").join("");

  const columns = [
    {
      key: "title",
      header: "Title",
      render: (j: Job & { customerName?: string }) => (
        <div>
          <div className="flex items-center gap-1.5">
            <p className="font-medium">{j.title}</p>
            {j.isRecurring && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 text-[10px] font-medium" data-testid={`badge-recurring-list-${j.id}`}>
                <RefreshCw className="h-2.5 w-2.5" />
                {j.recurringFrequency ? RECURRING_FREQUENCY_LABELS[j.recurringFrequency] || "Recurring" : "Recurring"}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{j.customerName || "No customer"}</p>
        </div>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      className: "hidden sm:table-cell",
      render: (j: Job) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[j.priority || "normal"]}`}>
          {JOB_PRIORITY_LABELS[j.priority || "normal"]}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (j: Job) => <StatusBadge status={j.status} type="job" />,
    },
    {
      key: "scheduled",
      header: "Scheduled",
      className: "hidden md:table-cell",
      render: (j: Job) => (
        <span className="text-sm text-muted-foreground">
          {j.scheduledStart ? format(new Date(j.scheduledStart), "MMM d, h:mm a") : "-"}
        </span>
      ),
    },
    {
      key: "assigned",
      header: "Assigned",
      className: "hidden md:table-cell",
      render: (j: Job) => {
        const ids: string[] = (j.assignedUserIds ?? []).filter(
          (id): id is string => typeof id === "string"
        );
        if (ids.length === 0) return <span className="text-muted-foreground text-sm">—</span>;
        return (
          <div className="flex items-center gap-0.5">
            {ids.slice(0, 3).map((uid) => {
              const m = members.find((mem) => mem.userId === uid);
              const name = m?.user?.name || m?.user?.username || "?";
              return (
                <span
                  key={uid}
                  className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary/20 text-primary text-[9px] font-semibold"
                  title={name}
                >
                  {getInitials(name)}
                </span>
              );
            })}
            {ids.length > 3 && (
              <span className="text-xs text-muted-foreground ml-0.5">+{ids.length - 3}</span>
            )}
          </div>
        );
      },
    },
    {
      key: "created",
      header: "Created",
      className: "hidden lg:table-cell",
      render: (j: Job) => (
        <span className="text-sm text-muted-foreground">
          {j.createdAt ? format(new Date(j.createdAt), "MMM d, yyyy") : ""}
        </span>
      ),
    },
  ];

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      title: fd.get("title"),
      description: fd.get("description") || "",
      customerId: fd.get("customerId") || null,
      priority: fd.get("priority") || "normal",
      status: "lead",
      scheduledStart: fd.get("scheduledStart") || null,
      scheduledEnd: fd.get("scheduledEnd") || null,
      internalNotes: fd.get("internalNotes") || "",
      isRecurring: canUseRecurring ? isRecurring : false,
      recurringFrequency: canUseRecurring && isRecurring ? recurringFrequency : null,
    });
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Jobs"
        description="Track work from lead to paid"
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-add-job">
            <Plus className="h-4 w-4 mr-1" />
            New Job
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-jobs"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-job-status-filter">
              <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(JOB_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="w-[150px]" data-testid="select-job-customer-filter">
              <SelectValue placeholder="Customer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canUseRecurring && (
            <button
              onClick={() => setRecurringFilter(!recurringFilter)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${recurringFilter ? "bg-blue-600 text-white border-blue-600" : "border-input bg-background hover:bg-muted"}`}
              data-testid="button-recurring-filter"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Recurring
            </button>
          )}
          <span className="text-sm text-muted-foreground">{filtered.length} job{filtered.length !== 1 ? "s" : ""}</span>
          <div className="ml-auto flex items-center border rounded-md overflow-hidden">
            <button
              className={`p-2 transition-colors ${view === "kanban" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => setView("kanban")}
              data-testid="button-kanban-view"
              title="Kanban view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              className={`p-2 transition-colors ${view === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => setView("list")}
              data-testid="button-list-view"
              title="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {view === "kanban" && (
          <div className="sm:hidden -mx-4 px-4 overflow-x-auto" data-testid="mobile-kanban-status-tabs">
            <div className="flex gap-1.5 min-w-max pb-1">
              <button
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${statusFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                onClick={() => setStatusFilter("all")}
                data-testid="mobile-status-tab-all"
              >
                All
              </button>
              {Object.entries(JOB_STATUS_LABELS).map(([value, label]) => (
                <button
                  key={value}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${statusFilter === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                  onClick={() => setStatusFilter(value)}
                  data-testid={`mobile-status-tab-${value}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {view === "kanban" ? (
          <KanbanBoard
            jobs={filtered}
            isLoading={isLoading}
            statusFilter={statusFilter}
          />
        ) : (
          <DataTable
            tableId="jobs"
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            onRowClick={(j) => navigate(`/jobs/${j.id}`)}
            testIdPrefix="job-row"
            emptyState={
              <EmptyState
                icon={Wrench}
                title="No jobs yet"
                description="Create your first job to start tracking work."
                actionLabel="New Job"
                onAction={() => setShowCreate(true)}
              />
            }
          />
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Job</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input name="title" required data-testid="input-job-title" placeholder="e.g. Kitchen sink repair" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Customer</Label>
                <select
                  name="customerId"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  data-testid="select-job-customer"
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
                  defaultValue="normal"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  data-testid="select-job-priority"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea name="description" data-testid="input-job-description" placeholder="Job details..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start</Label>
                <Input name="scheduledStart" type="datetime-local" data-testid="input-job-start" />
              </div>
              <div className="space-y-2">
                <Label>End</Label>
                <Input name="scheduledEnd" type="datetime-local" data-testid="input-job-end" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Internal Notes</Label>
              <Textarea name="internalNotes" data-testid="input-job-notes" placeholder="Notes for your team..." rows={2} />
            </div>
            {canUseRecurring && (
              <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Recurring Job</Label>
                    <p className="text-xs text-muted-foreground">Auto-schedule the next visit when this job is done</p>
                  </div>
                  <Switch
                    checked={isRecurring}
                    onCheckedChange={setIsRecurring}
                    data-testid="switch-recurring"
                  />
                </div>
                {isRecurring && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Frequency</Label>
                    <Select value={recurringFrequency} onValueChange={setRecurringFrequency}>
                      <SelectTrigger data-testid="select-recurring-frequency">
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
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-job">
                {createMutation.isPending ? "Creating..." : "Create Job"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
