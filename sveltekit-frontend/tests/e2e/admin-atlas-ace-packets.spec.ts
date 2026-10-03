/**
 * /admin/atlas forensic load + cache-panel contract, seeded with REAL ACE v3 packets.
 *
 * - Forensic block follows tests/e2e/upload-button-diagnostic.spec.ts (console / pageerror /
 *   requestfailed / 4xx-5xx bodies). Run with PLAYWRIGHT_SKIP_GLOBAL_SETUP=true.
 * - The cache panel (`/api/admin/atlas/cache`) only counts ace:cartridge:* / ace:feature:* /
 *   ace:topo:* and gpu:karpathy:scores. It does NOT surface atlas.ace-packet.v3 packets, so the
 *   ACE-v3 assertion is a test.fixme that records the gap instead of a fake pass.
 * - Read-only: no Valkey/Postgres writes. Packets are read from the local sealed shards
 *   (.tmp/atlas/ace-packets-v3/*) and only used as fixtures/route stubs.
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { PORTS } from '../helpers/env-ports.js';

const BASE = PORTS.APP_BASE;
const SHARD_ROOT = path.resolve(process.cwd(), '..', '.tmp/atlas/ace-packets-v3');

function loadAcePacketsV3(n: number): Array<Record<string, any>> {
	if (!fs.existsSync(SHARD_ROOT)) return [];
	const run = fs.readdirSync(SHARD_ROOT).sort().at(-1)!;
	const shard = fs.readdirSync(path.join(SHARD_ROOT, run)).filter((f) => f.endsWith('.ndjson')).sort()[0];
	if (!shard) return [];
	const lines = fs.readFileSync(path.join(SHARD_ROOT, run, shard), 'utf8').split(/\r?\n/).filter(Boolean);
	return lines.slice(0, n).map((l) => JSON.parse(l));
}

function attach(page: Page) {
	const log = {
		console: [] as string[], pageErrors: [] as string[],
		failed: [] as string[], http4xx5xx: [] as string[],
	};
	page.on('console', (m) => { if (m.type() === 'error') log.console.push(m.text().slice(0, 300)); });
	page.on('pageerror', (e) => log.pageErrors.push(e.message.slice(0, 300)));
	page.on('requestfailed', (r) => log.failed.push(`${r.url()} :: ${r.failure()?.errorText}`));
	page.on('response', (r) => { if (r.status() >= 400) log.http4xx5xx.push(`${r.status()} ${r.url()}`); });
	return log;
}

test.describe('/admin/atlas + ACE v3 packet fixtures', () => {
	test('fixtures: real ACE v3 packets are valid and carry the 9 expected sections', async () => {
		const packets = loadAcePacketsV3(5);
		test.skip(packets.length === 0, 'no ACE v3 shards under .tmp/atlas/ace-packets-v3');
		for (const p of packets) {
			expect(p.schema).toBe('atlas.ace-packet.v3');
			for (const k of ['base', 'identity', 'source', 'semantic', 'topology', 'residency', 'evidence', 'integrity']) {
				expect(p, `section ${k}`).toHaveProperty(k);
			}
			expect(p.identity.packet_key).toMatch(/^packet:/);
		}
	});

	test('forensic load: page renders without uncaught exceptions', async ({ page }) => {
		const log = attach(page);
		const res = await page.goto(`${BASE}/admin/atlas`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
		expect(res?.status()).toBe(200);
		await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
		console.log('[forensic] console.error:', JSON.stringify(log.console.slice(0, 8)));
		console.log('[forensic] requestfailed:', JSON.stringify(log.failed.slice(0, 8)));
		console.log('[forensic] http>=400:', JSON.stringify(log.http4xx5xx.slice(0, 12)));
		expect(log.pageErrors, 'uncaught page errors').toEqual([]);
	});

	test('cache API contract: same top-level keys on success (degraded-response rule)', async ({ request }) => {
		const r = await request.get(`${BASE}/api/admin/atlas/cache`);
		expect(r.status()).toBe(200);
		const body = await r.json();
		for (const k of ['cartridgeCount', 'featureCardCount', 'karpathyScoreCount', 'topoCacheCount', 'topScoredFiles']) {
			expect(body, k).toHaveProperty(k);
		}
		expect(Array.isArray(body.topScoredFiles)).toBe(true);
	});

	test('cache panel renders API counts (route-stubbed with counts from real fixtures)', async ({ page }) => {
		const packets = loadAcePacketsV3(7);
		test.skip(packets.length === 0, 'no ACE v3 shards');
		const stub = { cartridgeCount: 0, featureCardCount: packets.length, karpathyScoreCount: 0, topoCacheCount: 0, topScoredFiles: [] };
		await page.route('**/api/admin/atlas/cache', (route) => {
			if (route.request().method() !== 'GET') return route.continue();
			return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(stub) });
		});
		await page.goto(`${BASE}/admin/atlas`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
		await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
		// Count is shown somewhere in the cache section; assert the number is present in the DOM text.
		await expect(page.locator('body')).toContainText(String(packets.length), { timeout: 20_000 });
	});

	// Regression (2026-09-27): `await using` is a SyntaxError on Node 22, so any route module containing
	// it 500s at load. These two were broken; 3 more files still contain it (see tasks.md OPS-05).
	test('regression: Redis-backed endpoints load (no await-using SyntaxError)', async ({ request }) => {
		const health = await request.get(`${BASE}/api/health/redis`);
		expect(health.status(), await health.text()).toBe(200);
		expect((await health.json()).status).toBe('healthy');
		const stats = await request.get(`${BASE}/api/cache/stats`);
		expect(stats.status(), await stats.text()).toBe(200);
		const body = await stats.json();
		expect(body).toHaveProperty('data.redis');
	});

	test('regression: /admin/cache renders without uncaught exceptions', async ({ page }) => {
		const log = attach(page);
		await page.goto(`${BASE}/admin/cache`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
		await page.waitForTimeout(5_000);
		expect(log.pageErrors, 'uncaught page errors').toEqual([]);
	});

	test.fixme('admin chat worker loads (no net::ERR_BLOCKED_BY_RESPONSE)', async () => {
		// Repeatable on every /admin/atlas load: requestfailed for
		// /src/lib/workers/admin-chat.worker.ts?worker_file&type=module :: net::ERR_BLOCKED_BY_RESPONSE
		// (likely COOP/COEP/CORP header on the worker response). Not yet diagnosed.
	});

	test.fixme('ACE v3 packets are surfaced in the cache panel', async () => {
		// GAP (2026-09-27): /api/admin/atlas/cache counts only ace:cartridge|feature|topo:* and gpu:karpathy:scores.
		// atlas.ace-packet.v3 packets (BitFrost `atlas:bitfrost:v1:ACE_PACKET:*` shape) are not counted or listed,
		// and the route uses redis.keys() (blocking O(N)); a SCAN-based count + an ACE v3 field is needed first.
	});
});
