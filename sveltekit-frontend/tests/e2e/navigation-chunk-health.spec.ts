import { expect, test } from '@playwright/test';

test('sidebar navigation and lazy route chunks render without failed module loads', async ({ page }) => {
	const failedClientChunks: string[] = [];
	page.on('requestfailed', (request) => {
		if (request.url().includes('/.svelte-kit/generated/client/nodes/')) {
			failedClientChunks.push(`${request.url()} :: ${request.failure()?.errorText ?? 'request failed'}`);
		}
	});
	page.on('response', (response) => {
		if (
			response.url().includes('/.svelte-kit/generated/client/nodes/') &&
			response.status() >= 400
		) {
			failedClientChunks.push(`${response.status()} ${response.url()}`);
		}
	});

	await page.goto('/admin/ai-dashboard', { waitUntil: 'domcontentloaded' });
	await page.getByRole('link', { name: 'CODEBASE INDEX' }).click();
	await expect(page).toHaveURL(/\/admin\/codebase-index$/);
	await expect(page.getByRole('heading', { name: /codebase index/i }).first()).toBeVisible();

	await page.getByRole('link', { name: 'DEMOS' }).click();
	await expect(page).toHaveURL(/\/demos$/);
	await page.getByRole('button', { name: /YoRHa Terminal.*Status/ }).click();
	await page.getByRole('button', { name: /Launch Demo/i }).click();
	await expect(page).toHaveURL(/\/demos\/yorha-terminal$/);
	await expect(page.getByRole('heading', { name: /yorha terminal/i })).toBeVisible();
	await expect.poll(() => failedClientChunks).toEqual([]);
});
