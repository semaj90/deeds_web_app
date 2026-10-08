import { test, expect } from '@playwright/test';
import { AccessibilityTester } from './accessibility-tester';

test.describe('Accessibility Tests', () => {
  let accessibilityTester: AccessibilityTester;

  test.beforeEach(async ({ page }) => {
    accessibilityTester = new AccessibilityTester(page);
  });

  test('keyboard navigation works correctly', async ({ page }) => {
    const results = await accessibilityTester.testKeyboardNavigation();

    // Expect at least 80% of keyboard tests to pass
    const successRate = results.passed / (results.passed + results.failed);
    expect(successRate).toBeGreaterThan(0.8);

    if (results.issues.length > 0) {
      console.warn('Keyboard navigation issues:', results.issues);
    }
  });

  test('screen reader compatibility', async ({ page }) => {
    const results = await accessibilityTester.testScreenReaderCompatibility();

    // Expect at least 90% of screen reader tests to pass
    const successRate = results.passed / (results.passed + results.failed);
    expect(successRate).toBeGreaterThan(0.9);

    if (results.issues.length > 0) {
      console.warn('Screen reader issues:', results.issues);
    }
  });

  test('AI accessibility features', async ({ page }) => {
    const results = await accessibilityTester.testAIAccessibilityFeatures();

    // All AI accessibility features should work
    expect(results.failed).toBe(0);

    if (results.issues.length > 0) {
      console.warn('AI accessibility issues:', results.issues);
    }
  });

  test('focus management', async ({ page }) => {
    const results = await accessibilityTester.testFocusManagement();

    // Focus management should work perfectly
    expect(results.failed).toBe(0);

    if (results.issues.length > 0) {
      console.warn('Focus management issues:', results.issues);
    }
  });

  test('visual accessibility features', async ({ page }) => {
    const results = await accessibilityTester.testVisualAccessibility();

    // Visual accessibility features should work
    expect(results.failed).toBeLessThanOrEqual(1); // Allow for one minor failure

    if (results.issues.length > 0) {
      console.warn('Visual accessibility issues:', results.issues);
    }
  });

  test('comprehensive accessibility audit', async ({ page }) => {
    const results = await accessibilityTester.runFullAccessibilityTest();

    // Overall accessibility score should be high
    const overallSuccessRate =
      results.summary.totalPassed / (results.summary.totalPassed + results.summary.totalFailed);
    expect(overallSuccessRate).toBeGreaterThan(0.85);

    // Generate detailed report
    console.log('\n🔍 Detailed Accessibility Report:');
    console.log('=====================================');
    console.log(
      `Keyboard Navigation: ${results.keyboard.passed}/${results.keyboard.passed + results.keyboard.failed} passed`
    );
    console.log(
      `Screen Reader: ${results.screenReader.passed}/${results.screenReader.passed + results.screenReader.failed} passed`
    );
    console.log(
      `AI Features: ${results.aiFeatures.passed}/${results.aiFeatures.passed + results.aiFeatures.failed} passed`
    );
    console.log(
      `Focus Management: ${results.focusManagement.passed}/${results.focusManagement.passed + results.focusManagement.failed} passed`
    );
    console.log(
      `Visual Features: ${results.visual.passed}/${results.visual.passed + results.visual.failed} passed`
    );
    console.log(`\nOverall Score: ${Math.round(overallSuccessRate * 100)}%`);

    if (results.summary.allIssues.length > 0) {
      console.log('\n⚠️  Issues requiring attention:');
      results.summary.allIssues.forEach((issue, index) => {
        console.log(`${index + 1}. ${issue}`);
      });
    } else {
      console.log('\n✅ All accessibility tests passed!');
    }
  });
});
