import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import tradeflowLogo from "@assets/tradeflowlogo_1771743836671.png";
import tradeflowCover from "@assets/tradeflowcover_1771743836670.png";

export default function AuthPage() {
  const { login, register } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    const fd = new FormData(e.currentTarget);
    try {
      await login(fd.get("username") as string, fd.get("password") as string);
      toast({ title: "Welcome back!" });
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    const fd = new FormData(e.currentTarget);
    try {
      await register(
        fd.get("username") as string,
        fd.get("password") as string,
        fd.get("fullName") as string
      );
      toast({ title: "Account created!" });
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-8">
            <img src={tradeflowLogo} alt="TradeFlow" className="h-10 w-10 rounded-lg object-contain" />
            <div>
              <h1 className="text-xl font-bold tracking-tight">TradeFlow</h1>
              <p className="text-xs text-muted-foreground">Service Management Platform</p>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-4">
              <Tabs defaultValue="login" className="w-full">
                <TabsList className="w-full" data-testid="auth-tabs">
                  <TabsTrigger value="login" className="flex-1" data-testid="tab-login">
                    Sign In
                  </TabsTrigger>
                  <TabsTrigger value="register" className="flex-1" data-testid="tab-register">
                    Create Account
                  </TabsTrigger>
                </TabsList>

                {error && (
                  <div className="mt-4 flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                <TabsContent value="login" className="mt-4">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-username">Username</Label>
                      <Input
                        id="login-username"
                        name="username"
                        required
                        data-testid="input-login-username"
                        placeholder="Enter your username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">Password</Label>
                      <Input
                        id="login-password"
                        name="password"
                        type="password"
                        required
                        data-testid="input-login-password"
                        placeholder="Enter your password"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isSubmitting}
                      data-testid="button-login"
                    >
                      {isSubmitting ? "Signing in..." : "Sign In"}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="register" className="mt-4">
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="reg-fullname">Full Name</Label>
                      <Input
                        id="reg-fullname"
                        name="fullName"
                        required
                        data-testid="input-register-fullname"
                        placeholder="John Smith"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-username">Username</Label>
                      <Input
                        id="reg-username"
                        name="username"
                        required
                        data-testid="input-register-username"
                        placeholder="Choose a username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-password">Password</Label>
                      <Input
                        id="reg-password"
                        name="password"
                        type="password"
                        required
                        minLength={6}
                        data-testid="input-register-password"
                        placeholder="Min 6 characters"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isSubmitting}
                      data-testid="button-register"
                    >
                      {isSubmitting ? "Creating account..." : "Create Account"}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardHeader>
          </Card>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Built for electricians, plumbers, carpenters & HVAC pros
          </p>
        </div>
      </div>

      <div className="hidden lg:flex flex-1 relative overflow-hidden">
        <img
          src={tradeflowCover}
          alt="TradeFlow - Service Management Platform"
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>
    </div>
  );
}
