/**
 * Button reaction sweep: for every page the route sweep visited, click each visible, enabled button
 * and record whether it reacted. A button "reacts" if the click produced a navigation, a network
 * request, a DOM change, or a newly visible dialog. A button that reacts to nothing is a DEAD candidate.
 *
 * Read-only by design: buttons whose label suggests a write, submit, delete, upload, or external
 * action are SKIPPED_UNSAFE and never clicked. Form submit buttons are skipped too.
 *
 * Gated: runs only with BUTTON_SWEEP=1. Requires the route sweep manifest first:
 *   ROUTE_SWEEP=1 npx playwright test tests/e2e/route-sweep.spec.ts
 *   BUTTON_SWEEP=1 npx playwright test tests/e2e/button-reaction-sweep.spec.ts
 * Optional:
 *   BUTTON_SWEEP_LIMIT=3       visit only the first N routes (smoke run)
 *   BUTTON_SWEEP_PER_PAGE=25   max buttons clicked per page
 *
 * Output: .tmp/button-sweep/<slug>.json per route, plus .tmp/button-sweep/manifest.json.
 * The test fails only on uncaught page errors; dead buttons are reported, not failed,
 * because many are intentionally inert until a modal or data loads.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ENABLED = process.env.BUTTON_SWEEP === '1';
const LIMIT = Number(process.env.BUTTON_SWEEP_LIMIT ?? '0');
const PER_PAGE = Number(process.env.BUTTON_SWEEP_PER_PAGE ?? '25');
const OUT_DIR = join(process.cwd(), '..', '.tmp', 'button-sweep');
const ROUTE_MANIFEST = join(process.cwd(), '..', '.tmp', 'route-sweep', 'manifest.json');
const BUTTON = 'button:visible';

// Labels that suggest a write, an external effect, or navigation away from the page.
const UNSAFE_LABEL =
	/delete|remove|logout|log out|sign out|submit|save|upload|send|export|publish|reset|clear|purge|archive|apply|confirm|pay|restart|stop|start|run|generate|analy[sz]e|ingest|index|sync|rebuild|create|add|import|approve|reject|accept|commit|migrate|sign in|login|register|download/i;

type Reaction = 'NAVIGATED' | 'REQUEST' | 'DOM_CHANGED' | 'DIALOG' | 'NONE' | 'CLICK_FAILED';

type ButtonResult = {
	index: number;
	label: string;
	status: 'CLICKED' | 'SKIPPED_UNSAFE' | 'SKIPPED_SUBMIT' | 'SKIPPED_HIDDEN_OR_DISABLED';
	reaction?: Reaction;
};

type RouteResult = {
	url: string;
	layouts: string[];
	navigationError?: string;
	buttons: ButtonResult[];
	pageErrors: string[];
	consoleErrors: string[];
};

type RouteEntry = { url: string; slug: string; layouts: string[]; status: string };

async function domFingerprint(page: Page): Promise<string> {
	return page.evaluate(() => {
		const s = document.body ? document.body.innerHTML : '';
		let h = 0;
		for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
		return `${h}:${s.length}`;
	});
}

async function visibleDialogs(page: Page): Promise<number> {
	return page.locator('[role="dialog"]:visible').count();
}

async function openRoute(page: Page, url: string): Promise<void> {
	await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
	await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
}

async function sweepRoute(page: Page, entry: RouteEntry): Promise<RouteResult> {
	const result: RouteResult = {
		url: entry.url,
		layouts: entry.layouts,
		buttons: [],
		pageErrors: [],
		consoleErrors: []
	};
	const onPageError = (e: Error) => result.pageErrors.push(String(e.message).slice(0, 300));
	const onConsole = (m: { type(): string; text(): string }) => {
		if (m.type() === 'error') result.consoleErrors.push(m.text().slice(0, 300));
	};
	page.on('pageerror', onPageError);
	page.on('console', onConsole);

	try {
		await openRoute(page, entry.url);
	} catch (err) {
		result.navigationError = String(err).slice(0, 300);
		page.off('pageerror', onPageError);
		page.off('console', onConsole);
		return result;
	}

	const total = Math.min(await page.locator(BUTTON).count(), PER_PAGE);
	for (let i = 0; i < total; i++) {
		const loc = page.locator(BUTTON).nth(i);
		const label = ((await loc.innerText().catch(() => '')) || (await loc.getAttribute('aria-label')) || '')
			.trim()
			.slice(0, 80);

		if (!(await loc.isVisible().catch(() => false)) || !(await loc.isEnabled().catch(() => false))) {
			result.buttons.push({ index: i, label, status: 'SKIPPED_HIDDEN_OR_DISABLED' });
			continue;
		}
		if ((await loc.getAttribute('type')) === 'submit') {
			result.buttons.push({ index: i, label, status: 'SKIPPED_SUBMIT' });
			continue;
		}
		if (UNSAFE_LABEL.test(label)) {
			result.buttons.push({ index: i, label, status: 'SKIPPED_UNSAFE' });
			continue;
		}

		const urlBefore = page.url();
		const domBefore = await domFingerprint(page);
		const dialogsBefore = await visibleDialogs(page);
		let requests = 0;
		const onRequest = () => {
			requests++;
		};
		page.on('request', onRequest);

		let reaction: Reaction;
		try {
			await loc.click({ timeout: 2000 });
			await page.waitForTimeout(400);
			const urlAfter = page.url();
			const domAfter = await domFingerprint(page);
			const dialogsAfter = await visibleDialogs(page);
			reaction =
				urlAfter !== urlBefore
					? 'NAVIGATED'
					: requests > 0
						? 'REQUEST'
						: domAfter !== domBefore
							? 'DOM_CHANGED'
							: dialogsAfter > dialogsBefore
								? 'DIALOG'
								: 'NONE';
		} catch {
			reaction = 'CLICK_FAILED';
		} finally {
			page.off('request', onRequest);
		}
		result.buttons.push({ index: i, label, status: 'CLICKED', reaction });

		// Restore the page so the next index points at the same button.
		if (reaction === 'NAVIGATED') {
			await openRoute(page, entry.url);
		} else if (reaction === 'DIALOG' || reaction === 'NONE' || reaction === 'DOM_CHANGED') {
			await page.keyboard.press('Escape').catch(() => {});
		}
	}

	page.off('pageerror', onPageError);
	page.off('console', onConsole);
	return result;
}

test('button reaction sweep over visited route-sweep pages', async ({ page }) => {
	test.skip(!ENABLED, 'Set BUTTON_SWEEP=1 to run (needs the route sweep manifest first).');
	test.setTimeout(60 * 60 * 1000);

	if (!existsSync(ROUTE_MANIFEST)) {
		throw new Error(`Missing ${ROUTE_MANIFEST}. Run the route sweep with ROUTE_SWEEP=1 first.`);
	}
	const manifest = JSON.parse(readFileSync(ROUTE_MANIFEST, 'utf8')) as { entries: RouteEntry[] };
	const routes = manifest.entries.filter((e) => e.status === 'VISITED');
	const selected = LIMIT > 0 ? routes.slice(0, LIMIT) : routes;

	mkdirSync(OUT_DIR, { recursive: true });
	const summary: Array<{ url: string; layouts: string[]; clicked: number; dead: number; pageErrors: number }> = [];

	for (const entry of selected) {
		const result = await sweepRoute(page, entry);
		const safeName = entry.slug || entry.url.replace(/[^a-z0-9]+/gi, '-');
		writeFileSync(join(OUT_DIR, `${safeName}.json`), JSON.stringify(result, null, 2));
		summary.push({
			url: entry.url,
			layouts: entry.layouts,
			clicked: result.buttons.filter((b) => b.status === 'CLICKED').length,
			dead: result.buttons.filter((b) => b.reaction === 'NONE').length,
			pageErrors: result.pageErrors.length
		});
	}

	writeFileSync(
		join(OUT_DIR, 'manifest.json'),
		JSON.stringify({ generatedAt: new Date().toISOString(), routes: summary.length, summary }, null, 2)
	);

	const deadRoutes = summary.filter((s) => s.dead > 0);
	console.log(
		`button sweep: ${summary.length} routes, ${summary.reduce((n, s) => n + s.clicked, 0)} buttons clicked, ` +
			`${summary.reduce((n, s) => n + s.dead, 0)} dead on ${deadRoutes.length} routes`
	);

	expect(summary.filter((s) => s.pageErrors > 0).map((s) => s.url)).toEqual([]);
});
