import { test, expect } from "@playwright/test";

const stamp = Date.now();
const username = `e2e_${stamp}`;
const password = "Test12345!";
const orgName = `E2E Org ${stamp}`;

test("signup → org → customer → job → quote → invoice → paid", async ({ page }) => {
  // ── Sign up ─────────────────────────────────────────────────────────────
  await page.goto("/auth");
  await page.getByRole("tab", { name: /sign up|register/i }).click().catch(() => {});
  await page.getByTestId("input-username").fill(username);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("button-register").click();

  // ── Create org ──────────────────────────────────────────────────────────
  await page.waitForURL(/\/(orgs|dashboard|onboarding)/);
  const createOrg = page.getByTestId("button-create-org");
  if (await createOrg.isVisible().catch(() => false)) {
    await createOrg.click();
  }
  await page.getByTestId("input-org-name").fill(orgName);
  await page.getByTestId("button-submit-org").click();

  await page.waitForURL(/\/dashboard/);

  // ── Add customer ────────────────────────────────────────────────────────
  await page.goto("/customers");
  await page.getByTestId("button-add-customer").click();
  await page.getByTestId("input-customer-name").fill("Acme E2E");
  await page.getByTestId("input-customer-phone").fill("555-0100");
  await page.getByTestId("button-save-customer").click();
  await expect(page.getByText("Acme E2E").first()).toBeVisible();

  // ── Create job ──────────────────────────────────────────────────────────
  await page.goto("/jobs");
  await page.getByTestId("button-add-job").click();
  await page.getByTestId("input-job-title").fill("E2E Service Call");
  await page.getByTestId("button-save-job").click();
  await expect(page.getByText("E2E Service Call").first()).toBeVisible();

  // ── Create quote ────────────────────────────────────────────────────────
  await page.goto("/quotes");
  await page.getByTestId("button-add-quote").click();
  await page.getByTestId("input-quote-item-description-0").fill("Diagnostic");
  await page.getByTestId("input-quote-item-qty-0").fill("1");
  await page.getByTestId("input-quote-item-price-0").fill("150");
  await page.getByTestId("button-save-quote").click();

  // ── Convert to invoice ──────────────────────────────────────────────────
  await page.getByTestId("button-convert-to-invoice").first().click();

  // ── Mark invoice paid ───────────────────────────────────────────────────
  await page.goto("/invoices");
  await page.getByTestId("button-mark-paid").first().click();
  await expect(page.getByText(/paid/i).first()).toBeVisible();

  // ── Dashboard reflects update ───────────────────────────────────────────
  await page.goto("/dashboard");
  await expect(page.getByTestId("stat-revenue")).toBeVisible();
});
