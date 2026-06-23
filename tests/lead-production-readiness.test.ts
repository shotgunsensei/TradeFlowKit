import { describe, expect, it } from "vitest";
import {
  LIVE_LEADS_CONFIRMATION_PHRASE,
  getLeadProductionReadiness,
} from "@shared/leadProductionReadiness";

describe("lead production readiness", () => {
  it("allows dry-run without provider configuration", () => {
    const readiness = getLeadProductionReadiness({
      enabled: true,
      dryRun: true,
      smsEnabled: false,
      emailEnabled: false,
      publicFormsEnabled: true,
      activeLeadSources: 1,
    });

    expect(readiness.messagingStatus.dryRun).toBe(true);
    expect(readiness.providerStatus.smsConfigured).toBe(false);
    expect(readiness.currentMode).toBe("dry_run");
  });

  it("blocks live SMS when provider readiness is missing", () => {
    const readiness = getLeadProductionReadiness({
      enabled: true,
      activeTradeTemplate: true,
      businessInfoConfigured: true,
      publicFormsEnabled: true,
      activeLeadSources: 1,
      dryRun: false,
      smsEnabled: true,
      followUpEnabled: true,
      defaultSmsTemplate: "Hi {name}",
      defaultEmailSubject: "Thanks",
      defaultEmailTemplate: "Hi",
      smsComplianceFooter: "Reply STOP to opt out.",
      smsConfigured: false,
      fromPhoneConfigured: false,
      testSmsSent: true,
    });

    expect(readiness.canGoLive).toBe(false);
    expect(readiness.currentMode).toBe("needs_attention");
    expect(readiness.blockers).toContain("SMS provider configured if SMS will be live");
  });

  it("blocks live SMS when opt-out wording is missing", () => {
    const readiness = getLeadProductionReadiness({
      enabled: true,
      activeTradeTemplate: true,
      businessInfoConfigured: true,
      publicFormsEnabled: true,
      activeLeadSources: 1,
      dryRun: false,
      smsEnabled: true,
      followUpEnabled: true,
      defaultSmsTemplate: "Hi {name}",
      defaultEmailSubject: "Thanks",
      defaultEmailTemplate: "Hi",
      smsComplianceFooter: "Thanks",
      smsConfigured: true,
      fromPhoneConfigured: true,
      testSmsSent: true,
    });

    expect(readiness.canGoLive).toBe(false);
    expect(readiness.complianceStatus.optOutCopyPresent).toBe(false);
    expect(readiness.blockers).toContain("SMS consent and opt-out reviewed");
  });

  it("allows live mode only after setup, provider, test, and confirmation checks pass", () => {
    const readiness = getLeadProductionReadiness({
      enabled: true,
      activeTradeTemplate: true,
      businessInfoConfigured: true,
      publicFormsEnabled: true,
      activeLeadSources: 1,
      dryRun: false,
      smsEnabled: true,
      emailEnabled: true,
      autoRespondEnabled: true,
      followUpEnabled: true,
      defaultSmsTemplate: "Hi {name}",
      defaultEmailSubject: "Thanks",
      defaultEmailTemplate: "Hi",
      smsComplianceFooter: "Reply STOP to opt out.",
      smsConfigured: true,
      emailConfigured: true,
      fromPhoneConfigured: true,
      fromEmailConfigured: true,
      testSmsSent: true,
      testEmailSent: true,
    });

    expect(LIVE_LEADS_CONFIRMATION_PHRASE).toBe("ENABLE LIVE LEADS");
    expect(readiness.canGoLive).toBe(true);
    expect(readiness.currentMode).toBe("live");
    expect(readiness.blockers).toEqual([]);
  });

  it("does not expose secret-shaped provider values", () => {
    const readiness = getLeadProductionReadiness({
      smsConfigured: true,
      emailConfigured: true,
      openAiConfiguredOrFallback: true,
      fromPhoneConfigured: true,
      fromEmailConfigured: true,
    });
    const serialized = JSON.stringify(readiness);

    expect(serialized).not.toMatch(/api[_-]?key|secret|token|password/i);
  });
});
