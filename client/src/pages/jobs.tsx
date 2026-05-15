import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
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
import { Plus, Wrench, Search, Filter, LayoutGrid, List, RefreshCw, Download, Upload, Trash2 } from "lucide-react";
import { CsvImportDialog, type CsvImportField } from "@/components/csv-import-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth";
import { useRowSelection } from "@/hooks/use-row-selection";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { toCSV, downloadCSV } from "@/lib/csv";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { JOB_STATUS_LABELS, JOB_PRIORITY_LABELS, RECURRING_FREQUENCY_LABELS } from "@shared/schema";
import type { Job, Customer } from "@shared/schema";

const jobFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().optional().default(""),
  customerId: z.string().optional().default(""),
  priority: z.enum(["low", "normal", "urgent"]).default("normal"),
  scheduledStart: z.string().optional().default(""),
  scheduledEnd: z.string().optional().default(""),
  internalNotes: z.string().optional().default(""),
}).refine(
  (data) => {
    if (data.scheduledStart && data.scheduledEnd) {
      return new Date(data.scheduledEnd) >= new Date(data.scheduledStart);
    }
    return true;
  },
  { message: "End time must be after start time", path: ["scheduledEnd"] }
);
type JobFormValues = z.infer<typeof jobFormSchema>;

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
  const createForm = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: { title: "", description: "", customerId: "", priority: "normal", scheduledStart: "", scheduledEnd: "", internalNotes: "" },
  });
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [bulkStatus, setBulkStatus] = useState<string>("");
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [showImport, setShowImport] = useState(false);
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
      createForm.reset();
      setIsRecurring(false);
      toast({ title: "Job created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filteredJobs = jobs.filter((j) => {
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
              <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 dark:bg-primary/20 text-primary px-1.5 py-0.5 text-[10px] font-medium" data-testid={`badge-recurring-list-${j.id}`}>
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

  const selection = useRowSelection(filteredJobs);

  const bulkRestoreMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/jobs/bulk-restore", { ids });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: `${data.restored} job${data.restored !== 1 ? "s" : ""} restored` });
    },
    onError: (err: Error) => {
      toast({ title: "Restore failed", description: err.message, variant: "destructive" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/jobs/bulk-delete", { ids });
      return res.json();
    },
    onSuccess: (data, ids) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({
        title: `${data.updated} job${data.updated !== 1 ? "s" : ""} deleted`,
        duration: 10000,
        action: (
          <ToastAction
            altText="Undo delete"
            data-testid="button-undo-bulk-delete-jobs"
            onClick={() => bulkRestoreMutation.mutate(ids)}
          >
            Undo
          </ToastAction>
        ),
      });
      selection.clear();
      setConfirmBulkDelete(false);
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const bulkStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const res = await apiRequest("POST", "/api/jobs/bulk-status", { ids, status });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: `${data.updated} job${data.updated !== 1 ? "s" : ""} updated` });
      selection.clear();
      setBulkStatus("");
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const handleExportJobs = () => {
    const items = selection.selectedItems.length > 0 ? selection.selectedItems : filteredJobs;
    const csv = toCSV(items, [
      { header: "Title", value: (j) => j.title },
      { header: "Customer", value: (j) => j.customerName || "" },
      { header: "Status", value: (j) => JOB_STATUS_LABELS[j.status] || j.status },
      { header: "Priority", value: (j) => JOB_PRIORITY_LABELS[j.priority || "normal"] || "" },
      { header: "Scheduled Start", value: (j) => j.scheduledStart ? format(new Date(j.scheduledStart), "yyyy-MM-dd HH:mm") : "" },
      { header: "Scheduled End", value: (j) => j.scheduledEnd ? format(new Date(j.scheduledEnd), "yyyy-MM-dd HH:mm") : "" },
      { header: "Description", value: (j) => j.description || "" },
      { header: "Created", value: (j) => j.createdAt ? format(new Date(j.createdAt), "yyyy-MM-dd") : "" },
    ]);
    downloadCSV(`jobs-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast({ title: `Exported ${items.length} job${items.length !== 1 ? "s" : ""}` });
  };

  const handleCreate = (data: JobFormValues) => {
    createMutation.mutate({
      title: data.title,
      description: data.description || "",
      customerId: data.customerId || null,
      priority: data.priority || "normal",
      status: "lead",
      scheduledStart: data.scheduledStart || null,
      scheduledEnd: data.scheduledEnd || null,
      internalNotes: data.internalNotes || "",
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
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleExportJobs} data-testid="button-export-jobs">
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowImport(true)} data-testid="button-import-jobs">
              <Upload className="h-4 w-4 mr-1" />
              Import
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-add-job">
              <Plus className="h-4 w-4 mr-1" />
              New Job
            </Button>
          </div>
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
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${recurringFilter ? "bg-primary text-primary-foreground border-primary" : "border-input bg-background hover:bg-muted"}`}
              data-testid="button-recurring-filter"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Recurring
            </button>
          )}
          <span className="text-sm text-muted-foreground">{filteredJobs.length} job{filteredJobs.length !== 1 ? "s" : ""}</span>
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
            jobs={filteredJobs}
            isLoading={isLoading}
            statusFilter={statusFilter}
          />
        ) : (
          <DataTable
            tableId="jobs"
            columns={columns}
            data={filteredJobs}
            isLoading={isLoading}
            onRowClick={(j) => navigate(`/jobs/${j.id}`)}
            testIdPrefix="job-row"
            selection={view === "list" ? selection : undefined}
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

        {view === "list" && (
          <BulkActionBar count={selection.selectedCount} onClear={selection.clear}>
            <Select
              value={bulkStatus}
              onValueChange={(v) => {
                setBulkStatus(v);
                bulkStatusMutation.mutate({ ids: selection.selected, status: v });
              }}
            >
              <SelectTrigger className="w-[160px] h-9" data-testid="select-bulk-job-status">
                <SelectValue placeholder="Change status..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(JOB_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={handleExportJobs} data-testid="button-bulk-export-jobs">
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setConfirmBulkDelete(true)}
              data-testid="button-bulk-delete-jobs"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </BulkActionBar>
        )}
      </div>

      <CsvImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        title="Import Jobs from CSV"
        description="Customers must already exist; rows are matched by customer name (case-insensitive)."
        resourceLabel="job"
        templateFilename="jobs-template.csv"
        templateExampleRow={[
          "Kitchen sink repair",
          "John Smith",
          "Replace gasket",
          "scheduled",
          "normal",
          "2026-05-10 09:00",
          "2026-05-10 11:00",
          "Bring extra parts",
        ]}
        fields={[
          { key: "title", label: "Title", required: true, aliases: ["jobtitle", "name"] },
          { key: "customerName", label: "Customer", aliases: ["customer", "client", "clientname", "customerName"] },
          { key: "description", label: "Description", aliases: ["details"] },
          { key: "status", label: "Status" },
          { key: "priority", label: "Priority" },
          { key: "scheduledStart", label: "Scheduled Start", aliases: ["start", "startdate", "starttime"] },
          { key: "scheduledEnd", label: "Scheduled End", aliases: ["end", "enddate", "endtime"] },
          { key: "internalNotes", label: "Internal Notes", aliases: ["notes"] },
        ]}
        onImport={async (rows) => {
          const res = await apiRequest("POST", "/api/jobs/import", { jobs: rows });
          return res.json();
        }}
        onImported={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        }}
      />

      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selection.selectedCount} job{selection.selectedCount !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the selected jobs and their history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-bulk-delete-jobs-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(selection.selected)}
              disabled={bulkDeleteMutation.isPending}
              data-testid="button-bulk-delete-jobs-confirm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Job</DialogTitle>
          </DialogHeader>
          <Form {...createForm}>
          <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4" noValidate>
            <FormField
              control={createForm.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-job-title" placeholder="e.g. Kitchen sink repair" />
                  </FormControl>
                  <FormMessage data-testid="error-job-title" />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={createForm.control}
                name="customerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        data-testid="select-job-customer"
                      >
                        <option value="">No customer</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        data-testid="select-job-priority"
                      >
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={createForm.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} data-testid="input-job-description" placeholder="Job details..." rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={createForm.control}
                name="scheduledStart"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start</FormLabel>
                    <FormControl>
                      <Input {...field} type="datetime-local" data-testid="input-job-start" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="scheduledEnd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End</FormLabel>
                    <FormControl>
                      <Input {...field} type="datetime-local" data-testid="input-job-end" />
                    </FormControl>
                    <FormMessage data-testid="error-job-end" />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={createForm.control}
              name="internalNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Internal Notes</FormLabel>
                  <FormControl>
                    <Textarea {...field} data-testid="input-job-notes" placeholder="Notes for your team..." rows={2} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
