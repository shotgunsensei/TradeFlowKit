import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
import { Plus, Receipt, Search, Filter, Download, AlertTriangle, CreditCard } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import type { Invoice, Customer } from "@shared/schema";

function AgingBadge({ dueDate, status }: { dueDate: string | Date | null; status: string }) {
  if (status === "paid" || status === "void" || !dueDate) return null;
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

  const outstandingTotal = invoices
    .filter((inv) => inv.status !== "paid" && inv.status !== "void")
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
              <CreditCard className="h-3.5 w-3.5 text-blue-500" aria-label="Paid via card" />
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
              onClick={() => { window.location.href = "/api/invoices/export/quickbooks"; }}
              data-testid="button-export-quickbooks"
            >
              <Download className="h-4 w-4 mr-1" />
              Export
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
      </div>
    </div>
  );
}
