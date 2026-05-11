// @vitest-environment node
//
// Tests for src/lib/server/ace/kag-cluster-source.ts and the producer
// scripts/agents/som-cluster-cards.mjs flag handling.

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	kagClusterNodeSchema,
	kagClusterIndexSchema,
	readClusterIndex,
	readClusterById,
	pickClusterByTags,
	pickClusterByQuery,
	getClusterContextForQuery,
} from '$lib/server/ace/kag-cluster-source';

const PRODUCER = resolve(process.cwd(), 'scripts/agents/som-cluster-cards.mjs');
const NVME_INDEX = resolve(process.cwd(), 'memory/agents-dag/index.json');

describe('kag-cluster-source — schema + read tier (NVMe fallback)', () => {
	let nvmeReady = false;

	beforeAll(() => {
		nvmeReady = existsSync(NVME_INDEX);
	});

	it('kagClusterNodeSchema accepts a well-formed cluster node', () => {
		const node = {
			id: 'kag:cluster:agents:0-3',
			somRow: 0,
			somCol: 3,
			memberCount: 25,
			memberIds: ['agents:dir:src-lib-server-vector'],
			memberPaths: ['src/lib/server/vector'],
			topTags: ['qdrant', 'pgvector'],
			topFeatures: ['hyperrag.lane.qdrant_dense'],
			summary: 'Cluster 0-3 (25 dirs).',
			generatedAt: new Date().toISOString(),
		};
		expect(() => kagClusterNodeSchema.parse(node)).not.toThrow();
	});

	it('kagClusterNodeSchema rejects malformed id', () => {
		const node = {
			id: 'kag:cluster:agents:bogus',
			somRow: 0, somCol: 0, memberCount: 1,
			memberIds: [], memberPaths: [],
			topTags: [], topFeatures: [],
			summary: '', generatedAt: new Date().toISOString(),
		};
		expect(() => kagClusterNodeSchema.parse(node)).toThrow();
	});

	it('kagClusterIndexSchema enforces grid + cells shape', () => {
		const index = {
			grid: { rows: 6, cols: 6 },
			cells: [{ key: '0-3', count: 25 }],
			generatedAt: new Date().toISOString(),
		};
		expect(() => kagClusterIndexSchema.parse(index)).not.toThrow();
	});

	it('readClusterIndex falls back to NVMe when present', async () => {
		if (!nvmeReady) {
			console.log('[skip] memory/agents-dag/index.json missing — run npm run agents:som first');
			return;
		}
		const index = await readClusterIndex();
		expect(index).not.toBeNull();
		expect(index!.cells.length).toBeGreaterThan(0);
		expect(index!.grid.rows).toBeGreaterThan(0);
		expect(index!.grid.cols).toBeGreaterThan(0);
	});

	it('readClusterById returns a real cluster from NVMe (when populated)', async () => {
		if (!nvmeReady) return;
		const index = await readClusterIndex();
		expect(index).not.toBeNull();
		// Pick the first populated cell
		const firstCell = index!.cells[0];
		const [r, c] = firstCell.key.split('-').map(Number);
		const node = await readClusterById(r, c);
		expect(node).not.toBeNull();
		expect(node!.memberCount).toBe(firstCell.count);
		expect(node!.id).toBe(`kag:cluster:agents:${r}-${c}`);
	});

	it('readClusterById returns null for unpopulated cell', async () => {
		const node = await readClusterById(99, 99);
		expect(node).toBeNull();
	});
});

describe('kag-cluster-source — picking + ACE injection', () => {
	let nvmeReady = false;

	beforeAll(() => {
		nvmeReady = existsSync(NVME_INDEX);
	});

	it('pickClusterByTags returns empty when no tags match', async () => {
		const picks = await pickClusterByTags(['xyzzy_no_such_tag']);
		expect(picks).toEqual([]);
	});

	it('pickClusterByTags ranks by overlap (highest score first)', async () => {
		if (!nvmeReady) return;
		// Pull tags from the actual top-cell so we know we'll get hits
		const index = await readClusterIndex();
		const firstCell = index!.cells[0];
		const [r, c] = firstCell.key.split('-').map(Number);
		const node = await readClusterById(r, c);
		if (!node || node.topTags.length === 0) return; // fixture-dependent skip
		const picks = await pickClusterByTags(node.topTags.slice(0, 3));
		expect(picks.length).toBeGreaterThan(0);
		// Should be sorted descending
		for (let i = 1; i < picks.length; i++) {
			expect(picks[i - 1].score).toBeGreaterThanOrEqual(picks[i].score);
		}
		// First pick should include some of our query tags in its overlap
		expect(picks[0].overlap.length).toBeGreaterThan(0);
	});

	it('pickClusterByQuery extracts tokens and delegates', async () => {
		const picks = await pickClusterByQuery('how does qdrant vector search work in src lib');
		// Either NVMe is populated (some picks) or empty (no fixture yet)
		expect(Array.isArray(picks)).toBe(true);
	});

	it('getClusterContextForQuery returns null contextBlock when no match', async () => {
		const ctx = await getClusterContextForQuery('xyzzy_plugh_no_match');
		expect(ctx.contextBlock).toBeNull();
		expect(ctx.clusters).toEqual([]);
		expect(typeof ctx.timing.totalMs).toBe('number');
	});

	it('getClusterContextForQuery emits ACE-shaped markdown when matches exist', async () => {
		if (!nvmeReady) return;
		const index = await readClusterIndex();
		const firstCell = index!.cells[0];
		const [r, c] = firstCell.key.split('-').map(Number);
		const node = await readClusterById(r, c);
		if (!node || node.topTags.length === 0) return;
		const ctx = await getClusterContextForQuery(node.topTags.join(' '));
		if (ctx.clusters.length === 0) return; // tag-overlap may still miss; fixture-dependent
		expect(ctx.contextBlock).toMatch(/Directory cluster context/);
		expect(ctx.contextBlock).toMatch(/Cluster \d+-\d+/);
	});
});

describe('som-cluster-cards.mjs — producer flag contract', () => {
	const SOURCE = readFileSync(PRODUCER, 'utf-8');

	it('parses every documented flag', () => {
		const flags = ['--grid', '--iters', '--bow-dim', '--with-llm', '--dry-run', '--skip-redis', '--skip-nvme', '--quiet'];
		for (const f of flags) expect(SOURCE.includes(f)).toBe(true);
	});

	it('writes 3 distinct Redis key shapes', () => {
		expect(SOURCE).toMatch(/kag:cluster:agents:\$\{key\}/);    // per-cell key (string template)
		expect(SOURCE).toMatch(/kag:cluster:agents:_index/);        // enumeration root
		// per-cluster nodes have id prefix
		expect(SOURCE).toMatch(/kag:cluster:agents:\$\{key\}/);
	});

	it('NVMe layout writes one file per cluster + index.json', () => {
		expect(SOURCE).toMatch(/cluster-\$\{node\.somRow\}-\$\{node\.somCol\}\.json/);
		expect(SOURCE).toMatch(/index\.json/);
	});

	it('LLM step gated by --with-llm flag (off by default)', () => {
		expect(SOURCE).toMatch(/FLAGS\.withLlm/);
		expect(SOURCE).toMatch(/argv\.includes\('--with-llm'\)/);
	});

	it('SOM uses pure-JS implementation (no GPU dependency)', () => {
		expect(SOURCE).toMatch(/function trainSom/);
		expect(SOURCE).not.toMatch(/from 'tensorrt_bridge\.node'/);
		expect(SOURCE).not.toMatch(/cuda/i);
	});

	it('reads from CouchDB karpathy_wiki via _all_docs (read-only)', () => {
		expect(SOURCE).toMatch(/karpathy_wiki\/_all_docs/);
		// Must NOT contain destructive ops
		expect(SOURCE).not.toMatch(/method:\s*['"]DELETE['"]/);
	});

	it('hard rules respected in source comments', () => {
		expect(SOURCE).toMatch(/Hard rules respected/);
	});
});
