import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PageHeader } from "@/components/page-header";
import { PLAN_LABELS } from "@shared/schema";
import type { Org, User, Membership } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Users, Building2, Trash2, Settings, ChevronDown, ChevronRight, UserMinus } from "lucide-react";

type AdminOrg = Org & {
  counts: { customers: number; jobs: number; quotes: number; invoices: number; members: number };
  memberCount: number;
};

type OrgMember = Membership & {
  user: Omit<User, "password"> | null;
};

const PLAN_COLORS: Record<string, string> = {
  free: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  individual: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  small_business: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  enterprise: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

function OrgMembersRow({ orgId }: { orgId: string }) {
  const { toast } = useToast();

  const { data: members = [], isLoading } = useQuery<OrgMember[]>({
    queryKey: ["/api/admin/orgs", orgId, "members"],
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `/api/admin/orgs/${orgId}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orgs", orgId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orgs"] });
      toast({ title: "Member removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to remove member", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={7} className="p-4">
          <Skeleton className="h-6 w-full" />
        </TableCell>
      </TableRow>
    );
  }

  if (members.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-3">
          No members found
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell colSpan={7} className="p-0">
        <div className="bg-muted/30 px-8 py-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Members</p>
          <div className="space-y-1.5">
            {members.map((m) => (
              <div
                key={m.userId}
                className="flex items-center justify-between gap-2 text-sm"
                data-testid={`member-row-${m.userId}`}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-medium" data-testid={`text-member-username-${m.userId}`}>
                    {m.user?.username || "Unknown"}
                  </span>
                  <span className="text-muted-foreground">{m.user?.fullName}</span>
                  <Badge variant="outline" className="text-xs no-default-hover-elevate no-default-active-elevate">
                    {m.role}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeMemberMutation.mutate(m.userId)}
                  disabled={removeMemberMutation.isPending}
                  data-testid={`button-remove-member-${m.userId}`}
                >
                  <UserMinus className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

function OrganizationsTab() {
  const { toast } = useToast();
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [deleteOrg, setDeleteOrg] = useState<AdminOrg | null>(null);

  const { data: orgs = [], isLoading } = useQuery<AdminOrg[]>({
    queryKey: ["/api/admin/orgs"],
  });

  const changePlanMutation = useMutation({
    mutationFn: async ({ id, plan }: { id: string; plan: string }) => {
      await apiRequest("PATCH", `/api/admin/orgs/${id}`, { plan });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orgs"] });
      toast({ title: "Plan updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update plan", description: err.message, variant: "destructive" });
    },
  });

  const deleteOrgMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/orgs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orgs"] });
      setDeleteOrg(null);
      toast({ title: "Organization deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete organization", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-center">Members</TableHead>
                <TableHead className="text-center">Customers</TableHead>
                <TableHead className="text-center">Jobs</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No organizations found
                  </TableCell>
                </TableRow>
              ) : (
                orgs.map((org) => (
                  <>
                    <TableRow key={org.id} data-testid={`row-org-${org.id}`}>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setExpandedOrg(expandedOrg === org.id ? null : org.id)}
                          data-testid={`button-expand-org-${org.id}`}
                        >
                          {expandedOrg === org.id ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium" data-testid={`text-org-name-${org.id}`}>
                        {org.name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`${PLAN_COLORS[org.plan] || ""} no-default-hover-elevate no-default-active-elevate`}
                          data-testid={`badge-plan-${org.id}`}
                        >
                          {PLAN_LABELS[org.plan] || org.plan}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-members-${org.id}`}>
                        {org.memberCount}
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-customers-${org.id}`}>
                        {org.counts?.customers ?? 0}
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-jobs-${org.id}`}>
                        {org.counts?.jobs ?? 0}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="no-default-hover-elevate no-default-active-elevate"
                          data-testid={`badge-status-${org.id}`}
                        >
                          {org.subscriptionStatus || "none"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-actions-org-${org.id}`}>
                              <Settings className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger data-testid={`button-change-plan-${org.id}`}>
                                Change Plan
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                {Object.entries(PLAN_LABELS).map(([key, label]) => (
                                  <DropdownMenuItem
                                    key={key}
                                    onClick={() => changePlanMutation.mutate({ id: org.id, plan: key })}
                                    disabled={org.plan === key}
                                    data-testid={`button-set-plan-${key}-${org.id}`}
                                  >
                                    {label}
                                    {org.plan === key && " (current)"}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setDeleteOrg(org)}
                              data-testid={`button-delete-org-${org.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Organization
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    {expandedOrg === org.id && <OrgMembersRow orgId={org.id} />}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteOrg} onOpenChange={(open) => !open && setDeleteOrg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Organization</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteOrg?.name}</strong>? This will permanently remove the organization and all its data including customers, jobs, quotes, and invoices.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteOrg && deleteOrgMutation.mutate(deleteOrg.id)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {deleteOrgMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function UsersTab() {
  const { data: users = [], isLoading } = useQuery<Omit<User, "password">[]>({
    queryKey: ["/api/admin/users"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Full Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Super Admin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                  <TableCell className="font-medium" data-testid={`text-username-${u.id}`}>
                    {u.username}
                  </TableCell>
                  <TableCell data-testid={`text-fullname-${u.id}`}>{u.fullName}</TableCell>
                  <TableCell data-testid={`text-email-${u.id}`}>{u.email || "—"}</TableCell>
                  <TableCell>
                    {u.isSuperAdmin ? (
                      <Badge
                        className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 no-default-hover-elevate no-default-active-elevate"
                        data-testid={`badge-superadmin-${u.id}`}
                      >
                        Super Admin
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function AdminPage() {
  const { user } = useAuth();

  if (!user?.isSuperAdmin) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Access Denied" />
        <div className="flex-1 flex items-center justify-center">
          <Card>
            <CardContent className="p-8 text-center">
              <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-lg font-semibold mb-2" data-testid="text-access-denied">Access Denied</h2>
              <p className="text-sm text-muted-foreground">
                You do not have permission to access this page. Super admin access is required.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Master Admin"
        description="Manage all organizations and users"
        actions={<Shield className="h-5 w-5 text-muted-foreground" />}
      />
      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="organizations">
          <TabsList>
            <TabsTrigger value="organizations" data-testid="tab-organizations">
              <Building2 className="h-3.5 w-3.5 mr-1.5" />
              Organizations
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Users
            </TabsTrigger>
          </TabsList>
          <TabsContent value="organizations" className="mt-6">
            <OrganizationsTab />
          </TabsContent>
          <TabsContent value="users" className="mt-6">
            <UsersTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
