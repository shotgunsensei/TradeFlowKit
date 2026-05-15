import { test, expect, type Page } from "@playwright/test";
import { registerAccount, type TestAccount } from "./helpers";

/**
 * Coverage for the refactored Settings page (split into per-tab files
 * under client/src/pages/settings/) and the Call Recovery page
 * (split into upgrade vs dashboard views under
 * client/src/components/call-recovery/).
 *
 * These tests start a fresh account per test (via registerAccount, which
 * uses page.request and shares cookies with the page), and do not depend
 * on Stripe / Twilio / SendGrid network calls — third-party endpoints are
 * stubbed via page.route where required.
 */

async function gotoSettings(page: Page, tab: string) {
  await page.goto(`/settings?tab=${tab}`);
  await expect(page.getByTestId(`tab-${tab}`)).toBeVisible();
}

test.describe("Settings page tabs (free plan)", () => {
  let acct: TestAccount;

  test.beforeEach(async ({ page }) => {
    acct = await registerAccount(page.request);
  });

  test("profile tab loads and saves profile changes", async ({ page }) => {
    await gotoSettings(page, "profile");

    const nameInput = page.getByTestId("input-settings-name");
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Updated Name");
    await page.getByTestId("input-settings-email").fill("updated@example.com");

    let saveCalls = 0;
    await page.route("**/api/auth/profile", async (route) => {
      if (route.request().method() === "PATCH") {
        saveCalls += 1;
        const body = route.request().postDataJSON();
        expect(body.fullName).toBe("Updated Name");
        expect(body.email).toBe("updated@example.com");
      }
      await route.continue();
    });

    await page.getByTestId("button-save-profile").click();
    await expect.poll(() => saveCalls).toBeGreaterThan(0);
  });

  test("organization tab loads and saves org changes", async ({ page }) => {
    await gotoSettings(page, "org");

    const orgName = page.getByTestId("input-settings-org-name");
    await expect(orgName).toBeVisible();
    await orgName.fill("Renamed Org");

    let patchCalls = 0;
    await page.route(`**/api/orgs/${acct.orgId}`, async (route) => {
      if (route.request().method() === "PATCH") {
        patchCalls += 1;
      }
      await route.continue();
    });

    await page.getByTestId("button-save-org").click();
    await expect.poll(() => patchCalls).toBeGreaterThan(0);
  });

  test("team tab lists current member and can create an invite code", async ({ page }) => {
    await gotoSettings(page, "team");

    // Owner row should appear (registered user is owner).
    await expect(page.getByTestId(`row-member-${acct.userId}`)).toBeVisible();

    // Create an invite code via the form. The default role is "tech".
    await page.getByTestId("button-create-invite").click();

    // After creation, the invite codes list should show at least one
    // copy button. We don't know the id ahead of time, so use a partial
    // selector.
    await expect(page.locator('[data-testid^="button-copy-code-"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test("automations tab on free plan shows upgrade CTAs for SMS reminders and reviews", async ({ page }) => {
    await gotoSettings(page, "automations");
    await expect(page.getByTestId("button-upgrade-for-automations")).toBeVisible();
    await expect(page.getByTestId("button-upgrade-automations")).toBeVisible();
    // Reminder switches and review controls should NOT be present.
    await expect(page.getByTestId("switch-invoice-reminder")).toHaveCount(0);
    await expect(page.getByTestId("switch-review-enabled")).toHaveCount(0);
  });

  test("automations tab on small_business plan shows toggles and saves settings", async ({ page }) => {
    // Stub plan-info so the tab renders the unlocked variant.
    await page.route("**/api/plan-info", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plan: "small_business",
          limits: { customers: -1, jobs: -1, quotes: -1, invoices: -1, teamMembers: 5, canInvite: true },
          counts: { customers: 0, jobs: 0, quotes: 0, invoices: 0, members: 1 },
          subscriptionStatus: "active",
        }),
      });
    });
    await page.route("**/api/automations", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            invoiceReminder: false,
            invoiceReminderDays: [3, 7, 14],
            quoteFollowUp: false,
            quoteFollowUpDays: [3, 5, 7],
          }),
        });
        return;
      }
      await route.continue();
    });

    let postBody: unknown = null;
    await page.route("**/api/automations", async (route) => {
      if (route.request().method() === "POST") {
        postBody = route.request().postDataJSON();
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
        return;
      }
      await route.fallback();
    });

    await gotoSettings(page, "automations");

    const invoiceSwitch = page.getByTestId("switch-invoice-reminder");
    await expect(invoiceSwitch).toBeVisible();
    await invoiceSwitch.click();
    await page.getByTestId("button-save-automations").first().click();

    await expect.poll(() => postBody).not.toBeNull();
  });

  test("billing tab shows plan badge and usage list", async ({ page }) => {
    await gotoSettings(page, "billing");
    await expect(page.getByTestId("card-billing")).toBeVisible();
    await expect(page.getByTestId("badge-plan")).toBeVisible();
    await expect(page.getByTestId("usage-list")).toBeVisible();
    await expect(page.getByTestId("button-change-plan")).toBeVisible();
  });

  test("payments tab on free plan shows upgrade CTA", async ({ page }) => {
    await gotoSettings(page, "payments");
    await expect(page.getByTestId("button-upgrade-for-payments")).toBeVisible();
    await expect(page.getByTestId("button-connect-stripe")).toHaveCount(0);
  });

  test("payments tab on individual plan shows Connect Stripe and triggers connect flow", async ({ page }) => {
    await page.route("**/api/plan-info", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plan: "individual",
          limits: { customers: -1, jobs: -1, quotes: -1, invoices: -1, teamMembers: 1, canInvite: false },
          counts: { customers: 0, jobs: 0, quotes: 0, invoices: 0, members: 1 },
          subscriptionStatus: "active",
        }),
      });
    });

    let connectHit = 0;
    await page.route("**/api/stripe/connect/authorize", async (route) => {
      connectHit += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "/settings?tab=payments&stub=1" }),
      });
    });

    await gotoSettings(page, "payments");
    const connectBtn = page.getByTestId("button-connect-stripe");
    await expect(connectBtn).toBeVisible();
    await connectBtn.click();
    await expect.poll(() => connectHit).toBeGreaterThan(0);
  });

  test("security tab change-password validates mismatched passwords and submits valid input", async ({ page }) => {
    await gotoSettings(page, "security");

    await page.getByTestId("input-current-password").fill(acct.password);
    await page.getByTestId("input-new-password").fill("NewPass123!");
    await page.getByTestId("input-confirm-password").fill("Different123!");
    await page.getByTestId("button-change-password").click();
    await expect(page.getByTestId("error-confirm-password")).toBeVisible();

    // Now actually change the password (real backend call).
    await page.getByTestId("input-current-password").fill(acct.password);
    await page.getByTestId("input-new-password").fill("NewPass123!");
    await page.getByTestId("input-confirm-password").fill("NewPass123!");

    let changeCalls = 0;
    await page.route("**/api/auth/change-password", async (route) => {
      changeCalls += 1;
      await route.continue();
    });

    await page.getByTestId("button-change-password").click();
    await expect.poll(() => changeCalls).toBeGreaterThan(0);
  });

  test("integrations tab on free plan shows exports lock", async ({ page }) => {
    await gotoSettings(page, "integrations");
    await expect(page.getByTestId("exports-locked")).toBeVisible();
    await expect(page.getByTestId("button-upgrade-for-exports")).toBeVisible();
    await expect(page.getByTestId("exports-panel")).toHaveCount(0);
  });

  test("integrations tab on small_business plan unlocks export buttons", async ({ page }) => {
    await page.route("**/api/plan-info", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plan: "small_business",
          limits: { customers: -1, jobs: -1, quotes: -1, invoices: -1, teamMembers: 5, canInvite: true },
          counts: { customers: 0, jobs: 0, quotes: 0, invoices: 0, members: 1 },
          subscriptionStatus: "active",
        }),
      });
    });
    await gotoSettings(page, "integrations");
    await expect(page.getByTestId("exports-panel")).toBeVisible();
    await expect(page.getByTestId("button-export-quickbooks")).toBeVisible();
    await expect(page.getByTestId("button-export-xero-customers")).toBeVisible();
  });

  test("audit tab on non-enterprise plan is locked", async ({ page }) => {
    await gotoSettings(page, "audit");
    await expect(page.getByTestId("audit-locked")).toBeVisible();
    await expect(page.getByTestId("button-upgrade-for-audit")).toBeVisible();
  });

  test("audit tab on enterprise plan renders the audit table area", async ({ page }) => {
    await page.route("**/api/plan-info", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plan: "enterprise",
          limits: { customers: -1, jobs: -1, quotes: -1, invoices: -1, teamMembers: -1, canInvite: true },
          counts: { customers: 0, jobs: 0, quotes: 0, invoices: 0, members: 1 },
          subscriptionStatus: "active",
        }),
      });
    });
    await page.route("**/api/audit-log*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });
    await gotoSettings(page, "audit");
    await expect(page.getByTestId("audit-locked")).toHaveCount(0);
    await expect(page.getByTestId("text-audit-empty")).toBeVisible();
  });
});

test.describe("Call Recovery page", () => {
  test.beforeEach(async ({ page }) => {
    await registerAccount(page.request);
  });

  test("users without a Call Recovery subscription see the Upgrade view with all plan cards", async ({ page }) => {
    // Stub the Stripe-products listing so the page doesn't depend on
    // Stripe-FDW being seeded.
    await page.route("**/api/call-recovery/plans", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.goto("/call-recovery");

    await expect(page.getByTestId("card-cr-plan-starter")).toBeVisible();
    await expect(page.getByTestId("card-cr-plan-growth")).toBeVisible();
    await expect(page.getByTestId("card-cr-plan-pro")).toBeVisible();

    // Subscribe buttons should be present (and disabled by missing plan,
    // but the user should not see the dashboard tabs).
    await expect(page.getByTestId("button-cr-subscribe-starter")).toBeVisible();
    await expect(page.getByTestId("tabs-cr")).toHaveCount(0);
  });

  test("users with an active subscription see the Dashboard view with tabs", async ({ page }) => {
    // Stub the subscription endpoint to return an active plan.
    await page.route("**/api/call-recovery/subscription", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plan: "growth",
          status: "active",
          phone: "+15555550123",
          limits: {
            includedCalls: 100,
            overagePricePerCall: 50,
            analytics: true,
            customAiPrompt: true,
          },
          usage: 7,
          stripeSubscriptionId: "sub_stub",
          subscription: {
            id: "sub_stub_id",
            currentPeriodStart: new Date().toISOString(),
            currentPeriodEnd: new Date(Date.now() + 30 * 86400_000).toISOString(),
          },
          periodStart: new Date().toISOString(),
          periodEnd: new Date(Date.now() + 30 * 86400_000).toISOString(),
        }),
      });
    });
    await page.route("**/api/call-recovery/stats", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          totalMissed: 0,
          recovered: 0,
          contacted: 0,
          responded: 0,
          recoveryRate: 0,
          monthOverMonth: 0,
        }),
      });
    });
    await page.route("**/api/call-recovery/missed-calls*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });
    await page.route("**/api/call-recovery/settings", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          autoResponseEnabled: true,
          customMessageTemplate: null,
          quietHoursStart: null,
          quietHoursEnd: null,
        }),
      });
    });

    await page.goto("/call-recovery");

    // Dashboard chrome (plan card + tabs) should render.
    await expect(page.getByTestId("card-cr-plan")).toBeVisible();
    await expect(page.getByTestId("tabs-cr")).toBeVisible();
    await expect(page.getByTestId("tab-missed-calls")).toBeVisible();
    await expect(page.getByTestId("tab-setup")).toBeVisible();
    await expect(page.getByTestId("tab-admin-settings")).toBeVisible();

    // Switching tabs should reveal each tab's content.
    await page.getByTestId("tab-setup").click();
    await expect(page.getByTestId("card-cr-setup")).toBeVisible();

    await page.getByTestId("tab-admin-settings").click();
    await expect(page.getByTestId("card-cr-auto-response")).toBeVisible();
    await expect(page.getByTestId("card-cr-custom-message")).toBeVisible();

    // The upgrade plan cards must NOT appear in the dashboard view.
    await expect(page.getByTestId("card-cr-plan-starter")).toHaveCount(0);
  });
});
