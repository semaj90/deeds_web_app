import { test, expect } from '@playwright/test';

test.describe('Unified Indexing Studio Visual Verification', () => {
  test('should capture high-fidelity studio screenshot', async ({ page }) => {
    // 1. Navigate to the admin studio
    // Using the bypass auth path if necessary, but assuming dev mode is on
    await page.goto('/admin/unified-indexing-studio');

    // 2. Wait for the studio to hydrate
    await page.waitForSelector('h1:has-text("Unified Indexing Studio")');
    
    // 3. Assert on key components
    const heading = page.locator('h1');
    await expect(heading).toContainText('Unified Indexing Studio');

    // 4. Verify Stat Cards exist
    const cards = page.locator('.stat-card');
    await expect(cards).toHaveCount(4);

    // 5. Verify AI Assistant is present
    const assistant = page.locator('.chat-assistant-container');
    await expect(assistant).toBeVisible();

    // 6. Explicit Screenshot for verification
    await page.screenshot({ 
      path: 'test-results/unified-studio-verify.png', 
      fullPage: true,
      animations: 'disabled'
    });
    
    console.log('✅ Visual verification screenshot captured at test-results/unified-studio-verify.png');
  });
});
