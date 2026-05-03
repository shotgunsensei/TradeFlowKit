import { Phone, MessageSquare, CheckCircle, AlertCircle, Clock } from "lucide-react";

export interface CRSubscription {
  plan: string | null;
  status: string | null;
  phone: string | null;
  limits: { recoveriesPerMonth: number; analytics: boolean } | null;
  usage: number;
  stripeSubscriptionId: string | null;
}

export interface StripePlan {
  product_id: string;
  product_name: string;
  product_description: string;
  product_metadata: Record<string, string> | string;
  price_id: string;
  unit_amount: number;
  currency: string;
  recurring: any;
}

export interface MissedCall {
  id: string;
  callerPhone: string;
  callerName: string | null;
  status: "new" | "in_progress" | "recovered" | "failed" | "expired";
  serviceType: string | null;
  location: string | null;
  urgency: string | null;
  customerId: string | null;
  jobId: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface AiMessage {
  id: string;
  role: "system" | "assistant" | "user";
  content: string;
  createdAt: string;
}

export interface CRSettings {
  enabled: boolean;
  customMessage: string | null;
  quietStart: string | null;
  quietEnd: string | null;
}

export interface CRStats {
  totalThisMonth: number;
  recovered: number;
  inProgress: number;
  failed: number;
  contacted: number;
  responded: number;
  recoveryRate: number;
  lastMonthTotal: number;
  lastMonthRecovered: number;
  lastMonthRecoveryRate: number;
  estimatedRevenue: number;
  funnel: {
    missed: number;
    contacted: number;
    responded: number;
    recovered: number;
  };
}

export const PLAN_ORDER = ["starter", "growth", "pro"] as const;

export const PLAN_FEATURES: Record<string, { label: string; included: boolean }[]> = {
  starter: [
    { label: "50 recoveries/month", included: true },
    { label: "AI SMS conversations", included: true },
    { label: "Auto-create leads in CRM", included: true },
    { label: "Unlimited recoveries", included: false },
    { label: "Analytics dashboard", included: false },
  ],
  growth: [
    { label: "Unlimited recoveries/month", included: true },
    { label: "AI SMS conversations", included: true },
    { label: "Auto-create leads in CRM", included: true },
    { label: "Unlimited recoveries", included: true },
    { label: "Analytics dashboard", included: false },
  ],
  pro: [
    { label: "Unlimited recoveries/month", included: true },
    { label: "AI SMS conversations", included: true },
    { label: "Auto-create leads in CRM", included: true },
    { label: "Unlimited recoveries", included: true },
    { label: "Analytics dashboard", included: true },
  ],
};

export const PLAN_BADGES: Record<string, string> = {
  starter: "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary",
  growth: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  pro: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

export const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  new: { label: "New", icon: Phone, color: "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary" },
  in_progress: { label: "Contacting", icon: MessageSquare, color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  recovered: { label: "Recovered", icon: CheckCircle, color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  failed: { label: "Failed", icon: AlertCircle, color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  expired: { label: "Expired", icon: Clock, color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300" },
};
