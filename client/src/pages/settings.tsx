import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Building2,
  User,
  Key,
  Copy,
  Check,
  Plus,
  Lock,
  CreditCard,
  Users,
  Trash2,
  ExternalLink,
  Shield,
  Zap,
  CheckCircle2,
  XCircle,
  Star,
} from "lucide-react";
import { PLAN_LABELS, PLAN_LIMITS } from "@shared/schema";
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

interface PlanInfo {
  plan: string;
  limits: { customers: number; jobs: number; quotes: number; invoices: number; teamMembers: number; canInvite: boolean };
  counts: { customers: number; jobs: number; quotes: number; invoices: number; members: number };
  subscriptionStatus: string | null;
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = limit === -1;
  const pct = unlimited ? 0 : Math.min((used / limit) * 100, 100);
  const warn = !unlimited && pct >= 80;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-medium ${warn ? "text-orange-600" : ""}`}>
          {used}{unlimited ? "" : ` / ${limit}`}
          {unlimited && <span className="text-xs text-muted-foreground ml-1">(unlimited)</span>}
        </span>
      </div>
      {!unlimited && (
        <Progress value={pct} className={warn ? "[&>div]:bg-orange-500" : ""} />
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { user, org, refreshAuth } = useAuth();
  const { toast } = useToast();
  const search = useSearch();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [newInviteRole, setNewInviteRole] = useState("tech");
  const [portalLoading, setPortalLoading] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [reviewEnabled, setReviewEnabled] = useState<boolean>(org?.reviewRequestEnabled ?? false);
  const [reviewUrl, setReviewUrl] = useState<string>(org?.reviewRequestUrl ?? "");
  const [reviewTemplate, setReviewTemplate] = useState<string>(
    org?.reviewRequestTemplate ?? "Hi {customer}, thanks for choosing {business}! We'd love your feedback. Please leave us a review: {google_link}"
  );

  const searchParams = new URLSearchParams(search);
  const defaultTab = searchParams.get("tab") || "profile";
  const justConnected = searchParams.get("connected") === "true";
  const connectError = searchParams.get("error");

  useEffect(() => {
    if (justConnected) {
      toast({ title: "Stripe account connected!", description: "You can now accept card payments on invoices." });
      refreshAuth();
    }
    if (connectError) {
      toast({ title: "Connection failed", description: decodeURIComponent(connectError), variant: "destructive" });
    }
  }, []);

  const { data: inviteCodes = [] } = useQuery<InviteCode[]>({
    queryKey: ["/api/invite-codes"],
    enabled: !!org,
  });

  const { data: members = [], isLoading: membersLoading } = useQuery<Member[]>({
    queryKey: ["/api/memberships"],
    enabled: !!org,
  });

  const { data: planInfo } = useQuery<PlanInfo>({
    queryKey: ["/api/plan-info"],
    enabled: !!org,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PATCH", "/api/auth/profile", data);
    },
    onSuccess: () => {
      refreshAuth();
      toast({ title: "Profile updated" });
    },
  });

  const updateOrgMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PATCH", `/api/orgs/${org?.id}`, data);
    },
    onSuccess: () => {
      refreshAuth();
      toast({ title: "Organization updated" });
    },
  });

  const saveAutomationsMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PATCH", `/api/orgs/${org?.id}`, data);
    },
    onSuccess: () => {
      refreshAuth();
      toast({ title: "Automation settings saved" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save", variant: "destructive" });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      await apiRequest("POST", "/api/auth/change-password", data);
    },
    onSuccess: () => {
      toast({ title: "Password changed successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to change password", variant: "destructive" });
    },
  });

  const createInviteMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/invite-codes", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invite-codes"] });
      toast({ title: "Invite code created" });
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

  const handleProfileSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    updateProfileMutation.mutate({
      fullName: fd.get("fullName"),
      phone: fd.get("phone") || "",
      email: fd.get("email") || "",
    });
  };

  const handleOrgSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    updateOrgMutation.mutate({
      name: fd.get("name"),
      phone: fd.get("phone") || "",
      email: fd.get("email") || "",
      address: fd.get("address") || "",
      website: fd.get("website") || "",
      logoUrl: fd.get("logoUrl") || "",
      businessHours: fd.get("businessHours") || "",
    });
  };

  const handlePasswordSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const currentPassword = fd.get("currentPassword") as string;
    const newPassword = fd.get("newPassword") as string;
    const confirmPassword = fd.get("confirmPassword") as string;
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    changePasswordMutation.mutate({ currentPassword, newPassword });
    (e.currentTarget as HTMLFormElement).reset();
  };

  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const res = await apiRequest("POST", "/api/stripe/create-portal");
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to open billing portal", variant: "destructive" });
    } finally {
      setPortalLoading(false);
    }
  };

  const handleConnectStripe = async () => {
    setConnectLoading(true);
    try {
      const res = await apiRequest("GET", "/api/stripe/connect/authorize");
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else toast({ title: "Error", description: data.error || "Failed to start connection", variant: "destructive" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to start Stripe connection", variant: "destructive" });
    } finally {
      setConnectLoading(false);
    }
  };

  const disconnectStripeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/stripe/connect");
    },
    onSuccess: () => {
      refreshAuth();
      toast({ title: "Stripe account disconnected" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to disconnect", variant: "destructive" });
    },
  });

  const myMembership = members.find((m) => m.userId === user?.id);
  const canManageTeam = myMembership?.role === "owner" || myMembership?.role === "admin";

  const plan = planInfo?.plan || org?.plan || "free";
  const limits = planInfo?.limits || PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const counts = planInfo?.counts || { customers: 0, jobs: 0, quotes: 0, invoices: 0, members: 0 };

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Settings" description="Manage your profile and organization" />

      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue={defaultTab} className="max-w-2xl">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="profile" data-testid="tab-profile">
              <User className="h-3.5 w-3.5 mr-1.5" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="org" data-testid="tab-org">
              <Building2 className="h-3.5 w-3.5 mr-1.5" />
              Organization
            </TabsTrigger>
            <TabsTrigger value="team" data-testid="tab-team">
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Team
            </TabsTrigger>
            <TabsTrigger value="automations" data-testid="tab-automations">
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              Automations
            </TabsTrigger>
            <TabsTrigger value="billing" data-testid="tab-billing">
              <CreditCard className="h-3.5 w-3.5 mr-1.5" />
              Billing
            </TabsTrigger>
            <TabsTrigger value="payments" data-testid="tab-payments">
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              Payments
            </TabsTrigger>
            <TabsTrigger value="security" data-testid="tab-security">
              <Shield className="h-3.5 w-3.5 mr-1.5" />
              Security
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Your Profile</CardTitle>
                <CardDescription>Update your personal information</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input name="fullName" defaultValue={user?.fullName || ""} data-testid="input-settings-name" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input name="phone" defaultValue={user?.phone || ""} data-testid="input-settings-phone" />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input name="email" type="email" defaultValue={user?.email || ""} data-testid="input-settings-email" />
                    </div>
                  </div>
                  <Button type="submit" disabled={updateProfileMutation.isPending} data-testid="button-save-profile">
                    {updateProfileMutation.isPending ? "Saving..." : "Save Profile"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="org" className="mt-6">
            {org && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{org.name}</CardTitle>
                  <CardDescription>Manage your business details</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleOrgSubmit} className="space-y-4">
                    <div className="flex items-center gap-4">
                      {org.logoUrl && (
                        <img
                          src={org.logoUrl}
                          alt="Business logo"
                          className="h-14 w-14 rounded-lg object-contain border bg-white"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                      <div className="flex-1 space-y-2">
                        <Label>Logo URL</Label>
                        <Input
                          name="logoUrl"
                          defaultValue={org.logoUrl || ""}
                          placeholder="https://example.com/logo.png"
                          data-testid="input-settings-logo-url"
                        />
                        <p className="text-xs text-muted-foreground">Paste a link to your business logo image</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Business Name</Label>
                      <Input name="name" defaultValue={org.name} data-testid="input-settings-org-name" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Phone</Label>
                        <Input name="phone" defaultValue={org.phone || ""} />
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input name="email" type="email" defaultValue={org.email || ""} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Address</Label>
                      <Input name="address" defaultValue={org.address || ""} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Website</Label>
                        <Input
                          name="website"
                          defaultValue={org.website || ""}
                          placeholder="https://example.com"
                          data-testid="input-settings-website"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Business Hours</Label>
                        <Input
                          name="businessHours"
                          defaultValue={org.businessHours || ""}
                          placeholder="Mon–Fri 8am–5pm"
                          data-testid="input-settings-business-hours"
                        />
                      </div>
                    </div>
                    <Button type="submit" disabled={updateOrgMutation.isPending} data-testid="button-save-org">
                      {updateOrgMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="team" className="mt-6 space-y-6">
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
          </TabsContent>

          <TabsContent value="automations" className="mt-6 space-y-6">
            {(plan === "free") ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center gap-3 py-4">
                    <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                      <Zap className="h-6 w-6 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-medium">Upgrade to unlock Automations</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Automations are available on the Individual plan and above.
                      </p>
                    </div>
                    <a href="/subscription">
                      <Button size="sm" data-testid="button-upgrade-automations">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Upgrade Plan
                      </Button>
                    </a>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-amber-500" />
                    <CardTitle className="text-base">Review Request</CardTitle>
                  </div>
                  <CardDescription>
                    Automatically send an SMS asking customers to leave a review when a job is marked as Done or Paid.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Enable Review Requests</p>
                      <p className="text-xs text-muted-foreground">Send SMS automatically on job completion</p>
                    </div>
                    <Switch
                      checked={reviewEnabled}
                      onCheckedChange={setReviewEnabled}
                      data-testid="switch-review-enabled"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Review Link URL</Label>
                    <Input
                      value={reviewUrl}
                      onChange={(e) => setReviewUrl(e.target.value)}
                      placeholder="https://g.page/r/your-business-review"
                      data-testid="input-review-url"
                    />
                    <p className="text-xs text-muted-foreground">
                      Your Google review link, Yelp page, or any review URL
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>SMS Template</Label>
                    <Textarea
                      value={reviewTemplate}
                      onChange={(e) => setReviewTemplate(e.target.value)}
                      rows={4}
                      data-testid="textarea-review-template"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use <code className="bg-muted px-1 rounded text-xs">{"{customer}"}</code>,{" "}
                      <code className="bg-muted px-1 rounded text-xs">{"{business}"}</code>,{" "}
                      <code className="bg-muted px-1 rounded text-xs">{"{google_link}"}</code> as placeholders.
                    </p>
                  </div>

                  {reviewUrl && (
                    <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">SMS Preview</p>
                      <p className="text-sm">
                        {reviewTemplate
                          .replace("{customer}", "John Smith")
                          .replace("{business}", org?.name || "Your Business")
                          .replace("{google_link}", reviewUrl)}
                      </p>
                    </div>
                  )}

                  <Button
                    onClick={() => saveAutomationsMutation.mutate({
                      reviewRequestEnabled: reviewEnabled,
                      reviewRequestUrl: reviewUrl,
                      reviewRequestTemplate: reviewTemplate,
                    })}
                    disabled={saveAutomationsMutation.isPending}
                    data-testid="button-save-automations"
                  >
                    {saveAutomationsMutation.isPending ? "Saving..." : "Save Automation Settings"}
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="billing" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Current Plan</CardTitle>
                    <CardDescription>Your TradeFlow subscription</CardDescription>
                  </div>
                  <Badge variant="outline" className="text-sm font-medium capitalize">
                    {PLAN_LABELS[plan] || plan}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <UsageBar label="Customers" used={counts.customers} limit={limits.customers} />
                  <UsageBar label="Jobs" used={counts.jobs} limit={limits.jobs} />
                  <UsageBar label="Quotes" used={counts.quotes} limit={limits.quotes} />
                  <UsageBar label="Invoices" used={counts.invoices} limit={limits.invoices} />
                  <UsageBar label="Team Members" used={counts.members} limit={limits.teamMembers} />
                </div>
                {plan === "free" && (
                  <div className="pt-2">
                    <a href="/subscription">
                      <Button variant="outline" size="sm" data-testid="button-upgrade-plan">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Upgrade Plan
                      </Button>
                    </a>
                  </div>
                )}
                {org?.stripeSubscriptionId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleManageBilling}
                    disabled={portalLoading}
                    data-testid="button-manage-billing"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    {portalLoading ? "Opening..." : "Manage Billing"}
                  </Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments" className="mt-6 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Accept Online Payments</CardTitle>
                <CardDescription>
                  Connect your Stripe account to collect card payments from customers directly on invoices.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {plan === "free" ? (
                  <div className="rounded-lg border border-dashed p-5 text-center space-y-3">
                    <div className="flex justify-center">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                        <Lock className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </div>
                    <div>
                      <p className="font-medium text-sm">Upgrade to enable online payments</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Online invoice payments are available on Individual plan and above.
                      </p>
                    </div>
                    <a href="/subscription">
                      <Button size="sm" data-testid="button-upgrade-for-payments">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Upgrade Plan
                      </Button>
                    </a>
                  </div>
                ) : (
                  <>
                    {org?.stripeConnectOnboarded && org?.stripeConnectAccountId ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-3 rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 p-4">
                          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                          <div className="flex-1">
                            <p className="font-medium text-sm text-emerald-800 dark:text-emerald-300" data-testid="text-stripe-connected">Connected</p>
                            <p className="text-xs text-emerald-700/70 dark:text-emerald-400/70 font-mono">{org.stripeConnectAccountId}</p>
                          </div>
                          <Badge className="bg-emerald-600 text-white text-xs">Active</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Your Stripe account is connected. Customers will see a "Pay Online" button on their invoices.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => {
                            if (confirm("Disconnect your Stripe account? Customers will no longer be able to pay invoices online.")) {
                              disconnectStripeMutation.mutate();
                            }
                          }}
                          disabled={disconnectStripeMutation.isPending}
                          data-testid="button-disconnect-stripe"
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1.5" />
                          {disconnectStripeMutation.isPending ? "Disconnecting..." : "Disconnect Stripe"}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        <div className="space-y-3">
                          <p className="text-sm font-medium">How to set up:</p>
                          <ol className="space-y-2.5">
                            <li className="flex gap-3 text-sm">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold mt-0.5">1</span>
                              <div>
                                <span className="font-medium">Create a free Stripe account</span>
                                <span className="text-muted-foreground"> (if you don't have one)</span>
                                <div className="mt-0.5">
                                  <a
                                    href="https://stripe.com/register"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                                    data-testid="link-stripe-register"
                                  >
                                    Open stripe.com/register <ExternalLink className="h-3 w-3" />
                                  </a>
                                </div>
                              </div>
                            </li>
                            <li className="flex gap-3 text-sm">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold mt-0.5">2</span>
                              <div>
                                <span className="font-medium">Connect your account to TradeFlow</span>
                                <p className="text-muted-foreground text-xs mt-0.5">Click below to authorize via Stripe's secure OAuth flow</p>
                              </div>
                            </li>
                            <li className="flex gap-3 text-sm">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold mt-0.5">3</span>
                              <span>
                                <span className="font-medium">Complete Stripe's quick onboarding</span>
                                <span className="text-muted-foreground"> (~5 minutes, requires bank details)</span>
                              </span>
                            </li>
                            <li className="flex gap-3 text-sm">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold mt-0.5">4</span>
                              <span className="font-medium">Done — your invoices will show a Pay Online button</span>
                            </li>
                          </ol>
                        </div>
                        <Button
                          onClick={handleConnectStripe}
                          disabled={connectLoading}
                          data-testid="button-connect-stripe"
                        >
                          <Zap className="h-4 w-4 mr-1.5" />
                          {connectLoading ? "Redirecting to Stripe..." : "Connect Stripe Account"}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Change Password</CardTitle>
                <CardDescription>Update your account password</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Current Password</Label>
                    <Input
                      name="currentPassword"
                      type="password"
                      required
                      data-testid="input-current-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>New Password</Label>
                    <Input
                      name="newPassword"
                      type="password"
                      required
                      minLength={6}
                      data-testid="input-new-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Confirm New Password</Label>
                    <Input
                      name="confirmPassword"
                      type="password"
                      required
                      data-testid="input-confirm-password"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={changePasswordMutation.isPending}
                    data-testid="button-change-password"
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
