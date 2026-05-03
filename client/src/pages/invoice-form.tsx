import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { calcLineItemsTotal, calcTotalWithTaxDiscount } from "@shared/schema";
import type { Customer, Invoice, InvoiceItem } from "@shared/schema";

interface LineItem {
  id?: string;
  description: string;
  qty: string;
  unitPrice: string;
}

const invoiceFormSchema = z.object({
  customerId: z.string().trim().min(1, "Please select a customer"),
  dueDate: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  taxRate: z.string().refine((v) => v === "" || (!isNaN(Number(v)) && Number(v) >= 0), { message: "Tax rate must be a non-negative number" }).default("0"),
  discount: z.string().refine((v) => v === "" || (!isNaN(Number(v)) && Number(v) >= 0), { message: "Discount must be a non-negative number" }).default("0"),
});
type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

export default function InvoiceForm() {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id && id !== "new";
  const [, navigate] = useLocation();
  const searchParams = useSearch();
  const params = new URLSearchParams(searchParams);
  const { toast } = useToast();

  const [jobId, setJobId] = useState(params.get("jobId") || "");
  const [items, setItems] = useState<LineItem[]>([
    { description: "", qty: "1", unitPrice: "0" },
  ]);
  const [itemsError, setItemsError] = useState<string>("");

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      customerId: params.get("customerId") || "",
      dueDate: "",
      notes: "",
      taxRate: "0",
      discount: "0",
    },
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: existingInvoice } = useQuery<Invoice & { items?: InvoiceItem[] }>({
    queryKey: ["/api/invoices", id],
    enabled: isEditing,
  });

  useEffect(() => {
    if (existingInvoice) {
      form.reset({
        customerId: existingInvoice.customerId || "",
        dueDate: existingInvoice.dueDate ? new Date(existingInvoice.dueDate).toISOString().split("T")[0] : "",
        notes: existingInvoice.notes || "",
        taxRate: existingInvoice.taxRate || "0",
        discount: existingInvoice.discount || "0",
      });
      setJobId(existingInvoice.jobId || "");
      if (existingInvoice.items && existingInvoice.items.length > 0) {
        setItems(
          existingInvoice.items.map((it) => ({
            id: it.id,
            description: it.description,
            qty: String(it.qty),
            unitPrice: String(it.unitPrice),
          }))
        );
      }
    }
  }, [existingInvoice]);

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (isEditing) {
        await apiRequest("PATCH", `/api/invoices/${id}`, data);
      } else {
        await apiRequest("POST", "/api/invoices", data);
      }
    },
    onSuccess: (_, vars: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      if (vars?.customerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/customers", vars.customerId, "invoices"] });
      }
      navigate("/invoices");
      toast({ title: isEditing ? "Invoice updated" : "Invoice created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const itemRefs = useRef<Array<[HTMLInputElement | null, HTMLInputElement | null, HTMLInputElement | null]>>([]);
  const setItemRef = (i: number, col: 0 | 1 | 2) => (el: HTMLInputElement | null) => {
    if (!itemRefs.current[i]) itemRefs.current[i] = [null, null, null];
    itemRefs.current[i][col] = el;
  };
  const focusCol = (row: number, col: 0 | 1 | 2) => {
    setTimeout(() => itemRefs.current[row]?.[col]?.focus(), 30);
  };

  const addItem = (autoFocus = false) => {
    setItems((prev) => {
      const next = [...prev, { description: "", qty: "1", unitPrice: "0" }];
      if (autoFocus) setTimeout(() => focusCol(next.length - 1, 0), 30);
      return next;
    });
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof LineItem, value: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
    if (itemsError) setItemsError("");
  };

  const handleDescKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "Enter") { e.preventDefault(); focusCol(i, 1); }
  };
  const handleQtyKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "Enter") { e.preventDefault(); focusCol(i, 2); }
  };
  const handlePriceKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (i === items.length - 1) addItem(true);
      else focusCol(i + 1, 0);
    }
  };

  const taxRate = form.watch("taxRate");
  const discount = form.watch("discount");
  const subtotal = calcLineItemsTotal(items);
  const totals = calcTotalWithTaxDiscount(subtotal, taxRate, discount);

  const onSubmit = (data: InvoiceFormValues) => {
    const validItems = items.filter((it) => it.description.trim());
    if (validItems.length === 0) {
      setItemsError("Add at least one line item with a description");
      return;
    }
    setItemsError("");
    saveMutation.mutate({
      customerId: data.customerId || null,
      jobId: jobId || null,
      taxRate: data.taxRate,
      discount: data.discount,
      dueDate: data.dueDate || null,
      notes: data.notes,
      items: validItems,
    });
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={isEditing ? "Edit Invoice" : "New Invoice"}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("/invoices")} data-testid="button-back-invoices">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-3xl space-y-6" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="customerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer</FormLabel>
                  <FormControl>
                    <select
                      {...field}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      data-testid="select-invoice-customer"
                    >
                      <option value="">Select customer</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage data-testid="error-invoice-customer" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due Date</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" data-testid="input-invoice-due-date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-invoice-notes" placeholder="Invoice notes..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">Line Items</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={() => addItem(true)} data-testid="button-add-invoice-item">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="flex items-end gap-3">
                  <div className="flex-1 space-y-1">
                    {i === 0 && <Label className="text-xs">Description</Label>}
                    <Input
                      ref={setItemRef(i, 0)}
                      value={item.description}
                      onChange={(e) => updateItem(i, "description", e.target.value)}
                      onKeyDown={(e) => handleDescKeyDown(e, i)}
                      placeholder="Service or material..."
                      data-testid={`input-inv-item-desc-${i}`}
                    />
                  </div>
                  <div className="w-20 space-y-1">
                    {i === 0 && <Label className="text-xs">Qty</Label>}
                    <Input
                      ref={setItemRef(i, 1)}
                      type="number"
                      step="1"
                      min="0"
                      value={item.qty}
                      onChange={(e) => updateItem(i, "qty", e.target.value)}
                      onKeyDown={(e) => handleQtyKeyDown(e, i)}
                      data-testid={`input-inv-item-qty-${i}`}
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    {i === 0 && <Label className="text-xs">Unit Price</Label>}
                    <Input
                      ref={setItemRef(i, 2)}
                      type="number"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(i, "unitPrice", e.target.value)}
                      onKeyDown={(e) => handlePriceKeyDown(e, i)}
                      data-testid={`input-inv-item-price-${i}`}
                    />
                  </div>
                  <div className="w-24 text-right space-y-1">
                    {i === 0 && <Label className="text-xs">Total</Label>}
                    <p className="text-sm font-medium py-2">
                      ${(Number(item.qty) * Number(item.unitPrice)).toFixed(2)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove line item"
                    onClick={() => removeItem(i)}
                    disabled={items.length <= 1}
                    data-testid={`button-remove-inv-item-${i}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {itemsError && (
                <p className="text-sm font-medium text-destructive" data-testid="error-invoice-items">{itemsError}</p>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="taxRate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tax Rate (%)</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" step="0.01" data-testid="input-invoice-tax" />
                  </FormControl>
                  <FormMessage data-testid="error-invoice-tax" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="discount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Discount ($)</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" step="0.01" data-testid="input-invoice-discount" />
                  </FormControl>
                  <FormMessage data-testid="error-invoice-discount" />
                </FormItem>
              )}
            />
            <div className="space-y-1 pt-6">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>${totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span>${totals.tax.toFixed(2)}</span>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span>-${totals.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold border-t pt-1">
                <span>Total</span>
                <span>${totals.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pb-24 sm:pb-0">
            <Button type="button" variant="outline" onClick={() => navigate("/invoices")}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-invoice">
              {saveMutation.isPending ? "Saving..." : isEditing ? "Update Invoice" : "Create Invoice"}
            </Button>
          </div>
        </form>
        </Form>
      </div>

      {/* Mobile pinned totals */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-10 bg-background border-t shadow-lg px-4 py-3 space-y-1" data-testid="mobile-inv-totals">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span>${totals.subtotal.toFixed(2)}</span>
        </div>
        {totals.tax > 0 && (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Tax ({taxRate}%)</span>
            <span>${totals.tax.toFixed(2)}</span>
          </div>
        )}
        {totals.discount > 0 && (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Discount</span>
            <span>-${totals.discount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-bold pt-1 border-t">
          <span>Total</span>
          <span>${totals.total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
