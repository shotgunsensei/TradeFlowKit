import { test, expect } from "@playwright/test";
import { registerAccount } from "./helpers";

test.describe("Lead Conversion Center smoke", () => {
  test.skip(!process.env.DATABASE_URL, "DATABASE_URL is required for DB-backed Lead Center browser smoke.");

  test("dashboard to lead detail to dry-run messages to conversion", async ({ page }, testInfo) => {
    const account = await registerAccount(page.request);

    await page.goto("/dashboard");
    await expect(page.getByText("Lead Conversion")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("dashboard-lead-widget.png"), fullPage: true });
    await page.locator('a[href="/leads"]').first().click();

    await expect(page).toHaveURL(/\/leads/);
    await expect(page.getByText("Lead Conversion Center").first()).toBeVisible();
    await expect(page.getByText("Hot Leads")).toBeVisible();
    await expect(page.getByTestId("lead-operating-mode")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("lead-operator-dashboard.png"), fullPage: true });

    await page.getByTestId("button-create-lead").click();
    await expect(page.getByRole("dialog", { name: "New Lead" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("new-lead-dialog.png"), fullPage: true });
    await page.getByTestId("input-lead-name").fill(`E2E Lead ${Date.now()}`);
    await page.getByTestId("input-lead-phone").fill("555-212-0100");
    await page.getByTestId("input-lead-email").fill(`${account.username}.lead@example.com`);
    await page.getByTestId("input-lead-service").fill("Emergency HVAC no cooling");
    await page.getByTestId("input-lead-description").fill("No cooling and needs same-day service. This should score as a hot lead.");
    await page.getByTestId("button-save-lead").click();

    await expect(page.getByText("Lead created")).toBeVisible();
    await expect(page.getByText(/E2E Lead/).first()).toBeVisible();
    await expect(page.getByText("Lead Details")).toBeVisible();
    await expect(page.getByText("Response status")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("lead-detail-created.png"), fullPage: true });

    await page.getByRole("button", { name: /Re-score/i }).click();
    await expect(page.getByText(/Lead activity recorded|Lead score refreshed|Score changed/i).first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /Prepare SMS/i }).click();
    await expect(page.getByText("Dry-run SMS logged")).toBeVisible();
    await expect(page.getByText(/SMS prepared|Dry-run SMS/i).first()).toBeVisible();

    await page.getByRole("button", { name: /Prepare Email/i }).click();
    await expect(page.getByText("Dry-run email logged")).toBeVisible();
    await expect(page.getByText(/Email prepared|Following up/i).first()).toBeVisible();

    await page.getByRole("button", { name: /Convert to Job/i }).first().click();
    await expect(page.getByText("Lead converted")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Customer\/job created|Customer and job created/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Open Customer/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Open Job/i })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("lead-detail-converted.png"), fullPage: true });

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /Lead Settings and Readiness/i })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("lead-settings-readiness.png"), fullPage: true });
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Performance", exact: true }).click();
    await expect(page.getByTestId("lead-performance-report")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("lead-performance-report.png"), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/leads");
    await expect(page.getByTestId("lead-operating-mode")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("lead-mobile-dashboard.png"), fullPage: true });

    await page.getByText(/E2E Lead/).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("lead-mobile-detail.png"), fullPage: true });
  });
});
