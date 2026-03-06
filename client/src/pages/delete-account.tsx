import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function DeleteAccountPage() {
  const { user } = useAuth();
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState("");

  if (deleted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle data-testid="text-deleted-title">Account Deleted</CardTitle>
            <CardDescription>Your account and all associated data have been permanently removed.</CardDescription>
          </CardHeader>
          <CardContent>
            <a href="/" className="text-primary hover:underline" data-testid="link-back-home">Go to homepage</a>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-xl mx-auto px-6 py-12">
          <h1 className="text-3xl font-bold mb-4" data-testid="text-delete-title">Delete Your Account</h1>
          <Card>
            <CardHeader>
              <CardTitle>Account Deletion</CardTitle>
              <CardDescription>To delete your TradeFlow account and all associated data, you need to log in first.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                When you delete your account, the following will be permanently removed:
              </p>
              <ul className="list-disc pl-6 text-sm space-y-1 text-muted-foreground">
                <li>Your user profile and login credentials</li>
                <li>All organizations where you are the sole member (including all their data)</li>
                <li>Your membership from shared organizations</li>
                <li>All customers, jobs, quotes, and invoices in your sole-member organizations</li>
              </ul>
              <div className="pt-4">
                <a href="/" data-testid="link-login">
                  <Button>Log in to delete your account</Button>
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const handleDelete = async () => {
    if (confirmText !== "DELETE") return;
    setIsDeleting(true);
    setError("");
    try {
      await apiRequest("DELETE", "/api/auth/delete-account");
      setDeleted(true);
    } catch (err: any) {
      setError(err.message || "Failed to delete account");
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-6" data-testid="text-delete-title">Delete Your Account</h1>
        <Card className="border-destructive/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <CardTitle className="text-destructive">Danger Zone</CardTitle>
                <CardDescription>This action cannot be undone.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              Deleting your account will permanently remove:
            </p>
            <ul className="list-disc pl-6 text-sm space-y-1 text-muted-foreground">
              <li>Your user profile and login credentials</li>
              <li>All organizations where you are the sole member</li>
              <li>All customers, jobs, quotes, and invoices in those organizations</li>
              <li>Your membership from any shared organizations</li>
            </ul>
            <div className="pt-4 space-y-3">
              <p className="text-sm font-medium">
                Type <span className="font-mono bg-muted px-1.5 py-0.5 rounded">DELETE</span> to confirm:
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                data-testid="input-confirm-delete"
              />
              {error && <p className="text-sm text-destructive" data-testid="text-error">{error}</p>}
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={confirmText !== "DELETE" || isDeleting}
                className="w-full"
                data-testid="button-delete-account"
              >
                {isDeleting ? "Deleting..." : "Permanently Delete My Account"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
