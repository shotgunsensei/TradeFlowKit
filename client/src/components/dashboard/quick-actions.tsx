import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const actions = [
  { label: "New Lead", href: "/leads?new=1", color: "bg-sky-700 hover:bg-sky-800 text-white" },
  { label: "New Job", href: "/jobs?new=1", color: "bg-primary hover:bg-primary/90 text-primary-foreground" },
  { label: "New Quote", href: "/quotes/new", color: "bg-emerald-700 hover:bg-emerald-800 text-white" },
  { label: "New Invoice", href: "/invoices/new", color: "bg-amber-700 hover:bg-amber-800 text-white" },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {actions.map((action) => (
        <Link key={action.label} href={action.href}>
          <button
            className={`w-full flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${action.color}`}
            data-testid={`quick-action-${action.label.toLowerCase().replace(" ", "-")}`}
          >
            <Plus className="h-3.5 w-3.5" />
            {action.label}
          </button>
        </Link>
      ))}
    </div>
  );
}
