import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Lock, ScrollText } from "lucide-react";

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

export default function AuditTab({ plan }: { plan: string }) {
  const isEnterprise = plan === "enterprise";
  const [limit, setLimit] = useState(50);
  const { data, isLoading } = useQuery<{ items: AuditEntry[]; total: number }>({
    queryKey: ["/api/audit-log", limit],
    queryFn: async () => {
      const res = await fetch(`/api/audit-log?limit=${limit}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: isEnterprise,
  });

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
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
        ) : !data || data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-audit-empty">No activity yet.</p>
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
