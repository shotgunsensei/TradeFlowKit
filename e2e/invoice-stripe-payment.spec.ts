import { test, expect } from "@playwright/test";
import { registerAccount, createCustomer, createInvoice } from "./helpers";

test("public invoice pay page redirects to a Stripe Checkout URL when Pay Now is clicked", async ({ page }) => {
  const account = await registerAccount(page.request);
  const customer = await createCustomer(page.request, { email: "payer@example.com" });
  const invoice = await createInvoice(page.request, customer.id, { qty: 1, unitPrice: 199 });

  // Pretend the org has connected Stripe so the Pay button renders.
  // We do this by stubbing both the public invoice fetch and the payment-link endpoint —
  // we never need real Stripe creds for the UI to drive the flow.
  await page.route(`**/api/invoices/${invoice.id}/public`, async (route) => {
    const upstream = await route.fetch();
    const body = await upstream.json();
    body.org = {
      ...(body.org || {}),
      name: account.orgName,
      stripeConnectAccountId: "acct_test_e2e",
      stripeConnectOnboarded: true,
    };
    await route.fulfill({
      status: upstream.status(),
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  const fakeCheckoutUrl =
    "https://checkout.stripe.com/c/pay/cs_test_e2e_fake#fidkdWxOYHwnPyd1blpxYHZxWjA0";
  let paymentLinkCalls = 0;
  await page.route(`**/api/invoices/${invoice.id}/payment-link`, async (route) => {
    paymentLinkCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ url: fakeCheckoutUrl }),
    });
  });

  // Block any actual navigation to Stripe — record where the browser tried to go.
  let redirectedTo: string | null = null;
  await page.route("https://checkout.stripe.com/**", async (route) => {
    redirectedTo = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body>stub stripe checkout</body></html>",
    });
  });

  await page.goto(`/invoices/${invoice.id}/pay`);
  await expect(page.getByTestId("text-customer-name")).toContainText(customer.name);
  await expect(page.getByTestId("text-invoice-total")).toContainText("199.00");

  await page.getByTestId("button-pay-now").click();

  await expect.poll(() => redirectedTo, { timeout: 10_000 }).toContain("checkout.stripe.com");
  expect(paymentLinkCalls).toBe(1);
});

test("paid=true query parameter renders the success state", async ({ page }) => {
  await registerAccount(page.request);
  const customer = await createCustomer(page.request);
  const invoice = await createInvoice(page.request, customer.id, { qty: 1, unitPrice: 50 });

  await page.goto(`/invoices/${invoice.id}/pay?paid=true`);
  await expect(page.getByTestId("text-payment-success")).toBeVisible();
});

test("payment errors surface to the user", async ({ page }) => {
  const account = await registerAccount(page.request);
  const customer = await createCustomer(page.request);
  const invoice = await createInvoice(page.request, customer.id);

  await page.route(`**/api/invoices/${invoice.id}/public`, async (route) => {
    const upstream = await route.fetch();
    const body = await upstream.json();
    body.org = {
      ...(body.org || {}),
      name: account.orgName,
      stripeConnectAccountId: "acct_test_e2e",
      stripeConnectOnboarded: true,
    };
    await route.fulfill({
      status: upstream.status(),
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.route(`**/api/invoices/${invoice.id}/payment-link`, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Stripe unavailable" }),
    });
  });

  await page.goto(`/invoices/${invoice.id}/pay`);
  await page.getByTestId("button-pay-now").click();
  await expect(page.getByTestId("text-payment-error")).toContainText("Stripe unavailable");
});
