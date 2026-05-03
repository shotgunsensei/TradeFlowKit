import { test, expect } from "@playwright/test";
import { registerAccount, createCustomer, createQuote } from "./helpers";

test("converting an accepted quote to an invoice navigates to the new invoice", async ({ page }) => {
  await registerAccount(page.request);
  const customer = await createCustomer(page.request);
  const quote = await createQuote(page.request, customer.id, { description: "Install service", qty: 1, unitPrice: 250 });

  // Mark the quote as accepted via the API for a clean starting state.
  const patchRes = await page.request.patch(`/api/quotes/${quote.id}`, { data: { status: "accepted" } });
  expect(patchRes.ok()).toBe(true);

  await page.goto(`/quotes/${quote.id}`);
  await expect(page.getByTestId("button-convert-to-invoice")).toBeVisible();

  await page.getByTestId("button-convert-to-invoice").click();

  // Should navigate to the new invoice detail page.
  await page.waitForURL(/\/invoices\/[a-f0-9-]+$/i, { timeout: 15_000 });

  // Confirm we landed on an invoice and that the line item was carried over.
  await expect(page.getByTestId("select-invoice-status")).toBeVisible();
  await expect(page.getByText("Install service").first()).toBeVisible();

  // The new invoice should show up in the listing.
  await page.goto("/invoices");
  await expect(page.getByText(customer.name).first()).toBeVisible();
});

test("declined quotes hide the convert-to-invoice action", async ({ page }) => {
  await registerAccount(page.request);
  const customer = await createCustomer(page.request);
  const quote = await createQuote(page.request, customer.id);

  await page.request.patch(`/api/quotes/${quote.id}`, { data: { status: "declined" } });

  await page.goto(`/quotes/${quote.id}`);
  await expect(page.getByTestId("button-convert-to-invoice")).toHaveCount(0);
});
