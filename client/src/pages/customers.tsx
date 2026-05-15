import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Users, Search, Download, Upload, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
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
import type { Customer } from "@shared/schema";

const customerFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().optional().default(""),
  email: z.union([z.string().email("Enter a valid email"), z.literal("")]).optional().default(""),
  address: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  smsOptOut: z.boolean().optional().default(false),
});
type CustomerFormValues = z.infer<typeof customerFormSchema>;

const CSV_HEADERS = ["name", "phone", "email", "address", "notes"];
const CSV_DISPLAY_HEADERS = ["Name", "Phone", "Email", "Address", "Notes"];
const CUSTOMER_FIELDS = [
  { value: "skip", label: "— Skip —" },
  { value: "name", label: "Name *" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "address", label: "Address" },
  { value: "notes", label: "Notes" },
];

function autoMap(csvHeader: string): string {
  const h = csvHeader.toLowerCase().replace(/[\s_\-]+/g, "");
  if (["name", "fullname", "customername", "client", "clientname"].includes(h)) return "name";
  if (["phone", "phonenumber", "mobile", "cell", "telephone", "tel"].includes(h)) return "phone";
  if (["email", "emailaddress", "mail"].includes(h)) return "email";
  if (["address", "addr", "street", "location"].includes(h)) return "address";
  if (["notes", "note", "comments", "comment", "description"].includes(h)) return "notes";
  return "skip";
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ""; });
    return row;
  });
  return { headers, rows };
}

function applyMapping(rows: Record<string, string>[], mapping: Record<string, string>): Record<string, string>[] {
  return rows.map((row) => {
    const mapped: Record<string, string> = {};
    Object.entries(mapping).forEach(([csvHeader, field]) => {
      if (field !== "skip" && field) {
        if (!mapped[field]) mapped[field] = row[csvHeader] || "";
      }
    });
    return mapped;
  });
}

export default function CustomersPage() {
  const [, navigate] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const createForm = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: { name: "", phone: "", email: "", address: "", notes: "", smsOptOut: false },
  });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [importStep, setImportStep] = useState<"upload" | "map" | "preview">("upload");
  const [importResult, setImportResult] = useState<{ imported: number; skipped?: number; errors: { row: number; error: string }[] } | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers", { q: debouncedSearch }],
    queryFn: async () => {
      const url = debouncedSearch ? `/api/customers?q=${encodeURIComponent(debouncedSearch)}` : "/api/customers";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch customers");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CustomerFormValues) => {
      await apiRequest("POST", "/api/customers", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setShowCreate(false);
      createForm.reset();
      toast({ title: "Customer created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (rows: Record<string, string>[]) => {
      const res = await apiRequest("POST", "/api/customers/import", { customers: rows });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setImportResult(data);
    },
    onError: (err: Error) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const filtered = customers;

  const selection = useRowSelection(filtered);

  const bulkRestoreMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/customers/bulk-restore", { ids });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: `${data.restored} customer${data.restored !== 1 ? "s" : ""} restored` });
    },
    onError: (err: Error) => {
      toast({ title: "Restore failed", description: err.message, variant: "destructive" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/customers/bulk-delete", { ids });
      return res.json();
    },
    onSuccess: (data, ids) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: `${data.updated} customer${data.updated !== 1 ? "s" : ""} deleted`,
        duration: 10000,
        action: (
          <ToastAction
            altText="Undo delete"
            data-testid="button-undo-bulk-delete-customers"
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

  const handleExportSelected = () => {
    const items = selection.selectedItems.length > 0 ? selection.selectedItems : filtered;
    const csv = toCSV(items, [
      { header: "Name", value: (c) => c.name },
      { header: "Phone", value: (c) => c.phone || "" },
      { header: "Email", value: (c) => c.email || "" },
      { header: "Address", value: (c) => c.address || "" },
      { header: "Notes", value: (c) => c.notes || "" },
    ]);
    downloadCSV(`customers-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast({ title: `Exported ${items.length} customer${items.length !== 1 ? "s" : ""}` });
  };

  const columns = [
    {
      key: "name",
      header: "Name",
      render: (c: Customer) => <span className="font-medium">{c.name}</span>,
      sortFn: (a: Customer, b: Customer) => a.name.localeCompare(b.name),
    },
    {
      key: "phone",
      header: "Phone",
      className: "hidden sm:table-cell",
      render: (c: Customer) => <span className="text-muted-foreground text-sm">{c.phone || "-"}</span>,
    },
    {
      key: "email",
      header: "Email",
      className: "hidden md:table-cell",
      render: (c: Customer) => <span className="text-muted-foreground text-sm">{c.email || "-"}</span>,
      sortFn: (a: Customer, b: Customer) => (a.email || "").localeCompare(b.email || ""),
    },
    {
      key: "address",
      header: "Address",
      className: "hidden lg:table-cell",
      render: (c: Customer) => (
        <span className="text-muted-foreground text-sm truncate max-w-[200px] block">{c.address || "-"}</span>
      ),
    },
  ];

  const downloadTemplate = () => {
    const exampleRow = ["John Smith", "(555) 123-4567", "john@example.com", "123 Main St City ST", "Existing customer"];
    const csv = [CSV_DISPLAY_HEADERS.join(","), exampleRow.join(",")].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "customers-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCSV(text);
      setImportRows(rows);
      setCsvHeaders(headers);
      const initialMapping: Record<string, string> = {};
      headers.forEach((h) => { initialMapping[h] = autoMap(h); });
      setFieldMapping(initialMapping);
      setImportResult(null);
      setImportStep("map");
    };
    reader.readAsText(file);
  };

  const handleImportClose = () => {
    setShowImport(false);
    setImportRows([]);
    setCsvHeaders([]);
    setFieldMapping({});
    setImportStep("upload");
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Customers"
        description="Manage your customer directory"
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleExportSelected} data-testid="button-export-customers">
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowImport(true)} data-testid="button-import-customers">
              <Upload className="h-4 w-4 mr-1" />
              Import
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-add-customer">
              <Plus className="h-4 w-4 mr-1" />
              Add Customer
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customers..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-customers"
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {filtered.length} customer{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        <DataTable
          tableId="customers"
          columns={columns}
          data={filtered}
          isLoading={isLoading}
          onRowClick={(c) => navigate(`/customers/${c.id}`)}
          testIdPrefix="customer-row"
          selection={selection}
          emptyState={
            <EmptyState
              icon={Users}
              title="No customers yet"
              description="Add your first customer or import from a CSV file."
              actionLabel="Add Customer"
              onAction={() => setShowCreate(true)}
            />
          }
        />

        <BulkActionBar count={selection.selectedCount} onClear={selection.clear}>
          <Button size="sm" variant="outline" onClick={handleExportSelected} data-testid="button-bulk-export-customers">
            <Download className="h-4 w-4 mr-1" />
            Export CSV
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirmBulkDelete(true)}
            data-testid="button-bulk-delete-customers"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </BulkActionBar>
      </div>

      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selection.selectedCount} customer{selection.selectedCount !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the selected customers. Their jobs and invoices will keep references but lose the customer link. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-bulk-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(selection.selected)}
              disabled={bulkDeleteMutation.isPending}
              data-testid="button-bulk-delete-confirm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Customer Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) createForm.reset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Customer</DialogTitle>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4" noValidate>
              <FormField
                control={createForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-customer-name" placeholder="Customer name" />
                    </FormControl>
                    <FormMessage data-testid="error-customer-name" />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={createForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-customer-phone" placeholder="(555) 123-4567" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" data-testid="input-customer-email" placeholder="email@example.com" />
                      </FormControl>
                      <FormMessage data-testid="error-customer-email" />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={createForm.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-customer-address" placeholder="123 Main St, City, ST" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea {...field} data-testid="input-customer-notes" placeholder="Any notes about this customer..." rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="smsOptOut"
                render={({ field }) => (
                  <FormItem className="flex items-start gap-2 rounded-md border p-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        id="cust-create-sms-opt-out"
                        checked={field.value}
                        onCheckedChange={(v) => field.onChange(v === true)}
                        data-testid="checkbox-create-sms-opt-out"
                      />
                    </FormControl>
                    <div className="space-y-0.5">
                      <Label htmlFor="cust-create-sms-opt-out" className="cursor-pointer">
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
                <Button type="button" variant="outline" onClick={() => { setShowCreate(false); createForm.reset(); }}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-customer">
                  {createMutation.isPending ? "Creating..." : "Add Customer"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Import CSV Dialog */}
      <Dialog open={showImport} onOpenChange={handleImportClose}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Customers from CSV</DialogTitle>
            <DialogDescription>
              Download the template, fill it in with your existing customers, then upload it here.
            </DialogDescription>
          </DialogHeader>

          {importResult ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="font-medium text-green-900 dark:text-green-300" data-testid="text-import-summary">
                    {importResult.imported} customer{importResult.imported !== 1 ? "s" : ""} imported successfully
                  </p>
                  <p className="text-sm text-green-800 dark:text-green-400 mt-0.5" data-testid="text-import-skipped">
                    {importResult.skipped ?? 0} duplicate{(importResult.skipped ?? 0) !== 1 ? "s" : ""} skipped
                  </p>
                </div>
              </div>
              {importResult.errors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4" />
                    {importResult.errors.length} row{importResult.errors.length !== 1 ? "s" : ""} skipped
                  </p>
                  <div className="rounded-lg border border-destructive/30 divide-y divide-border max-h-40 overflow-y-auto">
                    {importResult.errors.map((e, i) => (
                      <div key={i} className="px-3 py-2 text-sm">
                        <span className="font-medium">Row {e.row}:</span>{" "}
                        <span className="text-muted-foreground">{e.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={handleImportClose}>Done</Button>
              </div>
            </div>
          ) : importStep === "upload" ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/40 border">
                <div className="flex-1">
                  <p className="text-sm font-medium">Step 1 — Download the template</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Opens a CSV with the correct column headers and an example row.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={downloadTemplate} data-testid="button-download-template">
                  <Download className="h-4 w-4 mr-1.5" />
                  Download Template
                </Button>
              </div>

              <div className="p-4 rounded-lg bg-muted/40 border space-y-3">
                <div>
                  <p className="text-sm font-medium">Step 2 — Upload your CSV</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Select your CSV file. You can map columns to customer fields in the next step.
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileSelect}
                  data-testid="input-csv-file"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-select-csv"
                >
                  <Upload className="h-4 w-4 mr-1.5" />
                  Select CSV File
                </Button>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleImportClose}>Cancel</Button>
              </div>
            </div>
          ) : importStep === "map" ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">Map columns — {importRows.length} rows detected</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Match each column in your CSV to the correct customer field. Set to "Skip" to ignore a column.
                </p>
              </div>
              <div className="rounded-lg border divide-y divide-border max-h-64 overflow-y-auto">
                {csvHeaders.map((header) => (
                  <div key={header} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1">
                      <span className="text-sm font-medium">{header}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        e.g. {importRows[0]?.[header] ? `"${String(importRows[0][header]).slice(0, 30)}"` : "—"}
                      </span>
                    </div>
                    <Select
                      value={fieldMapping[header] ?? "skip"}
                      onValueChange={(val) =>
                        setFieldMapping((prev) => ({ ...prev, [header]: val }))
                      }
                    >
                      <SelectTrigger className="w-36 h-8 text-xs" data-testid={`map-select-${header}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CUSTOMER_FIELDS.map((f) => (
                          <SelectItem key={f.value} value={f.value} className="text-xs">
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {!Object.values(fieldMapping).includes("name") && (
                <p className="text-xs text-destructive">
                  ⚠ You must map at least one column to <strong>Name</strong> before continuing.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setImportStep("upload")}>Back</Button>
                <Button
                  disabled={!Object.values(fieldMapping).includes("name")}
                  onClick={() => setImportStep("preview")}
                  data-testid="button-mapping-next"
                >
                  Preview Import
                </Button>
              </div>
            </div>
          ) : (
            (() => {
              const mappedRows = applyMapping(importRows, fieldMapping);
              const duplicates = mappedRows.map((row) => {
                const nameLower = row.name?.trim().toLowerCase();
                const emailLower = row.email?.trim().toLowerCase();
                const phoneNorm = row.phone?.replace(/\D/g, "");
                return customers.some(
                  (c) =>
                    (nameLower && c.name.toLowerCase() === nameLower) ||
                    (emailLower && c.email && c.email.toLowerCase() === emailLower) ||
                    (phoneNorm && phoneNorm.length >= 7 && c.phone && c.phone.replace(/\D/g, "") === phoneNorm)
                );
              });
              const dupCount = duplicates.filter(Boolean).length;
              const missingName = mappedRows.filter((r) => !r.name?.trim()).length;
              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Preview — {mappedRows.length} row{mappedRows.length !== 1 ? "s" : ""}</p>
                    <div className="flex gap-2 text-xs">
                      {dupCount > 0 && (
                        <span className="text-amber-600 font-medium">⚠ {dupCount} possible dup{dupCount !== 1 ? "s" : ""}</span>
                      )}
                      {missingName > 0 && (
                        <span className="text-destructive font-medium">✕ {missingName} missing name</span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border overflow-hidden max-h-52 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/60 sticky top-0">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-medium w-6">#</th>
                          {CSV_DISPLAY_HEADERS.map((h) => (
                            <th key={h} className="px-3 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                          ))}
                          <th className="px-3 py-1.5 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {mappedRows.slice(0, 10).map((row, i) => (
                          <tr key={i} className={!row.name?.trim() ? "bg-destructive/5" : duplicates[i] ? "bg-amber-50 dark:bg-amber-950/20" : ""}>
                            <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                            {CSV_HEADERS.map((h) => (
                              <td key={h} className="px-3 py-1.5 max-w-[100px] truncate">
                                {row[h] || <span className="text-muted-foreground">—</span>}
                              </td>
                            ))}
                            <td className="px-3 py-1.5">
                              {!row.name?.trim() ? (
                                <span className="text-destructive">Missing name</span>
                              ) : duplicates[i] ? (
                                <span className="text-amber-600">Possible dup</span>
                              ) : (
                                <span className="text-emerald-600">OK</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {mappedRows.length > 10 && (
                          <tr>
                            <td colSpan={7} className="px-3 py-1.5 text-center text-muted-foreground">
                              +{mappedRows.length - 10} more rows
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setImportStep("map")}>Back</Button>
                    <Button variant="outline" onClick={handleImportClose}>Cancel</Button>
                    <Button
                      disabled={mappedRows.length === 0 || importMutation.isPending}
                      onClick={() => importMutation.mutate(mappedRows)}
                      data-testid="button-confirm-import"
                    >
                      {importMutation.isPending ? "Importing..." : `Import ${mappedRows.length} Customer${mappedRows.length !== 1 ? "s" : ""}`}
                    </Button>
                  </div>
                </div>
              );
            })()
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
