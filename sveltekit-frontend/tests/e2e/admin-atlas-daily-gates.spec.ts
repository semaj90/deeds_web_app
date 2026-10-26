import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PORTS } from '../helpers/env-ports.js';

for (const width of [1280, 390]) {
test(`live daily diagnostic proposals remain bounded and non-executable at ${width}px`, async ({ page }, testInfo) => {
	await page.setViewportSize({ width, height: 900 });
	const boardPath = new URL('../../../docs/reports/atlas/atlas-kanban-tasks.json', import.meta.url);
	const boardBytes = readFileSync(boardPath, 'utf8');
	const snapshot = JSON.parse(boardBytes) as {
		tasks: { id: string; origin?: string; status?: string; dispatchable?: boolean; mutationAllowed?: boolean; reason_codes?: string[] }[];
	};
	const proposals = snapshot.tasks.filter((task) => task.origin === 'agentic_error_fixing_v1'
		&& task.dispatchable === false && task.mutationAllowed === false);
	expect(proposals.length).toBeGreaterThan(0);
	const response = await page.goto(`${PORTS.APP_BASE}/admin/ai-dashboard`, { waitUntil: 'domcontentloaded' });
	expect(response?.status()).toBe(200);
	await expect(page.getByRole('heading', { name: 'Daily Diagnostic Board', exact: true })).toBeVisible();
	if (width <= 768) {
		const sidebar = page.locator('.yorha-sidebar');
		await expect(sidebar).toHaveClass(/collapsed/);
		const desktopPreference = await page.evaluate(() => localStorage.getItem('yorha-sidebar-collapsed'));
		await page.getByTitle('Expand sidebar', { exact: true }).click();
		await expect(sidebar).not.toHaveClass(/collapsed/);
		await page.getByTitle('Collapse sidebar', { exact: true }).click();
		await expect(sidebar).toHaveClass(/collapsed/);
		expect(await page.evaluate(() => localStorage.getItem('yorha-sidebar-collapsed'))).toBe(desktopPreference);
	}
	await expect(page.getByText('File-backed diagnostic proposals, separate from PostgreSQL Kanban tasks', { exact: false })).toBeVisible();
	const cards = page.locator('.board-grid article.task-card');
	for (const proposal of proposals.slice(0, 20)) {
		const card = cards.filter({ hasText: proposal.id });
		await expect(card).toHaveCount(1);
		await expect(card.locator('.task-status')).toHaveText('PROPOSED');
		await expect(card.getByRole('button', { name: 'Queue validation' })).toHaveCount(0);
		for (const reason of proposal.reason_codes ?? []) {
			await expect(card.getByText(reason, { exact: true })).toBeVisible();
		}
		await card.locator('summary').click();
		await expect(card.locator('.task-evidence ul')).toBeVisible();
		expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
	}
	await testInfo.attach('observed-diagnostic-board', { body: boardBytes, contentType: 'application/json' });
	await page.getByRole('heading', { name: 'Daily Diagnostic Board', exact: true }).scrollIntoViewIfNeeded();
	const pageWidth = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
	expect(pageWidth.content, JSON.stringify(pageWidth)).toBeLessThanOrEqual(pageWidth.viewport + 1);
	const layout = await page.evaluate(() => ({
		scrollX,
		viewport: innerWidth,
		boxes: ['.app-shell', '.content', '.ai-dashboard-hub', '.board-shell', '.yorha-sidebar'].map((selector) => {
			const element = document.querySelector(selector);
			const rect = element?.getBoundingClientRect();
			return { selector, left: rect?.left, right: rect?.right, width: rect?.width };
		}),
	}));
	await testInfo.attach('observed-board-layout', { body: JSON.stringify(layout), contentType: 'application/json' });
	const boardBounds = await page.locator('.board-shell').boundingBox();
	expect(boardBounds?.x, JSON.stringify(layout)).toBeGreaterThanOrEqual(0);
	await page.screenshot({ path: testInfo.outputPath('daily-gate-proposals.png'), fullPage: true });
});
}
