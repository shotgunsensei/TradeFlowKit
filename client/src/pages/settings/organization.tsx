import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Building2, Link2 } from "lucide-react";

const orgFormSchema = z.object({
  name: z.string().trim().min(1, "Business name is required"),
  phone: z.string().optional().default(""),
  email: z.union([z.string().email("Enter a valid email"), z.literal("")]).optional().default(""),
  address: z.string().optional().default(""),
  website: z.union([z.string().url("Enter a valid URL (include https://)"), z.literal("")]).optional().default(""),
  businessHours: z.string().optional().default(""),
});
type OrgFormValues = z.infer<typeof orgFormSchema>;

export default function OrganizationTab() {
  const { org, user, membership, refreshAuth } = useAuth();
  const { toast } = useToast();
  const [logoUrl, setLogoUrl] = useState<string>(org?.logoUrl ?? "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [operatorosOrgIdInput, setOperatorosOrgIdInput] = useState<string>(
    org?.operatorosOrganizationId ?? ""
  );

  useEffect(() => {
    setOperatorosOrgIdInput(org?.operatorosOrganizationId ?? "");
  }, [org?.id, org?.operatorosOrganizationId]);

  const canManageOperatorosLink = membership?.role === "owner" || !!user?.isSuperAdmin;

  const updateOperatorosLinkMutation = useMutation({
    mutationFn: async (value: string | null) => {
      await apiRequest("PATCH", `/api/orgs/${org?.id}/operatoros-link`, {
        operatorosOrganizationId: value,
      });
    },
    onSuccess: (_data, variables) => {
      refreshAuth();
      toast({
        title: variables === null ? "OperatorOS link removed" : "OperatorOS organization linked",
        description:
          variables === null
            ? "Future SSO launches from that tenant will provision a new org."
            : "Teammates launching from this OperatorOS tenant will join this org.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't update link",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const orgForm = useForm<OrgFormValues>({
    resolver: zodResolver(orgFormSchema),
    defaultValues: {
      name: org?.name || "",
      phone: org?.phone || "",
      email: org?.email || "",
      address: org?.address || "",
      website: org?.website || "",
      businessHours: org?.businessHours || "",
    },
  });

  useEffect(() => {
    orgForm.reset({
      name: org?.name || "",
      phone: org?.phone || "",
      email: org?.email || "",
      address: org?.address || "",
      website: org?.website || "",
      businessHours: org?.businessHours || "",
    });
  }, [org?.id, org?.name, org?.phone, org?.email, org?.address, org?.website, org?.businessHours]);

  useEffect(() => {
    setLogoUrl(org?.logoUrl ?? "");
  }, [org?.logoUrl]);

  const updateOrgMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PATCH", `/api/orgs/${org?.id}`, data);
    },
    onSuccess: () => {
      refreshAuth();
      toast({ title: "Organization updated" });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't save organization", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  const handleLogoFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Logo must be under 5MB", variant: "destructive" });
      return;
    }
    setUploadingLogo(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });
      const resized = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 400;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("Canvas not supported"));
          ctx.drawImage(img, 0, 0, width, height);
          const isPng = file.type === "image/png" || file.type === "image/svg+xml";
          resolve(canvas.toDataURL(isPng ? "image/png" : "image/jpeg", 0.9));
        };
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = dataUrl;
      });
      setLogoUrl(resized);
      toast({ title: "Logo ready", description: "Click Save Changes to apply" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to process image", variant: "destructive" });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleOrgSubmit = (data: OrgFormValues) => {
    updateOrgMutation.mutate({
      name: data.name,
      phone: data.phone || "",
      email: data.email || "",
      address: data.address || "",
      website: data.website || "",
      logoUrl: logoUrl || "",
      businessHours: data.businessHours || "",
    });
  };

  if (!org) return null;

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{org.name}</CardTitle>
        <CardDescription>Manage your business details</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...orgForm}>
          <form onSubmit={orgForm.handleSubmit(handleOrgSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label>Business Logo</Label>
              <div className="flex items-start gap-4">
                <div className="h-20 w-20 rounded-lg border bg-white flex items-center justify-center overflow-hidden shrink-0">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Business logo"
                      className="h-full w-full object-contain"
                      data-testid="img-settings-logo-preview"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <Building2 className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadingLogo}
                      onClick={() => document.getElementById("settings-logo-file-input")?.click()}
                      data-testid="button-upload-logo"
                    >
                      {uploadingLogo ? "Processing..." : logoUrl ? "Change Logo" : "Upload Logo"}
                    </Button>
                    {logoUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setLogoUrl("")}
                        data-testid="button-remove-logo"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <input
                    id="settings-logo-file-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    data-testid="input-settings-logo-file"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLogoFile(file);
                      e.target.value = "";
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    PNG or JPG, up to 5MB. Shown on quotes, invoices, and your customer-facing quote pages.
                  </p>
                </div>
              </div>
            </div>
            <FormField
              control={orgForm.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Business Name</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-settings-org-name" />
                  </FormControl>
                  <FormMessage data-testid="error-settings-org-name" />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={orgForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={orgForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" />
                    </FormControl>
                    <FormMessage data-testid="error-settings-org-email" />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={orgForm.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={orgForm.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="https://example.com"
                        data-testid="input-settings-website"
                      />
                    </FormControl>
                    <FormMessage data-testid="error-settings-website" />
                  </FormItem>
                )}
              />
              <FormField
                control={orgForm.control}
                name="businessHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Hours</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Mon–Fri 8am–5pm"
                        data-testid="input-settings-business-hours"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" disabled={updateOrgMutation.isPending} data-testid="button-save-org">
              {updateOrgMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
    <Card className="mt-4" data-testid="card-operatoros-link">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          OperatorOS Link
        </CardTitle>
        <CardDescription>
          Connect this TradeFlowKit org to an OperatorOS organization. Once linked,
          teammates launching from that OperatorOS tenant via SSO will automatically
          join this org instead of getting a new one.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="input-operatoros-org-id">OperatorOS Organization ID</Label>
          <Input
            id="input-operatoros-org-id"
            value={operatorosOrgIdInput}
            onChange={(e) => setOperatorosOrgIdInput(e.target.value)}
            placeholder="e.g. org_abc123"
            disabled={!canManageOperatorosLink || updateOperatorosLinkMutation.isPending}
            data-testid="input-operatoros-org-id"
          />
          <p className="text-xs text-muted-foreground">
            {org?.operatorosOrganizationId ? (
              <>
                Currently linked to{" "}
                <span className="font-mono" data-testid="text-current-operatoros-link">
                  {org.operatorosOrganizationId}
                </span>
                .
              </>
            ) : (
              "Not linked to any OperatorOS organization yet."
            )}
          </p>
          {!canManageOperatorosLink && (
            <p className="text-xs text-muted-foreground">
              Only the organization owner can change this.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={
              !canManageOperatorosLink ||
              updateOperatorosLinkMutation.isPending ||
              operatorosOrgIdInput.trim() === (org?.operatorosOrganizationId ?? "")
            }
            onClick={() =>
              updateOperatorosLinkMutation.mutate(
                operatorosOrgIdInput.trim() === "" ? null : operatorosOrgIdInput.trim()
              )
            }
            data-testid="button-save-operatoros-link"
          >
            {updateOperatorosLinkMutation.isPending ? "Saving..." : "Save Link"}
          </Button>
          {org?.operatorosOrganizationId && (
            <Button
              type="button"
              variant="outline"
              disabled={!canManageOperatorosLink || updateOperatorosLinkMutation.isPending}
              onClick={() => updateOperatorosLinkMutation.mutate(null)}
              data-testid="button-remove-operatoros-link"
            >
              Remove Link
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
    </>
  );
}
