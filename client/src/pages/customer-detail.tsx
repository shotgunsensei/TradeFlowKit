import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Edit, Phone, Mail, MapPin, Wrench, FileText, Receipt, Trash2, Plus, BarChart3, Calendar, MessageSquareOff, Activity, Link2, Check } from "lucide-react";
import { CustomerActivityTimeline } from "@/components/customer-activity-timeline";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useHotkey } from "@/hooks/use-hotkey";
import { usePageShortcuts } from "@/components/shortcuts-help";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { Customer, Job, Quote, Invoice } from "@shared/schema";

const editCustomerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().optional().default(""),
  email: z.union([z.string().email("Enter a valid email"), z.literal("")]).optional().default(""),
  address: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  smsOptOut: z.boolean().optional().default(false),
});

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showEdit, setShowEdit] = useState(false);
  const [copiedPortal, setCopiedPortal] = useState(false);
  const editForm = useForm<z.infer<typeof editCustomerSchema>>({
    resolver: zodResolver(editCustomerSchema),
    defaultValues: { name: "", phone: "", email: "", address: "", notes: "", smsOptOut: false },
  });

  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: ["/api/customers", id],
  });

  const { data: customerJobs = [] } = useQuery<Job[]>({
    queryKey: ["/api/customers", id, "jobs"],
    enabled: !!id,
  });

  const { data: customerInvoices = [] } = useQuery<(Invoice & { total?: number })[]>({
    queryKey: ["/api/customers", id, "invoices"],
    enabled: !!id,
  });

  const { data: allQuotes = [] } = useQuery<(Quote & { customerName?: string; total?: number })[]>({
    queryKey: ["/api/quotes"],
  });
  const customerQuotes = allQuotes.filter((q) => q.customerId === id);

  useHotkey("e", () => {
    openEdit();
  }, { enabled: !showEdit });
  usePageShortcuts([
    { keys: "E", description: "Edit customer" },
    { keys: "Esc", description: "Close dialog" },
  ]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PATCH", `/api/customers/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setShowEdit(false);
      toast({ title: "Customer updated" });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't update customer", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/customers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      navigate("/customers");
      toast({ title: "Customer deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't delete customer", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!customer) {
    return <div className="p-6 text-center text-muted-foreground">Customer not found</div>;
  }

  const openEdit = () => {
    editForm.reset({
      name: customer?.name || "",
      phone: customer?.phone || "",
      email: customer?.email || "",
      address: customer?.address || "",
      notes: customer?.notes || "",
      smsOptOut: !!customer?.smsOptOut,
    });
    setShowEdit(true);
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={customer.name}
        description="Customer details"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/customers")} data-testid="button-back-customers">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={openEdit} data-testid="button-edit-customer">
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { if (confirm("Delete this customer?")) deleteMutation.mutate(); }}
              data-testid="button-delete-customer"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {customer.phone && (
            <div className="flex items-center gap-3 rounded-md border p-4">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <a href={`tel:${customer.phone}`} className="text-sm font-medium hover:underline">{customer.phone}</a>
              </div>
            </div>
          )}
          {customer.email && (
            <div className="flex items-center gap-3 rounded-md border p-4">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <a href={`mailto:${customer.email}`} className="text-sm font-medium hover:underline">{customer.email}</a>
              </div>
            </div>
          )}
          {customer.address && (
            <div className="flex items-center gap-3 rounded-md border p-4">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Address</p>
                <p className="text-sm font-medium">{customer.address}</p>
              </div>
            </div>
          )}
        </div>

        {customer.smsOptOut && (
          <div
            className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 px-3 py-2"
            data-testid="status-sms-opt-out"
          >
            <MessageSquareOff className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-900 dark:text-amber-200">
              This customer has opted out of SMS reminders. No automated text messages will be sent.
            </p>
            <Badge variant="outline" className="ml-auto border-amber-400 text-amber-700 dark:text-amber-300">
              SMS opt-out
            </Badge>
          </div>
        )}

        <div className="flex gap-2 flex-wrap" data-testid="customer-quick-actions">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => navigate(`/jobs?customerId=${id}`)}
            data-testid="quick-action-new-job"
          >
            <Wrench className="h-3.5 w-3.5" />
            New Job
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => navigate(`/quotes/new?customerId=${id}`)}
            data-testid="quick-action-new-quote"
          >
            <FileText className="h-3.5 w-3.5" />
            New Quote
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => navigate(`/invoices/new?customerId=${id}`)}
            data-testid="quick-action-new-invoice"
          >
            <Receipt className="h-3.5 w-3.5" />
            New Invoice
          </Button>
          {(customer as any).portalToken && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={async () => {
                const link = `${window.location.origin}/portal/${(customer as any).portalToken}`;
                try {
                  await navigator.clipboard.writeText(link);
                  setCopiedPortal(true);
                  toast({ title: "Portal link copied!", description: "Send this private link to your customer." });
                  setTimeout(() => setCopiedPortal(false), 2000);
                } catch {
                  toast({ title: "Failed to copy link", variant: "destructive" });
                }
              }}
              data-testid="button-copy-portal-link"
            >
              {copiedPortal ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Link2 className="h-3.5 w-3.5" />}
              {copiedPortal ? "Copied!" : "Copy Portal Link"}
            </Button>
          )}
        </div>

        <Tabs defaultValue="activity">
          <TabsList>
            <TabsTrigger value="activity" data-testid="tab-customer-activity">
              <Activity className="h-3.5 w-3.5 mr-1.5" />
              Activity
            </TabsTrigger>
            <TabsTrigger value="overview" data-testid="tab-customer-overview">
              Overview
            </TabsTrigger>
            <TabsTrigger value="jobs" data-testid="tab-customer-jobs">
              Jobs ({customerJobs.length})
            </TabsTrigger>
            <TabsTrigger value="quotes" data-testid="tab-customer-quotes">
              Quotes ({customerQuotes.length})
            </TabsTrigger>
            <TabsTrigger value="invoices" data-testid="tab-customer-invoices">
              Invoices ({customerInvoices.length})
            </TabsTrigger>
            <TabsTrigger value="notes" data-testid="tab-customer-notes">
              Notes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="activity" className="mt-4">
            <CustomerActivityTimeline customerId={id!} />
          </TabsContent>

          <TabsContent value="overview" className="mt-4">
            {(() => {
              const activeJobs = customerJobs.filter((j) => !["done", "invoiced", "paid", "canceled"].includes(j.status));
              const totalInvoiced = customerInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
              const paidInvoices = customerInvoices.filter((inv) => inv.status === "paid");
              const totalPaid = paidInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
              const openQuotes = customerQuotes.filter((q) => q.status === "draft" || q.status === "sent");
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Wrench className="h-4 w-4 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">Total Jobs</p>
                        </div>
                        <p className="text-2xl font-bold" data-testid="overview-total-jobs">{customerJobs.length}</p>
                        {activeJobs.length > 0 && <p className="text-xs text-primary mt-0.5">{activeJobs.length} active</p>}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">Open Quotes</p>
                        </div>
                        <p className="text-2xl font-bold" data-testid="overview-open-quotes">{openQuotes.length}</p>
                        {customerQuotes.length > 0 && <p className="text-xs text-muted-foreground mt-0.5">{customerQuotes.length} total</p>}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Receipt className="h-4 w-4 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">Invoiced</p>
                        </div>
                        <p className="text-2xl font-bold" data-testid="overview-total-invoiced">${totalInvoiced.toFixed(0)}</p>
                        {totalPaid > 0 && <p className="text-xs text-green-600 mt-0.5">${totalPaid.toFixed(0)} paid</p>}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <BarChart3 className="h-4 w-4 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">Lifetime Value</p>
                        </div>
                        <p className="text-2xl font-bold text-emerald-600" data-testid="overview-lifetime-value">
                          ${totalPaid.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(customer.createdAt), "MMM yyyy")} · since
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {customer.notes && (
                    <Card>
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5" /> Notes
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{customer.notes}</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              );
            })()}
          </TabsContent>

          <TabsContent value="jobs" className="mt-4">
            {customerJobs.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg">
                <Wrench className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No jobs for this customer</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => navigate(`/jobs/new?customerId=${id}`)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  New Job
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {customerJobs.map((job) => (
                  <Link key={job.id} href={`/jobs/${job.id}`}>
                    <div className="flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-muted/50 cursor-pointer transition-colors" data-testid={`customer-job-${job.id}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{job.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {job.createdAt ? format(new Date(job.createdAt), "MMM d, yyyy") : ""}
                        </p>
                      </div>
                      <StatusBadge status={job.status} type="job" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="quotes" className="mt-4">
            {customerQuotes.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No quotes for this customer</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => navigate(`/quotes/new?customerId=${id}`)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  New Quote
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {customerQuotes.map((q) => (
                  <Link key={q.id} href={`/quotes/${q.id}`}>
                    <div className="flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-muted/50 cursor-pointer transition-colors" data-testid={`customer-quote-${q.id}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Quote #{q.id.slice(0, 8)}</p>
                        <p className="text-xs text-muted-foreground">
                          {q.total !== undefined ? `$${q.total.toFixed(2)}` : ""}
                          {q.expiresAt ? ` · Expires ${format(new Date(q.expiresAt), "MMM d, yyyy")}` : ""}
                        </p>
                      </div>
                      <StatusBadge status={q.status} type="quote" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="invoices" className="mt-4">
            {customerInvoices.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg">
                <Receipt className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No invoices for this customer</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => navigate(`/invoices/new?customerId=${id}`)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  New Invoice
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {customerInvoices.map((inv) => (
                  <Link key={inv.id} href={`/invoices/${inv.id}`}>
                    <div className="flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-muted/50 cursor-pointer transition-colors" data-testid={`customer-invoice-${inv.id}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Invoice #{inv.id.slice(0, 8)}</p>
                        <p className="text-xs text-muted-foreground">
                          {inv.dueDate ? `Due ${format(new Date(inv.dueDate), "MMM d, yyyy")}` : "No due date"}
                        </p>
                      </div>
                      <StatusBadge status={inv.status} type="invoice" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="notes" className="mt-4">
            <Card>
              <CardContent className="pt-4 space-y-3">
                {customer.notes ? (
                  <>
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {customer.notesUpdatedAt
                          ? `Last updated ${format(new Date(customer.notesUpdatedAt), "MMM d, yyyy 'at' h:mm a")}`
                          : `Added ${format(new Date(customer.createdAt), "MMM d, yyyy")}`}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 ml-auto text-xs"
                        onClick={openEdit}
                        data-testid="button-edit-notes"
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap border-l-2 border-muted pl-3">{customer.notes}</p>
                  </>
                ) : (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    <p>No notes yet</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      onClick={openEdit}
                      data-testid="button-add-notes"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Add Notes
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit((data) => updateMutation.mutate(data))} className="space-y-4" noValidate>
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-customer-name" />
                    </FormControl>
                    <FormMessage data-testid="error-edit-customer-name" />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={editForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-customer-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" data-testid="input-edit-customer-email" />
                      </FormControl>
                      <FormMessage data-testid="error-edit-customer-email" />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editForm.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="smsOptOut"
                render={({ field }) => (
                  <FormItem className="flex items-start gap-2 rounded-md border p-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        id="cust-sms-opt-out"
                        checked={field.value}
                        onCheckedChange={(v) => field.onChange(v === true)}
                        data-testid="checkbox-sms-opt-out"
                      />
                    </FormControl>
                    <div className="space-y-0.5">
                      <Label htmlFor="cust-sms-opt-out" className="cursor-pointer">
                        Do not send SMS reminders
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Skip this customer for invoice reminders, quote follow-ups, and other automated text messages.
                      </p>
                    </div>
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
                <Button type="submit" disabled={updateMutation.isPending} data-testid="button-update-customer">
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
