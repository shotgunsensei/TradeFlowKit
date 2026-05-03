import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Lock, ShieldCheck, CheckCircle2 } from "lucide-react";

interface TotpStatus {
  enabled: boolean;
  enabledAt: string | null;
  pendingSetup: boolean;
  recoveryCodesRemaining: number;
}

function TwoFactorCard() {
  const { toast } = useToast();
  const { data: status, refetch } = useQuery<TotpStatus>({ queryKey: ["/api/auth/2fa/status"] });
  const [setupData, setSetupData] = useState<{ secret: string; otpauthUrl: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [showDisable, setShowDisable] = useState(false);

  const startSetup = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/2fa/setup");
      return res.json();
    },
    onSuccess: (data) => {
      setSetupData(data);
      setRecoveryCodes(null);
      refetch();
    },
    onError: (err: any) => toast({ title: "Setup failed", description: err.message, variant: "destructive" }),
  });

  const verifySetup = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/2fa/verify", { code });
      return res.json();
    },
    onSuccess: (data) => {
      setRecoveryCodes(data.recoveryCodes);
      setSetupData(null);
      setCode("");
      toast({ title: "Two-factor authentication enabled" });
      refetch();
    },
    onError: (err: any) => toast({ title: "Verification failed", description: err.message, variant: "destructive" }),
  });

  const disable = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/2fa/disable", { password: disablePassword });
      return res.json();
    },
    onSuccess: () => {
      setDisablePassword("");
      setShowDisable(false);
      setRecoveryCodes(null);
      toast({ title: "Two-factor authentication disabled" });
      refetch();
    },
    onError: (err: any) => toast({ title: "Could not disable", description: err.message, variant: "destructive" }),
  });

  const regenerate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/2fa/regenerate-codes");
      return res.json();
    },
    onSuccess: (data) => {
      setRecoveryCodes(data.recoveryCodes);
      toast({ title: "New recovery codes generated" });
      refetch();
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Card data-testid="card-2fa">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Two-factor authentication
        </CardTitle>
        <CardDescription>
          Add an extra layer of security with a code from your authenticator app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.enabled ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <p className="text-sm text-emerald-800 dark:text-emerald-300" data-testid="text-2fa-enabled">
                Enabled · {status.recoveryCodesRemaining} recovery code{status.recoveryCodesRemaining === 1 ? "" : "s"} remaining
              </p>
            </div>
            {recoveryCodes && (
              <div className="rounded-md border bg-amber-50 dark:bg-amber-950/20 border-amber-200 p-3 space-y-2">
                <p className="text-sm font-medium">Save these recovery codes somewhere safe:</p>
                <div className="grid grid-cols-2 gap-1 font-mono text-xs" data-testid="recovery-codes-list">
                  {recoveryCodes.map((c, i) => (
                    <div key={i} className="rounded bg-background px-2 py-1" data-testid={`recovery-code-${i}`}>{c}</div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Each code works once. They will not be shown again.</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => regenerate.mutate()}
                disabled={regenerate.isPending}
                data-testid="button-regenerate-codes"
              >
                {regenerate.isPending ? "Generating..." : "Regenerate recovery codes"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => setShowDisable(!showDisable)}
                data-testid="button-show-disable-2fa"
              >
                Disable 2FA
              </Button>
            </div>
            {showDisable && (
              <div className="rounded-md border p-3 space-y-2">
                <Label className="text-xs">Confirm your password to disable 2FA</Label>
                <Input
                  type="password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  data-testid="input-disable-2fa-password"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => disable.mutate()}
                  disabled={disable.isPending || !disablePassword}
                  data-testid="button-disable-2fa"
                >
                  {disable.isPending ? "Disabling..." : "Confirm disable"}
                </Button>
              </div>
            )}
          </div>
        ) : setupData ? (
          <div className="space-y-4" data-testid="2fa-setup-panel">
            <p className="text-sm">
              Scan this QR code with Google Authenticator, 1Password, Authy, or any TOTP app:
            </p>
            <div className="flex justify-center">
              <img src={setupData.qrDataUrl} alt="2FA QR code" className="h-44 w-44 rounded border bg-white p-2" data-testid="img-2fa-qr" />
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Or enter this key manually:</p>
              <code className="rounded bg-muted px-2 py-1 text-xs font-mono break-all" data-testid="text-2fa-secret">{setupData.secret}</code>
            </div>
            <div className="space-y-2">
              <Label>Enter the 6-digit code from your app</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                data-testid="input-2fa-verify-code"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => verifySetup.mutate()}
                disabled={verifySetup.isPending || code.length < 6}
                data-testid="button-verify-2fa-setup"
              >
                {verifySetup.isPending ? "Verifying..." : "Enable 2FA"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setSetupData(null); setCode(""); }}
                data-testid="button-cancel-2fa-setup"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : recoveryCodes ? (
          <div className="rounded-md border bg-amber-50 dark:bg-amber-950/20 border-amber-200 p-3 space-y-2">
            <p className="text-sm font-medium">Save these recovery codes — they won't be shown again:</p>
            <div className="grid grid-cols-2 gap-1 font-mono text-xs">
              {recoveryCodes.map((c, i) => (
                <div key={i} className="rounded bg-background px-2 py-1" data-testid={`recovery-code-${i}`}>{c}</div>
              ))}
            </div>
            <Button type="button" size="sm" onClick={() => setRecoveryCodes(null)}>Done</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You'll need an authenticator app like Google Authenticator, 1Password, or Authy.
            </p>
            <Button
              type="button"
              onClick={() => startSetup.mutate()}
              disabled={startSetup.isPending}
              data-testid="button-start-2fa-setup"
            >
              <ShieldCheck className="h-4 w-4 mr-2" />
              {startSetup.isPending ? "Setting up..." : "Set up two-factor authentication"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SecurityTab() {
  const { toast } = useToast();
  const [passwordErrors, setPasswordErrors] = useState<{ newPassword?: string; confirmPassword?: string }>({});

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

  const handlePasswordSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const currentPassword = fd.get("currentPassword") as string;
    const newPassword = fd.get("newPassword") as string;
    const confirmPassword = fd.get("confirmPassword") as string;
    const errors: { newPassword?: string; confirmPassword?: string } = {};
    if (newPassword.length < 6) {
      errors.newPassword = "Password must be at least 6 characters";
    }
    if (newPassword !== confirmPassword) {
      errors.confirmPassword = "Passwords don't match";
    }
    setPasswordErrors(errors);
    if (Object.keys(errors).length > 0) return;
    changePasswordMutation.mutate({ currentPassword, newPassword });
    form.reset();
  };

  return (
    <>
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
                aria-invalid={!!passwordErrors.newPassword}
                onChange={() => passwordErrors.newPassword && setPasswordErrors((p) => ({ ...p, newPassword: undefined }))}
                data-testid="input-new-password"
              />
              {passwordErrors.newPassword && (
                <p className="text-xs font-medium text-destructive" data-testid="error-new-password">
                  {passwordErrors.newPassword}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <Input
                name="confirmPassword"
                type="password"
                required
                aria-invalid={!!passwordErrors.confirmPassword}
                onChange={() => passwordErrors.confirmPassword && setPasswordErrors((p) => ({ ...p, confirmPassword: undefined }))}
                data-testid="input-confirm-password"
              />
              {passwordErrors.confirmPassword && (
                <p className="text-xs font-medium text-destructive" data-testid="error-confirm-password">
                  {passwordErrors.confirmPassword}
                </p>
              )}
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

      <TwoFactorCard />
    </>
  );
}
