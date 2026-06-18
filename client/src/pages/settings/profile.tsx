import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const profileFormSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required"),
  phone: z.string().optional().default(""),
  email: z.union([z.string().email("Enter a valid email"), z.literal("")]).optional().default(""),
});
type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function ProfileTab() {
  const { user, refreshAuth } = useAuth();
  const { toast } = useToast();

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      fullName: user?.fullName || "",
      phone: user?.phone || "",
      email: user?.email || "",
    },
  });

  useEffect(() => {
    profileForm.reset({
      fullName: user?.fullName || "",
      phone: user?.phone || "",
      email: user?.email || "",
    });
  }, [user?.id, user?.fullName, user?.phone, user?.email]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PATCH", "/api/auth/profile", data);
    },
    onSuccess: () => {
      refreshAuth();
      toast({ title: "Profile updated" });
    },
    onError: (err: any) => {
      const message: string = err?.message || "";
      if (message.startsWith("409:")) {
        const detail = message.slice(4).trim() || "That email is already in use by another account";
        profileForm.setError("email", { type: "server", message: detail });
        profileForm.setFocus("email");
        return;
      }
      toast({ title: "Couldn't save profile", description: message || "Please try again.", variant: "destructive" });
    },
  });

  const handleProfileSubmit = (data: ProfileFormValues) => {
    profileForm.clearErrors("email");
    updateProfileMutation.mutate({
      fullName: data.fullName,
      phone: data.phone || "",
      email: data.email || "",
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your Profile</CardTitle>
        <CardDescription>Update your personal information</CardDescription>
      </CardHeader>
      <CardContent>
        {user?.operatorosUserId && (
          <div
            className="mb-4 flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-900 dark:bg-blue-950/40"
            data-testid="banner-operatoros-managed"
          >
            <ShieldCheck className="h-4 w-4 mt-0.5 text-blue-600 dark:text-blue-300 shrink-0" />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-blue-900 dark:text-blue-100">
                  Managed by OperatorOS
                </span>
                <Badge
                  variant="outline"
                  className="border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300 no-default-hover-elevate no-default-active-elevate"
                  data-testid="badge-operatoros-self"
                >
                  SSO
                </Badge>
              </div>
              <p className="text-blue-800/90 dark:text-blue-200/90">
                You sign in through OperatorOS. Your account role (including super-admin
                status) is controlled there and re-applied each time you sign in.
              </p>
            </div>
          </div>
        )}
        <Form {...profileForm}>
          <form onSubmit={profileForm.handleSubmit(handleProfileSubmit)} className="space-y-4" noValidate>
            <FormField
              control={profileForm.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-settings-name" />
                  </FormControl>
                  <FormMessage data-testid="error-settings-name" />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={profileForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-settings-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={profileForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" data-testid="input-settings-email" />
                    </FormControl>
                    <FormMessage data-testid="error-settings-email" />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" disabled={updateProfileMutation.isPending} data-testid="button-save-profile">
              {updateProfileMutation.isPending ? "Saving..." : "Save Profile"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
