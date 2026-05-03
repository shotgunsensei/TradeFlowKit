import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { Briefcase, FileText, Receipt, ArrowRight } from "lucide-react";

interface ActivityItem {
  type: string;
  id: string;
  label: string;
  link: string;
  time: string | Date;
}

function ActivityIcon({ type }: { type: string }) {
  if (type === "invoice") return <Receipt className="h-3.5 w-3.5 text-amber-600" />;
  if (type === "quote") return <FileText className="h-3.5 w-3.5 text-emerald-600" />;
  return <Briefcase className="h-3.5 w-3.5 text-primary" />;
}

function ActivityDot({ type }: { type: string }) {
  if (type === "invoice") return <div className="h-2 w-2 rounded-full bg-amber-500 shrink-0 mt-1.5" />;
  if (type === "quote") return <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 mt-1.5" />;
  return <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />;
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (!items || items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No recent activity yet
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {items.map((item, i) => (
        <Link key={`${item.id}-${i}`} href={item.link}>
          <div
            className="flex items-start gap-2.5 rounded-md px-2 py-2 hover:bg-muted/60 transition-colors cursor-pointer group"
            data-testid={`activity-item-${item.id}`}
          >
            <ActivityDot type={item.type} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground leading-snug">{item.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDistanceToNow(new Date(item.time), { addSuffix: true })}
              </p>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
          </div>
        </Link>
      ))}
    </div>
  );
}
