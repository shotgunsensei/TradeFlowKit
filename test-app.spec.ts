import { test, expect } from '@playwright/test';

test.describe('Quick Test', () => {
  test('login and verify customer details', async ({ page }) => {
    // Log console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Login
    await page.goto('http://localhost:5000/');
    await page.fill('input[name="username"]', 'demo');
    await page.fill('input[name="password"]', 'demo123');
    await page.click('button[type="submit"]');
    
    // Go to customers
    await page.waitForURL('**/dashboard');
    await page.goto('http://localhost:5000/customers');
    
    // Click first customer
    await page.waitForSelector('table');
    await page.click('table tbody tr:first-child');
    
    // Verify "Activity" tab is default and timeline renders
    await page.waitForURL('**/customers/*');
    const activityTab = page.locator('[data-testid="tab-customer-activity"]');
    await expect(activityTab).toHaveAttribute('data-state', 'active');
    await expect(page.locator('.lucide-activity')).toBeVisible(); // Icon in tab
    await expect(page.locator('.customer-activity-timeline')).toBeVisible().catch(() => {
        // Fallback check if class name is different
        return expect(page.locator('text=Activity Timeline')).toBeVisible().catch(() => {
            return expect(page.locator('[data-testid="customer-activity-timeline"]')).toBeVisible();
        });
    });

    console.log('Activity tab and timeline verified');
  });

  test('mobile bottom nav', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    
    // Login
    await page.goto('http://localhost:5000/');
    await page.fill('input[name="username"]', 'demo');
    await page.fill('input[name="password"]', 'demo123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');

    const bottomNav = page.locator('[data-testid="mobile-bottom-nav"]');
    await expect(bottomNav).toBeVisible();
    
    const buttons = bottomNav.locator('button, a');
    await expect(buttons).toHaveCount(4);
    
    const dashboardBtn = page.locator('[data-testid="mobile-nav-dashboard"]');
    const jobsBtn = page.locator('[data-testid="mobile-nav-jobs"]');
    const customersBtn = page.locator('[data-testid="mobile-nav-customers"]');
    const moreBtn = page.locator('[data-testid="mobile-nav-more"]');
    
    await expect(dashboardBtn).toBeVisible();
    await expect(jobsBtn).toBeVisible();
    await expect(customersBtn).toBeVisible();
    await expect(moreBtn).toBeVisible();
    
    // Check More button toggles sidebar drawer
    await moreBtn.click();
    await expect(page.locator('[data-sidebar="sidebar"]')).toBeVisible();
    
    console.log('Mobile bottom nav and sidebar toggle verified');
  });

  test('security tab field-level errors', async ({ page }) => {
    // Login
    await page.goto('http://localhost:5000/');
    await page.fill('input[name="username"]', 'demo');
    await page.fill('input[name="password"]', 'demo123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');
    
    // Go to settings security
    await page.goto('http://localhost:5000/settings?tab=security');
    
    // Enter mismatched passwords
    await page.fill('input[name="currentPassword"]', 'demo123');
    await page.fill('input[name="newPassword"]', 'newpassword123');
    await page.fill('input[name="confirmPassword"]', 'mismatched');
    
    // Trigger validation
    await page.click('[data-testid="button-change-password"]');
    
    // Verify field-level error
    const confirmError = page.locator('[data-testid="error-confirm-password"]');
    await expect(confirmError).toBeVisible();
    await expect(confirmError).toHaveText("Passwords don't match");

    console.log('Security field-level errors verified');
  });
});
