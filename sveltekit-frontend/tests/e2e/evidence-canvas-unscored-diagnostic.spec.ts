import { test, expect, type Page } from '@playwright/test';

/**
 * Diagnostic for the EvidenceCanvas fix: a connection must never show a fabricated (Math.random) similarity.
 * - /api/embed failing  -> connection is UNSCORED, status says so, no "% similarity"
 * - /api/embed succeeding -> a real cosine score is shown
 * Captures pageerror/console errors so a blank or broken page is reported, not hidden.
 */
async function openCanvas(page: Page) {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
	// The aborted /api/embed request logs its own net error; that is the injected fault, not a page bug.
	page.on('console', (m) => { if (m.type() === 'error' && !m.location().url.includes('/api/embed')) errors.push(`console.error: ${m.text()} @ ${m.location().url}`); });
	await page.goto('/demos/evidence-canvas');
	// EvidenceCanvas renders only under the 'ai-canvas' view; the demo opens on the Canvas Editor.
	await page.getByRole('button', { name: 'AI Evidence', exact: true }).click();
	const nodes = page.locator('div[role="button"]:has(.node-title)');
	await expect(nodes.first()).toBeVisible({ timeout: 30_000 });
	expect(await nodes.count()).toBeGreaterThanOrEqual(2);
	return { nodes, errors };
}

async function connectFirstTwo(page: Page, nodes: ReturnType<Page['locator']>) {
	await nodes.nth(0).click();
	await nodes.nth(1).click();
	await page.locator('button[title="Connect selected nodes"]').click();
	const status = page.locator('.status-bar');
	await expect(status).toContainText('Created similarity connection', { timeout: 10_000 });
	return (await status.innerText()).trim();
}

test.describe('EvidenceCanvas connection scoring', () => {
	test('embedding failure => UNSCORED, never a random percentage', async ({ page }, info) => {
		await page.route('**/api/embed', (r) => r.abort());
		const { nodes, errors } = await openCanvas(page);
		const message = await connectFirstTwo(page, nodes);
		await page.screenshot({ path: info.outputPath('unscored.png'), fullPage: true });
		console.log('STATUS (embed failing):', message);
		expect(message).toMatch(/unscored/i);
		expect(message).not.toMatch(/\d+% similarity/);
		expect(errors, errors.join('\n')).toEqual([]);
	});

	test('embedding success => real cosine score is shown', async ({ page }, info) => {
		await page.route('**/api/embed', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ embedding: [1, 0, 0] }) }));
		const { nodes, errors } = await openCanvas(page);
		const message = await connectFirstTwo(page, nodes);
		await page.screenshot({ path: info.outputPath('scored.png'), fullPage: true });
		console.log('STATUS (embed ok):', message);
		expect(message).toContain('100% similarity');
		expect(errors, errors.join('\n')).toEqual([]);
	});
});
