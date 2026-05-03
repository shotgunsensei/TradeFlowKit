import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { User, Trash2, Plus, Copy, Check } from "lucide-react";
import type { InviteCode } from "@shared/schema";

interface Member {
  id: string;
  orgId: string;
  userId: string;
  role: string;
  user: {
    id: string;
    username: string;
    fullName: string | null;
    email: string | null;
  } | null;
}

export default function TeamTab() {
  const { user, org } = useAuth();
  const { toast } = useToast();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [newInviteRole, setNewInviteRole] = useState("tech");

  const { data: members = [], isLoading: membersLoading } = useQuery<Member[]>({
    queryKey: ["/api/memberships"],
    enabled: !!org,
  });

  const { data: inviteCodes = [] } = useQuery<InviteCode[]>({
    queryKey: ["/api/invite-codes"],
    enabled: !!org,
  });

  const createInviteMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/invite-codes", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invite-codes"] });
      toast({ title: "Invite code created" });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't create invite", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      await apiRequest("PATCH", `/api/memberships/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memberships"] });
      toast({ title: "Role updated" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update role", variant: "destructive" });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `/api/memberships/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memberships"] });
      toast({ title: "Member removed" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to remove member", variant: "destructive" });
    },
  });

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const myMembership = members.find((m) => m.userId === user?.id);
  const canManageTeam = myMembership?.role === "owner" || myMembership?.role === "admin";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team Members</CardTitle>
          <CardDescription>
            {members.length} member{members.length !== 1 ? "s" : ""} in your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <p className="text-sm text-muted-foreground py-2">Loading members...</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No members found.</p>
          ) : (
            <div className="space-y-2">
              {members.map((m) => {
                const isMe = m.userId === user?.id;
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 rounded-md border p-3"
                    data-testid={`row-member-${m.userId}`}
                  >
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {m.user?.fullName || m.user?.username || "Unknown"}
                        {isMe && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{m.user?.email || m.user?.username}</p>
                    </div>
                    {canManageTeam && !isMe && m.role !== "owner" ? (
                      <Select
                        value={m.role}
                        onValueChange={(role) => changeRoleMutation.mutate({ userId: m.userId, role })}
                      >
                        <SelectTrigger className="w-[100px] h-7 text-xs" data-testid={`select-role-${m.userId}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="tech">Tech</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline" className="text-xs capitalize">{m.role}</Badge>
                    )}
                    {canManageTeam && !isMe && m.role !== "owner" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove team member"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeMemberMutation.mutate(m.userId)}
                        disabled={removeMemberMutation.isPending}
                        data-testid={`button-remove-member-${m.userId}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Invite Codes</CardTitle>
              <CardDescription>Share codes to invite new team members</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={newInviteRole} onValueChange={setNewInviteRole}>
                <SelectTrigger className="w-[120px] h-8 text-sm" data-testid="select-invite-role">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="tech">Tech</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => createInviteMutation.mutate({ role: newInviteRole })}
                disabled={createInviteMutation.isPending}
                data-testid="button-create-invite"
              >
                <Plus className="h-4 w-4 mr-1" />
                Create Code
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {inviteCodes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No invite codes yet. Create one to invite team members.
            </p>
          ) : (
            <div className="space-y-2">
              {inviteCodes.map((ic) => (
                <div
                  key={ic.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <code className="text-sm font-mono font-medium">{ic.code}</code>
                    <p className="text-xs text-muted-foreground mt-0.5 capitalize">Role: {ic.role}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Copy invite code"
                    onClick={() => copyCode(ic.code)}
                    data-testid={`button-copy-code-${ic.id}`}
                  >
                    {copiedCode === ic.code ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
