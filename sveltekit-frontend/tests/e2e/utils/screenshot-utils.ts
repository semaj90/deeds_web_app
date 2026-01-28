/**
 * Screenshot Utilities for E2E Testing
 *
 * Provides helper functions for capturing screenshots during test steps
 * for visual verification of user flows.
 *
 * @module tests/e2e/utils/screenshot-utils
 * @validates Requirements 2.7 - Screenshot capture for verification
 */

import type { Page } from '@playwright/test';
import * as path from 'path';

/**
 * Screenshot configuration options
 */
export interface ScreenshotOptions {
  /** Whether to capture full page screenshot */
  fullPage?: boolean;
  /** Custom screenshot directory (relative to test-results) */
  directory?: string;
  /** Additional metadata to include in filename */
  metadata?: string;
}

/**
 * Screenshot result with path and metadata
 */
export interface ScreenshotResult {
  /** Full path to the saved screenshot */
  path: string;
  /** Filename of the screenshot */
  filename: string;
  /** Timestamp when screenshot was captured */
  timestamp: Date;
  /** Step name for reference */
  stepName: string;
}

/**
 * Captures a screenshot at a specific test step for visual verification.
 *
 * This function is designed to be called after each significant step in
 * user flow tests (login, case creation, evidence upload, etc.) to provide
 * visual documentation of the test execution.
 *
 * @param page - Playwright Page object
 * @param stepName - Descriptive name for the test step (e.g., 'login-form-filled')
 * @param options - Optional screenshot configuration
 * @returns Promise<ScreenshotResult> - Screenshot metadata
 *
 * @example
 * ```typescript
 * // Capture screenshot after filling login form
 * await captureStepScreenshot(page, 'login-form-filled', { fullPage: false });
 *
 * // Capture full page screenshot of dashboard
 * await captureStepScreenshot(page, 'dashboard-loaded', { fullPage: true });
 * ```
 *
 * @validates Requirements 2.7 - Screenshot capture for verification
 */
export async function captureStepScreenshot(
  page: Page,
  stepName: string,
  options: ScreenshotOptions = {}
): Promise<ScreenshotResult> {
  const { fullPage = false, directory = 'screenshots', metadata = '' } = options;

  const timestamp = new Date();
  const timestampStr = timestamp.toISOString().replace(/[:.]/g, '-');
  const metadataSuffix = metadata ? `-${metadata}` : '';
  const filename = `${stepName}${metadataSuffix}-${timestampStr}.png`;
  const screenshotPath = path.join('test-results', directory, filename);

  await page.screenshot({
    path: screenshotPath,
    fullPage,
  });

  return {
    path: screenshotPath,
    filename,
    timestamp,
    stepName,
  };
}

/**
 * Captures a screenshot with automatic step numbering for sequential flows.
 *
 * Useful for documenting multi-step user flows where order matters.
 *
 * @param page - Playwright Page object
 * @param stepNumber - Sequential step number (1, 2, 3, etc.)
 * @param stepDescription - Description of the step
 * @param options - Optional screenshot configuration
 * @returns Promise<ScreenshotResult>
 *
 * @example
 * ```typescript
 * await captureNumberedStep(page, 1, 'navigate-to-login');
 * await captureNumberedStep(page, 2, 'fill-credentials');
 * await captureNumberedStep(page, 3, 'submit-form');
 * await captureNumberedStep(page, 4, 'verify-dashboard');
 * ```
 */
export async function captureNumberedStep(
  page: Page,
  stepNumber: number,
  stepDescription: string,
  options: ScreenshotOptions = {}
): Promise<ScreenshotResult> {
  const paddedNumber = String(stepNumber).padStart(2, '0');
  const stepName = `step-${paddedNumber}-${stepDescription}`;
  return captureStepScreenshot(page, stepName, options);
}

/**
 * Captures a screenshot on test failure with error context.
 *
 * @param page - Playwright Page object
 * @param testName - Name of the failing test
 * @param error - Error that caused the failure
 * @returns Promise<ScreenshotResult>
 */
export async function captureFailureScreenshot(
  page: Page,
  testName: string,
  error: Error
): Promise<ScreenshotResult> {
  const errorType = error.name || 'UnknownError';
  return captureStepScreenshot(page, `FAILURE-${testName}`, {
    fullPage: true,
    directory: 'failures',
    metadata: errorType,
  });
}

/**
 * Creates a screenshot directory structure for a test suite.
 *
 * @param suiteName - Name of the test suite
 * @returns Directory path for the suite's screenshots
 */
export function getScreenshotDirectory(suiteName: string): string {
  return path.join('screenshots', suiteName);
}

/**
 * Generates a unique screenshot filename based on test context.
 *
 * @param testName - Name of the test
 * @param stepName - Name of the step
 * @returns Unique filename string
 */
export function generateScreenshotFilename(testName: string, stepName: string): string {
  const timestamp = Date.now();
  const sanitizedTestName = testName.replace(/[^a-zA-Z0-9-_]/g, '-');
  const sanitizedStepName = stepName.replace(/[^a-zA-Z0-9-_]/g, '-');
  return `${sanitizedTestName}-${sanitizedStepName}-${timestamp}.png`;
}
