// @vitest-environment node
import { expect, test } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const TIMEOUT_FAST = 10_000;
const TIMEOUT_FULL = 90_000;

test.describe('HyperRAG Pipeline Smoke', () => {
	test('fast smoke — no inference, clusters+hits+wiki+sourceRefs present (<10s)', async ({ request }) => {
		const start = Date.now();
		const res = await request.post(`${BASE}/api/admin/atlas/hyperrag`, {
			data: { query: 'evidence upload pipeline', topK: 5, topClusters: 3, noInference: true },
			timeout: TIMEOUT_FAST,
		});

		const elapsed = Date.now() - start;
		expect(res.status(), `HTTP status`).toBe(200);

		const d = await res.json();

		// Phase B: Qdrant returned hits
		expect(d.resultCount, 'resultCount > 0').toBeGreaterThan(0);
		expect(Array.isArray(d.results), 'results array').toBe(true);

		// Phase C: CouchDB wiki enrichment ran
		expect(d.phaseC, 'phaseC present').toBeTruthy();
		expect(typeof d.phaseC.wikiDocsFetched, 'wikiDocsFetched is number').toBe('number');
		expect(typeof d.phaseC.hitsEnriched, 'hitsEnriched is number').toBe('number');

		// Phase latency fields
		expect(d.phaseLatency, 'phaseLatency present').toBeTruthy();
		expect(typeof d.phaseLatency.embed, 'embed latency').toBe('number');
		expect(typeof d.phaseLatency.qdrant, 'qdrant latency').toBe('number');
		expect(typeof d.phaseLatency.couchdb, 'couchdb latency').toBe('number');

		// At least one result has a source_ref
		const withRef = d.results.filter((h: { source_ref: string | null }) => h.source_ref);
		expect(withRef.length, 'at least one source_ref').toBeGreaterThan(0);

		// RRF scores present
		for (const hit of d.results as Array<{ rrfScore: number }>) {
			expect(typeof hit.rrfScore).toBe('number');
		}

		// noInference flag suppresses Phase D synthesis
		expect(d.phaseD?.synthesis ?? null, 'no synthesis when noInference=true').toBeNull();

		console.log(`fast smoke OK — ${elapsed}ms, ${d.resultCount} hits, wiki=${d.phaseC.hitsEnriched}`);
	});

	test('full synthesis smoke — RotorQuant runs and returns blend scores (~30-60s)', async ({ request }) => {
		// Skip if RotorQuant / Ollama not reachable (CI without GPU)
		const rotorUrl = process.env.ROTORQUANT_URL ?? 'http://127.0.0.1:8090';
		let rotorUp = false;
		try {
			const h = await fetch(`${rotorUrl}/health`, { signal: AbortSignal.timeout(2_000) });
			rotorUp = h.ok;
		} catch { /* offline */ }

		if (!rotorUp) {
			console.warn('⚠️  RotorQuant not reachable — skipping full synthesis smoke');
			test.skip();
			return;
		}

		const start = Date.now();
		const res = await request.post(`${BASE}/api/admin/atlas/hyperrag`, {
			data: { query: 'legal document evidence chain of custody', topK: 10, topClusters: 5, noInference: false },
			timeout: TIMEOUT_FULL,
		});

		const elapsed = Date.now() - start;
		expect(res.status(), `HTTP status`).toBe(200);

		const d = await res.json();

		// Phase D ran
		expect(d.phaseD, 'phaseD present').toBeTruthy();

		// Either synthesis text OR explicit inferError — no silent null
		const hasOutput = d.phaseD.synthesis !== null || d.phaseD.inferError !== null;
		expect(hasOutput, 'phaseD produced synthesis or inferError').toBe(true);

		// Phase E audit log
		expect(d.phaseE, 'phaseE present').toBeTruthy();
		expect(d.phaseE.auditLogWritten, 'auditLogWritten').toBe(true);

		// Karpathy blend scores on results
		const withBlend = (d.results as Array<{ karpathyBlend: number | null }>)
			.filter(h => h.karpathyBlend !== null);
		expect(withBlend.length, 'at least one karpathyBlend score').toBeGreaterThan(0);

		// RotorQuant latency tracked
		expect(typeof d.phaseD.inferLatencyMs, 'inferLatencyMs is number').toBe('number');

		// Total latency field present
		expect(typeof d.latencyMs, 'latencyMs present').toBe('number');

		console.log(
			`full synthesis OK — ${elapsed}ms, synthesis=${d.phaseD.synthesis ? 'yes' : 'no'}, ` +
			`inferMs=${d.phaseD.inferLatencyMs}, blendHits=${withBlend.length}`
		);
	});
});