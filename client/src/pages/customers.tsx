import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Users, Search, Download, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Customer } from "@shared/schema";

const CSV_HEADERS = ["name", "phone", "email", "address", "notes"];
const CSV_DISPLAY_HEADERS = ["Name", "Phone", "Email", "Address", "Notes"];

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ""; });
    return row;
  });
}

export default function CustomersPage() {
  const [, navigate] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState("");
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [importResult, setImportResult] = useState<{ imported: number; errors: { row: number; error: string }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/customers", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setShowCreate(false);
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

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.phone || "").includes(search)
  );

  const columns = [
    {
      key: "name",
      header: "Name",
      render: (c: Customer) => <span className="font-medium">{c.name}</span>,
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

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      name: fd.get("name"),
      phone: fd.get("phone") || "",
      email: fd.get("email") || "",
      address: fd.get("address") || "",
      notes: fd.get("notes") || "",
    });
  };

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
      const rows = parseCSV(text);
      setImportRows(rows);
      setImportResult(null);
    };
    reader.readAsText(file);
  };

  const handleImportClose = () => {
    setShowImport(false);
    setImportRows([]);
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
          columns={columns}
          data={filtered}
          isLoading={isLoading}
          onRowClick={(c) => navigate(`/customers/${c.id}`)}
          testIdPrefix="customer-row"
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
      </div>

      {/* Add Customer Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Customer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cust-name">Name</Label>
              <Input id="cust-name" name="name" required data-testid="input-customer-name" placeholder="Customer name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="cust-phone">Phone</Label>
                <Input id="cust-phone" name="phone" data-testid="input-customer-phone" placeholder="(555) 123-4567" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cust-email">Email</Label>
                <Input id="cust-email" name="email" type="email" data-testid="input-customer-email" placeholder="email@example.com" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cust-address">Address</Label>
              <Input id="cust-address" name="address" data-testid="input-customer-address" placeholder="123 Main St, City, ST" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cust-notes">Notes</Label>
              <Textarea id="cust-notes" name="notes" data-testid="input-customer-notes" placeholder="Any notes about this customer..." rows={3} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-customer">
                {createMutation.isPending ? "Creating..." : "Add Customer"}
              </Button>
            </div>
          </form>
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
                  <p className="font-medium text-green-900 dark:text-green-300">
                    {importResult.imported} customer{importResult.imported !== 1 ? "s" : ""} imported successfully
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
          ) : (
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
                  <p className="text-sm font-medium">Step 2 — Fill in your customers</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Open the file in Excel, Google Sheets, or any spreadsheet app. Add one customer per row.
                    The <strong>Name</strong> column is required; all others are optional.
                  </p>
                </div>
                <div className="overflow-x-auto rounded border bg-background text-xs">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/60">
                        {CSV_DISPLAY_HEADERS.map((h) => (
                          <th key={h} className="px-3 py-1.5 text-left font-medium whitespace-nowrap">
                            {h}{h === "Name" && <span className="text-destructive ml-0.5">*</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="text-muted-foreground">
                        <td className="px-3 py-1.5">John Smith</td>
                        <td className="px-3 py-1.5">(555) 123-4567</td>
                        <td className="px-3 py-1.5">john@example.com</td>
                        <td className="px-3 py-1.5">123 Main St</td>
                        <td className="px-3 py-1.5">Existing customer</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-muted/40 border space-y-3">
                <div>
                  <p className="text-sm font-medium">Step 3 — Upload your file</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Select your completed CSV file to preview before importing.</p>
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
                  {importRows.length > 0 ? `${importRows.length} row${importRows.length !== 1 ? "s" : ""} loaded — click to change` : "Select CSV File"}
                </Button>
              </div>

              {importRows.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Preview ({importRows.length} row{importRows.length !== 1 ? "s" : ""})</p>
                  <div className="rounded-lg border overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/60 sticky top-0">
                        <tr>
                          {CSV_DISPLAY_HEADERS.map((h) => (
                            <th key={h} className="px-3 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {importRows.slice(0, 10).map((row, i) => (
                          <tr key={i} className={!row.name?.trim() ? "bg-destructive/5" : ""}>
                            {CSV_HEADERS.map((h) => (
                              <td key={h} className="px-3 py-1.5 max-w-[120px] truncate">
                                {row[h] || <span className="text-muted-foreground">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {importRows.length > 10 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-1.5 text-center text-muted-foreground">
                              +{importRows.length - 10} more rows
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleImportClose}>Cancel</Button>
                <Button
                  disabled={importRows.length === 0 || importMutation.isPending}
                  onClick={() => importMutation.mutate(importRows)}
                  data-testid="button-confirm-import"
                >
                  {importMutation.isPending ? "Importing..." : `Import ${importRows.length > 0 ? importRows.length + " " : ""}Customer${importRows.length !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
