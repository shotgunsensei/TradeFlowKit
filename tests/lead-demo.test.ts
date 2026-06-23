import { describe, expect, it } from "vitest";
import { LEAD_DEMO_WALKTHROUGH_STEPS, LEAD_FIRST_RUN_CHECKLIST } from "@shared/leadDemo";

describe("Lead Conversion Center demo copy", () => {
  it("covers the six-step contractor lead journey", () => {
    expect(LEAD_DEMO_WALKTHROUGH_STEPS.map((step) => step.focus)).toEqual([
      "capture",
      "score",
      "hot",
      "followup",
      "message",
      "convert",
    ]);
    expect(LEAD_FIRST_RUN_CHECKLIST).toContain("Confirm dry-run/live mode");
  });

  it("keeps demo language contractor-friendly and secret-free", () => {
    const copy = JSON.stringify({
      steps: LEAD_DEMO_WALKTHROUGH_STEPS,
      checklist: LEAD_FIRST_RUN_CHECKLIST,
    }).toLowerCase();

    expect(copy).not.toMatch(/webhook processor|adapter payload|provider event|automation engine/);
    expect(copy).not.toMatch(/secret|api[_ -]?key|token|password/);
    expect(copy).toContain("dry-run");
    expect(copy).toContain("customers and jobs");
  });
});
