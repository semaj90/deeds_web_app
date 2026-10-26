import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { PORTS } from '../helpers/env-ports.js';

/**
 * Production-hardening crawl: every static (non-[param]) +page.svelte route.
 *
 * Read-only by construction ("mutation fence"): the page context aborts and records
 *   - every non-GET/HEAD/OPTIONS request to the app origin, and
 *   - GET /api/** paths that look like job triggers (ingest/reindex/backfill/train/run/...).
 * Buttons are clicked only if their label is not on a destructive/side-effect denylist.
 *
 * Hard failures (test fails): navigation error, final document status >= 400, uncaught page error,
 * page body not rendered. Everything else (console errors, 4xx/5xx sub-requests, missing layout landmarks,
 * buttons with no observable effect, blocked requests) is recorded, not failed, in
 *   logs/task-output/route-hardening/<slug>.json   (aggregate: scripts/ summarize in the OpenSpec tasks)
 *
 * Run: PLAYWRIGHT_SKIP_GLOBAL_SETUP=true npx playwright test tests/e2e/production-hardening-routes.spec.ts --project=chromium --workers=2
 * Optional: HARDEN_ROUTE_FILTER=<regex> to narrow, HARDEN_MAX_BUTTONS=<n> (default 12).
 */
const ROUTES_DIR = path.resolve(process.cwd(), 'src', 'routes');
const OUT_DIR = path.resolve(process.cwd(), '..', 'logs', 'task-output', 'route-hardening');
const MAX_BUTTONS = Number(process.env.HARDEN_MAX_BUTTONS ?? 12);
const FILTER = process.env.HARDEN_ROUTE_FILTER ? new RegExp(process.env.HARDEN_ROUTE_FILTER) : null;

const SKIP_ROUTES = /(^|\/)(logout|signout|sign-out|delete|reset-password)(\/|$)/i;
const BUTTON_DENY =
	/delet|remov|drop|destroy|purge|wipe|reset|clear|logout|log out|sign out|submit|save|upload|ingest|run\b|start|stop|execute|apply|deploy|restart|kill|rebuild|reindex|backfill|train|generate|send|create|publish|archive|import|sync|trigger|warm|merge|approve|reject|revoke|ban\b|confirm|commit|install|download|export|analy[sz]e|scan|refresh|retry|cancel|abort|finali[sz]e|promote|migrate/i;
const HEAVY_GET = /(ingest|reindex|backfill|train|\/start|\/run\b|\/execute|\/sync|trigger|warm|rebuild|cluster|embed|crawl|scan|build|migrate|promote|restart|\/stop|\/kill|index-stream|generate)/i;

function discoverRoutes(): string[] {
	const out: string[] = [];
	const walk = (dir: string, segs: string[]) => {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			if (e.isDirectory()) {
				if (e.name.includes('[')) continue; // dynamic params: covered by targeted specs
				walk(path.join(dir, e.name), /^\(.*\)$/.test(e.name) ? segs : [...segs, e.name]);
			} else if (e.name === '+page.svelte') {
				out.push('/' + segs.join('/'));
			}
		}
	};
	walk(ROUTES_DIR, []);
	let list = [...new Set(out)].filter((r) => !SKIP_ROUTES.test(r)).filter((r) => (FILTER ? FILTER.test(r) : true)).sort();
	// Batching for memory-constrained hosts (the Vite dev server grew to ~4.9 GB heap over ~60 heavy routes and died):
	//   HARDEN_ROUTES_FILE=<json array of routes>  HARDEN_SLICE=<start>:<end>
	if (process.env.HARDEN_ROUTES_FILE) {
		const wanted = new Set<string>(JSON.parse(fs.readFileSync(process.env.HARDEN_ROUTES_FILE, 'utf8')));
		list = list.filter((r) => wanted.has(r));
	}
	if (process.env.HARDEN_SLICE) {
		const [a, b] = process.env.HARDEN_SLICE.split(':').map(Number);
		list = list.slice(a, b);
	}
	return list;
}

async function fingerprint(page: Page): Promise<string> {
	return page.evaluate(() => {
		const s = document.body ? document.body.innerHTML : '';
		let h = 5381;
		for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
		return `${s.length}:${h}:${document.querySelectorAll('[role="dialog"],dialog[open]').length}:${location.pathname}${location.search}`;
	});
}

const routes = discoverRoutes();
test.describe.configure({ mode: 'parallel' });

for (const route of routes) {
	test(`route ${route}`, async ({ page, baseURL }) => {
		test.setTimeout(90_000);
		const base = new URL(baseURL ?? PORTS.APP_BASE).origin;
		const rec: Record<string, any> = {
			route, consoleErrors: [] as string[], consoleWarnings: 0, pageErrors: [] as string[],
			failedResponses: [] as { status: number; url: string }[], requestFailures: [] as string[],
			blockedMutations: [] as string[], blockedHeavyGet: [] as string[], buttons: [] as any[], requests: 0,
		};
		// Keep the browser-reported source location beside each error (same index) so error_logs can fill file_path/line_number.
		rec.consoleErrorLocations = [] as { url: string; line: number; col: number }[];
		rec.pageErrorFrames = [] as string[];
		page.on('console', (m) => {
			if (m.type() === 'error') {
				rec.consoleErrors.push(m.text().slice(0, 240));
				const l = m.location();
				rec.consoleErrorLocations.push({ url: l.url ?? '', line: l.lineNumber ?? 0, col: l.columnNumber ?? 0 });
			} else if (m.type() === 'warning') rec.consoleWarnings++;
		});
		page.on('pageerror', (e) => {
			rec.pageErrors.push(String(e.message).slice(0, 300));
			rec.pageErrorFrames.push((e.stack ?? '').split('\n').find((l) => /\/src\/.*:\d+:\d+/.test(l))?.trim().slice(0, 300) ?? '');
		});
		page.on('request', () => rec.requests++);
		page.on('requestfailed', (r) => { const f = r.failure()?.errorText ?? ''; if (!/ERR_ABORTED|blockedbyclient/i.test(f)) rec.requestFailures.push(`${r.method()} ${r.url().slice(0, 160)} ${f}`); });
		page.on('response', (r) => { if (r.status() >= 400 && new URL(r.url()).origin === base) rec.failedResponses.push({ status: r.status(), url: r.url().replace(base, '').slice(0, 160) }); });
		await page.route('**/*', async (rt) => {
			const req = rt.request();
			const u = new URL(req.url());
			if (u.origin !== base) return rt.continue();
			if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { rec.blockedMutations.push(`${req.method()} ${u.pathname}`); return rt.abort('blockedbyclient'); }
			if (u.pathname.startsWith('/api/') && HEAVY_GET.test(u.pathname)) { rec.blockedHeavyGet.push(u.pathname); return rt.abort('blockedbyclient'); }
			return rt.continue();
		});

		let status = 0;
		let navError: string | null = null;
		try {
			const resp = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 45_000 });
			status = resp?.status() ?? 0;
			// first hit on a route makes Vite compile its chunks: wait for real rendered text before judging
			await page.waitForFunction(() => (document.body?.innerText ?? '').trim().length > 0, null, { timeout: 20_000 }).catch(() => {});
			await page.waitForTimeout(800);
		} catch (e) { navError = String((e as Error).message).slice(0, 200); }

		const layout = navError ? null : await page.evaluate(() => ({
			title: document.title,
			bodyTextLen: (document.body?.innerText ?? '').trim().length,
			hasMain: !!document.querySelector('main,[role="main"]'),
			hasNav: !!document.querySelector('nav,aside,[role="navigation"]'),
			h1: document.querySelectorAll('h1').length,
			buttons: document.querySelectorAll('button').length,
			finalPath: location.pathname,
		})).catch(() => null);
		rec.status = status; rec.navError = navError; rec.layout = layout;

		if (!navError && layout) {
			const btns = page.locator('button:visible:not([disabled])');
			const count = Math.min(await btns.count().catch(() => 0), MAX_BUTTONS);
			for (let i = 0; i < count; i++) {
				const el = btns.nth(i);
				let label = '';
				try {
					label = ((await el.innerText({ timeout: 800 })).trim() || (await el.getAttribute('aria-label')) || (await el.getAttribute('title')) || `#${i}`).replace(/\s+/g, ' ').slice(0, 60);
				} catch { rec.buttons.push({ i, result: 'unreadable' }); continue; }
				if (BUTTON_DENY.test(label)) { rec.buttons.push({ i, label, result: 'skipped-denylist' }); continue; }
				try {
					const before = await fingerprint(page); const reqBefore = rec.requests;
					await el.click({ timeout: 2500 });
					await page.waitForTimeout(350);
					const after = await fingerprint(page);
					const effect = before !== after || rec.requests !== reqBefore;
					rec.buttons.push({ i, label, result: effect ? 'ok' : 'no-observable-effect' });
					const moved = (await page.evaluate(() => location.pathname).catch(() => route)) !== layout.finalPath;
					if (moved) await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
					else await page.keyboard.press('Escape').catch(() => {});
				} catch (e) { rec.buttons.push({ i, label, result: 'click-failed', error: String((e as Error).message).split('\n')[0].slice(0, 140) }); }
			}
		}

		fs.mkdirSync(OUT_DIR, { recursive: true });
		const slug = route === '/' ? 'root' : route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '_');
		fs.writeFileSync(path.join(OUT_DIR, `${slug}.json`), JSON.stringify(rec, null, 2));

		expect(navError, 'navigation error').toBeNull();
		expect(status, 'document status').toBeLessThan(400);
		expect(rec.pageErrors, 'uncaught page errors').toEqual([]);
		expect(layout?.bodyTextLen ?? 0, 'rendered body text').toBeGreaterThan(0);
	});
}
