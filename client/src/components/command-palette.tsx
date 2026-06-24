import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Users,
  Wrench,
  FileText,
  Receipt,
  Settings,
  BarChart3,
  PhoneMissed,
  User,
  UserPlus,
  Briefcase,
  DollarSign,
  ListChecks,
} from "lucide-react";
import { useHotkey } from "@/hooks/use-hotkey";

type SearchResults = {
  customers: Array<{ id: string; name: string }>;
  jobs: Array<{ id: string; title: string; customerName: string | null }>;
  quotes: Array<{ id: string; customerName: string | null; status: string }>;
  invoices: Array<{ id: string; customerName: string | null; status: string }>;
};

const NAV_ITEMS = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Leads", path: "/leads", icon: UserPlus, description: "Lead Conversion Center" },
  { label: "Lead ROI Report", path: "/leads?view=performance", icon: DollarSign, description: "Lead performance and estimated value" },
  { label: "Lead Settings", path: "/leads?settings=1", icon: Settings, description: "Messaging, forms, and lead sources" },
  { label: "Lead Go-Live Checklist", path: "/leads?settings=1&readiness=1", icon: ListChecks, description: "Production readiness and messaging mode" },
  { label: "Customers", path: "/customers", icon: Users },
  { label: "Jobs", path: "/jobs", icon: Wrench },
  { label: "Quotes", path: "/quotes", icon: FileText },
  { label: "Invoices", path: "/invoices", icon: Receipt },
  { label: "Analytics", path: "/analytics", icon: BarChart3 },
  { label: "Call Recovery", path: "/call-recovery", icon: PhoneMissed },
  { label: "Settings", path: "/settings", icon: Settings },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [, navigate] = useLocation();

  useHotkey("mod+k", () => setOpen((v) => !v), { allowInInputs: true });

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebounced("");
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 180);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery<SearchResults>({
    queryKey: ["/api/search", debounced],
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(debounced)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: open && debounced.length > 0,
    staleTime: 30_000,
  });

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const hasResults = useMemo(() => {
    if (!data) return false;
    return (
      data.customers.length +
        data.jobs.length +
        data.quotes.length +
        data.invoices.length >
      0
    );
  }, [data]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search customers, jobs, quotes, invoices…"
        value={query}
        onValueChange={setQuery}
        data-testid="input-command-palette"
      />
      <CommandList>
        {debounced && !isFetching && !hasResults && (
          <CommandEmpty>No results found for "{debounced}"</CommandEmpty>
        )}
        {!debounced && <CommandEmpty>Start typing to search…</CommandEmpty>}

        {data?.customers && data.customers.length > 0 && (
          <CommandGroup heading="Customers">
            {data.customers.map((c) => (
              <CommandItem
                key={`cust-${c.id}`}
                value={`customer ${c.name} ${c.id}`}
                onSelect={() => go(`/customers/${c.id}`)}
                data-testid={`palette-customer-${c.id}`}
              >
                <User className="h-4 w-4" />
                <span>{c.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {data?.jobs && data.jobs.length > 0 && (
          <CommandGroup heading="Jobs">
            {data.jobs.map((j) => (
              <CommandItem
                key={`job-${j.id}`}
                value={`job ${j.title} ${j.customerName || ""} ${j.id}`}
                onSelect={() => go(`/jobs/${j.id}`)}
                data-testid={`palette-job-${j.id}`}
              >
                <Briefcase className="h-4 w-4" />
                <div className="flex flex-col">
                  <span>{j.title}</span>
                  {j.customerName && (
                    <span className="text-xs text-muted-foreground">
                      {j.customerName}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {data?.quotes && data.quotes.length > 0 && (
          <CommandGroup heading="Quotes">
            {data.quotes.map((q) => (
              <CommandItem
                key={`quote-${q.id}`}
                value={`quote ${q.id} ${q.customerName || ""}`}
                onSelect={() => go(`/quotes/${q.id}`)}
                data-testid={`palette-quote-${q.id}`}
              >
                <FileText className="h-4 w-4" />
                <div className="flex flex-col">
                  <span>Quote #{q.id.slice(0, 8)}</span>
                  {q.customerName && (
                    <span className="text-xs text-muted-foreground">
                      {q.customerName}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {data?.invoices && data.invoices.length > 0 && (
          <CommandGroup heading="Invoices">
            {data.invoices.map((inv) => (
              <CommandItem
                key={`inv-${inv.id}`}
                value={`invoice ${inv.id} ${inv.customerName || ""}`}
                onSelect={() => go(`/invoices/${inv.id}`)}
                data-testid={`palette-invoice-${inv.id}`}
              >
                <Receipt className="h-4 w-4" />
                <div className="flex flex-col">
                  <span>Invoice #{inv.id.slice(0, 8)}</span>
                  {inv.customerName && (
                    <span className="text-xs text-muted-foreground">
                      {inv.customerName}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {hasResults && <CommandSeparator />}

        <CommandGroup heading="Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.path}
                value={`go to ${item.label}`}
                onSelect={() => go(item.path)}
                data-testid={`palette-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <Icon className="h-4 w-4" />
                <div className="flex flex-col">
                  <span>{item.label}</span>
                  {item.description && (
                    <span className="text-xs text-muted-foreground">{item.description}</span>
                  )}
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
