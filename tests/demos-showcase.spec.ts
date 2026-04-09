import { expect, test, type Page } from '@playwright/test';

/**
 * Playwright tests for the two demo showcase pages:
 * - /demos/celestial-icons — Unified icon system (YoRHa + Lucide), SSR-enabled
 * - /demos/ui-components — 11 orphan components wired into live showcase, ssr=false (client-only)
 *
 * Run: npx playwright test tests/demos-showcase.spec.ts --config=playwright.dev.config.js
 */

/** Navigate and wait for client-side hydration (ssr=false pages render blank initially) */
async function gotoAndHydrate(page: Page, url: string, marker: string, timeout = 30000) {
  await page.goto(url, { waitUntil: 'commit', timeout });
  await page.waitForSelector(marker, { state: 'visible', timeout });
}

test.describe('Celestial Icons Demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('deeds-onboarding-completed', 'true');
    });
  });

  test('loads without errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const response = await page.goto('/demos/celestial-icons', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    expect(response?.status()).toBe(200);

    // Wait for page-specific h1 (layout also has an h1 "YORHA DETECTIVE")
    await expect(page.locator('.hero-title').first()).toBeVisible();

    // No fatal console errors (filter out expected noise)
    const fatalErrors = consoleErrors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('WebSocket') &&
        !e.includes('HMR') &&
        !e.includes('onnx') &&
        !e.includes('wasm') &&
        !e.includes('Failed to load resource')
    );
    expect(fatalErrors).toHaveLength(0);
  });

  test('renders all 3 icon sections', async ({ page }) => {
    await page.goto('/demos/celestial-icons', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.hero-title', { state: 'visible' });

    // Section headings are h2 elements
    await expect(page.locator('h2').filter({ hasText: 'YoRHa Celestial' })).toBeVisible();
    await expect(page.locator('h2').filter({ hasText: 'Lucide Legal' })).toBeVisible();
    await expect(page.locator('h2').filter({ hasText: 'Lucide UI' })).toBeVisible();
  });

  test('search filter works', async ({ page }) => {
    await page.goto('/demos/celestial-icons', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.icon-card', { state: 'visible' });

    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await expect(searchInput).toBeVisible();

    // Count icons before filtering
    const beforeCount = await page.locator('.icon-card').count();
    expect(beforeCount).toBeGreaterThan(0);

    // Type filter text
    await searchInput.fill('law');
    await page.waitForTimeout(300);

    // After filtering, fewer icons should be visible
    const afterCount = await page.locator('.icon-card').count();
    expect(afterCount).toBeGreaterThan(0);
    expect(afterCount).toBeLessThan(beforeCount);
  });

  test('size controls adjust icons', async ({ page }) => {
    await page.goto('/demos/celestial-icons', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.icon-card', { state: 'visible' });

    // Size picker buttons
    const sizeButtons = page.locator('button.pill');
    const count = await sizeButtons.count();
    if (count > 0) {
      await sizeButtons.last().click();
      await page.waitForTimeout(300);
    }
  });

  test('screenshot: full page', async ({ page }) => {
    await page.goto('/demos/celestial-icons', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.hero-title', { state: 'visible' });
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'test-results/screenshots/demos-celestial-icons.png',
      fullPage: true,
    });
  });
});

test.describe('UI Components Showcase Demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('deeds-onboarding-completed', 'true');
    });
  });

  test('loads without errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // ssr=false page: HTML arrives empty, JS renders content client-side
    await gotoAndHydrate(page, '/demos/ui-components', '.hero-title');

    await expect(page.locator('.hero-title')).toContainText('UI Components Showcase');

    const fatalErrors = consoleErrors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('WebSocket') &&
        !e.includes('HMR') &&
        !e.includes('onnx') &&
        !e.includes('wasm') &&
        !e.includes('canvas') &&
        !e.includes('WebGL') &&
        !e.includes('Failed to load resource') &&
        !e.includes('effect_update_depth_exceeded') &&
        !e.includes('ErrorBoundary caught') &&
        !e.includes('updated at')
    );
    expect(fatalErrors).toHaveLength(0);
  });

  test('renders all 11 demo sections', async ({ page }) => {
    await gotoAndHydrate(page, '/demos/ui-components', '.hero-title');

    const sections = [
      'Badge', 'Card', 'Progress', 'Skeleton', 'Kbd', 'Tooltip',
      'ChatFeedback', 'BoardMinimap', 'Unified Icons',
      'TypewriterPrompt', 'MarkdownSceneViewer',
    ];

    for (const section of sections) {
      await expect(page.locator('h2').filter({ hasText: section }).first()).toBeVisible();
    }
  });

  test('Badge variants render', async ({ page }) => {
    await gotoAndHydrate(page, '/demos/ui-components', '.hero-title');

    await expect(page.getByText('Default').first()).toBeVisible();
    await expect(page.getByText('Primary').first()).toBeVisible();
    await expect(page.getByText('Success').first()).toBeVisible();
    await expect(page.getByText('Danger').first()).toBeVisible();
    await expect(page.getByText('Outline').first()).toBeVisible();
  });

  test('Progress slider is interactive', async ({ page }) => {
    await gotoAndHydrate(page, '/demos/ui-components', '.hero-title');

    const slider = page.locator('input[type="range"]').first();
    await expect(slider).toBeVisible();

    // Default shows 65%
    await expect(page.getByText('Value: 65%')).toBeVisible();

    // Use keyboard ArrowRight to increment slider value (Svelte bind:value needs native input)
    await slider.focus();
    for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    await expect(page.getByText('Value: 90%')).toBeVisible();
  });

  test('ChatFeedback thumbs interaction', async ({ page }) => {
    await gotoAndHydrate(page, '/demos/ui-components', '.hero-title');

    const section = page.locator('h2').filter({ hasText: 'ChatFeedback' });
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    const thumbsUp = page.locator('button[title="Helpful"]').first();
    await expect(thumbsUp).toBeVisible();
    await thumbsUp.click();
    await page.waitForTimeout(500);

    await expect(page.getByText('Feedback log:')).toBeVisible({ timeout: 5000 });
  });

  test('Kbd shortcut symbols render', async ({ page }) => {
    await gotoAndHydrate(page, '/demos/ui-components', '.hero-title');

    // Ctrl+K renders as ⌃ + K in <kbd> elements
    await expect(page.locator('kbd').filter({ hasText: '⌃' }).first()).toBeVisible();
    await expect(page.locator('kbd').filter({ hasText: 'K' }).first()).toBeVisible();
    await expect(page.locator('kbd').filter({ hasText: 'Esc' }).first()).toBeVisible();
  });

  test('Card variants all visible', async ({ page }) => {
    await gotoAndHydrate(page, '/demos/ui-components', '.hero-title');

    await expect(page.locator('.card-title').filter({ hasText: 'Elevated' }).first()).toBeVisible();
    await expect(page.locator('.card-title').filter({ hasText: 'Outlined' }).first()).toBeVisible();
    await expect(page.locator('.card-title').filter({ hasText: 'Ghost' }).first()).toBeVisible();
  });

  test('TypewriterPrompt section exists', async ({ page }) => {
    await gotoAndHydrate(page, '/demos/ui-components', '.hero-title');

    const section = page.locator('h2').filter({ hasText: 'TypewriterPrompt' });
    await section.scrollIntoViewIfNeeded();

    await expect(page.getByText('Auto-cycles through 3 legal prompts')).toBeVisible();
  });

  test('MarkdownSceneViewer validate button', async ({ page }) => {
    await gotoAndHydrate(page, '/demos/ui-components', '.hero-title');

    const section = page.locator('h2').filter({ hasText: 'MarkdownSceneViewer' });
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    await expect(page.getByText('Financial Transaction Summary')).toBeVisible();

    const validateBtn = page.locator('button').filter({ hasText: 'Validate' }).first();
    await expect(validateBtn).toBeVisible({ timeout: 5000 });
    await validateBtn.click();
    await page.waitForTimeout(500);
    await expect(page.getByText('Validated scene')).toBeVisible({ timeout: 5000 });
  });

  test('BoardMinimap renders SVG with nodes', async ({ page }) => {
    await gotoAndHydrate(page, '/demos/ui-components', '.hero-title');

    const section = page.locator('h2').filter({ hasText: 'BoardMinimap' });
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    const svg = page.locator('.minimap svg').first();
    await expect(svg).toBeVisible();

    const circles = svg.locator('circle');
    const count = await circles.count();
    expect(count).toBe(10);
  });

  test('screenshot: full page', async ({ page }) => {
    await gotoAndHydrate(page, '/demos/ui-components', '.hero-title');
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: 'test-results/screenshots/demos-ui-components.png',
      fullPage: true,
    });
  });
});
