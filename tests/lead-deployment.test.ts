import { describe, expect, it } from "vitest";
import { LEAD_DEPLOYMENT_CHECKLIST, deploymentChecklistStatus } from "@shared/leadDeployment";

describe("lead deployment checklist", () => {
  it("keeps manual deployment steps informational while marking system-backed checks complete", () => {
    const status = deploymentChecklistStatus({
      activeTradeTemplate: true,
      businessInfoConfigured: true,
      publicFormsConfigured: true,
      leadSourcesConfigured: true,
      templatesReviewed: true,
      followUpEnabled: true,
      totalLeads: 1,
      productionCanGoLive: true,
      convertedCount: 1,
    });

    expect(status).toHaveLength(LEAD_DEPLOYMENT_CHECKLIST.length);
    expect(status.find((item) => item.key === "trade_template")?.complete).toBe(true);
    expect(status.find((item) => item.key === "production_readiness")?.complete).toBe(true);
    expect(status.find((item) => item.key === "discovery")?.complete).toBe(false);
    expect(status.find((item) => item.key === "handoff")?.complete).toBe(false);
  });

  it("uses contractor-facing labels without implementation jargon", () => {
    const serialized = JSON.stringify(LEAD_DEPLOYMENT_CHECKLIST);

    expect(serialized).toContain("Client handoff completed");
    expect(serialized).not.toMatch(/webhook|adapter payload|queue|provider event/i);
  });
});
