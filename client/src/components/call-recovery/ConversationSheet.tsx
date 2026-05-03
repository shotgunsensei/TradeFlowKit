import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { PhoneMissed, Briefcase, Clock, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { StatusBadge } from "./StatusBadge";
import type { MissedCall, AiMessage } from "./types";

export function ConversationSheet({
  callId,
  open,
  onClose,
}: {
  callId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<{ missedCall: MissedCall; messages: AiMessage[] }>({
    queryKey: ["/api/call-recovery/missed-calls", callId, "messages"],
    enabled: !!callId && open,
  });

  const messages = (data?.messages || []).filter((m) => m.role !== "system");
  const mc = data?.missedCall;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="p-6 pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <PhoneMissed className="h-4 w-4 text-muted-foreground" />
            Missed Call Recovery
          </SheetTitle>
          {mc && (
            <SheetDescription className="space-y-1 text-left">
              <span className="block font-medium text-foreground">{mc.callerPhone}</span>
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={mc.status} />
                {mc.serviceType && (
                  <span className="text-xs text-muted-foreground">
                    <Briefcase className="h-3 w-3 inline mr-1" />{mc.serviceType}
                  </span>
                )}
                {mc.urgency && (
                  <span className="text-xs text-muted-foreground capitalize">
                    <Clock className="h-3 w-3 inline mr-1" />{mc.urgency}
                  </span>
                )}
              </div>
              {mc.jobId && (
                <a
                  href={`/jobs/${mc.jobId}`}
                  className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                  data-testid="link-recovered-job"
                >
                  <Briefcase className="h-3 w-3" /> View auto-created job
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-auto p-4 space-y-3">
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-3/4" style={{ marginLeft: i % 2 === 0 ? "auto" : undefined }} />
              ))}
            </div>
          )}
          {!isLoading && messages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No messages yet.</p>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              data-testid={`message-${msg.id}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <p className={`text-[10px] mt-1 ${msg.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {format(new Date(msg.createdAt), "h:mm a")}
                </p>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
