// @vitest-environment node
/**
 * Phase A1.9 — buildRegenContext composer contract.
 *
 * Verifies Promise.allSettled wiring, diagnostics shape, fixture
 * injection, and graceful handling of individual loader failures.
 *
 * We mock the 6 loader modules at the file boundary rather than
 * stubbing Redis/Postgres — the composer's job is orchestration, not
 * data fetching, so loader stubs cleanly isolate the contract.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/server/agents/regen/loaders/graph.js', () => ({
	loadGraph: vi.fn(async () => ({
		graph: {
			createdAt:   new Date().toISOString(),
			repoRoot:    '/tmp/test',
			files:       new Map([['a.ts', { rel: 'a.ts' }]]),
			directories: new Map([['src', { rel: 'src', fileCount: 1 }]]),
			fileCount:   1,
			dirCount:    1,
		},
		loadedAt:     new Date().toISOString(),
		staleMs:      0,
		staleWarning: false,
		source:       'mocked',
	})),
}));

vi.mock('../src/lib/server/agents/regen/loaders/karpathy.js', () => ({
	loadKarpathyScores: vi.fn(async () => ({
		scores: new Map([['a.ts', { pr: 1, attn: 1, authority: 1, blend: 1 }]]),
		loadedAt: new Date().toISOString(),
		entryCount: 1,
		source: 'mocked',
	})),
}));

vi.mock('../src/lib/server/agents/regen/loaders/cluster-summaries.js', () => ({
	loadClusterSummaries: vi.fn(async () => ({
		summaries: new Map([['0', 'summary']]),
		loadedAt: new Date().toISOString(),
		entryCount: 1,
		source: 'mocked',
	})),
}));

vi.mock('../src/lib/server/agents/regen/loaders/features.js', () => ({
	loadFeatures: vi.fn(async () => ({
		features: [{ featureKey: 'k', featureName: 'n', description: '', laneIds: [], status: 'active', confidence: 1, files: [] }],
		byDir:    new Map(),
		loadedAt: new Date().toISOString(),
		source:   'mocked',
	})),
}));

vi.mock('../src/lib/server/agents/regen/loaders/activity.js', () => ({
	loadActivity: vi.fn(async () => ({
		byDir:       new Map(),
		loadedAt:    new Date().toISOString(),
		rowsScanned: 0,
		source:      'mocked',
	})),
}));

vi.mock('../src/lib/server/agents/regen/loaders/path-aliases.js', () => ({
	loadPathAliases: vi.fn(async () => ({
		aliases:  new Map([['$lib', 'src/lib']]),
		loadedAt: new Date().toISOString(),
		source:   'mocked',
	})),
}));

import { buildRegenContext } from '../src/lib/server/agents/regen/loaders/build-context.js';
import { loadActivity } from '../src/lib/server/agents/regen/loaders/activity.js';
import { loadFeatures } from '../src/lib/server/agents/regen/loaders/features.js';

describe('buildRegenContext', () => {
	it('aggregates all 6 loaders into a typed RegenContext', async () => {
		const ctx = await buildRegenContext();
		expect(ctx.graph.fileCount).toBe(1);
		expect(ctx.karpathy.entryCount).toBe(1);
		expect(ctx.clusters.entryCount).toBe(1);
		expect(ctx.features.features).toHaveLength(1);
		expect(ctx.pathAliases.aliases.get('$lib')).toBe('src/lib');
		expect(ctx.runStartedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
	});

	it('records per-loader diagnostics (ok + durationMs + counts)', async () => {
		const ctx = await buildRegenContext();
		const d   = ctx.diagnostics;
		expect(d.loaderResults.graph.ok).toBe(true);
		expect(d.loaderResults.karpathyScores.ok).toBe(true);
		expect(d.loaderResults.karpathyScores.entryCount).toBe(1);
		expect(d.loaderResults.clusterSummaries.entryCount).toBe(1);
		expect(d.loaderResults.features.featureCount).toBe(1);
		expect(d.loaderResults.activity.rowsScanned).toBe(0);
		expect(d.loaderResults.pathAliases.aliasCount).toBe(1);
		expect(d.totalDurationMs).toBeGreaterThanOrEqual(0);
		expect(d.warnings).toBeInstanceOf(Array);
	});

	it('skips activity when --skipActivity option is set', async () => {
		const mockedActivity = loadActivity as unknown as ReturnType<typeof vi.fn>;
		mockedActivity.mockClear();
		const ctx = await buildRegenContext({ skipActivity: true });
		expect(ctx.activity.source).toBe('skipped');
		expect(mockedActivity).not.toHaveBeenCalled();
	});

	it('injects fixtures.features in lieu of the real loader', async () => {
		const mockedFeatures = loadFeatures as unknown as ReturnType<typeof vi.fn>;
		mockedFeatures.mockClear();
		const fixture = {
			features: [{ featureKey: 'fx', featureName: 'fx', description: 'fixture', laneIds: ['LX'], status: 'active', confidence: 1, files: ['fx.ts'] }],
			byDir:    new Map(),
			loadedAt: new Date().toISOString(),
			source:   'fixture',
		};
		const ctx = await buildRegenContext({ fixtures: { features: fixture } });
		expect(ctx.features.source).toBe('fixture');
		expect(ctx.features.features[0].featureKey).toBe('fx');
		expect(mockedFeatures).not.toHaveBeenCalled();
	});

	it('runs survivors when one loader throws', async () => {
		const mockedKarpathy = (await import('../src/lib/server/agents/regen/loaders/karpathy.js')).loadKarpathyScores as unknown as ReturnType<typeof vi.fn>;
		mockedKarpathy.mockRejectedValueOnce(new Error('redis down'));

		const ctx = await buildRegenContext();
		// karpathy uses empty defaults
		expect(ctx.karpathy.entryCount).toBe(0);
		// other loaders still produce real values
		expect(ctx.graph.fileCount).toBe(1);
		expect(ctx.features.features).toHaveLength(1);
		// warning recorded
		expect(ctx.diagnostics.warnings.some((w) => w.loader === 'karpathyScores')).toBe(true);
		expect(ctx.diagnostics.loaderResults.karpathyScores.ok).toBe(false);
	});

	it('emits a warning when graph is > 24h stale', async () => {
		const mockedGraph = (await import('../src/lib/server/agents/regen/loaders/graph.js')).loadGraph as unknown as ReturnType<typeof vi.fn>;
		mockedGraph.mockResolvedValueOnce({
			graph: {
				createdAt:   new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
				repoRoot:    '/tmp/test',
				files:       new Map(),
				directories: new Map(),
				fileCount:   0,
				dirCount:    0,
			},
			loadedAt:     new Date().toISOString(),
			staleMs:      48 * 3600 * 1000,
			staleWarning: true,
			source:       'mocked-stale',
		});

		const ctx = await buildRegenContext();
		expect(ctx.diagnostics.warnings.some((w) => w.loader === 'graph' && w.message.includes('stale'))).toBe(true);
	});
});
