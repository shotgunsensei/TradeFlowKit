export const LIVE_LEADS_CONFIRMATION_PHRASE = "ENABLE LIVE LEADS";

export type LeadProductionMode = "demo" | "dry_run" | "live" | "needs_attention";

export type LeadProductionRequiredCheck = {
  key: string;
  label: string;
  status: "complete" | "warning" | "blocked";
  explanation: string;
  action: string;
};

export type LeadProductionReadinessInput = {
  enabled?: boolean;
  activeTradeTemplate?: boolean;
  businessInfoConfigured?: boolean;
  publicFormsEnabled?: boolean;
  activeLeadSources?: number;
  lastLeadReceivedAt?: Date | string | null;
  dryRun?: boolean;
  smsEnabled?: boolean;
  emailEnabled?: boolean;
  autoRespondEnabled?: boolean;
  followUpEnabled?: boolean;
  defaultSmsTemplate?: string | null;
  defaultEmailSubject?: string | null;
  defaultEmailTemplate?: string | null;
  smsComplianceFooter?: string | null;
  smsConfigured?: boolean;
  emailConfigured?: boolean;
  openAiConfiguredOrFallback?: boolean;
  fromPhoneConfigured?: boolean;
  fromEmailConfigured?: boolean;
  testSmsSent?: boolean;
  testEmailSent?: boolean;
  templatesReviewed?: boolean;
  demoDataPresent?: boolean;
};

export type LeadProductionReadiness = {
  canGoLive: boolean;
  currentMode: LeadProductionMode;
  blockers: string[];
  warnings: string[];
  completedChecks: string[];
  requiredChecks: LeadProductionRequiredCheck[];
  providerStatus: {
    smsConfigured: boolean;
    emailConfigured: boolean;
    openAiConfiguredOrFallback: boolean;
    fromPhoneConfigured: boolean;
    fromEmailConfigured: boolean;
  };
  leadSourceStatus: {
    publicFormsEnabled: boolean;
    activeLeadSources: number;
    lastLeadReceivedAt: Date | string | null;
  };
  messagingStatus: {
    dryRun: boolean;
    smsEnabled: boolean;
    emailEnabled: boolean;
    autoRespondEnabled: boolean;
    followUpEnabled: boolean;
    testSmsSent: boolean;
    testEmailSent: boolean;
  };
  complianceStatus: {
    smsConsentRequired: boolean;
    optOutCopyPresent: boolean;
    templatesReviewed: boolean;
  };
  lastUpdatedAt: string;
};

function hasText(value: string | null | undefined) {
  return !!value?.trim();
}

function check(
  key: string,
  label: string,
  complete: boolean,
  explanation: string,
  action: string,
  warning = false,
): LeadProductionRequiredCheck {
  return {
    key,
    label,
    status: complete ? "complete" : warning ? "warning" : "blocked",
    explanation,
    action,
  };
}

export function getLeadProductionReadiness(input: LeadProductionReadinessInput): LeadProductionReadiness {
  const smsEnabled = !!input.smsEnabled;
  const emailEnabled = !!input.emailEnabled;
  const dryRun = input.dryRun !== false;
  const optOutCopyPresent = hasText(input.smsComplianceFooter) && /stop|opt\s*out|unsubscribe/i.test(input.smsComplianceFooter || "");
  const smsTemplateReady = hasText(input.defaultSmsTemplate);
  const emailTemplateReady = hasText(input.defaultEmailSubject) && hasText(input.defaultEmailTemplate);
  const templatesReviewed = input.templatesReviewed ?? !!(smsTemplateReady && emailTemplateReady);
  const smsProviderReady = !!(input.smsConfigured && input.fromPhoneConfigured);
  const emailProviderReady = !!(input.emailConfigured && input.fromEmailConfigured);
  const activeLeadSources = Math.max(0, Number(input.activeLeadSources || 0));

  const requiredChecks = [
    check("module_enabled", "Lead Conversion Center enabled", input.enabled !== false, "The add-on must be available for this org before production use.", "Review module access."),
    check("trade_template", "Trade template selected", !!input.activeTradeTemplate, "Trade-specific scoring and service labels should be selected before launch.", "Choose trade template."),
    check("business_details", "Business details complete", !!input.businessInfoConfigured, "Customer-facing messages need recognizable business contact information.", "Update business details."),
    check("capture_form", "Lead capture form enabled", !!input.publicFormsEnabled, "At least one enabled form should be ready before public traffic is sent.", "Open lead form settings."),
    check("lead_source", "At least one lead source active", activeLeadSources > 0, "Website, manual, call, or source labels should feed the lead pipeline.", "Connect first lead source."),
    check("templates", "SMS/email templates reviewed", templatesReviewed, "Replies should be reviewed before any live message can be sent.", "Review templates."),
    check("followups", "Follow-up sequence reviewed", !!input.followUpEnabled, "Follow-up scheduling should be intentionally enabled or reviewed before launch.", "Review follow-up settings."),
    check("sms_provider", "SMS provider configured if SMS will be live", !smsEnabled || smsProviderReady, "Live SMS requires Twilio readiness and a from phone.", "Configure SMS provider."),
    check("email_provider", "Email provider configured if email will be live", !emailEnabled || emailProviderReady, "Live email requires SendGrid readiness and a from email.", "Configure email provider."),
    check("test_sms", "Test SMS sent if SMS live is desired", !smsEnabled || !!input.testSmsSent, "Send an explicit test SMS before enabling live SMS.", "Send test SMS.", smsEnabled),
    check("test_email", "Test email sent if email live is desired", !emailEnabled || !!input.testEmailSent, "Send an explicit test email before enabling live email.", "Send test email.", emailEnabled),
    check("sms_compliance", "SMS consent and opt-out reviewed", !smsEnabled || optOutCopyPresent, "Live SMS requires clear opt-out wording and consent-aware sending.", "Review SMS opt-out copy."),
    check("dry_run_reviewed", "Dry-run mode reviewed", true, "Dry-run is the default and should stay on until production activation is intentional.", "Review messaging mode."),
    check("live_confirmation", "Production mode explicitly confirmed", !dryRun, "Turning off dry-run requires the live activation confirmation phrase.", "Confirm live activation.", dryRun),
  ];

  const blockers = requiredChecks
    .filter((item) => item.status === "blocked")
    .map((item) => item.label);
  const warnings = requiredChecks
    .filter((item) => item.status === "warning")
    .map((item) => item.label);
  const completedChecks = requiredChecks
    .filter((item) => item.status === "complete")
    .map((item) => item.label);
  const canGoLive = blockers.length === 0 && (smsEnabled || emailEnabled);
  const currentMode: LeadProductionMode = blockers.length > 0 && !dryRun
    ? "needs_attention"
    : !dryRun && canGoLive
      ? "live"
      : input.demoDataPresent
        ? "demo"
        : "dry_run";

  return {
    canGoLive,
    currentMode,
    blockers,
    warnings,
    completedChecks,
    requiredChecks,
    providerStatus: {
      smsConfigured: !!input.smsConfigured,
      emailConfigured: !!input.emailConfigured,
      openAiConfiguredOrFallback: input.openAiConfiguredOrFallback !== false,
      fromPhoneConfigured: !!input.fromPhoneConfigured,
      fromEmailConfigured: !!input.fromEmailConfigured,
    },
    leadSourceStatus: {
      publicFormsEnabled: !!input.publicFormsEnabled,
      activeLeadSources,
      lastLeadReceivedAt: input.lastLeadReceivedAt || null,
    },
    messagingStatus: {
      dryRun,
      smsEnabled,
      emailEnabled,
      autoRespondEnabled: !!input.autoRespondEnabled,
      followUpEnabled: !!input.followUpEnabled,
      testSmsSent: !!input.testSmsSent,
      testEmailSent: !!input.testEmailSent,
    },
    complianceStatus: {
      smsConsentRequired: smsEnabled,
      optOutCopyPresent,
      templatesReviewed,
    },
    lastUpdatedAt: new Date().toISOString(),
  };
}
