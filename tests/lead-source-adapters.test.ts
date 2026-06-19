import { describe, expect, it } from "vitest";
import { getLeadSourceAdapter, getPublicLeadSourceAdapters } from "../server/leadSourceAdapters";

describe("lead source adapters", () => {
  it("exposes safe public adapter metadata", () => {
    const adapters = getPublicLeadSourceAdapters();

    expect(adapters.map((adapter) => adapter.key)).toContain("genericJson");
    expect(adapters.map((adapter) => adapter.key)).toContain("websiteForm");
    expect(JSON.stringify(adapters)).not.toMatch(/secret|token|orgId/i);
  });

  it("normalizes a generic JSON webhook payload", () => {
    const adapter = getLeadSourceAdapter("genericJson");
    const normalized = adapter!.normalize({
      fullName: "Pat Customer",
      phoneNumber: "+15551234567",
      emailAddress: "pat@example.com",
      service: "No cooling",
      details: "AC is not cooling today.",
      smsConsent: "yes",
      campaignName: "Summer HVAC",
    });

    expect(normalized.name).toBe("Pat Customer");
    expect(normalized.phone).toBe("+15551234567");
    expect(normalized.email).toBe("pat@example.com");
    expect(normalized.serviceType).toBe("No cooling");
    expect(normalized.consentToSms).toBe(true);
    expect(normalized.metadata.campaignName).toBe("Summer HVAC");
  });

  it("normalizes website form payloads into website form source", () => {
    const adapter = getLeadSourceAdapter("websiteForm");
    const normalized = adapter!.normalize({
      name: "Website Lead",
      email: "lead@example.com",
      message: "Need a roof inspection.",
    });

    expect(normalized.source).toBe("website_form");
    expect(normalized.name).toBe("Website Lead");
    expect(normalized.description).toBe("Need a roof inspection.");
  });

  it("rejects malformed payloads", () => {
    const adapter = getLeadSourceAdapter("genericJson");

    expect(() => adapter!.normalize({ phone: "555-0100" })).toThrow(/Name is required/);
    expect(() => adapter!.normalize({ name: "No Contact" })).toThrow(/contact method/);
    expect(() => adapter!.normalize(null)).toThrow(/JSON object/);
  });
});
