import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, formatDistanceToNow } from "date-fns";
import {
  Wrench,
  FileText,
  Receipt,
  Bell,
  CheckCircle2,
  Send,
  XCircle,
  ArrowRight,
  Clock,
} from "lucide-react";
import type { Job, Quote, Invoice, ReminderLog } from "@shared/schema";

interface TimelineItem {
  id: string;
  type: "job" | "quote" | "invoice" | "reminder";
  subtype?: string;
  title: string;
  meta?: string;
  date: Date;
  link?: string;
}

const TYPE_STYLE: Record<string, { dot: string; iconBg: string; iconColor: string }> = {
  job: { dot: "bg-primary", iconBg: "bg-primary/10", iconColor: "text-primary" },
  quote: { dot: "bg-emerald-500", iconBg: "bg-emerald-500/10", iconColor: "text-emerald-600 dark:text-emerald-400" },
  invoice: { dot: "bg-amber-500", iconBg: "bg-amber-500/10", iconColor: "text-amber-600 dark:text-amber-400" },
  reminder: { dot: "bg-sky-500", iconBg: "bg-sky-500/10", iconColor: "text-sky-600 dark:text-sky-400" },
};

function ItemIcon({ type, subtype }: { type: string; subtype?: string }) {
  if (type === "job") return <Wrench className="h-3.5 w-3.5" />;
  if (type === "quote") {
    if (subtype === "accepted") return <CheckCircle2 className="h-3.5 w-3.5" />;
    if (subtype === "declined") return <XCircle className="h-3.5 w-3.5" />;
    if (subtype === "sent") return <Send className="h-3.5 w-3.5" />;
    return <FileText className="h-3.5 w-3.5" />;
  }
  if (type === "invoice") {
    if (subtype === "paid") return <CheckCircle2 className="h-3.5 w-3.5" />;
    if (subtype === "sent") return <Send className="h-3.5 w-3.5" />;
    return <Receipt className="h-3.5 w-3.5" />;
  }
  return <Bell className="h-3.5 w-3.5" />;
}

export function CustomerActivityTimeline({ customerId }: { customerId: string }) {
  const { data: jobs = [] } = useQuery<Job[]>({
    queryKey: ["/api/customers", customerId, "jobs"],
    enabled: !!customerId,
  });

  const { data: invoices = [] } = useQuery<(Invoice & { total?: number })[]>({
    queryKey: ["/api/customers", customerId, "invoices"],
    enabled: !!customerId,
  });

  const { data: allQuotes = [] } = useQuery<(Quote & { customerName?: string; total?: number })[]>({
    queryKey: ["/api/quotes"],
  });
  const customerQuotes = allQuotes.filter((q) => q.customerId === customerId);

  const { data: customerReminders = [] } = useQuery<ReminderLog[]>({
    queryKey: ["/api/customers", customerId, "reminders"],
    enabled: !!customerId,
  });

  const items: TimelineItem[] = [];

  for (const j of jobs) {
    if (j.createdAt) {
      items.push({
        id: `job-created-${j.id}`,
        type: "job",
        title: `Job created · ${j.title}`,
        meta: `Status: ${j.status}`,
        date: new Date(j.createdAt),
        link: `/jobs/${j.id}`,
      });
    }
    const completedAt = (j as { completedAt?: Date | string | null }).completedAt;
    if (completedAt) {
      items.push({
        id: `job-done-${j.id}`,
        type: "job",
        subtype: "done",
        title: `Job completed · ${j.title}`,
        date: new Date(completedAt),
        link: `/jobs/${j.id}`,
      });
    }
  }

  for (const q of customerQuotes) {
    if (q.createdAt) {
      items.push({
        id: `quote-created-${q.id}`,
        type: "quote",
        title: `Quote #${q.id.slice(0, 8)} created`,
        meta: q.total !== undefined ? `$${q.total.toFixed(2)}` : undefined,
        date: new Date(q.createdAt),
        link: `/quotes/${q.id}`,
      });
    }
    if (q.sentAt) {
      items.push({
        id: `quote-sent-${q.id}`,
        type: "quote",
        subtype: "sent",
        title: `Quote #${q.id.slice(0, 8)} sent`,
        date: new Date(q.sentAt),
        link: `/quotes/${q.id}`,
      });
    }
    if (q.status === "accepted") {
      items.push({
        id: `quote-accepted-${q.id}`,
        type: "quote",
        subtype: "accepted",
        title: `Quote #${q.id.slice(0, 8)} accepted`,
        date: new Date((q as any).updatedAt || q.sentAt || q.createdAt!),
        link: `/quotes/${q.id}`,
      });
    } else if (q.status === "declined") {
      items.push({
        id: `quote-declined-${q.id}`,
        type: "quote",
        subtype: "declined",
        title: `Quote #${q.id.slice(0, 8)} declined`,
        date: new Date((q as any).updatedAt || q.sentAt || q.createdAt!),
        link: `/quotes/${q.id}`,
      });
    }
  }

  for (const inv of invoices) {
    if (inv.createdAt) {
      items.push({
        id: `invoice-created-${inv.id}`,
        type: "invoice",
        title: `Invoice #${inv.id.slice(0, 8)} created`,
        meta: inv.total !== undefined ? `$${inv.total.toFixed(2)}` : undefined,
        date: new Date(inv.createdAt),
        link: `/invoices/${inv.id}`,
      });
    }
    if (inv.sentAt) {
      items.push({
        id: `invoice-sent-${inv.id}`,
        type: "invoice",
        subtype: "sent",
        title: `Invoice #${inv.id.slice(0, 8)} sent`,
        date: new Date(inv.sentAt),
        link: `/invoices/${inv.id}`,
      });
    }
    if (inv.paidAt) {
      items.push({
        id: `invoice-paid-${inv.id}`,
        type: "invoice",
        subtype: "paid",
        title: `Invoice #${inv.id.slice(0, 8)} paid`,
        meta: inv.total !== undefined ? `$${inv.total.toFixed(2)}` : undefined,
        date: new Date(inv.paidAt),
        link: `/invoices/${inv.id}`,
      });
    }
  }

  for (const r of customerReminders) {
    items.push({
      id: `reminder-${r.id}`,
      type: "reminder",
      title: `Reminder SMS sent`,
      meta: r.message.length > 80 ? `${r.message.slice(0, 80)}…` : r.message,
      date: new Date(r.sentAt),
      link: r.targetType === "invoice" ? `/invoices/${r.targetId}` : `/quotes/${r.targetId}`,
    });
  }

  items.sort((a, b) => b.date.getTime() - a.date.getTime());

  if (items.length === 0) {
    return (
      <div
        className="text-center py-12 text-sm text-muted-foreground border rounded-lg"
        data-testid="activity-timeline-empty"
      >
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p>No activity yet for this customer.</p>
        <p className="text-xs mt-1">Jobs, quotes, invoices, and reminders will appear here.</p>
      </div>
    );
  }

  return (
    <div className="relative" data-testid="customer-activity-timeline">
      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" aria-hidden="true" />
      <ul className="space-y-3">
        {items.map((item) => {
          const style = TYPE_STYLE[item.type];
          const Inner = (
            <div
              className="group flex gap-3 rounded-md border bg-card p-3 hover:bg-muted/40 transition-colors"
              data-testid={`timeline-item-${item.id}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                  <span className="text-xs text-muted-foreground shrink-0" title={format(item.date, "PPpp")}>
                    {formatDistanceToNow(item.date, { addSuffix: true })}
                  </span>
                </div>
                {item.meta && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.meta}</p>
                )}
              </div>
              {item.link && (
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity self-center shrink-0" />
              )}
            </div>
          );
          return (
            <li key={item.id} className="relative pl-10">
              <div
                className={`absolute left-0 top-3 flex h-8 w-8 items-center justify-center rounded-full border bg-background ${style.iconColor}`}
              >
                <ItemIcon type={item.type} subtype={item.subtype} />
              </div>
              {item.link ? <Link href={item.link}>{Inner}</Link> : Inner}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
