import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Lock, ScrollText, X } from "lucide-react";

interface AuditEntry {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  createdAt: string;
  userName: string | null;
  userUsername: string | null;
}

const ENTITY_OPTIONS = [
  { value: "customer", label: "Customer" },
  { value: "invoice", label: "Invoice" },
  { value: "job", label: "Job" },
  { value: "quote", label: "Quote" },
  { value: "organization", label: "Organization" },
  { value: "org", label: "Organization (SSO)" },
  { value: "membership", label: "Team membership" },
];

const ACTION_OPTIONS = [
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "paid", label: "Paid" },
  { value: "payment_failed", label: "Payment failed" },
  { value: "sso_auto_join", label: "SSO auto-join" },
  { value: "sso_auto_provision", label: "SSO auto-provision" },
];

const ALL = "__all__";

export default function AuditTab({ plan }: { plan: string }) {
  const isEnterprise = plan === "enterprise";
  const [limit, setLimit] = useState(50);
  const [entity, setEntity] = useState<string>(ALL);
  const [action, setAction] = useState<string>(ALL);

  const params = new URLSearchParams({ limit: String(limit) });
  if (entity !== ALL) params.set("entity", entity);
  if (action !== ALL) params.set("action", action);

  const { data, isLoading } = useQuery<{ items: AuditEntry[]; total: number }>({
    queryKey: ["/api/audit-log", limit, entity, action],
    queryFn: async () => {
      const res = await fetch(`/api/audit-log?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: isEnterprise,
  });

  const hasActiveFilters = entity !== ALL || action !== ALL;
  const clearFilters = () => {
    setEntity(ALL);
    setAction(ALL);
    setLimit(50);
  };

  if (!isEnterprise) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ScrollText className="h-4 w-4" /> Audit log
          </CardTitle>
          <CardDescription>Track every change in your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-5 text-center space-y-3" data-testid="audit-locked">
            <Lock className="h-5 w-5 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">Audit log access is an Enterprise feature.</p>
            <p className="text-xs text-muted-foreground">Activity is being recorded — upgrade to view it here.</p>
            <a href="/subscription">
              <Button size="sm" data-testid="button-upgrade-for-audit">Upgrade Plan</Button>
            </a>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ScrollText className="h-4 w-4" /> Audit log
        </CardTitle>
        <CardDescription>Recent changes recorded across your organization.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div className="space-y-1">
            <Label htmlFor="audit-filter-entity" className="text-xs">Entity</Label>
            <Select
              value={entity}
              onValueChange={(v) => { setEntity(v); setLimit(50); }}
            >
              <SelectTrigger id="audit-filter-entity" className="h-8 w-[180px]" data-testid="select-audit-entity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL} data-testid="option-audit-entity-all">All entities</SelectItem>
                {ENTITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} data-testid={`option-audit-entity-${o.value}`}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-filter-action" className="text-xs">Action</Label>
            <Select
              value={action}
              onValueChange={(v) => { setAction(v); setLimit(50); }}
            >
              <SelectTrigger id="audit-filter-action" className="h-8 w-[180px]" data-testid="select-audit-action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL} data-testid="option-audit-action-all">All actions</SelectItem>
                {ACTION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} data-testid={`option-audit-action-${o.value}`}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-8"
              data-testid="button-clear-audit-filters"
            >
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          )}
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
        ) : !data || data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-audit-empty">
            {hasActiveFilters ? "No activity matches these filters." : "No activity yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table data-testid="table-audit">
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((row) => (
                  <TableRow key={row.id} data-testid={`row-audit-${row.id}`}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{row.userName || row.userUsername || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{row.action}</Badge></TableCell>
                    <TableCell className="text-xs">{row.entity}</TableCell>
                    <TableCell className="font-mono text-xs">{row.entityId?.slice(0, 8) || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-muted-foreground" data-testid="text-audit-count">
                Showing {data.items.length} of {data.total}
              </p>
              {data.total > data.items.length && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLimit(Math.min(limit + 50, 200))}
                  disabled={limit >= 200}
                  data-testid="button-load-more-audit"
                >
                  {limit >= 200 ? "Max 200 shown" : "Load more"}
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
