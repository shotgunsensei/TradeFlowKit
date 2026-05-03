import { test, expect } from "@playwright/test";
import { registerAccount, createCustomer, createQuote, createInvoice } from "./helpers";

test("public quote view renders for a valid token and rejects an invalid one", async ({ browser, page }) => {
  const account = await registerAccount(page.request);
  const customer = await createCustomer(page.request);
  const quote = await createQuote(page.request, customer.id, { description: "Plumbing diagnosis", qty: 1, unitPrice: 175 });

  // Public view should be reachable WITHOUT a session — open a clean browser context.
  const anonContext = await browser.newContext();
  const anonPage = await anonContext.newPage();

  // Missing/invalid token should NOT render the document.
  await anonPage.goto(`/quotes/${quote.id}/view?token=not-the-real-token`);
  await expect(anonPage.getByTestId("quote-document")).toHaveCount(0);
  await expect(anonPage.getByText(/invalid|expired/i).first()).toBeVisible();

  // With the real token, the public document renders with the line item and total.
  await anonPage.goto(`/quotes/${quote.id}/view?token=${quote.publicToken}`);
  await expect(anonPage.getByTestId("quote-document")).toBeVisible();
  await expect(anonPage.getByText("Plumbing diagnosis")).toBeVisible();
  await expect(anonPage.getByText("$175.00").first()).toBeVisible();
  await expect(anonPage.getByText(account.orgName).first()).toBeVisible();

  await anonContext.close();
});

test("public invoice pay page renders details without a session", async ({ browser, page }) => {
  const account = await registerAccount(page.request);
  const customer = await createCustomer(page.request, { name: "Public Buyer Co." });
  const invoice = await createInvoice(page.request, customer.id, { description: "Service call", qty: 3, unitPrice: 75 });

  const anonContext = await browser.newContext();
  const anonPage = await anonContext.newPage();

  await anonPage.goto(`/invoices/${invoice.id}/pay`);
  await expect(anonPage.getByTestId("text-org-name")).toContainText(account.orgName);
  await expect(anonPage.getByTestId("text-customer-name")).toContainText("Public Buyer Co.");
  await expect(anonPage.getByTestId("text-invoice-total")).toContainText("225.00"); // 3 * 75
  await expect(anonPage.getByTestId("badge-invoice-status")).toBeVisible();

  await anonContext.close();
});

test("paid invoices show the success state on the public pay page", async ({ browser, page }) => {
  await registerAccount(page.request);
  const customer = await createCustomer(page.request);
  const invoice = await createInvoice(page.request, customer.id, { qty: 1, unitPrice: 42 });

  // Mark the invoice as paid via the authenticated API.
  const patchRes = await page.request.patch(`/api/invoices/${invoice.id}`, { data: { status: "paid" } });
  expect(patchRes.ok()).toBe(true);

  const anonContext = await browser.newContext();
  const anonPage = await anonContext.newPage();
  await anonPage.goto(`/invoices/${invoice.id}/pay`);
  await expect(anonPage.getByTestId("text-payment-success")).toBeVisible();
  await anonContext.close();
});
