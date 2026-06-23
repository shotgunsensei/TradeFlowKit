export type LeadDeploymentChecklistItem = {
  key: string;
  label: string;
  explanation: string;
  action: string;
};

export const LEAD_DEPLOYMENT_CHECKLIST: LeadDeploymentChecklistItem[] = [
  {
    key: "discovery",
    label: "Discovery complete",
    explanation: "Business details, lead sources, response process, and success criteria are documented.",
    action: "Use discovery worksheet",
  },
  {
    key: "trade_template",
    label: "Trade template selected",
    explanation: "The lead scoring and service labels match the contractor vertical.",
    action: "Choose trade template",
  },
  {
    key: "business_settings",
    label: "Business settings configured",
    explanation: "Service area and business contact details are ready for customer-facing messages.",
    action: "Review business settings",
  },
  {
    key: "capture_form",
    label: "Lead capture form connected",
    explanation: "The website or manual capture path can create leads in TradeFlowKit.",
    action: "Open lead form",
  },
  {
    key: "lead_source",
    label: "Lead source connected",
    explanation: "At least one website, phone, or manual lead source feeds the Lead Center.",
    action: "Review lead sources",
  },
  {
    key: "templates",
    label: "Messaging templates reviewed",
    explanation: "SMS/email templates sound like the business and include required SMS opt-out wording.",
    action: "Review templates",
  },
  {
    key: "followups",
    label: "Follow-up sequence reviewed",
    explanation: "Follow-up timing and channels are intentional before staff use the list.",
    action: "Review follow-ups",
  },
  {
    key: "dry_run_test",
    label: "Dry-run test completed",
    explanation: "A test lead has been captured, scored, followed up, and converted without accidental sending.",
    action: "Create test lead",
  },
  {
    key: "production_readiness",
    label: "Production readiness passed",
    explanation: "Message setup, lead source, template, consent, and test-message checks are ready for live mode.",
    action: "Open Go Live Checklist",
  },
  {
    key: "go_live",
    label: "Go-live scheduled",
    explanation: "The launch window, rollback owner, and first-day monitoring owner are known.",
    action: "Schedule go-live",
  },
  {
    key: "handoff",
    label: "Client handoff completed",
    explanation: "Office staff know how to read hot leads, due follow-ups, and conversions.",
    action: "Review handoff guide",
  },
  {
    key: "first_week_review",
    label: "First-week review scheduled",
    explanation: "A review is scheduled to tune templates, scoring, follow-up timing, and source quality.",
    action: "Schedule review",
  },
];

export function deploymentChecklistStatus(input: {
  activeTradeTemplate?: boolean;
  businessInfoConfigured?: boolean;
  publicFormsConfigured?: boolean;
  leadSourcesConfigured?: boolean;
  templatesReviewed?: boolean;
  followUpEnabled?: boolean;
  totalLeads?: number;
  productionCanGoLive?: boolean;
  convertedCount?: number;
}) {
  return LEAD_DEPLOYMENT_CHECKLIST.map((item) => {
    const complete = item.key === "discovery"
      ? false
      : item.key === "trade_template"
        ? !!input.activeTradeTemplate
        : item.key === "business_settings"
          ? !!input.businessInfoConfigured
          : item.key === "capture_form"
            ? !!input.publicFormsConfigured
            : item.key === "lead_source"
              ? !!input.leadSourcesConfigured
              : item.key === "templates"
                ? !!input.templatesReviewed
                : item.key === "followups"
                  ? !!input.followUpEnabled
                  : item.key === "dry_run_test"
                    ? (input.totalLeads || 0) > 0
                    : item.key === "production_readiness"
                      ? !!input.productionCanGoLive
                      : item.key === "go_live"
                        ? false
                        : item.key === "handoff"
                          ? false
                          : item.key === "first_week_review"
                            ? false
                            : false;
    return { ...item, complete };
  });
}
