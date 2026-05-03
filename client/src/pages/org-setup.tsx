import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Building2, UserPlus, Wrench, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const createOrgSchema = z.object({
  name: z.string().trim().min(1, "Business name is required"),
  phone: z.string().optional().default(""),
  email: z.union([z.string().email("Enter a valid email"), z.literal("")]).optional().default(""),
  address: z.string().optional().default(""),
});
type CreateOrgValues = z.infer<typeof createOrgSchema>;

const joinOrgSchema = z.object({
  code: z.string().trim().min(1, "Invite code is required"),
});
type JoinOrgValues = z.infer<typeof joinOrgSchema>;

export default function OrgSetup() {
  const { refreshAuth, user, logout } = useAuth();
  const { toast } = useToast();
  const [error, setError] = useState("");

  const createForm = useForm<CreateOrgValues>({
    resolver: zodResolver(createOrgSchema),
    defaultValues: { name: "", phone: "", email: "", address: "" },
  });
  const joinForm = useForm<JoinOrgValues>({
    resolver: zodResolver(joinOrgSchema),
    defaultValues: { code: "" },
  });

  const handleCreateOrg = async (data: CreateOrgValues) => {
    setError("");
    try {
      await apiRequest("POST", "/api/orgs", {
        name: data.name,
        slug: data.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-"),
        phone: data.phone || "",
        email: data.email || "",
        address: data.address || "",
      });
      toast({ title: "Organization created!" });
      await refreshAuth();
    } catch (err: any) {
      setError(err.message || "Failed to create organization");
    }
  };

  const handleJoinOrg = async (data: JoinOrgValues) => {
    setError("");
    try {
      await apiRequest("POST", "/api/orgs/join", { code: data.code });
      toast({ title: "Joined organization!" });
      await refreshAuth();
    } catch (err: any) {
      setError(err.message || "Invalid invite code");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <Wrench className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">TradeFlow</h1>
            <p className="text-xs text-muted-foreground">Welcome, {user?.fullName || user?.username}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-6 ml-[52px]">
          Set up or join an organization to get started.
        </p>

        <Card>
          <CardHeader>
            <CardTitle>Get Started</CardTitle>
            <CardDescription>
              Create a new business or join an existing one with an invite code.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive" data-testid="org-setup-error">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Tabs defaultValue="create" onValueChange={() => setError("")}>
              <TabsList className="w-full mb-4">
                <TabsTrigger value="create" className="flex-1 gap-1.5" data-testid="tab-create-org">
                  <Building2 className="h-3.5 w-3.5" />
                  Create Business
                </TabsTrigger>
                <TabsTrigger value="join" className="flex-1 gap-1.5" data-testid="tab-join-org">
                  <UserPlus className="h-3.5 w-3.5" />
                  Join with Code
                </TabsTrigger>
              </TabsList>

              <TabsContent value="create">
                <Form {...createForm}>
                  <form onSubmit={createForm.handleSubmit(handleCreateOrg)} className="space-y-4" noValidate>
                    <FormField
                      control={createForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel htmlFor="org-name">Business Name</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              id="org-name"
                              data-testid="input-org-name"
                              placeholder="e.g. Smith Plumbing LLC"
                            />
                          </FormControl>
                          <FormMessage data-testid="error-org-name" />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={createForm.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel htmlFor="org-phone">Phone</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                id="org-phone"
                                data-testid="input-org-phone"
                                placeholder="(555) 123-4567"
                              />
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
                            <FormLabel htmlFor="org-email">Email</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                id="org-email"
                                type="email"
                                data-testid="input-org-email"
                                placeholder="office@company.com"
                              />
                            </FormControl>
                            <FormMessage data-testid="error-org-email" />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={createForm.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel htmlFor="org-address">Address</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              id="org-address"
                              data-testid="input-org-address"
                              placeholder="123 Main St, City, ST 12345"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={createForm.formState.isSubmitting}
                      data-testid="button-create-org"
                    >
                      {createForm.formState.isSubmitting ? "Creating..." : "Create Business"}
                    </Button>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="join">
                <Form {...joinForm}>
                  <form onSubmit={joinForm.handleSubmit(handleJoinOrg)} className="space-y-4" noValidate>
                    <FormField
                      control={joinForm.control}
                      name="code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel htmlFor="invite-code">Invite Code</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              id="invite-code"
                              data-testid="input-invite-code"
                              placeholder="Enter your invite code"
                            />
                          </FormControl>
                          <FormMessage data-testid="error-invite-code" />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={joinForm.formState.isSubmitting}
                      data-testid="button-join-org"
                    >
                      {joinForm.formState.isSubmitting ? "Joining..." : "Join Business"}
                    </Button>
                  </form>
                </Form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="mt-4 text-center">
          <Button variant="ghost" size="sm" onClick={logout} data-testid="button-logout-setup">
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
