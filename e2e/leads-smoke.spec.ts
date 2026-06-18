import { test, expect } from "@playwright/test";
import { registerAccount } from "./helpers";

test.describe("Lead Conversion Center smoke", () => {
  test.skip(!process.env.DATABASE_URL, "DATABASE_URL is required for DB-backed Lead Center browser smoke.");

  test("dashboard to lead detail to dry-run messages to conversion", async ({ page }, testInfo) => {
    const account = await registerAccount(page.request);

    await page.goto("/dashboard");
    await expect(page.getByText("Lead Conversion")).toBeVisible();
    await page.locator('a[href="/leads"]').first().click();

    await expect(page).toHaveURL(/\/leads/);
    await expect(page.getByText("Lead Conversion Center").first()).toBeVisible();
    await expect(page.getByText("Hot Leads")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("lead-operator-dashboard.png"), fullPage: true });

    await page.getByTestId("button-create-lead").click();
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

    await page.getByRole("button", { name: /Dry-run SMS/i }).click();
    await expect(page.getByText("Dry-run SMS logged")).toBeVisible();
    await expect(page.getByText(/SMS prepared|Dry-run SMS/i).first()).toBeVisible();

    await page.getByRole("button", { name: /Dry-run Email/i }).click();
    await expect(page.getByText("Dry-run email logged")).toBeVisible();
    await expect(page.getByText(/Email prepared|Following up/i).first()).toBeVisible();

    await page.getByRole("button", { name: /^Convert$/i }).click();
    await expect(page.getByText("Lead converted")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Customer\/job created|Customer and job created/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Open Customer/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Open Job/i })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("lead-detail-converted.png"), fullPage: true });
  });
});
