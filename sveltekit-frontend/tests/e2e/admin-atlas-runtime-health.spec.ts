import { expect, test, type Locator } from '@playwright/test';
import { PORTS } from '../helpers/env-ports.js';

type RuntimeHealthResponse = {
	ok: boolean;
	health: {
		ok: boolean;
		indexed: number;
		dim: number;
		bits: number;
		backend: string | null;
		source: string | null;
		collection: string | null;
		representationId: string | null;
		role: string | null;
		turbovec: boolean | null;
	} | null;
	error: string | null;
};

const healthPath = '/api/admin/atlas/turbovec-prefilter';

function assertHealthContract(body: RuntimeHealthResponse) {
	expect(Object.keys(body).sort()).toEqual(['error', 'health', 'ok']);
	expect(typeof body.ok).toBe('boolean');
	expect(body.error === null || typeof body.error === 'string').toBe(true);
	if (body.health === null) {
		expect(body.ok).toBe(false);
		expect(body.error).toEqual(expect.any(String));
		return;
	}
	expect(typeof body.health.ok).toBe('boolean');
	for (const field of ['indexed', 'dim', 'bits'] as const) {
		expect(Number.isSafeInteger(body.health[field]), field).toBe(true);
		expect(body.health[field], field).toBeGreaterThanOrEqual(0);
	}
	for (const field of ['backend', 'source', 'collection', 'representationId', 'role'] as const) {
		if (body.health[field] !== null) {
			expect(body.health[field], field).toEqual(expect.any(String));
		}
	}
	if (body.health.turbovec !== null) {
		expect(typeof body.health.turbovec).toBe('boolean');
	}
}

function healthCard(panel: Locator, label: string) {
	return panel.getByText(label, { exact: true }).locator('..');
}

test.use({ baseURL: PORTS.APP_BASE, locale: 'en-US' });

test.describe('Admin Atlas live runtime health', () => {
	test('TurboVec panel reflects the same-origin live backend', async ({ request, page }, testInfo) => {
		const preflight = await request.get(healthPath, { timeout: 15_000 });
		expect(preflight.status(), await preflight.text()).toBe(200);
		const preflightBody: RuntimeHealthResponse = await preflight.json();
		assertHealthContract(preflightBody);
		await testInfo.attach('live-turbovec-preflight', {
			body: JSON.stringify(preflightBody, null, 2),
			contentType: 'application/json'
		});

		const navigation = await page.goto('/admin/atlas', { waitUntil: 'domcontentloaded' });
		expect(navigation?.status()).toBe(200);
		const healthResponsePromise = page.waitForResponse((response) =>
			new URL(response.url()).pathname === healthPath && response.request().method() === 'GET'
		);
		await page.getByRole('button', { name: '[turbovec]', exact: true }).click();
		const healthResponse = await healthResponsePromise;
		expect(healthResponse.status(), await healthResponse.text()).toBe(200);
		expect(new URL(healthResponse.url()).origin).toBe(new URL(page.url()).origin);
		const actual: RuntimeHealthResponse = await healthResponse.json();
		assertHealthContract(actual);
		await testInfo.attach('live-turbovec-panel-response', {
			body: JSON.stringify(actual, null, 2),
			contentType: 'application/json'
		});

		const refresh = page.getByRole('button', { name: 'REFRESH_HEALTH', exact: true });
		await expect(refresh).toBeEnabled();
		const panel = page.getByRole('region', { name: 'TurboVec sidecar health', exact: true });
		if (actual.health) {
			await expect(healthCard(panel, 'STATUS')).toContainText(actual.health.ok ? 'ONLINE' : 'DEGRADED');
			await expect(healthCard(panel, 'INDEXED')).toContainText(actual.health.indexed.toLocaleString('en-US'));
			await expect(healthCard(panel, 'DIM / BITS')).toContainText(`${actual.health.dim}d / ${actual.health.bits}b`);
			await expect(healthCard(panel, 'BACKEND')).toContainText(actual.health.backend ?? 'UNREPORTED');
			for (const field of ['source', 'collection', 'representationId', 'role'] as const) {
				const value = actual.health[field];
				if (value) await expect(panel.getByText(value, { exact: true })).toBeVisible();
			}
		} else {
			await expect(panel.getByText('SIDECAR_OFFLINE', { exact: true })).toBeVisible();
			await expect(panel.getByText('ONLINE', { exact: true })).toHaveCount(0);
		}
		await page.screenshot({ path: testInfo.outputPath('admin-atlas-runtime-health.png'), fullPage: true });
	});

	test('task-source index shows source counts and interactive snapshot tabs', async ({ page }, testInfo) => {
		const navigation = await page.goto('/admin/atlas/task-sources', { waitUntil: 'domcontentloaded' });
		expect(navigation?.status()).toBe(200);
		await expect(page.getByRole('heading', { name: 'OpenSpec task source index', exact: true })).toBeVisible();
		await expect(page.getByText('Searchable source locators, not an executable Kanban queue.', { exact: false })).toBeVisible();
		const snapshot = page.getByRole('region', { name: 'Source index snapshot', exact: true });
		await expect(snapshot).toBeVisible();
		const indexedCard = snapshot.locator('div').filter({ has: page.getByText('Indexed open source lines', { exact: true }) });
		const indexedText = await indexedCard.locator('p').nth(1).innerText();
		expect(indexedText).toMatch(/^\d[\d,]*$/);
		expect(Number(indexedText.replaceAll(',', ''))).toBeGreaterThan(0);
		const snapshotCard = snapshot.locator('div').filter({ has: page.getByText('Snapshot', { exact: true }) });
		const snapshotId = (await snapshotCard.locator('p').nth(1).innerText()).trim();
		expect(snapshotId).toMatch(/^sha256:[a-f0-9]{64}$/);

		const tabList = page.getByRole('tablist', { name: 'Task source views', exact: true });
		const sourcesTab = tabList.getByRole('tab', { name: 'Open task sources', exact: true });
		const detailsTab = tabList.getByRole('tab', { name: 'Snapshot details', exact: true });
		await expect(sourcesTab).toHaveAttribute('aria-selected', 'true');
		await detailsTab.click();
		await expect(detailsTab).toHaveAttribute('aria-selected', 'true');
		await expect(sourcesTab).toHaveAttribute('aria-selected', 'false');
		const details = page.getByRole('tabpanel');
		await expect(details).toContainText('Workspace snapshot:');
		await expect(details).toContainText('Input census checksum:');
		await expect(details).toContainText('Repository task source lines; source revision intentionally deferred.');
		await page.screenshot({ path: testInfo.outputPath('admin-atlas-task-source-snapshot.png'), fullPage: true });
		await sourcesTab.click();
		await expect(sourcesTab).toHaveAttribute('aria-selected', 'true');
		await expect(page.getByRole('columnheader', { name: 'Source ref', exact: true })).toBeVisible();
		await expect(page.locator('tbody tr').first()).toContainText(/openspec\//);
		await page.screenshot({ path: testInfo.outputPath('admin-atlas-task-sources.png'), fullPage: true });
	});

	test('Daily Graphify dashboard refreshes diagnostic Top 10 and Top 100 errors', async ({ page }, testInfo) => {
		const navigation = await page.goto('/admin/ai-dashboard', { waitUntil: 'domcontentloaded' });
		expect(navigation?.status()).toBe(200);
		await expect(page.getByRole('heading', { name: 'Daily Diagnostic Board', exact: true })).toBeVisible();
		const runtimePriority = page.getByRole('region', { name: 'Runtime error priority' });
		await expect(runtimePriority.getByRole('button', { name: 'Top 10', exact: true })).toHaveAttribute('aria-pressed', 'true');
		await expect(runtimePriority.getByRole('button', { name: 'Top 100', exact: true })).toHaveAttribute('aria-pressed', 'false');
		await expect(page.getByText(/auto-refresh 15s/)).toBeVisible();

		const responsePromise = page.waitForResponse((response) =>
			new URL(response.url()).pathname === '/api/admin/ai-dashboard/runtime-errors' &&
			response.request().method() === 'GET',
		);
		await runtimePriority.getByRole('button', { name: 'Refresh', exact: true }).click();
		const response = await responsePromise;
		expect(response.status()).toBe(200);
		const report = await response.json();
		expect(report.status).toBe('AVAILABLE');
		expect(Number.isInteger(report.total)).toBe(true);
		expect(report.top10.length).toBeLessThanOrEqual(10);
		expect(report.top100.length).toBeLessThanOrEqual(100);
		await expect(page.getByText(/auto-refresh 15s/)).toBeVisible();
		await testInfo.attach('daily-graphify-runtime-error-priority.png', {
			body: await page.screenshot({ fullPage: true }),
			contentType: 'image/png',
		});
	});

	test('Daily Graphify task priority switches between Top 10 and Top 100 without changing task state', async ({ page }, testInfo) => {
		const navigation = await page.goto('/admin/ai-dashboard', { waitUntil: 'domcontentloaded' });
		expect(navigation?.status()).toBe(200);
		const taskPriority = page.getByRole('region', { name: 'Daily task priority' });
		await expect(taskPriority.getByRole('button', { name: 'Top 10', exact: true })).toHaveAttribute('aria-pressed', 'true');
		await expect(taskPriority.getByRole('button', { name: 'Top 100', exact: true })).toHaveAttribute('aria-pressed', 'false');
		await expect(taskPriority.getByText(/explicit board P0–P3 labels/)).toBeVisible();
		const countLine = taskPriority.locator('.runtime-error-count');
		const initialCountText = await countLine.innerText();
		const initialShown = Number(initialCountText.match(/Showing (\d+) of/)?.[1]);
		const total = Number(initialCountText.match(/of (\d+) file-backed/)?.[1]);
		expect(initialShown).toBe(Math.min(10, total));
		await expect(taskPriority.locator('.runtime-error-card')).toHaveCount(initialShown);

		await taskPriority.getByRole('button', { name: 'Top 100', exact: true }).click();
		await expect(taskPriority.getByRole('button', { name: 'Top 100', exact: true })).toHaveAttribute('aria-pressed', 'true');
		await expect(countLine).toContainText(`Showing ${Math.min(100, total)} of ${total}`);
		await expect(taskPriority.locator('.runtime-error-card')).toHaveCount(Math.min(100, total));
		await expect(taskPriority.getByText(/does not queue or promote tasks/)).toBeVisible();
		await testInfo.attach('daily-graphify-task-priority.png', {
			body: await page.screenshot({ fullPage: true }),
			contentType: 'image/png',
		});
	});
});
