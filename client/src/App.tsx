import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { AuthProvider, useAuth } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import OrgSetup from "@/pages/org-setup";
import { Skeleton } from "@/components/ui/skeleton";
import { CommandPalette } from "@/components/command-palette";
import { ShortcutsHelpProvider } from "@/components/shortcuts-help";
import { UpgradeDialog } from "@/components/upgrade-dialog";

const Dashboard = lazy(() => import("@/pages/dashboard"));
const LeadsPage = lazy(() => import("@/pages/leads"));
const CustomersPage = lazy(() => import("@/pages/customers"));
const JobsPage = lazy(() => import("@/pages/jobs"));
const QuotesPage = lazy(() => import("@/pages/quotes"));
const InvoicesPage = lazy(() => import("@/pages/invoices"));
const CustomerDetail = lazy(() => import("@/pages/customer-detail"));
const JobDetail = lazy(() => import("@/pages/job-detail"));
const QuoteForm = lazy(() => import("@/pages/quote-form"));
const QuoteDetail = lazy(() => import("@/pages/quote-detail"));
const QuoteView = lazy(() => import("@/pages/quote-view"));
const InvoiceForm = lazy(() => import("@/pages/invoice-form"));
const InvoiceDetail = lazy(() => import("@/pages/invoice-detail"));
const InvoicePayPage = lazy(() => import("@/pages/invoice-pay"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const SubscriptionPage = lazy(() => import("@/pages/subscription"));
const AdminPage = lazy(() => import("@/pages/admin"));
const PrivacyPage = lazy(() => import("@/pages/privacy"));
const TermsPage = lazy(() => import("@/pages/terms"));
const DeleteAccountPage = lazy(() => import("@/pages/delete-account"));
const CallRecoveryPage = lazy(() => import("@/pages/call-recovery"));
const AnalyticsPage = lazy(() => import("@/pages/analytics"));
const SmsConsentPage = lazy(() => import("@/pages/sms-consent"));
const GuidePage = lazy(() => import("@/pages/guide"));
const CustomerPortalPage = lazy(() => import("@/pages/customer-portal"));
const TrashPage = lazy(() => import("@/pages/trash"));
const AccessDeniedPage = lazy(() => import("@/pages/access-denied"));

function RouteFallback() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function AppContent() {
  const { user, org, access, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="space-y-4 w-64">
          <Skeleton className="h-8 w-32 mx-auto" />
          <Skeleton className="h-4 w-48 mx-auto" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Switch>
          <Route path="/privacy" component={PrivacyPage} />
          <Route path="/terms" component={TermsPage} />
          <Route path="/sms-consent" component={SmsConsentPage} />
          <Route path="/guide" component={GuidePage} />
          <Route path="/delete-account" component={DeleteAccountPage} />
          <Route path="/quotes/:id/view" component={QuoteView} />
          <Route path="/invoices/:id/pay" component={InvoicePayPage} />
          <Route path="/portal/:token" component={CustomerPortalPage} />
          <Route><AuthPage /></Route>
        </Switch>
      </Suspense>
    );
  }

  if (!org) {
    return <OrgSetup />;
  }

  // OperatorOS access gate: if the active org is OperatorOS-linked AND the
  // resolver has decided the user is not allowed, force them onto the
  // AccessDenied page regardless of which route they tried to reach. The
  // server already 403s their API calls; this prevents a confusing empty UI.
  if (access && access.linked && !access.allowed) {
    const reason = access.reason ?? "no_module_role";
    const here = window.location.pathname + window.location.search;
    const target = `/access-denied?reason=${encodeURIComponent(reason)}`;
    if (!here.startsWith("/access-denied")) {
      window.history.replaceState(null, "", target);
    }
    return (
      <Suspense fallback={<RouteFallback />}>
        <AccessDeniedPage />
      </Suspense>
    );
  }

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <ShortcutsHelpProvider>
      <CommandPalette />
      <SidebarProvider style={sidebarStyle as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <main className="flex-1 flex flex-col overflow-hidden pb-14 md:pb-0">
            <Suspense fallback={<RouteFallback />}>
              <Switch>
                <Route path="/" component={Dashboard} />
                <Route path="/dashboard" component={Dashboard} />
                <Route path="/leads/demo" component={LeadsPage} />
                <Route path="/leads" component={LeadsPage} />
                <Route path="/customers" component={CustomersPage} />
                <Route path="/customers/:id" component={CustomerDetail} />
                <Route path="/jobs" component={JobsPage} />
                <Route path="/jobs/:id" component={JobDetail} />
                <Route path="/quotes" component={QuotesPage} />
                <Route path="/quotes/new" component={QuoteForm} />
                <Route path="/quotes/:id/view" component={QuoteView} />
                <Route path="/quotes/:id/edit" component={QuoteForm} />
                <Route path="/quotes/:id" component={QuoteDetail} />
                <Route path="/invoices" component={InvoicesPage} />
                <Route path="/invoices/new" component={InvoiceForm} />
                <Route path="/invoices/:id/pay" component={InvoicePayPage} />
                <Route path="/invoices/:id/edit" component={InvoiceForm} />
                <Route path="/invoices/:id" component={InvoiceDetail} />
                <Route path="/settings" component={SettingsPage} />
                <Route path="/subscription" component={SubscriptionPage} />
                <Route path="/analytics" component={AnalyticsPage} />
                <Route path="/call-recovery" component={CallRecoveryPage} />
                <Route path="/trash" component={TrashPage} />
                <Route path="/admin" component={AdminPage} />
                <Route path="/access-denied" component={AccessDeniedPage} />
                <Route path="/guide" component={GuidePage} />
                <Route path="/privacy" component={PrivacyPage} />
                <Route path="/terms" component={TermsPage} />
                <Route path="/sms-consent" component={SmsConsentPage} />
                <Route path="/delete-account" component={DeleteAccountPage} />
                <Route path="/portal/:token" component={CustomerPortalPage} />
                <Route component={NotFound} />
              </Switch>
            </Suspense>
          </main>
          <MobileBottomNav />
        </div>
      </SidebarProvider>
    </ShortcutsHelpProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
        <UpgradeDialog />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
