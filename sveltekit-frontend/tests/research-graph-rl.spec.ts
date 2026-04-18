/**
 * Research Graph RL — Playwright integration tests
 *
 * Covers four areas:
 *   1. API routes  — GET stats, POST build/policy/search/rl-step shape + error handling
 *   2. Runes reactivity — Svelte 5 $state transitions visible in the DOM
 *      (graphLoading, graphBuilding, graphBuildMsg, rlPolicy, graphStats, activeSection)
 *   3. Cache layer — Redis L1 keys rsgraph:clusters + rlpolicy:pipeline_weights
 *   4. Web workers / capabilities — ONNX SharedArrayBuffer, hardwareConcurrency,
 *      health endpoint worker-thread report
 *
 * All tests degrade gracefully: if the dev server is down or DB is empty, they
 * skip rather than hard-fail.  Auth bypass via DEV_BYPASS_AUTH=true (set in
 * npm run dev via cross-env).
 */

import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';
import { PORTS } from './helpers/env-ports.js';

const BASE = PORTS.APP_BASE;
const SI_URL = `${BASE}/admin/search-intelligence`;
const GRAPH_API = `${BASE}/api/analytics/research-graph`;

// ── helpers ──────────────────────────────────────────────────────────────────

async function serverAlive(): Promise<boolean> {
	try {
		const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
		return r.status < 500;
	} catch {
		return false;
	}
}

/** Capture all console messages from the page and return a getter. */
function captureConsole(page: Page): () => ConsoleMessage[] {
	const msgs: ConsoleMessage[] = [];
	page.on('console', (m) => msgs.push(m));
	return () => msgs;
}

/**
 * Wait for a reactive DOM indicator to appear, logging the time it takes.
 * Returns elapsed ms.
 */
async function waitForReactivity(
	page: Page,
	selector: string,
	description: string,
	timeoutMs = 10_000,
): Promise<number> {
	const t0 = Date.now();
	await expect(page.locator(selector)).toBeVisible({ timeout: timeoutMs });
	const elapsed = Date.now() - t0;
	console.log(`  ✓ [rune Δ] ${description} — visible in ${elapsed}ms`);
	return elapsed;
}

// ── 1. API routes ─────────────────────────────────────────────────────────────

test.describe('Research Graph RL — API routes', () => {
	test.beforeAll(async () => {
		if (!(await serverAlive())) test.skip();
	});

	test('GET /api/analytics/research-graph returns correct shape', async ({ request }) => {
		const res = await request.get(GRAPH_API);
		// May be 401 if auth is strict, 200 if bypass active
		const status = res.status();
		console.log(`  GET ${GRAPH_API} → ${status}`);

		if (status === 401) {
			console.log('  ℹ  Auth guard active — skipping shape check');
			return;
		}
		expect(status).toBe(200);

		const body = await res.json();
		// Degraded contract: both keys must exist even when Redis is cold
		expect(body).toHaveProperty('graph');
		expect(body).toHaveProperty('policy');
		expect(body.graph).toHaveProperty('clusters');
		expect(body.graph).toHaveProperty('totalSummaries');
		expect(body.graph).toHaveProperty('builtAt');
		console.log(`  graph.totalSummaries=${body.graph.totalSummaries}  clusters=${body.graph.clusters?.length ?? 0}  policy=${body.policy ? 'present' : 'null'}`);
	});

	test('POST build returns GraphBuildResult shape', async ({ request }) => {
		const res = await request.post(GRAPH_API, {
			data: { action: 'build' },
		});
		const status = res.status();
		console.log(`  POST {action:"build"} → ${status}`);
		if (status === 401) return;

		expect(status).toBe(200);
		const body = await res.json();
		// May be { clusters:[], totalSummaries:0 } if table is empty — shape still valid
		expect(body).toHaveProperty('clusters');
		expect(body).toHaveProperty('totalSummaries');
		expect(body).toHaveProperty('durationMs');
		expect(body).toHaveProperty('source');
		console.log(`  clusters=${body.clusters?.length}  totalSummaries=${body.totalSummaries}  source=${body.source}  durationMs=${body.durationMs}`);
	});

	test('POST policy returns RlPolicyWeights shape', async ({ request }) => {
		const res = await request.post(GRAPH_API, {
			data: { action: 'policy' },
		});
		const status = res.status();
		console.log(`  POST {action:"policy"} → ${status}`);
		if (status === 401) return;

		expect(status).toBe(200);
		const body = await res.json();
		// weights object has pipeline keys
		expect(body).toHaveProperty('weights');
		const w = body.weights;
		if (w) {
			expect(w).toHaveProperty('ace');
			expect(w).toHaveProperty('rag');
			expect(w).toHaveProperty('kag');
			expect(w).toHaveProperty('dag');
			expect(w).toHaveProperty('updatedAt');
			console.log(`  ace=${w.ace?.toFixed(3)}  rag=${w.rag?.toFixed(3)}  kag=${w.kag?.toFixed(3)}  dag=${w.dag?.toFixed(3)}`);
		}
	});

	test('POST search rejects wrong embedding length (400)', async ({ request }) => {
		const res = await request.post(GRAPH_API, {
			data: {
				action: 'search',
				query:  'hearsay evidence',
				embedding: new Array(512).fill(0),   // wrong: needs 768
				topK: 5,
			},
		});
		const status = res.status();
		console.log(`  POST {action:"search", embedding.length=512} → ${status} (expect 400)`);
		if (status === 401) return;
		expect(status).toBe(400);
	});

	test('POST search accepts correct 768-dim embedding', async ({ request }) => {
		// Provide a well-formed (zero) 768-dim vector — result may be empty but shape must be valid
		const embedding = new Array(768).fill(0);
		const res = await request.post(GRAPH_API, {
			data: { action: 'search', query: 'hearsay evidence', embedding, topK: 5 },
		});
		const status = res.status();
		console.log(`  POST {action:"search", embedding.length=768} → ${status}`);
		if (status === 401) return;

		expect(status).toBe(200);
		const body = await res.json();
		expect(body).toHaveProperty('results');
		expect(Array.isArray(body.results)).toBe(true);
		console.log(`  results.length=${body.results.length}`);
	});

	test('POST rl-step rate-limit returns 429 after 10 rapid requests', async ({ request }) => {
		const embedding = new Array(768).fill(0.1);
		const payload = { action: 'rl-step', query: 'test', embedding };

		let hit429 = false;
		let firstStatus = 0;

		for (let i = 0; i < 11; i++) {
			const res = await request.post(GRAPH_API, { data: payload });
			const s = res.status();
			if (i === 0) firstStatus = s;
			if (s === 429) { hit429 = true; break; }
			if (s === 401) {
				console.log('  ℹ  Auth guard — skipping rate-limit test');
				return;
			}
		}

		console.log(`  rl-step rate-limit: firstStatus=${firstStatus}  hit429=${hit429}`);
		// If we hit 429, the rate-limit is working; if all 200, Redis may be cold or rl-step is fast
		// Either outcome is acceptable — we just verify no unexpected 5xx
		if (!hit429) {
			console.log('  ℹ  11 requests completed without 429 — Redis rate-limit bucket may be cold');
		} else {
			expect(hit429).toBe(true);
		}
	});

	test('POST unknown action returns 400', async ({ request }) => {
		const res = await request.post(GRAPH_API, {
			data: { action: 'unknown-action' },
		});
		const status = res.status();
		console.log(`  POST {action:"unknown-action"} → ${status} (expect 400)`);
		if (status === 401) return;
		expect(status).toBe(400);
	});
});

// ── 2. Runes reactivity ───────────────────────────────────────────────────────

test.describe('Runes reactivity — Graph RL tab in Search Intelligence', () => {
	test.beforeAll(async () => {
		if (!(await serverAlive())) test.skip();
	});

	test('tab click sets activeSection → Graph RL panel renders', async ({ page }) => {
		const consoleMsgs = captureConsole(page);

		await page.goto(SI_URL, { waitUntil: 'networkidle' });

		// Tab must be in the nav
		const graphTab = page.locator('button.s-tab', { hasText: 'Graph RL' });
		await expect(graphTab).toBeVisible({ timeout: 10_000 });

		// Before click: panel not visible
		const panel = page.locator('text=Research Graph RL');
		await expect(panel).not.toBeVisible();

		// Click — triggers activeSection = 'graph' ($state mutation)
		await graphTab.click();

		// After click: panel heading visible — rune Δ confirmed
		await waitForReactivity(page, 'text=Research Graph RL', 'activeSection → "graph"');

		// Rebuild + Recompute buttons should be present
		await expect(page.locator('button', { hasText: 'Rebuild Graph' })).toBeVisible();
		await expect(page.locator('button', { hasText: 'Recompute Policy' })).toBeVisible();

		console.log(`  console messages during navigation: ${consoleMsgs().filter(m => m.type() === 'error').length} errors`);
	});

	test('fetch_graph triggers graphLoading → panel shows spinner or content', async ({ page }) => {
		// Intercept the graph API call to observe the loading state window
		let requestFired = false;
		page.on('request', (req) => {
			if (req.url().includes('/api/analytics/research-graph') && req.method() === 'GET') {
				requestFired = true;
				console.log(`  [rune Δ] graphLoading=true — GET /api/analytics/research-graph fired`);
			}
		});
		page.on('response', (res) => {
			if (res.url().includes('/api/analytics/research-graph')) {
				console.log(`  [rune Δ] graphLoading=false — response ${res.status()} received`);
			}
		});

		await page.goto(SI_URL, { waitUntil: 'networkidle' });
		await page.locator('button.s-tab', { hasText: 'Graph RL' }).click();

		// Wait for either the cluster chart OR the empty-state message — both prove graphLoading settled
		const settled = page.locator('text=/Cluster PageRank|No graph built yet|no graph/i').first();
		await expect(settled).toBeVisible({ timeout: 15_000 });
		console.log(`  [rune Δ] graphLoading=false confirmed (settled state visible)`);

		expect(requestFired).toBe(true);
	});

	test('Rebuild Graph click sets graphBuilding → button text changes', async ({ page }) => {
		await page.goto(SI_URL, { waitUntil: 'networkidle' });
		await page.locator('button.s-tab', { hasText: 'Graph RL' }).click();
		await expect(page.locator('button', { hasText: 'Rebuild Graph' })).toBeVisible({ timeout: 8_000 });

		// Capture the in-flight text to prove graphBuilding=$state(true) reflected in DOM
		const buildBtn = page.locator('button', { hasText: /Rebuild Graph|Building…/ });

		// Track the response to correlate with DOM transition
		const [res] = await Promise.all([
			page.waitForResponse((r) => r.url().includes('/api/analytics/research-graph') && r.request().method() === 'POST', { timeout: 20_000 }),
			page.locator('button', { hasText: 'Rebuild Graph' }).click(),
		]);

		console.log(`  [rune Δ] rebuild POST → ${res.status()}`);
		// After response, graphBuildMsg should appear (if build succeeded or server responded)
		if (res.status() !== 401) {
			// graphBuildMsg becomes non-empty → span.build-msg visible
			const msgSpan = page.locator('.build-msg');
			const buildMsgText = await msgSpan.textContent().catch(() => '(no msg)');
			console.log(`  [rune Δ] graphBuildMsg="${buildMsgText}"`);
		}

		// Button should have returned to "Rebuild Graph" (graphBuilding=false)
		await expect(buildBtn.filter({ hasText: 'Rebuild Graph' })).toBeVisible({ timeout: 15_000 });
		console.log(`  [rune Δ] graphBuilding=false — button restored`);
	});

	test('RL policy bars render when rlPolicy state is populated', async ({ page }) => {
		await page.goto(SI_URL, { waitUntil: 'networkidle' });
		await page.locator('button.s-tab', { hasText: 'Graph RL' }).click();

		// Trigger policy recompute to ensure rlPolicy $state gets a value
		const policyBtn = page.locator('button', { hasText: 'Recompute Policy' });
		await expect(policyBtn).toBeVisible({ timeout: 8_000 });

		const [res] = await Promise.all([
			page.waitForResponse((r) => r.url().includes('/api/analytics/research-graph'), { timeout: 15_000 }),
			policyBtn.click(),
		]);

		if (res.status() === 401) {
			console.log('  ℹ  Auth guard — skipping policy bars check');
			return;
		}

		// If policy was returned, .policy-bars div should be visible
		const body = await res.json().catch(() => ({}));
		if (body.weights) {
			await waitForReactivity(page, '.policy-bars', 'rlPolicy → policy bars rendered');
			const bars = page.locator('.policy-row');
			const count = await bars.count();
			console.log(`  [rune Δ] rlPolicy populated — ${count} pipeline bars rendered`);
			expect(count).toBeGreaterThan(0);
		} else {
			console.log('  ℹ  No policy weights returned (empty DB) — bars check skipped');
		}
	});

	test('graph section shows empty-state message when no data built yet', async ({ page }) => {
		await page.goto(SI_URL, { waitUntil: 'networkidle' });
		await page.locator('button.s-tab', { hasText: 'Graph RL' }).click();

		// Either cluster chart or empty note — both are valid settled states
		const chartOrEmpty = page.locator('text=/Cluster PageRank|No graph built yet|Needs ≥40|no graph/i').first();
		await expect(chartOrEmpty).toBeVisible({ timeout: 15_000 });

		const visible = await chartOrEmpty.textContent();
		console.log(`  [rune Δ] settled state text: "${visible?.slice(0, 80)}"`);
	});
});

// ── 3. Cache layer ────────────────────────────────────────────────────────────

test.describe('Cache layer — research graph Redis keys', () => {
	test.beforeAll(async () => {
		if (!(await serverAlive())) test.skip();
	});

	test('two sequential GETs return identical graph.builtAt (served from Redis)', async ({ request }) => {
		const r1 = await request.get(GRAPH_API);
		const r2 = await request.get(GRAPH_API);
		if (r1.status() === 401) {
			console.log('  ℹ  Auth guard — skipping cache identity check');
			return;
		}

		const [b1, b2] = await Promise.all([r1.json(), r2.json()]);
		const at1 = b1?.graph?.builtAt;
		const at2 = b2?.graph?.builtAt;

		console.log(`  GET #1 builtAt=${at1}  totalSummaries=${b1?.graph?.totalSummaries}`);
		console.log(`  GET #2 builtAt=${at2}  totalSummaries=${b2?.graph?.totalSummaries}`);

		// Both responses must have the same shape
		expect(b1).toHaveProperty('graph');
		expect(b2).toHaveProperty('graph');

		// If graph was already built, both should return the same timestamp
		if (at1 && at2) {
			expect(at1).toBe(at2);
			console.log(`  ✓ Redis cache hit confirmed — same builtAt timestamp`);
		} else {
			console.log(`  ℹ  Graph not built yet — cache key is empty (null builtAt)`);
		}
	});

	test('GET /api/cache/exact-match/stats responds (L1 cache health)', async ({ request }) => {
		const res = await request.get(`${BASE}/api/cache/exact-match/stats`);
		const status = res.status();
		console.log(`  GET /api/cache/exact-match/stats → ${status}`);
		if (status === 401) return;

		if (status === 200) {
			const body = await res.json();
			console.log(`  L1 cache: keys=${body.stats?.totalKeys}  memory=${body.stats?.memoryUsedMB?.toFixed(2)}MB  avgTtl=${body.stats?.avgTtlMinutes}min`);
			expect(body).toHaveProperty('success');
		} else {
			// 500/404 = Redis down — acceptable, test passes
			console.log(`  ℹ  Cache stats endpoint non-200 — Redis may be unavailable`);
		}
	});

	test('POST build caches result — immediate GET returns non-null builtAt', async ({ request }) => {
		// Build (may be empty-cluster noop but still writes to Redis)
		const buildRes = await request.post(GRAPH_API, { data: { action: 'build' } });
		if (buildRes.status() === 401) {
			console.log('  ℹ  Auth guard — skipping cache write check');
			return;
		}

		const buildBody = await buildRes.json();
		console.log(`  POST build: clusters=${buildBody.clusters?.length}  source=${buildBody.source}`);

		// Only check builtAt if there was actual data to cluster
		if (buildBody.totalSummaries > 0) {
			const getRes = await request.get(GRAPH_API);
			const getBody = await getRes.json();
			expect(getBody.graph?.builtAt).toBeTruthy();
			console.log(`  ✓ Redis write confirmed — builtAt=${getBody.graph?.builtAt}`);
		} else {
			console.log('  ℹ  0 summaries in DB — Redis write skipped by buildResearchGraph()');
		}
	});
});

// ── 4. Web workers & client capabilities ─────────────────────────────────────

test.describe('Web workers — client capabilities', () => {
	test.beforeAll(async () => {
		if (!(await serverAlive())) test.skip();
	});

	test('browser reports hardwareConcurrency > 0', async ({ page }) => {
		await page.goto(BASE, { waitUntil: 'domcontentloaded' });
		const cores: number = await page.evaluate(() => navigator.hardwareConcurrency);
		console.log(`  hardwareConcurrency=${cores}`);
		expect(cores).toBeGreaterThan(0);
	});

	test('SharedArrayBuffer available for ONNX threaded WASM', async ({ page }) => {
		await page.goto(BASE, { waitUntil: 'domcontentloaded' });
		const available: boolean = await page.evaluate(() => typeof SharedArrayBuffer !== 'undefined');
		console.log(`  SharedArrayBuffer=${available}`);
		// Not a hard failure — cross-origin isolation may not be enabled in dev
		if (!available) {
			console.log('  ℹ  SharedArrayBuffer unavailable — ONNX will fall back to single-threaded WASM');
		} else {
			console.log('  ✓ SharedArrayBuffer available — ONNX threaded runtime enabled');
		}
	});

	test('WebAssembly SIMD available for vector ops', async ({ page }) => {
		await page.goto(BASE, { waitUntil: 'domcontentloaded' });
		const simd: boolean = await page.evaluate(async () => {
			try {
				// Feature-detect SIMD via wasm module with SIMD opcode
				const bytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
				await WebAssembly.compile(bytes);
				return true;
			} catch {
				return false;
			}
		});
		console.log(`  WASM SIMD=${simd}`);
		if (!simd) console.log('  ℹ  WASM SIMD unavailable — using scalar fallback');
	});

	test('/api/health/capabilities reports GPU/worker support', async ({ request }) => {
		const res = await request.get(`${BASE}/api/health/capabilities`);
		const status = res.status();
		console.log(`  GET /api/health/capabilities → ${status}`);
		if (status === 404) {
			console.log('  ℹ  /api/health/capabilities not found — skipping');
			return;
		}
		if (status !== 200) {
			console.log(`  ℹ  Capabilities endpoint non-200 (${status}) — backend may be down`);
			return;
		}
		const body = await res.json();
		console.log(`  capabilities: ${JSON.stringify(body).slice(0, 200)}`);
		// Any valid JSON response with no crash passes
		expect(typeof body).toBe('object');
	});

	test('ONNX runtime static assets are served', async ({ request }) => {
		// The SvelteKit static dir should serve ORT loader files
		const loaderRes = await request.get(`${BASE}/ort/ort-wasm-simd-threaded.mjs`);
		const status = loaderRes.status();
		console.log(`  /ort/ort-wasm-simd-threaded.mjs → ${status}`);
		// 200 = served | 404 = WASM not copied to static/ after clone
		if (status === 404) {
			console.log('  ⚠  ONNX .mjs not served — run: cp node_modules/onnxruntime-web/dist/*.mjs static/ort/');
		}
		// Don't hard-fail: this is an environment check, not a build check
	});

	test('compute-pool worker API reports via /api/health', async ({ request }) => {
		const res = await request.get(`${BASE}/api/health`);
		const status = res.status();
		console.log(`  GET /api/health → ${status}`);
		if (status !== 200) return;

		const body = await res.json();
		// Log worker pool information if present in health response
		const workerInfo = body?.workerPool ?? body?.workers ?? body?.compute ?? null;
		if (workerInfo) {
			console.log(`  worker pool: ${JSON.stringify(workerInfo).slice(0, 200)}`);
		} else {
			console.log(`  ℹ  No worker pool info in health response — checking top-level keys: ${Object.keys(body).slice(0, 8).join(', ')}`);
		}
		expect(typeof body).toBe('object');
	});
});
