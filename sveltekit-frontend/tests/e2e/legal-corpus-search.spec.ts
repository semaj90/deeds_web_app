import { test, expect } from '@playwright/test';

/**
 * California code corpus (library_documents -> legal_nodes -> legal_chunks) is loaded and searchable.
 * Lexical path only: embeddings are filled in asynchronously by the CPU worker, so nothing here
 * depends on vector search. Needs the dev server (DEV_BYPASS_AUTH) and the ingested corpus.
 */
const CODES = [
	'California Penal Code',
	'California Health and Safety Code',
	'California Civil Code',
	'California Evidence Code',
	'California Welfare and Institutions Code',
];

test.describe('legal corpus: California codes', () => {
	test('library lists all five codes with sections and chunks', async ({ page }) => {
		await page.goto('/library');
		for (const title of CODES) {
			await expect(page.getByText(title, { exact: false }).first()).toBeVisible();
		}
		await page.screenshot({ path: 'test-results/legal-corpus/library-list.png', fullPage: true });
	});

	test('library title filter narrows to one code', async ({ page }) => {
		await page.goto('/library');
		await page.getByPlaceholder(/search/i).first().fill('penal');
		await expect(page.getByText('California Penal Code').first()).toBeVisible();
		await expect(page.getByText('California Civil Code')).toHaveCount(0);
	});

	test('API: chunk search finds Penal Code theft sections', async ({ request }) => {
		const res = await request.post('/api/library/search', {
			data: { query: 'grand theft property of another', jurisdiction: 'ca', limit: 20 },
		});
		expect(res.ok()).toBeTruthy();
		const body = await res.json();
		const hits = body.results ?? body.hits ?? [];
		expect(hits.length).toBeGreaterThan(0);
		expect(JSON.stringify(hits)).toContain('Cal. Pen. Code § 487');
	});

	test('API: statute lookups by topic hit the right code', async ({ request }) => {
		const cases: Array<[string, string]> = [
			['sex offender registration', 'Cal. Pen. Code § 290'],
			['harbors conceals or aids a principal in such felony', 'Cal. Pen. Code § 32'],
			['possession of controlled substance', 'Cal. Health & Safety Code § 11350'],
			['finds lost property appropriates to his own use knowledge of the true owner', 'Cal. Pen. Code § 485'],
			['finds a thing lost depositary for the owner', 'Cal. Civ. Code § 2080'],
			['hearsay evidence statement made other than by a witness', 'Cal. Evid. Code § 1200'],
		];
		for (const [query, expected] of cases) {
			const res = await request.post('/api/library/search', { data: { query, jurisdiction: 'ca', limit: 50 } });
			expect(res.ok(), query).toBeTruthy();
			const body = await res.json();
			const text = JSON.stringify(body.results ?? body.hits ?? []);
			expect(text, `${query} -> ${expected}`).toContain(expected);
		}
	});

	test('UI: reader Search tab returns Evidence Code hearsay (§ 1200)', async ({ page }) => {
		await page.goto('/library');
		await page.getByText('California Evidence Code').first().click();
		await page.waitForURL(/\/library\/[0-9a-f-]{36}/);
		const docUrl = page.url().split('?')[0].replace(/\/reader$/, '');
		await page.goto(`${docUrl}/reader`);

		const input = page.getByPlaceholder('Search within this library...');
		// retry the click until Svelte has hydrated and the tab actually opens
		await expect(async () => {
			await page.getByRole('button', { name: 'Search', exact: true }).first().click();
			await expect(input).toBeVisible({ timeout: 2000 });
		}).toPass({ timeout: 30000 });
		await input.fill('hearsay evidence statement made other than by a witness');
		await input.press('Enter');

		const card = page.locator('.lr-result-card').first();
		await expect(card).toBeVisible({ timeout: 30000 });
		// top-10 order depends on how many chunks are embedded yet; assert on content, not rank
		await expect(page.locator('.lr-results-list')).toContainText('Cal. Evid. Code §');
		await expect(page.locator('.lr-results-list')).toContainText(/hearsay/i);
		expect(await page.locator('.lr-result-card').count()).toBeGreaterThanOrEqual(5);
		await page.screenshot({ path: 'test-results/legal-corpus/reader-search.png', fullPage: true });
	});
});

/**
 * Buttons / controls + forensic error log.
 * Read-only: never submits the upload form, never calls a mutating endpoint. Every browser signal
 * (console, pageerror, 4xx/5xx with body, requestfailed) is recorded per step and written to
 * ../logs/task-output/legal-corpus-e2e-errors.json (outside test-results/, which Playwright wipes).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Page, Locator } from '@playwright/test';
import { attachListeners, emptyLog, type CapturedLog } from './route-forensic/_helpers';

const steps: Record<string, CapturedLog> = {};
function track(page: Page, label: string): CapturedLog {
	const log = emptyLog();
	attachListeners(page, log);
	steps[label] = log;
	return log;
}
const benign = (u: string, f: string) => /ERR_ABORTED/.test(f) || /__data\.json/.test(u);
function hard(log: CapturedLog) {
	return {
		consoleErrors: log.consoleMessages.filter((m) => m.type === 'error'),
		pageErrors: log.pageErrors,
		serverErrors: log.responses.filter((r) => r.status >= 500),
		clientErrors: log.responses.filter((r) => r.status >= 400 && r.status < 500),
		requestFailures: log.requestFailures.filter((r) => !benign(r.url, r.failure)),
	};
}
async function clickUntil(target: Locator, done: () => Promise<void>) {
	// Svelte may not be hydrated on first click; retry until the effect is visible.
	await expect(async () => {
		await target.click();
		await done();
	}).toPass({ timeout: 30000 });
}

test.describe.serial('legal corpus: buttons and controls (read-only) + error log', () => {
	test.afterAll(() => {
		const out = path.resolve(process.cwd(), '..', 'logs', 'task-output');
		fs.mkdirSync(out, { recursive: true });
		const report = Object.entries(steps).map(([label, log]) => {
			const h = hard(log);
			return {
				step: label,
				counts: {
					consoleErrors: h.consoleErrors.length,
					consoleWarnings: log.consoleMessages.filter((m) => m.type === 'warning').length,
					pageErrors: h.pageErrors.length,
					serverErrors: h.serverErrors.length,
					clientErrors: h.clientErrors.length,
					requestFailures: h.requestFailures.length,
					requests: log.requests.length,
				},
				consoleErrors: h.consoleErrors.slice(0, 5),
				consoleWarningsSample: log.consoleMessages
					.filter((m) => m.type === 'warning')
					.slice(0, 3)
					.map((m) => m.text.slice(0, 200)),
				pageErrors: h.pageErrors.slice(0, 5),
				serverErrors: h.serverErrors.slice(0, 5),
				clientErrors: h.clientErrors.slice(0, 5),
				requestFailures: h.requestFailures.slice(0, 5),
			};
		});
		fs.writeFileSync(
			path.join(out, 'legal-corpus-e2e-errors.json'),
			JSON.stringify({ generated: new Date().toISOString(), report }, null, 2),
		);
	});

	test('library: Upload button toggles the panel (no submit)', async ({ page }) => {
		const log = track(page, 'library:upload-toggle');
		await page.goto('/library');
		const panel = page.locator('.lib-upload-panel');
		await clickUntil(page.getByRole('button', { name: /^Upload$/ }), () => expect(panel).toBeVisible({ timeout: 2000 }));
		await expect(panel.locator('input[type="file"][accept=".pdf"]')).toBeVisible();
		await expect(panel.getByPlaceholder(/Title/)).toBeVisible();
		await expect(panel.getByRole('button', { name: 'Upload & Ingest' })).toBeEnabled();
		await page.getByRole('button', { name: /^Upload$/ }).click();
		await expect(panel).toBeHidden();
		expect.soft(hard(log).pageErrors).toHaveLength(0);
		expect.soft(hard(log).consoleErrors).toHaveLength(0);
	});

	test('library: jurisdiction and type filters change the result count', async ({ page }) => {
		const log = track(page, 'library:filters');
		await page.goto('/library');
		const count = page.locator('.lib-result-count');
		const selects = page.locator('select.lib-select');
		await expect(count).toContainText(/\d+ results/);
		await expect(async () => {
			await selects.nth(0).selectOption('ca');
			await expect(count).toHaveText('5 results', { timeout: 2000 });
		}).toPass({ timeout: 30000 });
		await selects.nth(1).selectOption('statute');
		await expect(count).toHaveText('5 results');
		// no California treatises exist -> empty state (options only list types/jurisdictions that have documents)
		await selects.nth(1).selectOption('treatise');
		await expect(count).toHaveText('0 results');
		await expect(page.getByText('No documents yet')).toBeVisible();
		await selects.nth(0).selectOption('all');
		await selects.nth(1).selectOption('all');
		await expect(count).not.toHaveText('0 results');
		expect.soft(hard(log).pageErrors).toHaveLength(0);
		expect.soft(hard(log).consoleErrors).toHaveLength(0);
	});

	test('library -> detail -> reader -> back navigation links work', async ({ page }) => {
		const log = track(page, 'library:card-detail-reader');
		await page.goto('/library');
		await clickUntil(page.getByText('California Penal Code').first(), () =>
			expect(page).toHaveURL(/\/library\/[0-9a-f-]{36}$/, { timeout: 2000 }),
		);
		await expect(page.getByRole('link', { name: 'Open Reader' }).first()).toBeVisible();
		await expect(page.getByRole('link', { name: /Back to Library/ })).toBeVisible();
		const official = page.locator('a.ld-official-link');
		if (await official.count()) {
			await expect(official.first()).toHaveAttribute('target', '_blank');
			await expect(official.first()).toHaveAttribute('rel', /noopener/);
		}
		await page.getByRole('link', { name: 'Open Reader' }).first().click();
		await expect(page).toHaveURL(/\/library\/[0-9a-f-]{36}\/reader$/);
		await page.goBack();
		await page.getByRole('link', { name: /Back to Library/ }).click();
		await expect(page).toHaveURL(/\/library$/);
		expect.soft(hard(log).pageErrors).toHaveLength(0);
		expect.soft(hard(log).serverErrors).toHaveLength(0);
	});

	test('reader: section click, All sections back button, and all four tabs', async ({ page }) => {
		const log = track(page, 'reader:tabs-and-sections');
		await page.goto('/library');
		await clickUntil(page.getByText('California Evidence Code').first(), () =>
			expect(page).toHaveURL(/\/library\/[0-9a-f-]{36}$/, { timeout: 2000 }),
		);
		await page.goto(`${page.url()}/reader`);

		// TOC section -> text pane shows that section; back button returns to the full list
		const section = page.getByText('California Evidence Code § 1200', { exact: true }).first();
		await expect(async () => {
			await section.click();
			await expect(page.getByRole('button', { name: /All sections/ })).toBeVisible({ timeout: 2000 });
		}).toPass({ timeout: 30000 });
		await expect(page.locator('.lr-content')).toContainText(/hearsay/i, { timeout: 20000 });
		await page.getByRole('button', { name: /All sections/ }).click();
		await expect(page.getByRole('button', { name: /All sections/ })).toBeHidden();

		// Tabs: each must open without an uncaught exception
		for (const tab of ['Summary', 'PDF', 'Search', 'Official Text']) {
			const btn = page.getByRole('button', { name: tab, exact: true }).first();
			await btn.click();
			await expect(btn).toHaveClass(/active/);
		}

		// Search tab: Search button works, a no-result query does not crash
		await page.getByRole('button', { name: 'Search', exact: true }).first().click();
		const input = page.getByPlaceholder('Search within this library...');
		await input.fill('hearsay evidence');
		await page.locator('.lr-search-btn').click();
		await expect(page.locator('.lr-result-card').first()).toBeVisible({ timeout: 30000 });
		await input.fill('zzzqqq nonsense xylophone');
		await page.locator('.lr-search-btn').click();
		await expect(page.locator('.lr-search-btn')).toBeEnabled({ timeout: 30000 });
		await expect(page.locator('.lr-search-empty')).toContainText('No matching sections found');

		expect.soft(hard(log).pageErrors, 'uncaught exceptions').toHaveLength(0);
		expect.soft(hard(log).serverErrors, '5xx responses').toHaveLength(0);
		expect.soft(hard(log).consoleErrors, 'console.error').toHaveLength(0);
	});

	for (const route of ['/library/glossary', '/library/corpus', '/legal-corpus']) {
		test(`page loads cleanly: ${route}`, async ({ page }) => {
			const log = track(page, `page:${route}`);
			await page.goto(route);
			await expect(page.locator('main, [role="main"], body').first()).toBeVisible();
			await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
			expect.soft(hard(log).pageErrors).toHaveLength(0);
			expect.soft(hard(log).serverErrors).toHaveLength(0);
			expect.soft(hard(log).consoleErrors).toHaveLength(0);
		});
	}
});
