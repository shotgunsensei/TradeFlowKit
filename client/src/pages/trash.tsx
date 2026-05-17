import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Trash2, RotateCcw, Skull } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import type { Customer, Job, Invoice } from "@shared/schema";

type EntityKind = "customers" | "jobs" | "invoices";

type TrashData = {
  customers: Customer[];
  jobs: (Job & { customerName?: string })[];
  invoices: (Invoice & { customerName?: string; total?: number })[];
};

function formatDeletedAt(d: Date | string | null | undefined): string {
  if (!d) return "—";
  try {
    return `${formatDistanceToNow(new Date(d))} ago`;
  } catch {
    return "—";
  }
}

export default function TrashPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<EntityKind>("customers");
  const [confirmPurge, setConfirmPurge] = useState<{ kind: EntityKind; id: string; label: string } | null>(null);

  const { data, isLoading } = useQuery<TrashData>({
    queryKey: ["/api/trash"],
  });

  const restoreMutation = useMutation({
    mutationFn: async ({ kind, id }: { kind: EntityKind; id: string }) => {
      await apiRequest("POST", `/api/trash/${kind}/${id}/restore`);
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trash"] });
      queryClient.invalidateQueries({ queryKey: [`/api/${vars.kind}`] });
      toast({ title: "Restored" });
    },
    onError: (err: Error) => {
      toast({ title: "Restore failed", description: err.message, variant: "destructive" });
    },
  });

  const purgeMutation = useMutation({
    mutationFn: async ({ kind, id }: { kind: EntityKind; id: string }) => {
      await apiRequest("DELETE", `/api/trash/${kind}/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trash"] });
      toast({ title: "Permanently deleted" });
      setConfirmPurge(null);
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const customers = data?.customers ?? [];
  const jobs = data?.jobs ?? [];
  const invoices = data?.invoices ?? [];
  const totalCount = customers.length + jobs.length + invoices.length;

  const renderActions = (kind: EntityKind, id: string, label: string) => (
    <div className="flex justify-end gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => restoreMutation.mutate({ kind, id })}
        disabled={restoreMutation.isPending}
        data-testid={`button-restore-${kind}-${id}`}
      >
        <RotateCcw className="h-3.5 w-3.5 mr-1" />
        Restore
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => setConfirmPurge({ kind, id, label })}
        data-testid={`button-purge-${kind}-${id}`}
      >
        <Skull className="h-3.5 w-3.5 mr-1" />
        Delete permanently
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Trash"
        description="Restore recently deleted items or remove them for good"
      />
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : totalCount === 0 ? (
          <EmptyState
            icon={Trash2}
            title="Trash is empty"
            description="Deleted customers, jobs, and invoices will appear here so you can restore them later."
          />
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as EntityKind)}>
            <TabsList>
              <TabsTrigger value="customers" data-testid="tab-trash-customers">
                Customers <Badge variant="secondary" className="ml-2">{customers.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="jobs" data-testid="tab-trash-jobs">
                Jobs <Badge variant="secondary" className="ml-2">{jobs.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="invoices" data-testid="tab-trash-invoices">
                Invoices <Badge variant="secondary" className="ml-2">{invoices.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="customers" className="mt-4">
              {customers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No deleted customers.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden sm:table-cell">Email</TableHead>
                      <TableHead className="hidden md:table-cell">Phone</TableHead>
                      <TableHead>Deleted</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((c) => (
                      <TableRow key={c.id} data-testid={`row-trash-customer-${c.id}`}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground">{c.email || "—"}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">{c.phone || "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm" data-testid={`text-deleted-at-customer-${c.id}`}>
                          {formatDeletedAt(c.deletedAt)}
                        </TableCell>
                        <TableCell>{renderActions("customers", c.id, c.name)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="jobs" className="mt-4">
              {jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No deleted jobs.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead className="hidden sm:table-cell">Customer</TableHead>
                      <TableHead className="hidden md:table-cell">Status</TableHead>
                      <TableHead>Deleted</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((j) => (
                      <TableRow key={j.id} data-testid={`row-trash-job-${j.id}`}>
                        <TableCell className="font-medium">{j.title}</TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground">{j.customerName || "—"}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">{j.status}</TableCell>
                        <TableCell className="text-muted-foreground text-sm" data-testid={`text-deleted-at-job-${j.id}`}>
                          {formatDeletedAt(j.deletedAt)}
                        </TableCell>
                        <TableCell>{renderActions("jobs", j.id, j.title)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="invoices" className="mt-4">
              {invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No deleted invoices.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead className="hidden sm:table-cell">Customer</TableHead>
                      <TableHead className="hidden md:table-cell">Total</TableHead>
                      <TableHead>Deleted</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => {
                      const ref = `#${inv.id.slice(0, 8).toUpperCase()}`;
                      return (
                        <TableRow key={inv.id} data-testid={`row-trash-invoice-${inv.id}`}>
                          <TableCell className="font-medium">{ref}</TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground">{inv.customerName || "—"}</TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground">
                            {typeof inv.total === "number" ? `$${inv.total.toFixed(2)}` : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm" data-testid={`text-deleted-at-invoice-${inv.id}`}>
                            {formatDeletedAt(inv.deletedAt)}
                          </TableCell>
                          <TableCell>{renderActions("invoices", inv.id, ref)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <AlertDialog open={!!confirmPurge} onOpenChange={(open) => !open && setConfirmPurge(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete {confirmPurge?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the record from the database for good. It can't be undone or restored later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-purge-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-purge-confirm"
              onClick={() => confirmPurge && purgeMutation.mutate({ kind: confirmPurge.kind, id: confirmPurge.id })}
              disabled={purgeMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {purgeMutation.isPending ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
