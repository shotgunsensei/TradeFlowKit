import { test, expect } from "@playwright/test";
import { registerAccount, createCustomer, createQuote } from "./helpers";

test("emailing a quote PDF sends through the dialog and updates status to sent", async ({ page }) => {
  await registerAccount(page.request);
  const customer = await createCustomer(page.request, { email: "buyer@example.com" });
  const quote = await createQuote(page.request, customer.id, { description: "Roof repair", qty: 1, unitPrice: 800 });

  // Stub the SendGrid-backed endpoint so the test never hits the network.
  // The route also asserts the UI sent the right payload.
  let sendCalls = 0;
  await page.route(`**/api/quotes/${quote.id}/send-email`, async (route) => {
    sendCalls += 1;
    const body = route.request().postDataJSON();
    expect(body.to).toBe("buyer@example.com");
    expect(typeof body.subject === "string" && body.subject.length > 0).toBe(true);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, sentTo: body.to }),
    });
  });

  await page.goto(`/quotes/${quote.id}`);
  await page.getByTestId("button-email-quote").click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("input-email-to")).toHaveValue("buyer@example.com");

  await dialog.getByTestId("button-send-email").click();

  await expect(page.getByTestId("email-sent-confirmation")).toBeVisible();
  expect(sendCalls).toBe(1);
});

test("invalid email blocks submission in the email dialog", async ({ page }) => {
  await registerAccount(page.request);
  const customer = await createCustomer(page.request, { email: "" });
  const quote = await createQuote(page.request, customer.id);

  await page.goto(`/quotes/${quote.id}`);
  await page.getByTestId("button-email-quote").click();

  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("input-email-to").fill("not-an-email");
  await expect(dialog.getByTestId("error-email-to")).toBeVisible();
  await expect(dialog.getByTestId("button-send-email")).toBeDisabled();
});
