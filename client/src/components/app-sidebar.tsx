import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Users,
  Wrench,
  FileText,
  Receipt,
  Settings,
  LogOut,
  Building2,
  ChevronDown,
  CreditCard,
  Shield,
  PhoneMissed,
  Lock,
  BookOpen,
} from "lucide-react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import tradeflowLogo from "@assets/tradeflow512_1773073035241.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const mainNav = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Customers", url: "/customers", icon: Users },
  { title: "Jobs", url: "/jobs", icon: Wrench },
  { title: "Quotes", url: "/quotes", icon: FileText },
  { title: "Invoices", url: "/invoices", icon: Receipt },
];

const settingsNav = [
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Subscription", url: "/subscription", icon: CreditCard },
  { title: "Help & Guide", url: "/guide", icon: BookOpen },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, org, orgs, logout, switchOrg } = useAuth();
  const hasCallRecovery = !!(org as any)?.callRecoveryPlan;

  const isActive = (url: string) => {
    if (url === "/") return location === "/";
    return location.startsWith(url);
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <img src={tradeflowLogo} alt="TradeFlow" className="h-8 w-8 rounded-md object-contain" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight">TradeFlow</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Service Management
            </span>
          </div>
        </div>
        {org && orgs.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                data-testid="button-org-switcher"
                className="mt-3 flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-left text-sm transition-colors"
              >
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1 truncate">{org.name}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {orgs.map((o) => (
                <DropdownMenuItem
                  key={o.id}
                  data-testid={`menu-org-${o.id}`}
                  onClick={() => switchOrg(o.id)}
                  className={o.id === org.id ? "bg-accent" : ""}
                >
                  <Building2 className="mr-2 h-3.5 w-3.5" />
                  {o.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    data-active={isActive(item.url)}
                    className="data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium"
                  >
                    <Link href={item.url} data-testid={`nav-${item.title.toLowerCase()}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    data-active={isActive(item.url)}
                    className="data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium"
                  >
                    <Link href={item.url} data-testid={`nav-${item.title.toLowerCase()}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Add-ons</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  data-active={isActive("/call-recovery")}
                  className="data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium"
                >
                  <Link href="/call-recovery" data-testid="nav-call-recovery">
                    <PhoneMissed className="h-4 w-4" />
                    <span>Call Recovery AI</span>
                    {!hasCallRecovery && (
                      <Lock className="h-3 w-3 ml-auto text-muted-foreground" />
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {user?.isSuperAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    data-active={isActive("/admin")}
                    className="data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium"
                  >
                    <Link href="/admin" data-testid="nav-admin">
                      <Shield className="h-4 w-4" />
                      <span>Master Admin</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="p-4">
        {user && (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                {(user.fullName || user.username).slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.fullName || user.username}</p>
              <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
            </div>
            <button
              data-testid="button-logout"
              onClick={logout}
              className="text-muted-foreground transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
