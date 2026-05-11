// @vitest-environment node
/**
 * Phase A2 — Section-builder + composeCard contract.
 *
 * Each builder is a pure function: same inputs → same output. We assemble
 * a synthetic RegenContext per test (no I/O), so the assertions are about
 * the section logic itself, not data plumbing.
 *
 * Reference: docs/design/2026-05-11_agents-directory-card-regen.md §2 + §6.
 */

import { describe, expect, it } from 'vitest';

import {
	buildIdentitySection,
	buildSummarySection,
	buildImportsSection,
	buildFeatureSection,
	buildTopologySection,
	buildStatusSection,
	buildActivitySection,
	buildGatesSection,
	composeCard,
} from '../src/lib/server/agents/regen/section-builders.js';
import type { RegenContext } from '../src/lib/server/agents/regen/loaders/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFile(rel: string, extra: Partial<RegenContext['graph']['files'] extends Map<string, infer V> ? V : never> = {}) {
	return {
		rel,
		ext:           '.ts',
		tags:          [],
		summary:       '',
		imports:       [],
		exports:       [],
		dynImports:    [],
		reExports:     [],
		routeHandlers: [],
		drizzleRefs:   [],
		isRoute:       false,
		isSvelteComp:  false,
		isTest:        false,
		lineCount:     0,
		...extra,
	};
}

function makeContext(overrides: Partial<RegenContext> = {}): RegenContext {
	const now = '2026-05-11T22:00:00.000Z';
	return {
		runStartedAt: now,
		graph: {
			createdAt:   now,
			repoRoot:    '/repo',
			files:       new Map(),
			directories: new Map(),
			fileCount:   0,
			dirCount:    0,
		},
		karpathy:    { scores: new Map(), loadedAt: now, entryCount: 0, source: 'mock' },
		clusters:    { summaries: new Map(), loadedAt: now, entryCount: 0, source: 'mock' },
		features:    { features: [], byDir: new Map(), loadedAt: now, source: 'mock' },
		activity:    { byDir: new Map(), loadedAt: now, rowsScanned: 0, source: 'mock' },
		pathAliases: { aliases: new Map([['$lib', 'src/lib'], ['$lib/*', 'src/lib/*']]), loadedAt: now, source: 'mock' },
		diagnostics: { loaderResults: {} as RegenContext['diagnostics']['loaderResults'], totalDurationMs: 0, warnings: [] },
		...overrides,
	};
}

// ── 1. buildIdentitySection ──────────────────────────────────────────────────

describe('buildIdentitySection', () => {
	it('produces a deterministic id + dirPath + title', () => {
		const a = buildIdentitySection('src/lib/server/ace');
		const b = buildIdentitySection('src/lib/server/ace');
		expect(a).toEqual(b);
		expect(a.id).toBe('agents:dir:src-lib-server-ace');
		expect(a.title).toBe('ACE'); // 3-char-or-less → uppercase
	});

	it('humanises multi-word basenames', () => {
		expect(buildIdentitySection('src/lib/server/context-assembler').title).toBe('Context Assembler');
	});

	it('normalises backslashes and trailing slashes', () => {
		const r = buildIdentitySection('src\\lib\\server\\ace\\');
		expect(r.dirPath).toBe('src/lib/server/ace');
	});
});

// ── 2. buildSummarySection ───────────────────────────────────────────────────

describe('buildSummarySection', () => {
	it('prefers cluster summary when the dir resolves to a cluster', () => {
		const ctx = makeContext();
		ctx.graph.directories.set('src/lib/server/ace', { rel: 'src/lib/server/ace', fileCount: 5, somCluster: '7' });
		ctx.clusters.summaries.set('7', 'cluster 7 — ACE pipeline');
		const r = buildSummarySection('src/lib/server/ace', ctx);
		expect(r.summary).toContain('cluster 7');
	});

	it('falls back to feature descriptions when no cluster summary', () => {
		const ctx = makeContext();
		ctx.features.byDir.set('src/lib/server/ace', [
			{ featureKey: 'ace.assembler', featureName: 'ACE Assembler', description: 'context assembler', laneIds: [], status: 'active', confidence: 1, files: [] },
		]);
		const r = buildSummarySection('src/lib/server/ace', ctx);
		expect(r.summary).toBe('context assembler');
	});

	it('caps at 2000 chars', () => {
		const ctx = makeContext();
		const long = 'x'.repeat(3000);
		ctx.graph.directories.set('d', { rel: 'd', fileCount: 1, somCluster: '0' });
		ctx.clusters.summaries.set('0', long);
		const r = buildSummarySection('d', ctx);
		expect(r.summary.length).toBeLessThanOrEqual(2000);
	});

	it('returns empty when no signals available', () => {
		expect(buildSummarySection('unknown/dir', makeContext()).summary).toBe('');
	});
});

// ── 3. buildImportsSection ───────────────────────────────────────────────────

describe('buildImportsSection', () => {
	it('counts top static + dynamic imports across files in the dir', () => {
		const ctx = makeContext();
		ctx.graph.files.set('src/lib/x/a.ts', makeFile('src/lib/x/a.ts', { imports: ['$lib/util', 'zod'] }));
		ctx.graph.files.set('src/lib/x/b.ts', makeFile('src/lib/x/b.ts', { imports: ['$lib/util'], dynImports: ['$lib/heavy'] }));
		ctx.graph.files.set('src/lib/other/c.ts', makeFile('src/lib/other/c.ts', { imports: ['$lib/util'] }));

		const r = buildImportsSection('src/lib/x', ctx);
		expect(r.staticImports[0]).toBe('$lib/util'); // most-counted in dir
		expect(r.dynamicImports).toContain('$lib/heavy');
		expect(r.pathAliases).toEqual(['$lib', '$lib/*']);
	});

	it('returns empty arrays when no files match the dir prefix', () => {
		const r = buildImportsSection('src/empty', makeContext());
		expect(r.staticImports).toEqual([]);
		expect(r.dynamicImports).toEqual([]);
		expect(r.pathAliases).toEqual([]);
	});
});

// ── 4. buildFeatureSection ───────────────────────────────────────────────────

describe('buildFeatureSection', () => {
	it('collects feature keys, route surfaces, and Drizzle table refs', () => {
		const ctx = makeContext();
		ctx.features.byDir.set('src/routes/api/x', [
			{ featureKey: 'x.search', featureName: 'X Search', description: '', laneIds: [], status: 'active', confidence: 1, files: [] },
		]);
		ctx.graph.files.set('src/routes/api/x/+server.ts', makeFile('src/routes/api/x/+server.ts', { isRoute: true, drizzleRefs: ['evidence_vectors'] }));
		ctx.graph.files.set('src/routes/api/x/helpers.ts', makeFile('src/routes/api/x/helpers.ts'));
		const r = buildFeatureSection('src/routes/api/x', ctx);
		expect(r.featureKeys).toEqual(['x.search']);
		expect(r.routeSurfaces).toContain('src/routes/api/x/+server.ts');
		expect(r.schemaTables).toEqual(['evidence_vectors']);
	});
});

// ── 5. buildTopologySection ──────────────────────────────────────────────────

describe('buildTopologySection', () => {
	it('aggregates qdrantTags from dir tagList + per-file tags + cluster id', () => {
		const ctx = makeContext();
		ctx.graph.directories.set('src/lib/x', { rel: 'src/lib/x', fileCount: 1, tagList: ['lib', 'x'], somCluster: '7' });
		ctx.graph.files.set('src/lib/x/a.ts', makeFile('src/lib/x/a.ts', { tags: ['ts', 'lib'] }));
		const r = buildTopologySection('src/lib/x', ctx);
		expect(r.qdrantTags).toEqual(expect.arrayContaining(['lib', 'x', 'ts', 'cluster:7']));
		expect(r.neo4jNodeId).toBe('agents:dir:src-lib-x');
		expect(r.couchDocId).toBe('agents:dir:src-lib-x');
	});
});

// ── 6. buildStatusSection ────────────────────────────────────────────────────

describe('buildStatusSection', () => {
	const ctx = makeContext();
	it('returns SHIPPED when routes + schema both present', () => {
		const r = buildStatusSection('any', ctx, { routeSurfaces: ['+server.ts'], schemaTables: ['t'], featureKeys: [] });
		expect(r.auditStatus).toBe('SHIPPED');
	});
	it('returns SPEC_ONLY when schema present but no routes', () => {
		const r = buildStatusSection('any', ctx, { routeSurfaces: [], schemaTables: ['t'], featureKeys: [] });
		expect(r.auditStatus).toBe('SPEC_ONLY');
	});
	it('returns PARTIAL when feature keys exist but no schema/route', () => {
		const r = buildStatusSection('any', ctx, { routeSurfaces: [], schemaTables: [], featureKeys: ['x'] });
		expect(r.auditStatus).toBe('PARTIAL');
	});
	it('returns EXPERIMENTAL when dirPath signals it', () => {
		const r = buildStatusSection('src/experimental/foo', ctx, { routeSurfaces: [], schemaTables: [], featureKeys: [] });
		expect(r.auditStatus).toBe('EXPERIMENTAL');
	});
	it('returns SPEC_ONLY by default', () => {
		const r = buildStatusSection('any', ctx, { routeSurfaces: [], schemaTables: [], featureKeys: [] });
		expect(r.auditStatus).toBe('SPEC_ONLY');
	});

	it('produces deterministic sibling recommendations from feature overlap', () => {
		const c = makeContext();
		c.features.byDir.set('src/a', [
			{ featureKey: 'shared', featureName: 's', description: '', laneIds: [], status: 'active', confidence: 1, files: [] },
		]);
		c.features.byDir.set('src/b', [
			{ featureKey: 'shared', featureName: 's', description: '', laneIds: [], status: 'active', confidence: 1, files: [] },
		]);
		c.features.byDir.set('src/c', [
			{ featureKey: 'unrelated', featureName: 'u', description: '', laneIds: [], status: 'active', confidence: 1, files: [] },
		]);
		const r = buildStatusSection('src/a', c, { routeSurfaces: [], schemaTables: [], featureKeys: ['shared'] });
		expect(r.recommendations).toEqual(['src/b']);
	});
});

// ── 7. buildActivitySection ──────────────────────────────────────────────────

describe('buildActivitySection', () => {
	it('returns 0/undefined when no activity recorded', () => {
		const r = buildActivitySection('cold/dir', makeContext());
		expect(r.activityScore).toBe(0);
		expect(r.lastAccessedAt).toBeUndefined();
	});

	it('pulls score + lastAccessedAt from the activity rollup', () => {
		const ctx = makeContext();
		ctx.activity.byDir.set('hot/dir', { dirPath: 'hot/dir', score: 3.14, lastAccessedAt: '2026-05-11T00:00:00.000Z', eventCount: 5 });
		const r = buildActivitySection('hot/dir', ctx);
		expect(r.activityScore).toBe(3.14);
		expect(r.lastAccessedAt).toBe('2026-05-11T00:00:00.000Z');
	});
});

// ── 8. buildGatesSection ─────────────────────────────────────────────────────

describe('buildGatesSection', () => {
	const ctx = makeContext();
	it('G-AI-01 is true when evidence_vectors schema OR tags present', () => {
		const r = buildGatesSection('d', ctx, { schemaTables: ['evidence_vectors'], qdrantTags: [], routeSurfaces: [] });
		expect(r.gates['G-AI-01']).toBe(true);
	});
	it('G-AI-02 reflects code_llm_index presence', () => {
		const r = buildGatesSection('d', ctx, { schemaTables: ['code_llm_index'], qdrantTags: [], routeSurfaces: [] });
		expect(r.gates['G-AI-02']).toBe(true);
	});
	it('G-AI-03 reflects route surfaces', () => {
		const r = buildGatesSection('d', ctx, { schemaTables: [], qdrantTags: [], routeSurfaces: ['+server.ts'] });
		expect(r.gates['G-AI-03']).toBe(true);
	});
});

// ── composeCard ──────────────────────────────────────────────────────────────

describe('composeCard', () => {
	function ctxWithFiles(dirPath: string): RegenContext {
		const ctx = makeContext();
		ctx.graph.directories.set(dirPath, { rel: dirPath, fileCount: 2, tagList: ['lib'], somCluster: '3' });
		ctx.graph.files.set(`${dirPath}/+server.ts`, makeFile(`${dirPath}/+server.ts`, { isRoute: true, drizzleRefs: ['evidence_vectors'], imports: ['$lib/util'] }));
		ctx.graph.files.set(`${dirPath}/helper.ts`, makeFile(`${dirPath}/helper.ts`, { imports: ['$lib/util'] }));
		ctx.clusters.summaries.set('3', 'topology cluster 3 — search pipeline');
		ctx.features.byDir.set(dirPath, [
			{ featureKey: 'search.x', featureName: 'Search', description: 'x search', laneIds: ['L0'], status: 'active', confidence: 1, files: [] },
		]);
		return ctx;
	}

	it('produces a Zod-valid card with hashed content', () => {
		const ctx = ctxWithFiles('src/routes/api/search');
		const { card, contentHash, changed } = composeCard('src/routes/api/search', ctx);
		expect(card.id).toBe('agents:dir:src-routes-api-search');
		expect(card.contentHash).toBe(contentHash);
		expect(contentHash).toMatch(/^[0-9a-f]{64}$/);
		expect(card.auditStatus).toBe('SHIPPED'); // route + schema
		expect(card.summary).toContain('topology cluster 3');
		expect(changed).toBe(true); // no existingCard
	});

	it('is deterministic: same context → same hash across 5 runs', () => {
		const ctx = ctxWithFiles('src/routes/api/x');
		const hashes = new Set<string>();
		for (let i = 0; i < 5; i++) {
			hashes.add(composeCard('src/routes/api/x', ctx).contentHash);
		}
		expect(hashes.size).toBe(1);
	});

	it('reports changed=false when existingCard has the same hash', () => {
		const ctx = ctxWithFiles('src/routes/api/x');
		const first  = composeCard('src/routes/api/x', ctx);
		const second = composeCard('src/routes/api/x', ctx, first.card);
		expect(second.changed).toBe(false);
		expect(second.contentHash).toBe(first.contentHash);
	});

	it('hash excludes lastIndexedAt + activityScore (churn-free regen)', () => {
		const ctx = ctxWithFiles('src/routes/api/x');
		const a = composeCard('src/routes/api/x', ctx);

		// Bump lastIndexedAt + activityScore on a fresh run
		const ctx2 = ctxWithFiles('src/routes/api/x');
		ctx2.runStartedAt = '2099-01-01T00:00:00.000Z';
		ctx2.activity.byDir.set('src/routes/api/x', { dirPath: 'src/routes/api/x', score: 99, lastAccessedAt: '2099-01-01T00:00:00.000Z', eventCount: 1 });
		const b = composeCard('src/routes/api/x', ctx2);

		expect(b.contentHash).toBe(a.contentHash); // unchanged → no rewrite
		expect(b.card.activityScore).toBe(99);     // but the card still carries the live value
	});
});
