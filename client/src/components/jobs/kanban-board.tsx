import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, Calendar, User, AlertTriangle, ArrowRight, Users, RefreshCw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS, RECURRING_FREQUENCY_LABELS } from "@shared/schema";
import type { Job } from "@shared/schema";

const STATUS_ORDER = [
  "lead",
  "quoted",
  "scheduled",
  "in_progress",
  "done",
  "invoiced",
  "paid",
  "canceled",
] as const;

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-red-600 dark:text-red-400",
  normal: "text-muted-foreground",
  low: "text-muted-foreground",
};

interface Member {
  userId: string;
  user?: { id: string; username: string; name?: string | null } | null;
}

interface KanbanBoardProps {
  jobs: (Job & { customerName?: string })[];
  isLoading: boolean;
  statusFilter?: string;
}

interface JobCardProps {
  job: Job & { customerName?: string };
  members: Member[];
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() || "")
    .join("");
}

function TechAvatar({ userId, members }: { userId: string; members: Member[] }) {
  const member = members.find((m) => m.userId === userId);
  const name = member?.user?.name || member?.user?.username || "?";
  const initials = getInitials(name);
  return (
    <span
      className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary/20 text-primary text-[9px] font-semibold shrink-0"
      title={name}
    >
      {initials}
    </span>
  );
}

function JobCard({ job, members }: JobCardProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      await apiRequest("PATCH", `/api/jobs/${job.id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const otherStatuses = STATUS_ORDER.filter((s) => s !== job.status);
  const assignedIds: string[] = (job.assignedUserIds ?? []).filter(
    (id): id is string => typeof id === "string"
  );

  return (
    <div
      className="bg-background rounded-lg border p-3 space-y-2 hover:shadow-sm transition-shadow cursor-pointer group"
      data-testid={`kanban-card-${job.id}`}
      onClick={() => navigate(`/jobs/${job.id}`)}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-tight flex-1 line-clamp-2">{job.title}</p>
        {job.priority === "urgent" && (
          <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
        )}
      </div>

      {job.customerName && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <User className="h-3 w-3" />
          <span className="truncate">{job.customerName}</span>
        </div>
      )}

      {job.isRecurring && (
        <div className="flex items-center gap-1" data-testid={`badge-recurring-${job.id}`}>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary px-1.5 py-0.5 text-[10px] font-medium">
            <RefreshCw className="h-2.5 w-2.5" />
            {job.recurringFrequency ? RECURRING_FREQUENCY_LABELS[job.recurringFrequency] || "Recurring" : "Recurring"}
          </span>
        </div>
      )}

      {job.scheduledStart && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>{format(new Date(job.scheduledStart), "MMM d")}</span>
        </div>
      )}

      {assignedIds.length > 0 && (
        <div className="flex items-center gap-1">
          <Users className="h-3 w-3 text-muted-foreground shrink-0" />
          <div className="flex items-center gap-0.5">
            {assignedIds.slice(0, 3).map((uid) => (
              <TechAvatar key={uid} userId={uid} members={members} />
            ))}
            {assignedIds.length > 3 && (
              <span className="text-xs text-muted-foreground ml-0.5">+{assignedIds.length - 3}</span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-1" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs px-2 gap-1"
              disabled={statusMutation.isPending}
              data-testid={`status-change-${job.id}`}
            >
              Move
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            {otherStatuses.map((s) => (
              <DropdownMenuItem
                key={s}
                onClick={() => statusMutation.mutate(s)}
                data-testid={`status-option-${job.id}-${s}`}
              >
                <ArrowRight className="h-3 w-3 mr-1.5 text-muted-foreground" />
                {JOB_STATUS_LABELS[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {job.priority !== "normal" && (
          <span className={`text-xs font-medium ${PRIORITY_COLORS[job.priority || "normal"]}`}>
            {job.priority}
          </span>
        )}
      </div>
    </div>
  );
}

export function KanbanBoard({ jobs, isLoading, statusFilter }: KanbanBoardProps) {
  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ["/api/memberships"],
  });

  const visibleStatuses = statusFilter && statusFilter !== "all"
    ? STATUS_ORDER.filter((s) => s === statusFilter)
    : STATUS_ORDER;

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STATUS_ORDER.slice(0, 5).map((s) => (
          <div key={s} className="flex-shrink-0 w-56 space-y-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ))}
      </div>
    );
  }

  const byStatus = (status: string) => jobs.filter((j) => j.status === status);

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 min-h-0">
      {visibleStatuses.map((status) => {
        const cols = byStatus(status);
        return (
          <div
            key={status}
            className="flex-shrink-0 w-56 flex flex-col gap-2"
            data-testid={`kanban-col-${status}`}
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {JOB_STATUS_LABELS[status]}
              </span>
              <Badge variant="secondary" className="text-xs h-4 px-1.5">
                {cols.length}
              </Badge>
            </div>
            <div className="flex flex-col gap-2">
              {cols.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                  No jobs
                </div>
              ) : (
                cols.map((job) => <JobCard key={job.id} job={job} members={members} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
