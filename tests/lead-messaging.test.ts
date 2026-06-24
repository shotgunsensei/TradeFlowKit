import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createLeadActivity = vi.fn(async (_orgId: string, leadId: string, data: any) => ({
  id: `activity-${createLeadActivity.mock.calls.length}`,
  leadId,
  createdAt: new Date(),
  ...data,
}));
const getLeadActivities = vi.fn(async () => []);
const getLeadSettings = vi.fn();

vi.mock("../server/storage", () => ({
  storage: {
    createLeadActivity,
    getLeadActivities,
    getLeadSettings,
  },
}));

const lead = {
  id: "lead-1",
  name: "Pat Customer",
  phone: "+15551234567",
  email: "pat@example.com",
  serviceType: "No cooling",
  urgency: "normal",
  consentToSms: true,
} as any;

function settings(overrides: Record<string, unknown> = {}) {
  return {
    dryRun: true,
    smsEnabled: false,
    emailEnabled: false,
    defaultSmsTemplate: "Hi {name}",
    defaultEmailSubject: "Thanks {name}",
    defaultEmailTemplate: "Hi {name}",
    smsComplianceFooter: "Reply STOP to opt out.",
    ...overrides,
  };
}

describe("lead messaging guards", () => {
  let messaging: typeof import("../server/leadMessaging");
  let sendSMS: ReturnType<typeof vi.fn>;
  let sendEmail: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    createLeadActivity.mockClear();
    getLeadActivities.mockClear();
    getLeadSettings.mockReset();
    sendSMS = vi.fn(async () => true);
    sendEmail = vi.fn(async () => undefined);
    process.env.SENDGRID_API_KEY = "";
    process.env.SENDGRID_FROM_EMAIL = "";
    process.env.OPENAI_API_KEY = "sk-test-secret";
    messaging = await import("../server/leadMessaging");
    messaging.setLeadMessagingDepsForTests({
      sendSMS,
      sendEmail: sendEmail as any,
      isTwilioConfigured: async () => true,
      getTwilioPhoneNumber: async () => "+15557654321",
    });
  });

  afterEach(() => {
    messaging.resetLeadMessagingDepsForTests();
    delete process.env.OPENAI_API_KEY;
  });

  it("defaults to dry-run and never calls Twilio", async () => {
    getLeadSettings.mockResolvedValue(settings({ dryRun: true, smsEnabled: true }));

    const result = await messaging.sendLeadSms({
      orgId: "org-1",
      lead,
      template: "Hi {name}",
    });

    expect(result.mode).toBe("dry-run");
    expect(sendSMS).not.toHaveBeenCalled();
    expect(createLeadActivity).toHaveBeenCalledWith("org-1", "lead-1", expect.objectContaining({
      status: "dry_run",
      metadata: expect.objectContaining({ dryRun: true, mode: "dry-run" }),
    }));
  });

  it("blocks live SMS without provider configuration", async () => {
    getLeadSettings.mockResolvedValue(settings({ dryRun: false, smsEnabled: true }));
    messaging.setLeadMessagingDepsForTests({
      sendSMS,
      isTwilioConfigured: async () => false,
      getTwilioPhoneNumber: async () => undefined,
    });

    const result = await messaging.sendLeadSms({ orgId: "org-1", lead, template: "Hi {name}" });

    expect(result.mode).toBe("blocked");
    expect(result.reason).toBe("twilio_not_configured");
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it("blocks live SMS without SMS consent", async () => {
    getLeadSettings.mockResolvedValue(settings({ dryRun: false, smsEnabled: true }));

    const result = await messaging.sendLeadSms({
      orgId: "org-1",
      lead: { ...lead, consentToSms: false },
      template: "Hi {name}",
    });

    expect(result.mode).toBe("blocked");
    expect(result.reason).toBe("missing_sms_consent");
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it("blocks live SMS without org channel enablement", async () => {
    getLeadSettings.mockResolvedValue(settings({ dryRun: false, smsEnabled: false }));

    const result = await messaging.sendLeadSms({ orgId: "org-1", lead, template: "Hi {name}" });

    expect(result.mode).toBe("blocked");
    expect(result.reason).toBe("sms_not_enabled");
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it("requires explicit test message destination", async () => {
    getLeadSettings.mockResolvedValue(settings({ dryRun: false, smsEnabled: true }));

    const result = await messaging.sendLeadTestMessage({
      orgId: "org-1",
      channel: "sms",
      to: "",
      template: "Test",
    });

    expect(result.mode).toBe("blocked");
    expect(result.reason).toBe("missing_test_destination");
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it("allows explicitly requested test SMS while lead messaging is still dry-run", async () => {
    getLeadSettings.mockResolvedValue(settings({ dryRun: true, smsEnabled: true }));

    const result = await messaging.sendLeadTestMessage({
      orgId: "org-1",
      channel: "sms",
      to: "+15550001111",
      template: "This is a test. Reply STOP to opt out.",
    });

    expect(result.mode).toBe("live");
    expect(sendSMS).toHaveBeenCalledWith("+15550001111", "+15557654321", expect.stringContaining("Reply STOP"));
  });

  it("returns a safe result when an explicit provider test fails", async () => {
    getLeadSettings.mockResolvedValue(settings({ dryRun: true, smsEnabled: true }));
    sendSMS.mockRejectedValueOnce(new Error("test provider exposed internal detail"));

    const result = await messaging.sendLeadTestMessage({
      orgId: "org-1",
      channel: "sms",
      to: "+15550001111",
      template: "This is a test. Reply STOP to opt out.",
    });

    expect(result).toEqual({ ok: false, mode: "error", reason: "provider_error" });
    expect(JSON.stringify(result)).not.toContain("internal detail");
  });

  it("keeps dry-run email from calling SendGrid", async () => {
    getLeadSettings.mockResolvedValue(settings({ dryRun: true, emailEnabled: true }));

    const result = await messaging.sendLeadEmail({
      orgId: "org-1",
      lead,
      subject: "Hello {name}",
      template: "Hi {name}",
    });

    expect(result.mode).toBe("dry-run");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("logs safe SMS provider errors without exposing provider details", async () => {
    getLeadSettings.mockResolvedValue(settings({ dryRun: false, smsEnabled: true }));
    sendSMS.mockRejectedValueOnce(new Error("provider exploded with credential detail"));

    const result = await messaging.sendLeadSms({
      orgId: "org-1",
      lead,
      template: "Hi {name}",
    });

    expect(result.mode).toBe("error");
    expect(result.activity.error).toBe("SMS provider request failed.");
    expect(JSON.stringify(result.activity)).not.toContain("credential detail");
  });

  it("logs safe email provider errors without exposing provider details", async () => {
    process.env.SENDGRID_API_KEY = "sendgrid-secret";
    process.env.SENDGRID_FROM_EMAIL = "from@example.com";
    getLeadSettings.mockResolvedValue(settings({ dryRun: false, emailEnabled: true }));
    sendEmail.mockRejectedValueOnce(new Error("provider exploded with credential detail"));

    const result = await messaging.sendLeadEmail({
      orgId: "org-1",
      lead,
      subject: "Hello {name}",
      template: "Hi {name}",
    });

    expect(result.mode).toBe("error");
    expect(result.activity.error).toBe("Email provider request failed.");
    expect(JSON.stringify(result.activity)).not.toContain("credential detail");
  });

  it("provider status exposes readiness without secrets", async () => {
    process.env.SENDGRID_API_KEY = "sendgrid-secret";
    process.env.SENDGRID_FROM_EMAIL = "from@example.com";

    const status = await messaging.getLeadMessagingProviderStatus();
    const serialized = JSON.stringify(status);

    expect(status.twilioConfigured).toBe(true);
    expect(status.sendgridConfigured).toBe(true);
    expect(serialized).not.toContain("sendgrid-secret");
    expect(serialized).not.toContain("sk-test-secret");
  });
});
