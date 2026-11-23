/**
 * Route sweep: visits every static page route under src/routes, captures a screenshot and the
 * browser signals (console errors, page errors, failed requests, HTTP status) for each, and writes
 * a manifest. Read-only: it navigates and captures, it never submits forms.
 *
 * Gated: runs only with ROUTE_SWEEP=1, so the normal suite is unaffected.
 *   ROUTE_SWEEP=1 npx playwright test tests/e2e/route-sweep.spec.ts
 * Optional:
 *   ROUTE_SWEEP_MOBILE=1   also capture a 390 px phone-width screenshot
 *   ROUTE_SWEEP_LIMIT=20   visit only the first N routes (smoke run)
 *
 * Output: .tmp/route-sweep/<slug>.desktop.png (and .mobile.png), plus .tmp/route-sweep/manifest.json.
 * Parameterised routes ([id], [...slug]) are listed as SKIPPED_PARAMETERIZED, not guessed.
 */
import { test, expect } from '@playwright/test';
import { readdirSync, statSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROUTES_DIR = join(process.cwd(), 'src', 'routes');
const OUT_DIR = join(process.cwd(), '..', '.tmp', 'route-sweep');
const SWEEP = process.env.ROUTE_SWEEP === '1';
const MOBILE = process.env.ROUTE_SWEEP_MOBILE === '1';
const LIMIT = Number(process.env.ROUTE_SWEEP_LIMIT ?? '0');
const RESUME = process.env.ROUTE_SWEEP_RESUME === '1';
const MANIFEST_PATH = join(OUT_DIR, 'manifest.json');

type Entry = {
	url: string;
	slug: string;
	pageFile: string;
	layouts: string[];
	status: 'VISITED' | 'SKIPPED_PARAMETERIZED' | 'SKIPPED_API' | 'NAVIGATION_FAILED';
	httpStatus?: number;
	consoleErrors: string[];
	pageErrors: string[];
	failedRequests: string[];
	screenshots: string[];
};

/** Walk src/routes and return every +page.svelte with its URL and the layouts above it. */
function discoverRoutes(): { url: string; pageFile: string; layouts: string[]; parameterized: boolean; api: boolean }[] {
	const found: { url: string; pageFile: string; layouts: string[]; parameterized: boolean; api: boolean }[] = [];
	const walk = (dir: string, segments: string[], layouts: string[]) => {
		const entries = readdirSync(dir);
		const layoutHere = entries.includes('+layout.svelte') ? [...layouts, relative(ROUTES_DIR, join(dir, '+layout.svelte')).split(sep).join('/')] : layouts;
		if (entries.includes('+page.svelte')) {
			const urlSegments = segments.filter((s) => !/^\(.*\)@?$/.test(s));
			const url = '/' + urlSegments.join('/');
			found.push({
				url: url === '/' ? '/' : url.replace(/\/$/, ''),
				pageFile: relative(ROUTES_DIR, join(dir, '+page.svelte')).split(sep).join('/'),
				layouts: layoutHere,
				parameterized: urlSegments.some((s) => s.startsWith('[')),
				api: urlSegments[0] === 'api'
			});
		}
		for (const name of entries) {
			const full = join(dir, name);
			if (!statSync(full).isDirectory()) continue;
			walk(full, [...segments, name], layoutHere);
		}
	};
	walk(ROUTES_DIR, [], []);
	return found.sort((a, b) => a.url.localeCompare(b.url));
}

function slugFor(url: string): string {
	return (url === '/' ? 'root' : url.slice(1).replace(/[^a-zA-Z0-9]+/g, '_')).slice(0, 120);
}

const IGNORED_CONSOLE = [/\[vite\]/i, /Download the React DevTools/i, /ERR_ABORTED/i, /favicon/i];

test.describe.configure({ mode: 'serial', timeout: 90_000 });

test.describe('route sweep (screenshots + browser signals)', () => {
	test.skip(!SWEEP, 'Set ROUTE_SWEEP=1 to run the route sweep');

	const priorEntries: Entry[] = RESUME && existsSync(MANIFEST_PATH)
		? (JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')).entries as Entry[])
		: [];
	const doneKeys = new Set(priorEntries.filter((e) => e.status !== 'NAVIGATION_FAILED').map((e) => `${e.url}|${e.pageFile}`));
	const manifest: Entry[] = [...priorEntries];
	const routes = discoverRoutes();
	const selected = LIMIT > 0 ? routes.slice(0, LIMIT) : routes;

	test.beforeAll(() => {
		mkdirSync(OUT_DIR, { recursive: true });
	});

	const writeManifest = () => {
		writeFileSync(
			MANIFEST_PATH,
			JSON.stringify(
				{
					generatedAt: new Date().toISOString(),
					totalPageRoutes: routes.length,
					visited: manifest.filter((e) => e.status === 'VISITED').length,
					skippedParameterized: manifest.filter((e) => e.status === 'SKIPPED_PARAMETERIZED').length,
					navigationFailed: manifest.filter((e) => e.status === 'NAVIGATION_FAILED').length,
					entries: manifest
				},
				null,
				2
			)
		);
	};

	test.afterAll(writeManifest);

	test.afterEach(() => {
		writeManifest();
	});

	for (const route of selected) {
		const slug = slugFor(route.url);

		test(`route ${route.url} [${route.pageFile}]`, async ({ page }) => {
			if (doneKeys.has(`${route.url}|${route.pageFile}`)) {
				test.skip(true, 'already captured in a previous run (ROUTE_SWEEP_RESUME=1)');
				return;
			}
			const entry: Entry = {
				url: route.url,
				slug,
				pageFile: route.pageFile,
				layouts: route.layouts,
				status: 'VISITED',
				consoleErrors: [],
				pageErrors: [],
				failedRequests: [],
				screenshots: []
			};
			manifest.push(entry);

			if (route.api) {
				entry.status = 'SKIPPED_API';
				return;
			}
			if (route.parameterized) {
				entry.status = 'SKIPPED_PARAMETERIZED';
				return;
			}

			page.on('console', (msg) => {
				if (msg.type() !== 'error') return;
				const text = msg.text();
				if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
				entry.consoleErrors.push(text.slice(0, 500));
			});
			page.on('pageerror', (err) => entry.pageErrors.push(String(err.message).slice(0, 500)));
			page.on('requestfailed', (req) => {
				const url = req.url();
				if (/\/@vite|\/node_modules|hot-update|__vite/.test(url)) return;
				entry.failedRequests.push(`${req.method()} ${url.slice(0, 200)} ${req.failure()?.errorText ?? ''}`);
			});

			let response;
			try {
				response = await page.goto(route.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
			} catch (err) {
				entry.status = 'NAVIGATION_FAILED';
				entry.pageErrors.push(`goto: ${String((err as Error).message).slice(0, 300)}`);
				return;
			}
			entry.httpStatus = response?.status();
			await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});

			const desktop = join(OUT_DIR, `${slug}.desktop.png`);
			await page.setViewportSize({ width: 1360, height: 900 });
			await page.screenshot({ path: desktop, fullPage: true, timeout: 20_000 }).catch(() => {});
			entry.screenshots.push(relative(join(process.cwd(), '..'), desktop).split(sep).join('/'));

			if (MOBILE) {
				const mobile = join(OUT_DIR, `${slug}.mobile.png`);
				await page.setViewportSize({ width: 390, height: 844 });
				await page.screenshot({ path: mobile, fullPage: true, timeout: 20_000 }).catch(() => {});
				entry.screenshots.push(relative(join(process.cwd(), '..'), mobile).split(sep).join('/'));
			}

			// The sweep reports; it does not fail on app errors. The status check is the only hard assertion.
			expect(entry.httpStatus ?? 0, `HTTP status for ${route.url}`).toBeLessThan(500);
		});
	}
});

