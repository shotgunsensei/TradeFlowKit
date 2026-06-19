import { describe, expect, it } from "vitest";
import { scoreLead } from "../server/leadScoring";
import { LEAD_TRADE_TEMPLATES } from "../shared/leadTradeTemplates";

describe("lead scoring", () => {
  it("scores emergency high-intent leads as hot", () => {
    const result = scoreLead({
      name: "Pat Customer",
      phone: "555-111-2222",
      email: "pat@example.com",
      address: "123 Main St",
      serviceType: "Roof leak repair",
      description: "Emergency roof leak today, water coming in.",
      urgency: "normal",
    });

    expect(result.urgency).toBe("emergency");
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.recommendedAction).toMatch(/immediately/i);
  });

  it("penalizes vague leads without phone or service details", () => {
    const result = scoreLead({
      name: "Unknown",
      email: "",
      description: "",
      urgency: "normal",
    });

    expect(result.score).toBeLessThan(35);
    expect(result.breakdown.phoneMissing).toBe(-15);
  });

  it("penalizes obvious spam signals", () => {
    const result = scoreLead({
      name: "SEO Vendor",
      phone: "555-111-2222",
      serviceType: "Backlink package",
      description: "We sell crypto casino SEO backlinks",
    });

    expect(result.score).toBeLessThan(40);
    expect(result.breakdown.spamSignals).toBe(-45);
  });

  it("returns all target trade templates", () => {
    expect(LEAD_TRADE_TEMPLATES.map((template) => template.tradeKey)).toEqual([
      "hvac",
      "electrical",
      "plumbing",
      "roofing",
      "landscaping",
      "general_contractor",
      "it_field_service",
    ]);
  });

  it("boosts HVAC no-cooling emergencies with trade-specific scoring", () => {
    const result = scoreLead({
      name: "HVAC Customer",
      phone: "555-111-2222",
      serviceType: "No cooling",
      description: "No cooling today and the system is not keeping up.",
      urgency: "normal",
    }, { tradeTemplateKey: "hvac" });

    expect(result.urgency).toBe("emergency");
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.breakdown.tradeTemplate).toBe("hvac");
    expect(result.breakdown.tradeUrgencyKeyword).toBe(14);
  });

  it("scores electrical panel upgrades as high-value trade leads", () => {
    const result = scoreLead({
      name: "Electrical Customer",
      phone: "555-222-3333",
      email: "electric@example.com",
      serviceType: "Panel upgrade",
      description: "Need a 200 amp panel upgrade for an EV charger.",
    }, { tradeTemplateKey: "electrical" });

    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.breakdown.tradeHighValueKeyword).toBe(12);
  });

  it("treats plumbing leaks as urgent with the plumbing template", () => {
    const result = scoreLead({
      name: "Plumbing Customer",
      phone: "555-333-4444",
      serviceType: "Leak",
      description: "Leak under sink and water is still running.",
    }, { tradeTemplateKey: "plumbing" });

    expect(result.urgency).toBe("emergency");
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.breakdown.tradeTemplate).toBe("plumbing");
  });
});
