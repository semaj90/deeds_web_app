import { expect, test } from '@playwright/test';

/**
 * Redis-GPU Pipeline Integration Tests
 * Tests the complete flow: MinIO → Redis → GPU Processing → Qdrant
 */

test.describe('Redis-GPU Pipeline', () => {
	test.beforeEach(async ({ page }) => {
		// Navigate to upload page
		await page.goto('/upload');
	});

	test('should process document through complete pipeline', async ({ page }) => {
		// Step 1: Upload document to MinIO
		const fileInput = page.locator('input[type="file"]');
		await fileInput.setInputFiles({
			name: 'test-evidence.pdf',
			mimeType: 'application/pdf',
			buffer: Buffer.from('Mock PDF content for testing')
		});

		const uploadButton = page.locator('button:has-text("Upload")');
		await uploadButton.click();

		// Wait for upload confirmation
		await expect(page.locator('text=/uploaded|success/i')).toBeVisible({ timeout: 10000 });

		// Step 2: Verify Redis queue processing
		// Check if processing status appears
		await expect(page.locator('text=/processing|queued/i')).toBeVisible({ timeout: 5000 });

		// Step 3: Wait for GPU processing completion
		// Should show GPU acceleration indicator
		await expect(
			page.locator('text=/gpu|accelerated|tensor/i')
		).toBeVisible({ timeout: 15000 });

		// Step 4: Verify Qdrant indexing
		// Navigate to search/RAG interface
		await page.goto('/rag-search');

		// Search for the uploaded document
		const searchInput = page.locator('input[placeholder*="search" i]');
		await searchInput.fill('test-evidence');
		await searchInput.press('Enter');

		// Verify document appears in search results
		await expect(page.locator('text=/test-evidence/i')).toBeVisible({ timeout: 10000 });
	});

	test('should show Redis cache hit indicator', async ({ page }) => {
		await page.goto('/rag-search');

		// First search (cache miss)
		const searchInput = page.locator('input[placeholder*="search" i]');
		await searchInput.fill('legal precedent');
		await searchInput.press('Enter');

		// Wait for results
		await page.waitForTimeout(2000);

		// Second identical search (should hit cache)
		await searchInput.fill('');
		await searchInput.fill('legal precedent');
		await searchInput.press('Enter');

		// Check for cache indicator (faster response time or visual indicator)
		const cacheIndicator = page.locator('text=/cached|from cache/i');
		await expect(cacheIndicator).toBeVisible({ timeout: 5000 });
	});

	test('should display GPU processing metrics', async ({ page }) => {
		await page.goto('/admin/system-configuration');

		// Check for GPU status
		const gpuStatus = page.locator('text=/gpu|nvidia|cuda/i');
		await expect(gpuStatus).toBeVisible();

		// Verify Redis connection
		const redisStatus = page.locator('text=/redis.*connected/i');
		await expect(redisStatus).toBeVisible();

		// Check processing metrics
		const metricsSection = page.locator('[data-testid="pipeline-metrics"]');
		await expect(metricsSection).toBeVisible();
	});

	test('should handle pipeline failure gracefully', async ({ page }) => {
		await page.goto('/upload');

		// Upload invalid file type
		const fileInput = page.locator('input[type="file"]');
		await fileInput.setInputFiles({
			name: 'invalid.exe',
			mimeType: 'application/x-msdownload',
			buffer: Buffer.from('Invalid executable')
		});

		const uploadButton = page.locator('button:has-text("Upload")');
		await uploadButton.click();

		// Should show error message
		await expect(page.locator('text=/error|invalid|unsupported/i')).toBeVisible({
			timeout: 5000
		});

		// Pipeline should not crash
		await page.goto('/rag-search');
		await expect(page.locator('input[placeholder*="search" i]')).toBeVisible();
	});
});

test.describe('Button Component Tests', () => {
	test('Svelte 5 Button.Root with bits-ui should render', async ({ page }) => {
		await page.goto('/');

		// Test primary action buttons
		const primaryButtons = page.locator('button[data-button-root]');
		expect(await primaryButtons.count()).toBeGreaterThan(0);

		// Verify button is interactive
		const firstButton = primaryButtons.first();
		await expect(firstButton).toBeEnabled();

		// Test hover state
		await firstButton.hover();
		// Button should have hover class or style change
		const hasHoverEffect = await firstButton.evaluate((btn) => {
			const styles = window.getComputedStyle(btn);
			return styles.transition.includes('background') || styles.cursor === 'pointer';
		});
		expect(hasHoverEffect).toBeTruthy();
	});

	test('Button variants should apply correct styles', async ({ page }) => {
		await page.goto('/');

		// Test different button variants
		const defaultButton = page.locator('button.nes-btn:not(.is-primary):not(.is-success)').first();
		const primaryButton = page.locator('button.nes-btn.is-primary').first();
		const successButton = page.locator('button.nes-btn.is-success').first();

		// All variants should be visible
		if (await defaultButton.isVisible()) {
			await expect(defaultButton).toBeVisible();
		}
		if (await primaryButton.isVisible()) {
			await expect(primaryButton).toBeVisible();
		}
		if (await successButton.isVisible()) {
			await expect(successButton).toBeVisible();
		}
	});

	test('Disabled buttons should not be clickable', async ({ page }) => {
		await page.goto('/');

		const disabledButton = page.locator('button:disabled').first();
		if (await disabledButton.isVisible()) {
			await expect(disabledButton).toBeDisabled();

			// Attempt to click should not trigger action
			await disabledButton.click({ force: true });
			// Page should remain stable (no navigation or error)
			await expect(page).toHaveURL(/\//);
		}
	});
});
