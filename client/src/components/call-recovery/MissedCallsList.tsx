import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PhoneMissed, MessageSquare, Briefcase, User, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "./StatusBadge";
import { ConversationSheet } from "./ConversationSheet";
import type { MissedCall, CRSubscription } from "./types";

export function MissedCallsList({ subscription }: { subscription: CRSubscription }) {
  const { toast } = useToast();
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: calls, isLoading: callsLoading } = useQuery<MissedCall[]>({
    queryKey: ["/api/call-recovery/missed-calls"],
  });

  const markRecoverMutation = useMutation({
    mutationFn: (callId: string) =>
      apiRequest("PATCH", `/api/call-recovery/missed-calls/${callId}/recover`, {}),
    onSuccess: () => {
      toast({ title: "Marked as recovered" });
      queryClient.invalidateQueries({ queryKey: ["/api/call-recovery/missed-calls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/call-recovery/stats"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update", variant: "destructive" });
    },
  });

  const openConversation = (callId: string) => {
    setSelectedCallId(callId);
    setSheetOpen(true);
  };

  return (
    <>
      <Card data-testid="card-missed-calls">
        <CardHeader>
          <CardTitle className="text-base">Missed Calls</CardTitle>
          <CardDescription>
            Calls that were automatically recovered by the AI. Click a row to view the conversation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {callsLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          )}
          {!callsLoading && (!calls || calls.length === 0) && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <PhoneMissed className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No missed calls yet.</p>
              <p className="text-xs text-muted-foreground">
                {subscription.phone
                  ? "Forward missed calls to your Twilio number to start recovering leads."
                  : "Set up your Twilio number in the Setup tab to get started."}
              </p>
            </div>
          )}
          {!callsLoading && calls && calls.length > 0 && (
            <div className="divide-y">
              {calls.map((call) => (
                <div
                  key={call.id}
                  className="flex items-center gap-2 py-3 px-2"
                  data-testid={`row-missed-call-${call.id}`}
                >
                  <button
                    className="flex-1 flex items-center gap-3 hover:bg-muted/40 rounded-md transition-colors text-left group min-w-0 p-1"
                    onClick={() => openConversation(call.id)}
                  >
                    <div className="flex-shrink-0 h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{call.callerPhone}</p>
                        <StatusBadge status={call.status} />
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {call.serviceType || "Service type pending"}
                        {call.location ? ` · ${call.location}` : ""}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(call.createdAt), "MMM d, h:mm a")}
                      </p>
                      {call.jobId && (
                        <p className="text-xs text-primary flex items-center gap-0.5 justify-end mt-0.5">
                          <Briefcase className="h-3 w-3" /> Job created
                        </p>
                      )}
                    </div>
                    <MessageSquare className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                  {call.status !== "recovered" && (
                    <button
                      className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors border border-green-200 dark:border-green-800"
                      onClick={() => markRecoverMutation.mutate(call.id)}
                      disabled={markRecoverMutation.isPending}
                      data-testid={`button-mark-recovered-${call.id}`}
                      title="Mark as recovered"
                    >
                      <CheckCircle className="h-3 w-3" />
                      Recovered
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConversationSheet
        callId={selectedCallId}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}
