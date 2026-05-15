import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
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
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Receipt, Search, Filter, Download, Upload, AlertTriangle, CreditCard, Trash2, CheckCircle2 } from "lucide-react";
import { CsvImportDialog } from "@/components/csv-import-dialog";
import { format, differenceInDays } from "date-fns";
import type { Invoice, Customer } from "@shared/schema";

function AgingBadge({ dueDate, status }: { dueDate: string | Date | null; status: string }) {
  if (status === "paid" || status === "void" || status === "processing" || !dueDate) return null;
  const due = new Date(dueDate);
  const days = differenceInDays(new Date(), due);
  if (days > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
        <AlertTriangle className="h-3 w-3" />
        Overdue {days}d
      </span>
    );
  }
  if (days >= -7) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
        Due in {Math.abs(days)}d
      </span>
    );
  }
  return null;
}

function statusRowClass(inv: Invoice & { total?: number }) {
  if (inv.status === "paid") return "opacity-70";
  if (inv.status === "void") return "opacity-50";
  if (inv.status === "processing") return "";
  if (inv.dueDate && differenceInDays(new Date(), new Date(inv.dueDate)) > 0) {
    return "border-l-2 border-l-red-400";
  }
  return "";
}

export default function InvoicesPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const { toast } = useToast();

  const { data: invoices = [], isLoading } = useQuery<(Invoice & { customerName?: string; total?: number })[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const filtered = invoices.filter((inv) => {
    const matchesSearch =
      (inv.customerName || "").toLowerCase().includes(search.toLowerCase()) ||
      inv.id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || inv.status === statusFilter;
    const matchesCustomer = customerFilter === "all" || inv.customerId === customerFilter;
    return matchesSearch && matchesStatus && matchesCustomer;
  });

  const selection = useRowSelection(filtered);

  const bulkRestoreMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/invoices/bulk-restore", { ids });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: `${data.restored} invoice${data.restored !== 1 ? "s" : ""} restored` });
    },
    onError: (err: Error) => {
      toast({ title: "Restore failed", description: err.message, variant: "destructive" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/invoices/bulk-delete", { ids });
      return res.json();
    },
    onSuccess: (data, ids) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({
        title: `${data.updated} invoice${data.updated !== 1 ? "s" : ""} deleted`,
        duration: 10000,
        action: (
          <ToastAction
            altText="Undo delete"
            data-testid="button-undo-bulk-delete-invoices"
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

  const bulkMarkPaidMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/invoices/bulk-mark-paid", { ids });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: `${data.updated} invoice${data.updated !== 1 ? "s" : ""} marked as paid` });
      selection.clear();
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const handleExportInvoices = () => {
    const items = selection.selectedItems.length > 0 ? selection.selectedItems : filtered;
    const csv = toCSV(items, [
      { header: "Invoice #", value: (inv) => inv.id.slice(0, 8).toUpperCase() },
      { header: "Customer", value: (inv) => inv.customerName || "" },
      { header: "Status", value: (inv) => inv.status },
      { header: "Total", value: (inv) => (inv.total || 0).toFixed(2) },
      { header: "Due Date", value: (inv) => inv.dueDate ? format(new Date(inv.dueDate), "yyyy-MM-dd") : "" },
      { header: "Created", value: (inv) => inv.createdAt ? format(new Date(inv.createdAt), "yyyy-MM-dd") : "" },
    ]);
    downloadCSV(`invoices-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast({ title: `Exported ${items.length} invoice${items.length !== 1 ? "s" : ""}` });
  };

  const outstandingTotal = invoices
    .filter((inv) => inv.status !== "paid" && inv.status !== "void" && inv.status !== "processing")
    .reduce((sum, inv) => sum + (inv.total || 0), 0);

  const columns = [
    {
      key: "id",
      header: "Invoice",
      render: (inv: Invoice & { customerName?: string; total?: number }) => (
        <div>
          <p className="font-medium">#{inv.id.slice(0, 8)}</p>
          <p className="text-xs text-muted-foreground">{inv.customerName || "No customer"}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (inv: Invoice & { total?: number }) => (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <StatusBadge status={inv.status} type="invoice" />
            {(inv as any).paidViaStripe && (
              <CreditCard className="h-3.5 w-3.5 text-primary" aria-label="Paid via card" />
            )}
          </div>
          <AgingBadge dueDate={inv.dueDate} status={inv.status} />
        </div>
      ),
    },
    {
      key: "total",
      header: "Total",
      render: (inv: Invoice & { total?: number }) => (
        <span className={`font-medium ${inv.status === "paid" ? "text-emerald-600" : ""}`}>
          ${(inv.total || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      key: "due",
      header: "Due Date",
      className: "hidden md:table-cell",
      render: (inv: Invoice) => (
        <span className={`text-sm ${inv.dueDate && differenceInDays(new Date(), new Date(inv.dueDate)) > 0 && inv.status !== "paid" ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
          {inv.dueDate ? format(new Date(inv.dueDate), "MMM d, yyyy") : "-"}
        </span>
      ),
    },
    {
      key: "created",
      header: "Created",
      className: "hidden lg:table-cell",
      render: (inv: Invoice) => (
        <span className="text-sm text-muted-foreground">
          {inv.createdAt ? format(new Date(inv.createdAt), "MMM d, yyyy") : ""}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Invoices"
        description="Manage billing and payments"
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportInvoices}
              data-testid="button-export-invoices"
            >
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { window.location.href = "/api/invoices/export/quickbooks"; }}
              data-testid="button-export-quickbooks"
            >
              <Download className="h-4 w-4 mr-1" />
              QuickBooks
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowImport(true)} data-testid="button-import-invoices">
              <Upload className="h-4 w-4 mr-1" />
              Import
            </Button>
            <Button size="sm" onClick={() => navigate("/invoices/new")} data-testid="button-add-invoice">
              <Plus className="h-4 w-4 mr-1" />
              New Invoice
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-4 md:p-6">
        {outstandingTotal > 0 && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-950/20 px-4 py-3" data-testid="outstanding-total-banner">
            <Receipt className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-sm text-amber-800 dark:text-amber-300">
              Outstanding balance: <strong>${outstandingTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </span>
          </div>
        )}

        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search invoices..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-invoices"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-invoice-status-filter">
              <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="void">Void</SelectItem>
            </SelectContent>
          </Select>
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="w-[160px]" data-testid="select-invoice-customer-filter">
              <SelectValue placeholder="Customer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{filtered.length} invoice{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        <DataTable
          tableId="invoices"
          columns={columns}
          data={filtered}
          isLoading={isLoading}
          onRowClick={(inv) => navigate(`/invoices/${inv.id}`)}
          testIdPrefix="invoice-row"
          rowClassName={statusRowClass}
          selection={selection}
          emptyState={
            <EmptyState
              icon={Receipt}
              title="No invoices yet"
              description="Create your first invoice to start billing customers."
              actionLabel="New Invoice"
              onAction={() => navigate("/invoices/new")}
            />
          }
        />

        <BulkActionBar count={selection.selectedCount} onClear={selection.clear}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => bulkMarkPaidMutation.mutate(selection.selected)}
            disabled={bulkMarkPaidMutation.isPending}
            data-testid="button-bulk-mark-paid"
          >
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Mark as Paid
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportInvoices} data-testid="button-bulk-export-invoices">
            <Download className="h-4 w-4 mr-1" />
            Export CSV
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirmBulkDelete(true)}
            data-testid="button-bulk-delete-invoices"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </BulkActionBar>
      </div>

      <CsvImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        title="Import Invoices from CSV"
        description="Customers must already exist; rows are matched by customer name. Use Invoice Ref to group multiple line item rows into one invoice."
        resourceLabel="invoice"
        templateFilename="invoices-template.csv"
        templateExampleRow={[
          "INV-1001",
          "John Smith",
          "draft",
          "2026-06-01",
          "8.5",
          "0",
          "Thanks for your business",
          "Labor",
          "2",
          "75.00",
        ]}
        fields={[
          { key: "invoiceRef", label: "Invoice Ref", aliases: ["invoiceno", "invoicenumber", "ref"] },
          { key: "customerName", label: "Customer", aliases: ["customer", "client", "clientname"] },
          { key: "status", label: "Status" },
          { key: "dueDate", label: "Due Date", aliases: ["due"] },
          { key: "taxRate", label: "Tax Rate %", aliases: ["tax", "taxpercent"] },
          { key: "discount", label: "Discount", aliases: ["discountamount"] },
          { key: "notes", label: "Notes" },
          { key: "itemDescription", label: "Item Description", aliases: ["description", "item", "lineitem"] },
          { key: "itemQty", label: "Item Qty", aliases: ["qty", "quantity"] },
          { key: "itemUnitPrice", label: "Item Unit Price", aliases: ["unitprice", "price", "rate"] },
        ]}
        onImport={async (rows) => {
          const res = await apiRequest("POST", "/api/invoices/import", { invoices: rows });
          return res.json();
        }}
        onImported={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        }}
      />

      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selection.selectedCount} invoice{selection.selectedCount !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the selected invoices and their line items. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-bulk-delete-invoices-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(selection.selected)}
              disabled={bulkDeleteMutation.isPending}
              data-testid="button-bulk-delete-invoices-confirm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
