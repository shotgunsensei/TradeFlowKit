import { Link, useLocation } from "wouter";
import { LayoutDashboard, UserPlus, Wrench, Menu } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

const tabs = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, match: (l: string) => l === "/" || l === "/dashboard" },
  { title: "Leads", url: "/leads", icon: UserPlus, match: (l: string) => l.startsWith("/leads") },
  { title: "Jobs", url: "/jobs", icon: Wrench, match: (l: string) => l.startsWith("/jobs") },
];

export function MobileBottomNav() {
  const [location] = useLocation();
  const { toggleSidebar, openMobile } = useSidebar();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] print:hidden"
      data-testid="mobile-bottom-nav"
    >
      <div className="grid grid-cols-4 h-14">
        {tabs.map((t) => {
          const active = t.match(location);
          const Icon = t.icon;
          return (
            <Link
              key={t.title}
              href={t.url}
              data-testid={`mobile-nav-${t.title.toLowerCase()}`}
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{t.title}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={toggleSidebar}
          data-testid="mobile-nav-more"
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
            openMobile ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Menu className="h-5 w-5" />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
