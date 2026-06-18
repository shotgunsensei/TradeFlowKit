import { describe, expect, it } from "vitest";
import { scoreLead } from "../server/leadScoring";

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
});
