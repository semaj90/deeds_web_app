import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import playwright from 'playwright';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const COMMAND_CENTER_URL = process.env.COMMAND_CENTER_URL ?? 'http://localhost:5173/command-center';
const FRAME_SELECTOR = '.command-frame';
const WIZARD_SELECTOR = '.wizard-overlay';
const QUICK_ACTIONS_SELECTOR = '.quick-actions-panel';
const ACTION_SELECTOR = '.quick-actions-panel .action-button';
const SCREENSHOT_PATH = join(SCRIPT_DIR, 'command-center-step4-FULL.png');

const browser = await playwright.chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1200 },
  ignoreHTTPSErrors: true,
});
const page = await context.newPage();

await page.addInitScript(() => {
  localStorage.setItem('deeds-onboarding-completed', 'true');
  localStorage.setItem('deeds-onboarding-step', '9');
  sessionStorage.setItem('deeds-capture-mode', 'true');
});

await page.route('**/api/onboarding', (route) => {
  if (route.request().method() === 'PATCH') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  }

  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ hasCompletedOnboarding: true, onboardingStep: 9 }),
  });
});

async function prepareCaptureSurface() {
  await page.addStyleTag({
    content: `
      .wizard-overlay,
      [aria-label^="Setup Wizard"],
      .toast-container {
        display: none !important;
        visibility: hidden !important;
      }
    `,
  });
}

async function hasVisibleWizard() {
  return page.locator(WIZARD_SELECTOR).evaluateAll((nodes) =>
    nodes.some((node) => {
      const style = window.getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    })
  );
}

try {
  await page.goto(COMMAND_CENTER_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 10000,
  });
  await page.locator(FRAME_SELECTOR).waitFor();
  await prepareCaptureSurface();
  await page.locator(ACTION_SELECTOR).first().waitFor();
  await page.waitForTimeout(300);

  const wizardVisible = await hasVisibleWizard();
  if (wizardVisible > 0) throw new Error('Tutorial wizard is still visible during capture');

  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
  console.log('✅ Full page screenshot saved');

  // Also get bounding box of QuickActions to see where it is
  const qaPosition = await page.evaluate(() => {
    const panel = document.querySelector('.quick-actions-panel');
    if (!panel) return null;
    const rect = panel.getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      bottom: rect.bottom,
    };
  });

  console.log('QuickActions position:', JSON.stringify(qaPosition, null, 2));
} catch (err) {
  console.log('❌ Error:', err.message);
} finally {
  await browser.close();
}
