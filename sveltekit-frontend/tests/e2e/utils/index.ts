/**
 * E2E Test Utilities Index
 *
 * Central export point for all E2E testing utilities.
 *
 * @module tests/e2e/utils
 */

export {
  captureStepScreenshot,
  captureNumberedStep,
  captureFailureScreenshot,
  getScreenshotDirectory,
  generateScreenshotFilename,
  type ScreenshotOptions,
  type ScreenshotResult,
} from './screenshot-utils';

export {
  testCredentials,
  testCaseData,
  testEvidenceData,
  testRoutes,
  type TestCredentials,
  type TestCaseData,
  type TestEvidenceData,
  type TestRoute,
} from './test-fixtures';
