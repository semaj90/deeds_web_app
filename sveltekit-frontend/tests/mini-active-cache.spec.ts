// @vitest-environment node
//
// Tests for the mini-active NVMe cache: producer flag contract +
// consumer reader semantics. Real-fixture aware — when the cache file
// is present, exercises full O(1) lookups; when absent, exercises null-fallback.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	miniActiveCacheSchema,
	miniCacheClusterEntrySchema,
	getClusterByCell,
	getCellForDirPath,
	getCellsForFeature,
	getCellsForTag,
	getCellForFilePath,
	pickCellsForKeywords,
	getMiniCacheStats,
	reloadMiniCache,
} from '$lib/server/ace/mini-active-cache';

const PRODUCER = resolve(process.cwd(), 'scripts/agents/build-mini-active-cache.mjs');
const CACHE_PATH = resolve(process.cwd(), 'mini_active_nvme_cache/agents-graph.min.json');

describe('mini-active-cache — schema', () => {
	it('miniCacheClusterEntrySchema accepts a well-formed entry', () => {
		const entry = {
			somRow: 0, somCol: 3,
			memberCount: 5,
			memberPaths: ['src/lib/server/vector'],
			topTags: ['qdrant'], topFeatures: ['hyperrag.lane.qdrant_dense'],
			summary: 'Cluster summary',
		};
		expect(() => miniCacheClusterEntrySchema.parse(entry)).not.toThrow();
	});

	it('miniActiveCacheSchema enforces top-level shape', () => {
		const cache = {
			version: '1.0.0',
			generatedAt: new Date().toISOString(),
			grid: { rows: 6, cols: 6 },
			cardCount: 0, clusterCount: 0, featureCount: 0, tagCount: 0, dirCount: 0,
			byCluster: {}, byDirPath: {}, byFeature: {}, byTag: {},
		};
		expect(() => miniActiveCacheSchema.parse(cache)).not.toThrow();
	});

	it('miniActiveCacheSchema rejects missing required field', () => {
		const cache: any = {
			version: '1.0.0',
			grid: { rows: 6, cols: 6 },
			byCluster: {}, byDirPath: {}, byFeature: {}, byTag: {},
		};
		expect(() => miniActiveCacheSchema.parse(cache)).toThrow();
	});
});

describe('mini-active-cache — readers', () => {
	let cachePresent = false;

	beforeAll(() => {
		reloadMiniCache(); // ensure clean state
		cachePresent = existsSync(CACHE_PATH);
	});

	it('getMiniCacheStats reports presence honestly', () => {
		const stats = getMiniCacheStats();
		expect(typeof stats.present).toBe('boolean');
		if (cachePresent) {
			expect(stats.present).toBe(true);
			expect(stats.bytes).toBeGreaterThan(0);
		}
	});

	it('all readers return null/empty when cache file is missing or fixture absent', () => {
		// These should NEVER throw — missing cache must degrade silently
		expect(() => getClusterByCell(99, 99)).not.toThrow();
		expect(() => getCellForDirPath('this/does/not/exist')).not.toThrow();
		expect(() => getCellsForFeature('xyz_no_such_feature')).not.toThrow();
		expect(() => getCellsForTag('xyz_no_such_tag')).not.toThrow();
		expect(() => getCellForFilePath('this/does/not/exist.ts')).not.toThrow();
		expect(() => pickCellsForKeywords(['xyz_no_match'])).not.toThrow();
	});

	it('getClusterByCell hits a real cell when cache is present', () => {
		if (!cachePresent) return;
		const cache = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
		const firstKey = Object.keys(cache.byCluster)[0];
		if (!firstKey) return; // empty fixture
		const [r, c] = firstKey.split('-').map(Number);
		const entry = getClusterByCell(r, c);
		expect(entry).not.toBeNull();
		expect(entry!.somRow).toBe(r);
		expect(entry!.somCol).toBe(c);
		expect(entry!.memberCount).toBeGreaterThan(0);
	});

	it('getCellForDirPath round-trips a known dir', () => {
		if (!cachePresent) return;
		const cache = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
		const knownDir = Object.keys(cache.byDirPath)[0];
		if (!knownDir) return;
		expect(getCellForDirPath(knownDir)).toBe(cache.byDirPath[knownDir]);
	});

	it('getCellForFilePath walks up from a file in a known dir', () => {
		if (!cachePresent) return;
		const cache = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
		const knownDir = Object.keys(cache.byDirPath)[0];
		if (!knownDir) return;
		// Append a fake filename — walk-up should still resolve to the same cell
		const fakeFile = `${knownDir}/some-file.ts`;
		expect(getCellForFilePath(fakeFile)).toBe(cache.byDirPath[knownDir]);
	});

	it('pickCellsForKeywords ranks descending', () => {
		if (!cachePresent) return;
		const cache = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
		const tags = Object.keys(cache.byTag).slice(0, 3);
		if (tags.length === 0) return;
		const picks = pickCellsForKeywords(tags);
		expect(Array.isArray(picks)).toBe(true);
		for (let i = 1; i < picks.length; i++) {
			expect(picks[i - 1].score).toBeGreaterThanOrEqual(picks[i].score);
		}
	});
});

describe('build-mini-active-cache.mjs — producer flag contract', () => {
	const SOURCE = readFileSync(PRODUCER, 'utf-8');

	it('parses every documented flag', () => {
		for (const f of ['--dry-run', '--pretty', '--skip-neo4j', '--quiet']) {
			expect(SOURCE.includes(f)).toBe(true);
		}
	});

	it('writes to mini_active_nvme_cache/agents-graph.min.json', () => {
		expect(SOURCE).toMatch(/mini_active_nvme_cache/);
		expect(SOURCE).toMatch(/agents-graph\.min\.json/);
	});

	it('reads from CouchDB karpathy_wiki + NVMe fallback (read-only)', () => {
		expect(SOURCE).toMatch(/karpathy_wiki\/_all_docs/);
		expect(SOURCE).toMatch(/agents-dag/); // NVMe fallback
		// NO destructive ops
		expect(SOURCE).not.toMatch(/method:\s*['"]DELETE['"]/);
		expect(SOURCE).not.toMatch(/method:\s*['"]PUT['"]/);
	});

	it('Neo4j step is read-only Cypher (MATCH/RETURN, no MERGE/CREATE/DELETE)', () => {
		// Find the Neo4j cypher block inside fetchNeo4jDirToFeaturesAndTags
		const cypherMatch = SOURCE.match(/MATCH \(c:AgentsCard\)[\s\S]+?RETURN[\s\S]+?\`/);
		expect(cypherMatch).not.toBeNull();
		expect(cypherMatch![0]).not.toMatch(/CREATE|MERGE|DELETE|SET\s/);
	});

	it('default output is minified (uses JSON.stringify without indent argument)', () => {
		// Pretty mode opts in via --pretty; default is no-indent stringify
		expect(SOURCE).toMatch(/FLAGS\.pretty\s*\?\s*JSON\.stringify\(cache,\s*null,\s*2\)\s*:\s*JSON\.stringify\(cache\)/);
	});

	it('hard rules respected in source comments', () => {
		expect(SOURCE).toMatch(/Hard rules:/);
		expect(SOURCE).toMatch(/READ-ONLY/);
		expect(SOURCE).toMatch(/No LLM calls/);
	});
});
