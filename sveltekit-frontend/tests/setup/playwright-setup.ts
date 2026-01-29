/**
 * Playwright E2E Test Setup
 *
 * Global setup and teardown for Playwright E2E tests.
 * This file provides common utilities and configuration for all E2E tests.
 *
 * @module tests/setup/playwright-setup
 * @validates Requirements 2.7, 3.1
 */

import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';
import {
  captureStepScreenshot,
  captureNumberedStep,
  captureFailureScreenshot,
  type ScreenshotResult,
} from '../e2e/utils/screenshot-utils';
import {
  testCredentials,
  testCaseData,
  testEvidenceData,
  testRoutes,
  commonSelectors,
  timeouts,
} from '../e2e/utils/test-fixtures';

// ═══════════════════════════════════════════════════════════════════════════
// Extended Test Fixtures
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extended test fixture with screenshot utilities and common helpers
 */
export const test = base.extend<{
  /** Capture a screenshot at the current step */
  captureStep: (stepName: string, fullPage?: boolean) => Promise<ScreenshotResult>;
  /** Capture a numbered step screenshot */
  captureNumbered: (stepNumber: number, description: string) => Promise<ScreenshotResult>;
  /** Wait for page to be fully loaded */
  waitForPageLoad: () => Promise<void>;
  /** Login with test credentials */
  loginAsTestUser: () => Promise<void>;
}>({
  captureStep: async ({ page }, use) => {
    const captureStep = async (stepName: string, fullPage = false) => {
      return captureStepScreenshot(page, stepName, { fullPage });
    };
    await use(captureStep);
  },

  captureNumbered: async ({ page }, use) => {
    const captureNumbered = async (stepNumber: number, description: string) => {
      return captureNumberedStep(page, stepNumber, description);
    };
    await use(captureNumbered);
  },

  waitForPageLoad: async ({ page }, use) => {
    const waitForPageLoad = async () => {
      await page.waitForLoadState('networkidle', { timeout: timeouts.extended });
    };
    await use(waitForPageLoad);
  },

  loginAsTestUser: async ({ page }, use) => {
    const loginAsTestUser = async () => {
      await page.goto('/login');
      await page.fill(
        '[data-testid="username-input"], input[name="username"]',
        testCredentials.username
      );
      await page.fill(
        '[data-testid="password-input"], input[name="password"]',
        testCredentials.password
      );
      await page.click('[data-testid="submit-button"], button[type="submit"]');
      await page.waitForURL(/\/(dashboard|app)/, { timeout: timeouts.medium });
    };
    await use(loginAsTestUser);
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// Global Test Hooks
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Before each test: Log test start
 */
test.beforeEach(async ({ page }, testInfo) => {
  console.log(`🧪 Starting test: ${testInfo.title}`);
  console.log(`   Project: ${testInfo.project.name}`);
  console.log(`   File: ${testInfo.file}`);
});

/**
 * After each test: Capture failure screenshot if test failed
 */
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    console.log(`❌ Test failed: ${testInfo.title}`);
    // Convert TestInfoError to Error for compatibility
    const errorMessage = testInfo.error?.message || 'Unknown error';
    const error = new Error(errorMessage);
    await captureFailureScreenshot(page, testInfo.title, error);
  } else {
    console.log(`✅ Test passed: ${testInfo.title}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wait for an element to be visible and stable
 */
export async function waitForElement(
  page: Page,
  selector: string,
  timeout = timeouts.medium
): Promise<void> {
  await page.waitForSelector(selector, { state: 'visible', timeout });
}

/**
 * Click an element and wait for navigation
 */
export async function clickAndNavigate(
  page: Page,
  selector: string,
  expectedUrl: string | RegExp
): Promise<void> {
  await Promise.all([
    page.waitForURL(expectedUrl, { timeout: timeouts.medium }),
    page.click(selector),
  ]);
}

/**
 * Fill a form field with retry logic
 */
export async function fillField(
  page: Page,
  selector: string,
  value: string,
  retries = 3
): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await page.fill(selector, value);
      return;
    } catch (error) {
      if (i === retries - 1) throw error;
      await page.waitForTimeout(500);
    }
  }
}

/**
 * Check if an element exists on the page
 */
export async function elementExists(page: Page, selector: string): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { state: 'attached', timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get text content from an element
 */
export async function getElementText(page: Page, selector: string): Promise<string> {
  const element = await page.waitForSelector(selector, { timeout: timeouts.short });
  return (await element?.textContent()) || '';
}

/**
 * Verify route loads correctly
 */
export async function verifyRouteLoads(
  page: Page,
  route: (typeof testRoutes)[number]
): Promise<{ success: boolean; error?: string }> {
  try {
    await page.goto(route.path, { timeout: timeouts.extended });

    // Check for expected elements if defined
    if (route.expectedElements) {
      for (const selector of route.expectedElements) {
        const exists = await elementExists(page, selector);
        if (!exists) {
          return { success: false, error: `Expected element not found: ${selector}` };
        }
      }
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Upload a file to a file input
 */
export async function uploadFile(
  page: Page,
  inputSelector: string,
  filePath: string
): Promise<void> {
  const fileInput = await page.waitForSelector(inputSelector, { timeout: timeouts.short });
  await fileInput?.setInputFiles(filePath);
}

// ═══════════════════════════════════════════════════════════════════════════
// Re-exports for convenience
// ═══════════════════════════════════════════════════════════════════════════

export { expect };
export { testCredentials, testCaseData, testEvidenceData, testRoutes, commonSelectors, timeouts };
export { captureStepScreenshot, captureNumberedStep, captureFailureScreenshot };
export type { Page, BrowserContext, ScreenshotResult };
