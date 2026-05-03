import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AuthModalProps {
  open: boolean;
  defaultTab?: "login" | "register";
  onClose: () => void;
}

const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});
type LoginValues = z.infer<typeof loginSchema>;

const registerSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required"),
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
type RegisterValues = z.infer<typeof registerSchema>;

export function AuthModal({ open, defaultTab = "login", onClose }: AuthModalProps) {
  const { login, verify2fa, register } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"login" | "register">(defaultTab);
  const [error, setError] = useState("");
  const [twoFAStep, setTwoFAStep] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });
  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", username: "", password: "" },
  });

  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
      setError("");
      loginForm.reset();
      registerForm.reset();
      setTwoFAStep(false);
      setUseRecovery(false);
    }
  }, [open, defaultTab]);

  const handleLogin = async (data: LoginValues) => {
    setError("");
    try {
      await login(data.username, data.password);
      toast({ title: "Welcome back!" });
      onClose();
    } catch (err: any) {
      if (err?.requires2fa) {
        setTwoFAStep(true);
        setError("");
      } else {
        setError(err.message || "Login failed");
      }
    }
  };

  const handle2fa = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    const fd = new FormData(e.currentTarget);
    try {
      if (useRecovery) {
        await verify2fa({ recoveryCode: fd.get("recoveryCode") as string });
      } else {
        await verify2fa({ code: fd.get("code") as string });
      }
      toast({ title: "Welcome back!" });
      onClose();
    } catch (err: any) {
      setError(err.message || "Verification failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (data: RegisterValues) => {
    setError("");
    try {
      await register(data.username, data.password, data.fullName);
      toast({ title: "Account created! Welcome to TradeFlow." });
      onClose();
    } catch (err: any) {
      setError(err.message || "Registration failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {twoFAStep ? "Two-factor verification" : (defaultTab === "register" ? "Start your free account" : "Sign in to TradeFlow")}
          </DialogTitle>
        </DialogHeader>

        {twoFAStep ? (
          <div className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive" data-testid="text-2fa-error">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            <form onSubmit={handle2fa} className="space-y-4">
              {useRecovery ? (
                <div className="space-y-2">
                  <Label htmlFor="recovery-code">Recovery code</Label>
                  <Input
                    id="recovery-code"
                    name="recoveryCode"
                    required
                    autoFocus
                    placeholder="XXXXX-XXXXX"
                    data-testid="input-recovery-code"
                  />
                  <p className="text-xs text-muted-foreground">Enter one of the recovery codes you saved when enabling 2FA.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="totp-code">6-digit code</Label>
                  <Input
                    id="totp-code"
                    name="code"
                    required
                    autoFocus
                    inputMode="numeric"
                    pattern="[0-9 ]*"
                    maxLength={7}
                    placeholder="123 456"
                    data-testid="input-totp-code"
                  />
                  <p className="text-xs text-muted-foreground">Open your authenticator app and enter the current code.</p>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={isSubmitting} data-testid="button-verify-2fa">
                {isSubmitting ? "Verifying..." : "Verify"}
              </Button>
              <button
                type="button"
                onClick={() => { setUseRecovery(!useRecovery); setError(""); }}
                className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
                data-testid="button-toggle-recovery"
              >
                {useRecovery ? "Use authenticator code instead" : "Use a recovery code instead"}
              </button>
            </form>
          </div>
        ) : (
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as "login" | "register"); setError(""); }} className="w-full">
          <TabsList className="w-full" data-testid="auth-tabs">
            <TabsTrigger value="login" className="flex-1" data-testid="tab-login">
              Sign In
            </TabsTrigger>
            <TabsTrigger value="register" className="flex-1" data-testid="tab-register">
              Create Account
            </TabsTrigger>
          </TabsList>

          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive" data-testid="auth-error">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <TabsContent value="login" className="mt-4">
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4" noValidate>
                <FormField
                  control={loginForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="login-username">Username</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          id="login-username"
                          autoComplete="username"
                          data-testid="input-login-username"
                          placeholder="Enter your username"
                        />
                      </FormControl>
                      <FormMessage data-testid="error-login-username" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={loginForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="login-password">Password</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          id="login-password"
                          type="password"
                          autoComplete="current-password"
                          data-testid="input-login-password"
                          placeholder="Enter your password"
                        />
                      </FormControl>
                      <FormMessage data-testid="error-login-password" />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={loginForm.formState.isSubmitting} data-testid="button-login">
                  {loginForm.formState.isSubmitting ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="register" className="mt-4">
            <Form {...registerForm}>
              <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4" noValidate>
                <FormField
                  control={registerForm.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="reg-fullname">Full Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          id="reg-fullname"
                          data-testid="input-register-fullname"
                          placeholder="John Smith"
                        />
                      </FormControl>
                      <FormMessage data-testid="error-register-fullname" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={registerForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="reg-username">Username</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          id="reg-username"
                          autoComplete="username"
                          data-testid="input-register-username"
                          placeholder="Choose a username"
                        />
                      </FormControl>
                      <FormMessage data-testid="error-register-username" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={registerForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="reg-password">Password</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          id="reg-password"
                          type="password"
                          autoComplete="new-password"
                          data-testid="input-register-password"
                          placeholder="Min 6 characters"
                        />
                      </FormControl>
                      <FormMessage data-testid="error-register-password" />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={registerForm.formState.isSubmitting} data-testid="button-register">
                  {registerForm.formState.isSubmitting ? "Creating account..." : "Create Free Account"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  No credit card required · Free forever plan available
                </p>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
