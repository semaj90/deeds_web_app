import { expect, test } from '@playwright/test';

test('Barrel Store Integration: Layout & Global State', async ({ page }) => {
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err));

  // --- 1. MOCK BACKEND (Prevent Network Errors) ---
  await page.route('**/api/sync/**', async route => {
    await route.fulfill({ status: 200, body: JSON.stringify([]) });
  });

  // --- 2. LOAD APP ---
  await page.goto('/');

  // Clear localStorage to ensure consistent starting state
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Verify the App Shell is present
  const shell = page.locator('.app-shell');
  await expect(shell).toBeVisible();

  // --- 3. TEST: Token Tracker (Store: tokenTracker) ---
  // Check if the progress bar renders (even at 0%)
  const progressBar = page.locator('progress');
  await expect(progressBar).toBeVisible();
  console.log('✅ Token Tracker store is wired up');

  // --- 4. TEST: Theme Toggle (Store: userPrefs) ---
  // Click the theme toggle button (Update text to match your actual button)
  const themeBtn = page.locator('button', { hasText: /Toggle|Mode/i });
  await themeBtn.click();

  // Verify the 'dark' class was added to the shell or body
  await expect(shell).toHaveClass(/dark/);
  console.log('✅ UserPrefs store handled Dark Mode toggle');
  // --- 5. TEST: Sidebar Toggle (Store: appState) ---
  const sidebar = page.locator('aside');
  const toggleBtn = page.locator('header button'); // The ☰ button

  // Initial state: Sidebar should be open (from your default store value)
  await expect(sidebar).not.toHaveClass(/closed/);

  // Click to close
  await toggleBtn.click();
  await expect(sidebar).toHaveClass(/closed/);
  console.log('✅ AppState store handled Sidebar toggle');

  // --- 6. TAKE THE "PHOTO" ---
  console.log('📸 Taking evidence photo...');
  await page.screenshot({ path: 'barrel-store-evidence.png', fullPage: true });
});
