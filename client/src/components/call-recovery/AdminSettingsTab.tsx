import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, ArrowRight } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CRSettings } from "./types";

export function AdminSettingsTab() {
  const { toast } = useToast();
  const [settingsEnabled, setSettingsEnabled] = useState(true);
  const [customMessage, setCustomMessage] = useState("");
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");

  const { data: crSettings } = useQuery<CRSettings>({
    queryKey: ["/api/call-recovery/settings"],
  });

  useEffect(() => {
    if (crSettings) {
      setSettingsEnabled(crSettings.enabled);
      setCustomMessage(crSettings.customMessage || "");
      setQuietStart(crSettings.quietStart || "");
      setQuietEnd(crSettings.quietEnd || "");
    }
  }, [crSettings]);

  const settingsMutation = useMutation({
    mutationFn: (data: Partial<CRSettings>) =>
      apiRequest("PATCH", "/api/call-recovery/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/call-recovery/settings"] });
      toast({ title: "Settings saved" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save settings", variant: "destructive" });
    },
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card data-testid="card-cr-auto-response">
        <CardHeader>
          <CardTitle className="text-base">Auto-Response</CardTitle>
          <CardDescription>Control when the AI sends recovery SMS messages</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Enable AI auto-response</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                When enabled, the AI automatically texts callers who miss your line
              </p>
            </div>
            <Switch
              checked={settingsEnabled}
              onCheckedChange={(checked) => {
                setSettingsEnabled(checked);
                settingsMutation.mutate({ enabled: checked });
              }}
              data-testid="switch-cr-enabled"
            />
          </div>
          <div className="space-y-2">
            <Label>Quiet Hours</Label>
            <p className="text-xs text-muted-foreground">AI will not respond during these hours</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input
                  type="time"
                  value={quietStart}
                  onChange={(e) => setQuietStart(e.target.value)}
                  data-testid="input-quiet-start"
                />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground mt-5 shrink-0" />
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input
                  type="time"
                  value={quietEnd}
                  onChange={(e) => setQuietEnd(e.target.value)}
                  data-testid="input-quiet-end"
                />
              </div>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => settingsMutation.mutate({ quietStart: quietStart || null, quietEnd: quietEnd || null })}
            disabled={settingsMutation.isPending}
            data-testid="button-save-quiet-hours"
          >
            {settingsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Hours"}
          </Button>
        </CardContent>
      </Card>

      <Card data-testid="card-cr-custom-message">
        <CardHeader>
          <CardTitle className="text-base">Custom Intro Message</CardTitle>
          <CardDescription>Override the default opening SMS sent to callers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Textarea
              placeholder="Hi {name}, I just missed your call. I'm {business} — what can I help you with today?"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              rows={4}
              data-testid="textarea-custom-message"
            />
            <div className="p-2.5 rounded-md bg-muted/50 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Available placeholders:</p>
              <p><code className="bg-muted px-1 rounded">{"{business}"}</code> — your business name</p>
              <p><code className="bg-muted px-1 rounded">{"{phone}"}</code> — your business phone number</p>
              <p><code className="bg-muted px-1 rounded">{"{name}"}</code> — caller's name (defaults to "there" if unknown)</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => settingsMutation.mutate({ customMessage: customMessage || null })}
              disabled={settingsMutation.isPending}
              data-testid="button-save-custom-message"
            >
              {settingsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Message"}
            </Button>
            {customMessage && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCustomMessage("");
                  settingsMutation.mutate({ customMessage: null });
                }}
                data-testid="button-clear-custom-message"
              >
                Reset to default
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
