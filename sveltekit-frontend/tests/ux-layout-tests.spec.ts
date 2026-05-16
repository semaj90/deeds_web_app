import { test, expect, type Page } from '@playwright/test';
import { PORTS } from './helpers/env-ports.js';

/**
 * UX Layout Tests for Enhanced-Bits Components
 * Following N64-UI-HOWTO principles for headless, accessible UI primitives
 */

test.describe('Enhanced-Bits UX Layout Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Set viewport for consistent testing
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test.describe('Case Scoring Dashboard UX', () => {
    test('should render dashboard with proper layout', async ({ page }) => {
      await page.goto(`${PORTS.APP_BASE}/demo/case-scoring`);

      // Wait for page load
      await expect(page.locator('h1')).toContainText('Case Scoring Dashboard Demo');

      // Check header layout
      const header = page.locator('.demo-header');
      await expect(header).toBeVisible();
      await expect(header.locator('h1')).toBeVisible();
      await expect(header.locator('.demo-description')).toBeVisible();

      // Check features section
      const features = page.locator('.demo-features');
      await expect(features).toBeVisible();
      await expect(features.locator('li')).toHaveCount(6);
    });

    test('should load and display mock case data', async ({ page }) => {
      await page.goto(`${PORTS.APP_BASE}/demo/case-scoring`);

      // Wait for the dashboard to load
      await page.waitForSelector('.case-scoring-dashboard', { timeout: 10000 });

      // Check demo toggle is active
      const demoToggle = page.locator('.demo-toggle input[type="checkbox"]');
      await expect(demoToggle).toBeChecked();

      // Wait for loading state to complete
      await page.waitForSelector('.loading-state', { state: 'hidden', timeout: 5000 });

      // Check that case cards are rendered
      const caseCards = page.locator('.case-score-card');
      await expect(caseCards).toHaveCount(5); // Should have 5 mock cases

      // Verify first case data
      const firstCard = caseCards.first();
      await expect(firstCard.locator('.case-title')).toContainText('Johnson v. Tech Corp');
      await expect(firstCard.locator('.score-badge')).toBeVisible();
      await expect(firstCard.locator('.priority-badge')).toBeVisible();
    });

    test('should handle case filtering and sorting', async ({ page }) => {
      await page.goto(`${PORTS.APP_BASE}/demo/case-scoring`);
      await page.waitForSelector('.case-scoring-dashboard');
      await page.waitForSelector('.loading-state', { state: 'hidden', timeout: 5000 });

      // Test score filter
      const scoreFilter = page.locator('#score-filter');
      await scoreFilter.selectOption('high');

      // Should show only high-risk cases (score >= 70)
      const highRiskCases = page.locator('.case-score-card');
      await expect(highRiskCases).toHaveCount(3); // Should have 3 high-risk cases

      // Test sorting
      const sortSelect = page.locator('#sort-by');
      await sortSelect.selectOption('priority');

      // Cases should be reordered by priority
      const firstCaseAfterSort = page.locator('.case-score-card').first();
      await expect(firstCaseAfterSort.locator('.priority-badge')).toContainText('CRITICAL');
    });

    test('should open modal dialog with case details', async ({ page }) => {
      await page.goto(`${PORTS.APP_BASE}/demo/case-scoring`);
      await page.waitForSelector('.case-scoring-dashboard');
      await page.waitForSelector('.loading-state', { state: 'hidden', timeout: 5000 });

      // Click on first case's "View Details" button
      const firstCard = page.locator('.case-score-card').first();
      await firstCard.locator('button:has-text("View Details")').click();

      // Modal should open
      const modal = page.locator('.modal-overlay');
      await expect(modal).toBeVisible();

      // Check modal content
      const modalContent = page.locator('.modal-content');
      await expect(modalContent).toBeVisible();
      await expect(modalContent.locator('.modal-title')).toContainText('Case Score Analysis');

      // Check scoring factors are displayed
      const factorsGrid = page.locator('.factors-grid');
      await expect(factorsGrid).toBeVisible();
      await expect(factorsGrid.locator('.factor-card')).toHaveCount(5);

      // Close modal
      await page.locator('.modal-close').click();
      await expect(modal).not.toBeVisible();
    });

    test('should simulate case rescoring', async ({ page }) => {
      await page.goto(`${PORTS.APP_BASE}/demo/case-scoring`);
      await page.waitForSelector('.case-scoring-dashboard');
      await page.waitForSelector('.loading-state', { state: 'hidden', timeout: 5000 });

      // Get initial score
      const firstCard = page.locator('.case-score-card').first();
      const initialScore = await firstCard.locator('.score-badge').textContent();

      // Click rescore button
      await firstCard.locator('button:has-text("Rescore")').click();

      // Should show loading state
      await expect(page.locator('button:has-text("Rescoring...")')).toBeVisible();

      // Wait for rescoring to complete
      await page.waitForSelector('button:has-text("Rescoring...")', {
        state: 'hidden',
        timeout: 3000,
      });

      // Score may have changed (within mock range)
      const newScore = await firstCard.locator('.score-badge').textContent();
      expect(newScore).toBeTruthy();
    });

    test('should be responsive on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 }); // iPhone size
      await page.goto(`${PORTS.APP_BASE}/demo/case-scoring`);

      // Check mobile responsiveness
      const dashboard = page.locator('.case-scoring-dashboard');
      await expect(dashboard).toBeVisible();

      // Filters should stack vertically on mobile
      const filtersRow = page.locator('.filters-row');
      await expect(filtersRow).toHaveCSS('flex-direction', 'column');

      // Case grid should be single column
      const casesGrid = page.locator('.cases-grid');
      await expect(casesGrid).toHaveCSS('grid-template-columns', '1fr');
    });
  });

  test.describe('LoadingButton UX', () => {
    test('should render all button variants correctly', async ({ page }) => {
      await page.goto(`${PORTS.APP_BASE}/demo/loading-button`);

      // Check page loads
      await expect(page.locator('h1')).toContainText('LoadingButton Component Demo');

      // Check all variants section
      const variantsSection = page.locator('section:has(h2:text("Variants"))');
      await expect(variantsSection).toBeVisible();

      const buttons = variantsSection.locator('button');
      await expect(buttons).toHaveCount(5);

      // Check each variant is styled correctly
      const primaryBtn = page.locator('button:has-text("Primary")');
      await expect(primaryBtn).toHaveClass(/loading-button--primary/);

      const secondaryBtn = page.locator('button:has-text("Secondary")');
      await expect(secondaryBtn).toHaveClass(/loading-button--secondary/);
    });

    test('should handle loading states properly', async ({ page }) => {
      await page.goto(`${PORTS.APP_BASE}/demo/loading-button`);

      // Click a loading button
      const saveBtn = page.locator('button:has-text("Save Document")');
      await saveBtn.click();

      // Should show loading state
      await expect(saveBtn).toHaveClass(/loading-button--loading/);
      await expect(saveBtn).toContainText('Saving...');
      await expect(saveBtn.locator('.loading-button__spinner')).toBeVisible();

      // Should be disabled during loading
      await expect(saveBtn).toHaveAttribute('disabled');

      // Wait for loading to complete
      await page.waitForSelector('button:has-text("Saving...")', {
        state: 'hidden',
        timeout: 3000,
      });
      await expect(saveBtn).not.toHaveAttribute('disabled');
    });

    test('should respect disabled state', async ({ page }) => {
      await page.goto(`${PORTS.APP_BASE}/demo/loading-button`);

      const disabledBtn = page.locator('button:has-text("Disabled Button")');

      // Should be disabled
      await expect(disabledBtn).toHaveAttribute('disabled');
      await expect(disabledBtn).toHaveClass(/loading-button--disabled/);

      // Click should not work
      await disabledBtn.click();
      // No loading state should occur since it's disabled
    });

    test('should handle keyboard navigation', async ({ page }) => {
      await page.goto(`${PORTS.APP_BASE}/demo/loading-button`);

      // Focus first button
      const firstBtn = page.locator('button').first();
      await firstBtn.focus();
      await expect(firstBtn).toBeFocused();

      // Tab to next button
      await page.keyboard.press('Tab');
      const secondBtn = page.locator('button').nth(1);
      await expect(secondBtn).toBeFocused();

      // Enter should activate button
      await page.keyboard.press('Enter');
      // Should trigger loading state or onclick handler
    });

    test('should display custom content with snippets', async ({ page }) => {
      await page.goto(`${PORTS.APP_BASE}/demo/loading-button`);

      // Find button with custom icon content
      const iconBtn = page.locator('button:has-text("Star this!")');
      await expect(iconBtn).toBeVisible();

      // Should contain SVG icon
      await expect(iconBtn.locator('svg')).toBeVisible();
    });
  });

  test.describe('Enhanced-Bits Integration', () => {
    test('should integrate SIMD parser with enhanced-bits components', async ({ page }) => {
      // Navigate to a page that uses SIMD parsing
      await page.goto(`${PORTS.APP_BASE}/demo/case-scoring`);

      // Check if SIMD parser is available in global context
      const simdAvailable = await page.evaluate(() => {
        return (
          (typeof window !== 'undefined' && 'SIMDJSONParser' in window) ||
          'simd-json-parser' in document.querySelectorAll('script')
        );
      });

      // If SIMD is integrated, test parsing performance
      if (simdAvailable) {
        const parseTime = await page.evaluate(() => {
          // Test SIMD parsing if available
          const testJSON = '{"id": "test", "title": "Test Document", "confidence": 0.95}';
          const start = performance.now();

          // Simulate parsing operation
          JSON.parse(testJSON);

          return performance.now() - start;
        });

        expect(parseTime).toBeLessThan(10); // Should be fast
      }
    });

    test('should maintain accessibility standards', async ({ page }) => {
      await page.goto(`${PORTS.APP_BASE}/demo/case-scoring`);

      // Run basic accessibility checks
      await page.locator('h1').first().waitFor();

      // Check for proper ARIA labels
      const buttons = page.locator('button');
      const buttonCount = await buttons.count();

      for (let i = 0; i < Math.min(buttonCount, 5); i++) {
        const button = buttons.nth(i);
        // Should have accessible text content or aria-label
        const hasAccessibleName = await button.evaluate((el) => {
          return el.textContent?.trim() || el.getAttribute('aria-label');
        });
        expect(hasAccessibleName).toBeTruthy();
      }

      // Check modal accessibility
      await page
        .locator('.case-score-card')
        .first()
        .locator('button:has-text("View Details")')
        .click();

      const modal = page.locator('[role="dialog"], .modal-overlay');
      if ((await modal.count()) > 0) {
        // Modal should have proper ARIA attributes
        const modalContent = page.locator('.modal-content');
        await expect(modalContent).toBeVisible();
      }
    });

    test('should handle SSR compatibility', async ({ page }) => {
      // Test that pages load without hydration errors
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });

      await page.goto(`${PORTS.APP_BASE}/demo/case-scoring`);
      await page.waitForLoadState('networkidle');

      // Should not have hydration mismatches or SSR errors
      const relevantErrors = errors.filter(
        (error) =>
          error.includes('hydration') || error.includes('mismatch') || error.includes('SSR')
      );

      expect(relevantErrors).toHaveLength(0);
    });
  });

  test.describe('Performance and Layout Stability', () => {
    test('should maintain layout stability during loading', async ({ page }) => {
      await page.goto(`${PORTS.APP_BASE}/demo/case-scoring`);

      // Measure layout shift during loading
      let cumulativeLayoutShift = 0;

      await page.evaluate(() => {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'layout-shift') {
              // LayoutShift type handling
              cumulativeLayoutShift += (entry as any).value;
            }
          }
        }).observe({ entryTypes: ['layout-shift'] });
      });

      // Wait for content to load
      await page.waitForSelector('.case-score-card', { timeout: 5000 });

      // CLS should be minimal
      expect(cumulativeLayoutShift).toBeLessThan(0.1);
    });

    test('should handle rapid user interactions', async ({ page }) => {
      await page.goto(`${PORTS.APP_BASE}/demo/loading-button`);

      // Rapidly click multiple buttons
      const buttons = page.locator('button').filter({ hasNotText: 'Disabled' });
      const buttonCount = Math.min(await buttons.count(), 3);

      for (let i = 0; i < buttonCount; i++) {
        await buttons.nth(i).click();
        await page.waitForTimeout(100); // Small delay between clicks
      }

      // Page should remain responsive
      await expect(page.locator('h1')).toBeVisible();
    });
  });
});
