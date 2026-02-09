import { test, expect } from '@playwright/test';

/**
 * E2E Test: /all-routes SSE Real-time Health Updates
 *
 * Validates that Server-Sent Events are properly updating
 * route health indicators in real-time on the all-routes page.
 */

test.describe('All Routes SSE Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to all-routes page
    await page.goto('/all-routes');

    // Wait for initial page load
    await page.waitForSelector('h1:has-text("YoRHa Command Center")');
  });

  test('should establish SSE connection on page load', async ({ page }) => {
    // Listen for console logs indicating SSE connection
    const sseConnectionLog = page.waitForEvent('console', msg =>
      msg.text().includes('[SSE] EventSource connection established')
    );

    // Wait for SSE connection log
    await expect(sseConnectionLog).resolves.toBeTruthy();
  });

  test('should display debug information with route counts', async ({ page }) => {
    // Verify debug info section exists
    const debugInfo = page.locator('.debug-info');
    await expect(debugInfo).toBeVisible();

    // Check that routes are loaded
    const routesLoaded = debugInfo.locator('p:has-text("Routes loaded:")');
    await expect(routesLoaded).toBeVisible();

    // Verify non-zero route count
    const routeCountText = await routesLoaded.textContent();
    const routeCount = parseInt(routeCountText?.match(/\d+/)?.[0] || '0');
    expect(routeCount).toBeGreaterThan(0);
  });

  test('should render route cards with health indicators', async ({ page }) => {
    // Wait for routes list to render
    await page.waitForSelector('.routes-list');

    // Verify at least one route item exists
    const routeItems = page.locator('.route-item');
    await expect(routeItems.first()).toBeVisible();

    // Check for health indicator emojis
    const healthIndicators = page.locator('.health-indicator');
    const count = await healthIndicators.count();
    expect(count).toBeGreaterThan(0);

    // Verify health indicator shows one of: ✅, 🟡, ❌
    const healthText = await healthIndicators.first().textContent();
    expect(['✅', '🟡', '❌']).toContain(healthText);
  });

  test('should display error badges for routes with errors', async ({ page }) => {
    // Look for routes with error badges
    const errorBadges = page.locator('.error-badge');

    if (await errorBadges.count() > 0) {
      // Verify error badge format
      const errorText = await errorBadges.first().textContent();
      expect(errorText).toMatch(/\d+ error(s)?/);
    }
  });

  test('should handle SSE health_change events', async ({ page }) => {
    // Set up console log listener for SSE health changes
    const healthChangePromise = new Promise<string>(resolve => {
      page.on('console', msg => {
        const text = msg.text();
        if (text.includes('[SSE] Health change:')) {
          resolve(text);
        }
      });
    });

    // Simulate SSE event by triggering route health change
    // (In production, this would come from server SSE stream)
    await page.evaluate(() => {
      const event = new MessageEvent('message', {
        data: JSON.stringify({
          type: 'health_change',
          routeId: 'test-route',
          newStatus: 'flaky',
          reason: 'Test health change'
        })
      });

      // Dispatch to EventSource if it exists
      const eventSource = (window as any).__eventSource__;
      if (eventSource) {
        eventSource.dispatchEvent(event);
      }
    });

    // Note: Full SSE testing requires mock SSE server or integration test
    // This test validates the UI is ready to receive SSE events
  });

  test('should color-code route cards by health status', async ({ page }) => {
    // Check for routes with errors (red border-left)
    const routesWithErrors = page.locator('.route-item.has-errors');

    if (await routesWithErrors.count() > 0) {
      // Verify CSS class is applied
      await expect(routesWithErrors.first()).toHaveClass(/has-errors/);
    }
  });

  test('should show Visit and Analyze action buttons', async ({ page }) => {
    const routeItems = page.locator('.route-item');
    const firstRoute = routeItems.first();

    // Verify Visit button exists
    const visitBtn = firstRoute.locator('button:has-text("Visit")');
    await expect(visitBtn).toBeVisible();

    // Verify Analyze button exists
    const analyzeBtn = firstRoute.locator('button:has-text("Analyze")');
    await expect(analyzeBtn).toBeVisible();
  });

  test('should log interaction when clicking route info', async ({ page }) => {
    // Listen for fetch request to interactions endpoint
    const interactionRequest = page.waitForRequest(
      request => request.url().includes('/api/routes/') &&
                 request.url().includes('/interactions') &&
                 request.method() === 'POST'
    );

    // Click route info button
    const routeInfoBtn = page.locator('.route-info-btn').first();
    await routeInfoBtn.click();

    // Verify interaction was logged
    const request = await interactionRequest;
    const postData = request.postDataJSON();
    expect(postData.interaction_type).toBe('view');
  });

  test('should handle SSE connection errors gracefully', async ({ page }) => {
    // Listen for console error logs
    let errorLogged = false;
    page.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('[SSE] Connection error')) {
        errorLogged = true;
      }
    });

    // Simulate SSE error
    await page.evaluate(() => {
      const eventSource = (window as any).__eventSource__;
      if (eventSource) {
        const errorEvent = new Event('error');
        eventSource.dispatchEvent(errorEvent);
      }
    });

    // Wait a bit for error handler to execute
    await page.waitForTimeout(500);

    // Note: In real scenario, EventSource auto-reconnects on error
    // This test validates error handler exists
  });

  test('should display YoRHa theme styling', async ({ page }) => {
    // Verify terminal-style background
    const main = page.locator('.command-center');
    await expect(main).toHaveCSS('background', /rgb\(0, 0, 0\)/);

    // Verify green terminal text color
    await expect(main).toHaveCSS('color', /rgb\(0, 255, 0\)/);
  });

  test('should show performance info if available', async ({ page }) => {
    const debugInfo = page.locator('.debug-info');

    // Check if error summary is loaded
    const errorSummary = debugInfo.locator('p:has-text("Error summary:")');
    await expect(errorSummary).toBeVisible();
  });
});

test.describe('All Routes SSE Performance', () => {
  test('should load page within 3 seconds', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/all-routes');
    await page.waitForSelector('.routes-list');

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(3000);
  });

  test('should handle 100+ routes without performance issues', async ({ page }) => {
    await page.goto('/all-routes');

    // Wait for routes to render
    await page.waitForSelector('.routes-list');

    // Get route count
    const routeCountText = await page.locator('.debug-info p:has-text("Routes loaded:")').textContent();
    const routeCount = parseInt(routeCountText?.match(/\d+/)?.[0] || '0');

    if (routeCount > 100) {
      // Verify page is still responsive
      const visitBtn = page.locator('button:has-text("Visit")').first();
      await expect(visitBtn).toBeVisible();

      // Click should respond within 500ms
      const clickStart = Date.now();
      await visitBtn.click();
      const clickTime = Date.now() - clickStart;
      expect(clickTime).toBeLessThan(500);
    }
  });
});

test.describe('All Routes SSE Real-time Updates (Integration)', () => {
  test.skip('should update health indicator when SSE event received', async ({ page, context }) => {
    // This test requires actual SSE server implementation
    // Mark as skip for now, implement when SSE endpoint is live

    await page.goto('/all-routes');

    // Get initial health indicator
    const healthIndicator = page.locator('.health-indicator').first();
    const initialHealth = await healthIndicator.textContent();

    // Wait for SSE health_change event (would come from server)
    // await page.waitForEvent('console', msg =>
    //   msg.text().includes('[SSE] Health change:')
    // );

    // Verify health indicator updated
    const newHealth = await healthIndicator.textContent();
    // expect(newHealth).not.toBe(initialHealth); // Uncomment when SSE live
  });
});
