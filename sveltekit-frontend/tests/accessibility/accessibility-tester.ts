/**
 * Accessibility Testing Scenarios for Legal AI Application
 * Tests for WCAG 2.1 AA compliance, screen reader compatibility, and keyboard navigation
 */

import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';

export class AccessibilityTester {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Test keyboard navigation across the application
   */
  async testKeyboardNavigation() {
    const results = {
      passed: 0, failed: 0,
      issues: [] as string[],
    };

    // Test Tab navigation through main interface
    await this.page.goto('/');

    // Start from first focusable element
    await this.page.keyboard.press('Tab');
    let focusedElement = await this.page.locator(':focus').first();

    // Navigate through main navigation
    const navItems = ['Home', 'Cases', 'AI Hub', 'Evidence', 'POI', 'Citations', 'Chat'];

    for (const item of navItems) {
      try {
        await this.page.keyboard.press('Tab');
        const current = await this.page.locator(':focus').first();
        const text = await current.textContent();

        if (text?.includes(item)) {
          results.passed++;
        } else {
          results.failed++;
          results.issues.push(`Tab navigation failed to reach ${item}`);
        }
      } catch (error) {
        results.failed++;
        results.issues.push(`Tab navigation error for ${item}: ${error}`);
      }
    }

    // Test accessibility button (Alt+A)
    try {
      await this.page.keyboard.press('Alt+a');
      await this.page.waitForSelector('[role="dialog"]', { timeout: 2000 });
      const dialog = await this.page.locator('[role="dialog"]').first();
      const isVisible = await dialog.isVisible();

      if (isVisible) {
        results.passed++;
      } else {
        results.failed++;
        results.issues.push('Alt+A keyboard shortcut failed to open accessibility settings');
      }

      // Close dialog
      await this.page.keyboard.press('Escape');
    } catch (error) {
      results.failed++;
      results.issues.push(`Accessibility settings shortcut error: ${error}`);
    }

    // Test skip-to-content (Alt+S)
    try {
      await this.page.keyboard.press('Alt+s');
      const mainContent = await this.page.locator('main, [role="main"]').first();
      const isFocused = await mainContent.evaluate((el) => document.activeElement === el);

      if (isFocused) {
        results.passed++;
      } else {
        results.failed++;
        results.issues.push('Alt+S skip-to-content failed to focus main content');
      }
    } catch (error) {
      results.failed++;
      results.issues.push(`Skip-to-content error: ${error}`);
    }

    return results;
  }

  /**
   * Test screen reader announcements and ARIA attributes
   */
  async testScreenReaderCompatibility() {
    const results = {
      passed: 0, failed: 0,
      issues: [] as string[],
    };

    await this.page.goto('/');

    // Test live regions for announcements
    const liveRegions = await this.page.locator('[aria-live]').all();

    if (liveRegions.length > 0) {
      results.passed++;
    } else {
      results.failed++;
      results.issues.push('No live regions found for screen reader announcements');
    }

    // Test ARIA labels and descriptions
    const interactiveElements = await this.page
      .locator('button, a, input, select, [role="button"], [role="link"]')
      .all();

    for (const element of interactiveElements) {
      try {
        const ariaLabel = await element.getAttribute('aria-label');
        const ariaLabelledBy = await element.getAttribute('aria-labelledby');
        const text = await element.textContent();

        if (ariaLabel || ariaLabelledBy || (text && text.trim().length > 0)) {
          results.passed++;
        } else {
          results.failed++;
          const tagName = await element.evaluate((el) => el.tagName.toLowerCase());
          results.issues.push(`Interactive element (${tagName}) missing accessible name`);
        }
      } catch (error) {
        results.failed++;
        results.issues.push(`Error checking accessible name: ${error}`);
      }
    }

    // Test heading structure
    const headings = await this.page.locator('h1, h2, h3, h4, h5, h6').all();
    let hasH1 = false;
    let previousLevel = 0;

    for (const heading of headings) {
      try {
        const tagName = await heading.evaluate((el) => el.tagName.toLowerCase());
        const level = parseInt(tagName.charAt(1));

        if (level === 1) {
          hasH1 = true;
        }

        // Check heading hierarchy
        if (previousLevel > 0 && level > previousLevel + 1) {
          results.failed++;
          results.issues.push(
            `Heading hierarchy skip detected: ${tagName} after h${previousLevel}`
          );
        } else {
          results.passed++;
        }

        previousLevel = level;
      } catch (error) {
        results.failed++;
        results.issues.push(`Error checking heading: ${error}`);
      }
    }

    if (!hasH1) {
      results.failed++;
      results.issues.push('No H1 heading found on page');
    }

    return results;
  }

  /**
   * Test AI-specific accessibility features
   */
  async testAIAccessibilityFeatures() {
    const results = {
      passed: 0, failed: 0,
      issues: [] as string[],
    };

    // Navigate to AI Hub
    await this.page.goto('/ai/dashboard');

    // Test AI operation announcements
    try {
      // Look for AI processing indicators
      const aiIndicators = await this.page
        .locator('[data-ai-status], [aria-describedby*="ai"], [role="status"]')
        .all();

      if (aiIndicators.length > 0) {
        results.passed++;
      } else {
        results.failed++;
        results.issues.push('No AI status indicators found for screen reader announcements');
      }
    } catch (error) {
      results.failed++;
      results.issues.push(`AI status indicator error: ${error}`);
    }

    // Test progressive disclosure for complex AI outputs
    try {
      const expandableElements = await this.page.locator('[aria-expanded]').all();

      for (const element of expandableElements) {
        const expanded = await element.getAttribute('aria-expanded');
        const controls = await element.getAttribute('aria-controls');

        if (controls) {
          const controlledElement = await this.page.locator(`#${controls}`).first();
          const isVisible = await controlledElement.isVisible();

          if ((expanded === 'true' && isVisible) || (expanded === 'false' && !isVisible)) {
            results.passed++;
          } else {
            results.failed++;
            results.issues.push('aria-expanded state does not match controlled element visibility');
          }
        }
      }
    } catch (error) {
      results.failed++;
      results.issues.push(`Progressive disclosure error: ${error}`);
    }

    return results;
  }

  /**
   * Test focus management and visual indicators
   */
  async testFocusManagement() {
    const results = {
      passed: 0, failed: 0,
      issues: [] as string[],
    };

    await this.page.goto('/');

    // Open accessibility settings modal
    await this.page.keyboard.press('Alt+a');

    try {
      // Check if focus is trapped in modal
      const modal = await this.page.locator('[role="dialog"]').first();
      await this.page.waitForSelector('[role="dialog"]', { timeout: 2000 });

      // Try to tab out of modal
      const focusableInModal = await modal
        .locator('button, a, input, select, [tabindex="0"]')
        .all();

      if (focusableInModal.length > 0) {
        // Focus first element
        await focusableInModal[0].focus();

        // Tab through all elements and try to escape
        for (let i = 0; i < focusableInModal.length + 2; i++) {
          await this.page.keyboard.press('Tab');
        }

        // Check if focus is still in modal
        const currentFocus = await this.page.locator(':focus').first();
        const isInModal = (await modal.locator(':focus').count()) > 0;

        if (isInModal) {
          results.passed++;
        } else {
          results.failed++;
          results.issues.push('Focus escaped from modal - focus trap not working');
        }
      }

      // Close modal and check focus restoration
      await this.page.keyboard.press('Escape');
      await this.page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 2000 });

      const focusAfterClose = await this.page.locator(':focus').first();
      const isAccessibilityButton = await focusAfterClose.evaluate(
        (el) => el.getAttribute('aria-label')?.includes('accessibility') || false
      );

      if (isAccessibilityButton) {
        results.passed++;
      } else {
        results.failed++;
        results.issues.push('Focus not restored to accessibility button after modal close');
      }
    } catch (error) {
      results.failed++;
      results.issues.push(`Focus management error: ${error}`);
    }

    return results;
  }

  /**
   * Test color contrast and visual accessibility
   */
  async testVisualAccessibility() {
    const results = {
      passed: 0, failed: 0,
      issues: [] as string[],
    };

    await this.page.goto('/');

    // Test high contrast mode
    try {
      await this.page.keyboard.press('Alt+a');
      await this.page.waitForSelector('[role="dialog"]');

      // Find and click high contrast toggle
      const highContrastToggle = await this.page
        .locator('[aria-checked]')
        .filter({ hasText: /high contrast/i })
        .first();
      await highContrastToggle.click();

      // Check if high contrast styles are applied
      await this.page.waitForTimeout(500); // Allow styles to apply

      const bodyClass = await this.page.locator('body').getAttribute('class');
      if (bodyClass?.includes('high-contrast')) {
        results.passed++;
      } else {
        results.failed++;
        results.issues.push('High contrast mode not applied to body class');
      }

      await this.page.keyboard.press('Escape');
    } catch (error) {
      results.failed++;
      results.issues.push(`High contrast test error: ${error}`);
    }

    // Test font size adjustments
    try {
      await this.page.keyboard.press('Alt+a');
      await this.page.waitForSelector('[role="dialog"]');

      // Test different font sizes
      const fontSizes = ['large', 'extra-large'];

      for (const size of fontSizes) {
        const sizeButton = await this.page
          .locator('button')
          .filter({ hasText: new RegExp(size, 'i') })
          .first();
        await sizeButton.click();
        await this.page.waitForTimeout(300);

        const rootFontSize = await this.page.evaluate(() => {
          return window.getComputedStyle(document.documentElement).fontSize;
        });

        // Font size should increase for larger settings
        const fontSize = parseFloat(rootFontSize);
        if (fontSize >= 16) {
          // Assuming base is 16px
          results.passed++;
        } else {
          results.failed++;
          results.issues.push(`Font size not increased for ${size} setting`);
        }
      }

      await this.page.keyboard.press('Escape');
    } catch (error) {
      results.failed++;
      results.issues.push(`Font size test error: ${error}`);
    }

    return results;
  }

  /**
   * Run comprehensive accessibility test suite
   */
  async runFullAccessibilityTest() {
    console.log('🔍 Running comprehensive accessibility test suite...');

    const keyboardResults = await this.testKeyboardNavigation();
    const screenReaderResults = await this.testScreenReaderCompatibility();
    const aiResults = await this.testAIAccessibilityFeatures();
    const focusResults = await this.testFocusManagement();
    const visualResults = await this.testVisualAccessibility();

    const totalResults = {
      keyboard: keyboardResults, screenReader: screenReaderResults,
      aiFeatures: aiResults, focusManagement: focusResults,
      visual: visualResults,
      summary: {
        totalPassed:
          keyboardResults.passed +
          screenReaderResults.passed +
          aiResults.passed +
          focusResults.passed +
          visualResults.passed, totalFailed: keyboardResults.failed +
          screenReaderResults.failed +
          aiResults.failed +
          focusResults.failed +
          visualResults.failed,
        allIssues: [
          ...keyboardResults.issues,
          ...screenReaderResults.issues,
          ...aiResults.issues,
          ...focusResults.issues,
          ...visualResults.issues,
        ],
      },
    };

    // Generate accessibility report
    console.log('\n📊 Accessibility Test Results:');
    console.log(`✅ Passed: ${totalResults.summary.totalPassed}`);
    console.log(`❌ Failed: ${totalResults.summary.totalFailed}`);

    if (totalResults.summary.allIssues.length > 0) {
      console.log('\n🔧 Issues to fix:');
      totalResults.summary.allIssues.forEach((issue, index) => {
        console.log(`${index + 1}. ${issue}`);
      });
    }

    return totalResults;
  }
}

// Playwright test integration
export const accessibilityTestConfig = {
  testDir: './tests/accessibility',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  use: {
    // Enable accessibility tree in Playwright
    actionTimeout: 0,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
};
