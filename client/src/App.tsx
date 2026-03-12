import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider, useAuth } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import OrgSetup from "@/pages/org-setup";
import Dashboard from "@/pages/dashboard";
import CustomersPage from "@/pages/customers";
import CustomerDetail from "@/pages/customer-detail";
import JobsPage from "@/pages/jobs";
import JobDetail from "@/pages/job-detail";
import QuotesPage from "@/pages/quotes";
import QuoteForm from "@/pages/quote-form";
import QuoteDetail from "@/pages/quote-detail";
import InvoicesPage from "@/pages/invoices";
import InvoiceForm from "@/pages/invoice-form";
import InvoiceDetail from "@/pages/invoice-detail";
import SettingsPage from "@/pages/settings";
import SubscriptionPage from "@/pages/subscription";
import AdminPage from "@/pages/admin";
import PrivacyPage from "@/pages/privacy";
import DeleteAccountPage from "@/pages/delete-account";
import CallRecoveryPage from "@/pages/call-recovery";
import SmsConsentPage from "@/pages/sms-consent";
import { Skeleton } from "@/components/ui/skeleton";

function AppContent() {
  const { user, org, isLoading } = useAuth();

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
      <Switch>
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/sms-consent" component={SmsConsentPage} />
        <Route path="/delete-account" component={DeleteAccountPage} />
        <Route><AuthPage /></Route>
      </Switch>
    );
  }

  if (!org) {
    return <OrgSetup />;
  }

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/customers" component={CustomersPage} />
            <Route path="/customers/:id" component={CustomerDetail} />
            <Route path="/jobs" component={JobsPage} />
            <Route path="/jobs/:id" component={JobDetail} />
            <Route path="/quotes" component={QuotesPage} />
            <Route path="/quotes/new" component={QuoteForm} />
            <Route path="/quotes/:id/edit" component={QuoteForm} />
            <Route path="/quotes/:id" component={QuoteDetail} />
            <Route path="/invoices" component={InvoicesPage} />
            <Route path="/invoices/new" component={InvoiceForm} />
            <Route path="/invoices/:id/edit" component={InvoiceForm} />
            <Route path="/invoices/:id" component={InvoiceDetail} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/subscription" component={SubscriptionPage} />
            <Route path="/call-recovery" component={CallRecoveryPage} />
            <Route path="/admin" component={AdminPage} />
            <Route path="/privacy" component={PrivacyPage} />
            <Route path="/sms-consent" component={SmsConsentPage} />
            <Route path="/delete-account" component={DeleteAccountPage} />
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
