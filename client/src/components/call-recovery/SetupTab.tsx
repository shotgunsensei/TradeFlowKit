import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, Loader2, ExternalLink } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CRSubscription } from "./types";

export function SetupTab({
  subscription,
  onRefresh,
}: {
  subscription: CRSubscription;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [phone, setPhone] = useState(subscription.phone || "");

  const configureMutation = useMutation({
    mutationFn: (phoneNumber: string) =>
      apiRequest("POST", "/api/call-recovery/configure", { phone: phoneNumber }),
    onSuccess: () => {
      toast({ title: "Phone number saved", description: "Your Twilio forwarding number has been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/call-recovery/subscription"] });
      onRefresh();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save phone number", variant: "destructive" });
    },
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card data-testid="card-cr-setup">
        <CardHeader>
          <CardTitle className="text-base">Twilio Phone Number</CardTitle>
          <CardDescription>
            This is the number your customers text when the AI contacts them after a missed call.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="twilio-phone" data-testid="label-twilio-phone">
              Your Twilio Number
            </Label>
            <div className="flex gap-2">
              <Input
                id="twilio-phone"
                placeholder="+15551234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                data-testid="input-twilio-phone"
              />
              <Button
                onClick={() => configureMutation.mutate(phone)}
                disabled={!phone || configureMutation.isPending}
                data-testid="button-save-phone"
              >
                {configureMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : "Save"}
              </Button>
            </div>
          </div>
          {subscription.phone && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
              Active number: <span className="font-medium text-foreground">{subscription.phone}</span>
            </p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-cr-instructions">
        <CardHeader>
          <CardTitle className="text-base">Setup Instructions</CardTitle>
          <CardDescription>How to forward missed calls to the AI</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="space-y-3 text-sm">
            {[
              { step: "1", text: "Get a Twilio phone number from twilio.com — choose a local number for your area." },
              { step: "2", text: "In Twilio Console, complete the A2P 10DLC registration for your brand and messaging campaign. Use the SMS Consent Policy link below as your opt-in documentation URL." },
              { step: "3", text: "Configure the Twilio number's Voice webhook (for missed calls) and Messaging webhook (for SMS replies) to the URLs shown below." },
              { step: "4", text: "Enter that Twilio number above and save it." },
              { step: "5", text: "On your mobile carrier or phone system, set up call forwarding for unanswered calls to your Twilio number." },
              { step: "6", text: "Test by calling your business number and letting it go unanswered. The caller should receive an AI SMS within seconds." },
            ].map((item) => (
              <li key={item.step} className="flex gap-3">
                <span className="flex-shrink-0 flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                  {item.step}
                </span>
                <span className="text-muted-foreground">{item.text}</span>
              </li>
            ))}
          </ol>

          <div className="p-3 rounded-lg bg-muted/40 text-xs space-y-1.5">
            <div>
              <strong className="text-foreground">Missed-call webhook URL:</strong>{" "}
              <code className="text-primary break-all">
                {window.location.origin}/api/call-recovery/webhook/missed-call
              </code>
            </div>
            <div>
              <strong className="text-foreground">SMS reply webhook URL:</strong>{" "}
              <code className="text-primary break-all">
                {window.location.origin}/api/call-recovery/webhook/sms
              </code>
            </div>
          </div>

          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 text-xs space-y-1.5" data-testid="card-sms-compliance">
            <p className="font-semibold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              Twilio Business Messaging Compliance
            </p>
            <p className="text-amber-800 dark:text-amber-400">
              Twilio requires proof of consumer consent for A2P 10DLC registration. Use the link below as
              your <strong>opt-in documentation URL</strong> when completing your campaign registration in the
              Twilio Console.
            </p>
            <a
              href="/sms-consent"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-amber-900 dark:text-amber-300 underline underline-offset-2 hover:opacity-80"
              data-testid="link-sms-consent"
            >
              <ExternalLink className="h-3 w-3" />
              {window.location.origin}/sms-consent
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
