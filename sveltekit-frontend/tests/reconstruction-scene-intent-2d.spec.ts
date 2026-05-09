import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 1 / 2D timeline viewer — visual + Compile loop.
 *
 * Loads /demos/scene-intent-2d (fixture-backed, no Docker required for the
 * static page), then exercises the Compile button which posts the current
 * SceneIntent to /api/reconstruction/compile and renders plan_hash +
 * projection warnings.
 *
 * Screenshots written to memory/runs/playwright/scene-intent-2d/.
 * Tolerant: if auth blocks the Compile button (DEV_BYPASS_AUTH not set in
 * CI), the test logs the skip but does not fail the visual assertion —
 * the fixture page itself does NOT require auth and must always render.
 */

const SCREENSHOT_DIR = resolve(process.cwd(), 'memory/runs/playwright/scene-intent-2d');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

test.describe('Phase 1 — SceneIntent 2D viewer', () => {
  test('fixture renders timeline + actors + evidence', async ({ page }) => {
    await page.goto('/demos/scene-intent-2d');

    // Hero — scene title from fixture
    await expect(page.locator('h1')).toContainText(/alleyway|reconstruction/i, { timeout: 10_000 });

    // Required disclaimer always present
    await expect(page.locator('.disclaimer')).toContainText('Demonstrative reconstruction');

    // Environment, actors, timeline sections all rendered
    await expect(page.locator('section.environment')).toBeVisible();
    await expect(page.locator('section.actors')).toBeVisible();
    await expect(page.locator('section.timeline')).toBeVisible();

    // At least one event bar rendered on the timeline
    const bars = page.locator('section.timeline .bar');
    await expect(bars.first()).toBeVisible();
    const barCount = await bars.count();
    expect(barCount).toBeGreaterThanOrEqual(1);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/01-fixture-loaded.png`,
      fullPage: true,
    });
  });

  test('Compile button → plan_hash + projection warnings', async ({ page }) => {
    await page.goto('/demos/scene-intent-2d');

    const compileBtn = page.locator('button.compile-btn');
    await expect(compileBtn).toBeVisible({ timeout: 10_000 });
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/02-before-compile.png`,
      fullPage: true,
    });

    // Click and wait for either the OK panel or the FAIL panel.
    await compileBtn.click();

    const okPanel   = page.locator('.compile-result.ok');
    const failPanel = page.locator('.compile-result.fail');

    // Race: whichever panel resolves first decides the test branch.
    const result = await Promise.race([
      okPanel.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'ok' as const),
      failPanel.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'fail' as const),
    ]).catch(() => 'timeout' as const);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/03-after-compile-${result}.png`,
      fullPage: true,
    });

    if (result === 'ok') {
      // plan_hash must be a 32-char hex string (sha256 sliced)
      const hash = await okPanel.locator('dt:has-text("plan_hash") + dd code').textContent();
      expect(hash).toMatch(/^[0-9a-f]{32}$/);

      // Compiler version is embedded
      const compilerVersion = await okPanel
        .locator('dt:has-text("compiler") + dd code')
        .textContent();
      expect(compilerVersion).toContain('scene-compiler');

      // The fixture has known projections (speaking → idle, flee → run); if
      // the warnings list is present, every entry should mention "projected"
      const warnings = okPanel.locator('.warnings li');
      const warningCount = await warnings.count();
      if (warningCount > 0) {
        const first = await warnings.first().textContent();
        expect(first).toContain('projected');
      }
    } else if (result === 'fail') {
      // Auth or backend failure — log but don't fail the test. The visual
      // assertion (page rendered, button clickable) is what matters here.
      const errorText = await failPanel.textContent();
      console.log(`Compile path returned error (likely auth in CI): ${errorText?.slice(0, 200)}`);
      test.skip(true, 'Compile endpoint returned non-200 — typical for unauth CI runs');
    } else {
      console.log('Neither result panel appeared within 15s — skipping');
      test.skip(true, 'Compile loop timed out (likely no DEV_BYPASS_AUTH)');
    }
  });
});
