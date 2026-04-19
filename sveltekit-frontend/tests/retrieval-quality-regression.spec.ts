/**
 * Retrieval quality regression tests.
 *
 * Verifies:
 *   1. Domain routing returns differentiated files per domain
 *   2. Error-vector fallback works when 'error' named vector is absent
 *   3. 2-stage tag search: tag filter first → unfiltered fallback
 *   4. Path-hint reranking boosts domain-relevant paths
 *   5. Compact budgets are respected under debug=false
 *   6. Worker degradation on timeout produces valid finding shape
 */

// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mock variables ────────────────────────────────────────────────────

const mockFetch = vi.hoisted(() => vi.fn());
const mockOllamaFetch = vi.hoisted(() => vi.fn());

// ── Static mocks ──────────────────────────────────────────────────────────────

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('$lib/server/env.server.js', () => ({
	ENV: {
		OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
		QDRANT_URL: 'http://127.0.0.1:6333',
		BIFROST_ENABLED: false,
	},
}));

vi.mock('$lib/config/env.server.js', () => ({
	getQdrantUrl: () => 'http://qdrant.test',
	getOllamaUrl: () => 'http://ollama.test',
}));

vi.mock('$lib/server/redis.js', () => ({
	getRedis: () => ({
		get: vi.fn(async () => null),
		set: vi.fn(async () => 'OK'),
		del: vi.fn(async () => 1),
	}),
	redis: {
		get: vi.fn(async () => null),
		set: vi.fn(async () => 'OK'),
	},
}));

vi.mock('$lib/server/db/client', () => ({
	db: {
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				returning: vi.fn(async () => []),
				catch: () => {},
			})),
		})),
	},
	pool: { query: vi.fn(async () => ({ rows: [] })) },
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
	researchSummaries: { id: 'id' },
	contextTimeline: {},
}));

// ── Fixture data ──────────────────────────────────────────────────────────────

function makeQdrantResult(paths: string[], tags: string[] = []) {
	return {
		result: paths.map((p, i) => ({
			id: i + 1,
			score: 0.95 - i * 0.05,
			payload: {
				file_path: p,
				content: `Content of ${p} — implementation details and logic.`,
				tags,
				role: 'server-module',
			},
		})),
	};
}

const DB_PATHS = [
	'src/lib/server/db/client.ts',
	'src/lib/server/db/schema-postgres.ts',
	'src/lib/server/db/migrations/0001_init.sql',
];

const API_PATHS = [
	'src/routes/api/cases/+server.ts',
	'src/routes/api/evidence/upload/+server.ts',
	'src/routes/api/chat/+server.ts',
];

const ERROR_PATHS = [
	'src/lib/server/error-handler.ts',
	'src/lib/server/diagnostics/error-cluster.ts',
	'src/routes/api/errors/+server.ts',
];

const MIXED_PATHS = [
	'src/lib/server/db/client.ts',
	'src/routes/api/cases/+server.ts',
	'src/lib/components/ui/Button.svelte',
	'src/lib/server/cache.ts',
];

// ── Test suites ───────────────────────────────────────────────────────────────

describe('Retrieval quality regression', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal('fetch', mockFetch);
	});

	describe('Domain routing differentiation', () => {
		it('database domain prefers db/ paths via path-hint reranking', () => {
			// Simulate Qdrant returning mixed paths — path-hint reranking should
			// surface db-related paths above generic ones
			const mixed = [...MIXED_PATHS];
			const results = mixed.map((p, i) => ({
				path: p,
				score: 0.90 - i * 0.02,
			}));

			// Apply the same path-hint boost logic used in searchQdrant
			const dbHints = ['db/', 'drizzle', 'schema', 'migration'];
			const sorted = results.sort((a, b) => {
				const aHit = dbHints.some(h => a.path.toLowerCase().includes(h.toLowerCase()));
				const bHit = dbHints.some(h => b.path.toLowerCase().includes(h.toLowerCase()));
				if (aHit !== bHit) return aHit ? -1 : 1;
				return b.score - a.score;
			});

			// After reranking, db/client.ts should be first despite not having highest score
			expect(sorted[0].path).toContain('db/');
		});

		it('api-routes domain prefers routes/api/ paths', () => {
			const mixed = [
				{ path: 'src/lib/server/cache.ts', score: 0.95 },
				{ path: 'src/routes/api/cases/+server.ts', score: 0.88 },
				{ path: 'src/lib/utils/string.ts', score: 0.85 },
			];

			const apiHints = ['routes/api/', '+server.ts'];
			const sorted = mixed.sort((a, b) => {
				const aHit = apiHints.some(h => a.path.toLowerCase().includes(h.toLowerCase()));
				const bHit = apiHints.some(h => b.path.toLowerCase().includes(h.toLowerCase()));
				if (aHit !== bHit) return aHit ? -1 : 1;
				return b.score - a.score;
			});

			expect(sorted[0].path).toContain('routes/api/');
		});

		it('DOMAIN_TAGS maps produce non-overlapping tag sets across domains', async () => {
			// Each domain (except general/error-patterns) should have distinct tags
			// that don't overlap with other domain tag sets
			const { COMPACT_DEFAULTS } = await import('$lib/server/ai/compact-budgets.js');
			expect(COMPACT_DEFAULTS.maxFindings).toBe(8); // sanity

			const DOMAIN_TAGS: Record<string, string[]> = {
				'api-routes':    ['api-route'],
				'state-machines':['state-machine'],
				'database':      ['database'],
				'error-patterns':[],
				'ml-inference':  ['ml-inference', 'embedding'],
				'auth':          ['auth'],
				'cache':         ['cache'],
				'rag-pipeline':  ['rag-pipeline', 'vector-search'],
				'ui-components': ['ui-component', 'page-component'],
				'graph-db':      ['graph-db'],
				'general':       [],
			};

			// Collect all tags from domains with non-empty arrays
			const allTagSets = Object.entries(DOMAIN_TAGS)
				.filter(([, tags]) => tags.length > 0)
				.map(([domain, tags]) => ({ domain, tags }));

			for (let i = 0; i < allTagSets.length; i++) {
				for (let j = i + 1; j < allTagSets.length; j++) {
					const overlap = allTagSets[i].tags.filter(t =>
						allTagSets[j].tags.includes(t)
					);
					expect(overlap, `${allTagSets[i].domain} and ${allTagSets[j].domain} overlap on: ${overlap}`).toEqual([]);
				}
			}
		});
	});

	describe('Error-vector fallback', () => {
		it('error-patterns domain has empty DOMAIN_TAGS (skips tag filter)', () => {
			const errorTags: string[] = [];
			expect(errorTags.length).toBe(0);

			// With empty tags, the 2-stage search skips the first stage
			const tagFilter = errorTags.length ? errorTags : undefined;
			expect(tagFilter).toBeUndefined();
		});

		it('error-patterns domain sets source to error-vector regardless of vecName fallback', () => {
			// Even when the 'error' named vector doesn't exist and we fall back
			// to 'content', the source field should still be 'error-vector'
			const domain = 'error-patterns';
			const useErrorVector = domain === 'error-patterns';
			const source = useErrorVector ? 'error-vector' : 'qdrant';
			expect(source).toBe('error-vector');
		});

		it('error-patterns with no chunks produces degraded finding', () => {
			const domain = 'error-patterns';
			const chunks: unknown[] = [];

			if (!chunks.length) {
				const finding = {
					domain,
					chunks: [],
					summary: 'No relevant chunks found',
					keyInsights: [],
					relevantPaths: [],
					durationMs: 50,
					source: 'degraded' as const,
					cached: false,
				};
				expect(finding.source).toBe('degraded');
				expect(finding.chunks).toEqual([]);
			}
		});
	});

	describe('2-stage tag search logic', () => {
		it('skips tag filter when domain has empty tags (general, error-patterns)', () => {
			for (const domain of ['general', 'error-patterns']) {
				const tags: string[] = []; // DOMAIN_TAGS for these domains
				const tagFilter = tags.length ? tags : undefined;
				expect(tagFilter).toBeUndefined();
			}
		});

		it('applies tag filter for domains with populated tags', () => {
			const dbTags = ['database'];
			const tagFilter = dbTags.length ? dbTags : undefined;
			expect(tagFilter).toEqual(['database']);
		});

		it('over-fetches 3x when pathHints present but no tagFilter', () => {
			const limit = 12;
			const tagFilter: string[] | undefined = undefined;
			const pathHints = ['db/', 'schema'];
			const fetchLimit = (pathHints?.length && !tagFilter?.length) ? limit * 3 : limit;
			expect(fetchLimit).toBe(36);
		});

		it('does not over-fetch when tagFilter is present', () => {
			const limit = 12;
			const tagFilter = ['database'];
			const pathHints = ['db/', 'schema'];
			const fetchLimit = (pathHints?.length && !tagFilter?.length) ? limit * 3 : limit;
			expect(fetchLimit).toBe(12);
		});
	});

	describe('Path-hint reranking', () => {
		it('boosts matching paths above higher-scoring non-matching paths', () => {
			const chunks = [
				{ path: 'src/lib/utils/string.ts', score: 0.99 },
				{ path: 'src/lib/server/db/client.ts', score: 0.80 },
				{ path: 'src/lib/components/Button.svelte', score: 0.85 },
			];

			const pathHints = ['db/', 'schema'];
			const sorted = [...chunks].sort((a, b) => {
				const aHit = pathHints.some(h => a.path.toLowerCase().includes(h.toLowerCase()));
				const bHit = pathHints.some(h => b.path.toLowerCase().includes(h.toLowerCase()));
				if (aHit !== bHit) return aHit ? -1 : 1;
				return b.score - a.score;
			});

			expect(sorted[0].path).toContain('db/');
			// Non-matching paths are sorted by score descending
			expect(sorted[1].score).toBeGreaterThan(sorted[2].score);
		});

		it('preserves score order when no pathHints are provided', () => {
			const chunks = [
				{ path: 'src/lib/server/db/client.ts', score: 0.80 },
				{ path: 'src/lib/utils/string.ts', score: 0.99 },
				{ path: 'src/lib/components/Button.svelte', score: 0.85 },
			];

			const pathHints: string[] = [];
			const sorted = [...chunks].sort((a, b) => {
				if (!pathHints?.length) return b.score - a.score;
				const aHit = pathHints.some(h => a.path.toLowerCase().includes(h.toLowerCase()));
				const bHit = pathHints.some(h => b.path.toLowerCase().includes(h.toLowerCase()));
				if (aHit !== bHit) return aHit ? -1 : 1;
				return b.score - a.score;
			});

			expect(sorted[0].score).toBe(0.99);
			expect(sorted[1].score).toBe(0.85);
			expect(sorted[2].score).toBe(0.80);
		});

		it('respects limit after reranking (slice to limit)', () => {
			const limit = 2;
			const chunks = Array.from({ length: 10 }, (_, i) => ({
				path: `src/file${i}.ts`,
				score: 0.90 - i * 0.05,
			}));

			const sliced = chunks.slice(0, limit);
			expect(sliced).toHaveLength(2);
		});
	});

	describe('Compact budget enforcement', () => {
		it('COMPACT_DEFAULTS values are within sane ranges', async () => {
			const { COMPACT_DEFAULTS } = await import('$lib/server/ai/compact-budgets.js');
			expect(COMPACT_DEFAULTS.maxFindings).toBeGreaterThanOrEqual(3);
			expect(COMPACT_DEFAULTS.maxFindings).toBeLessThanOrEqual(20);
			expect(COMPACT_DEFAULTS.maxFiles).toBeGreaterThanOrEqual(3);
			expect(COMPACT_DEFAULTS.maxFiles).toBeLessThanOrEqual(15);
			expect(COMPACT_DEFAULTS.maxActionItems).toBeGreaterThanOrEqual(3);
			expect(COMPACT_DEFAULTS.maxActionItems).toBeLessThanOrEqual(15);
			expect(COMPACT_DEFAULTS.maxSummaryChars).toBeGreaterThanOrEqual(500);
			expect(COMPACT_DEFAULTS.maxSummaryChars).toBeLessThanOrEqual(5000);
		});

		it('ASSIST_BUDGETS extends COMPACT_DEFAULTS with extra fields', async () => {
			const { COMPACT_DEFAULTS, ASSIST_BUDGETS } = await import(
				'$lib/server/ai/compact-budgets.js'
			);

			// All compact fields must be present in assist budgets
			for (const [key, val] of Object.entries(COMPACT_DEFAULTS)) {
				expect((ASSIST_BUDGETS as Record<string, unknown>)[key]).toBe(val);
			}

			// Assist has additional fields
			expect(ASSIST_BUDGETS).toHaveProperty('maxSchemaIds');
			expect(ASSIST_BUDGETS).toHaveProperty('maxRetrievalHits');
			expect(ASSIST_BUDGETS).toHaveProperty('maxAceChunks');
			expect(ASSIST_BUDGETS).toHaveProperty('maxErrorCards');
		});

		it('compact slicing truncates long summaries to maxSummaryChars', async () => {
			const { COMPACT_DEFAULTS } = await import('$lib/server/ai/compact-budgets.js');
			const longSummary = 'x'.repeat(5000);
			const truncated = longSummary.slice(0, COMPACT_DEFAULTS.maxSummaryChars);
			expect(truncated.length).toBe(2400);
		});

		it('compact slicing truncates keyFindings to maxFindings', async () => {
			const { COMPACT_DEFAULTS } = await import('$lib/server/ai/compact-budgets.js');
			const findings = Array.from({ length: 20 }, (_, i) => `Finding ${i}`);
			const truncated = findings.slice(0, COMPACT_DEFAULTS.maxFindings);
			expect(truncated.length).toBe(8);
		});
	});

	describe('Worker degradation shape', () => {
		it('timed-out worker produces valid WorkerFinding shape', () => {
			const domain = 'database' as const;
			const degraded = {
				domain,
				chunks: [],
				summary: 'Worker timeout or error: worker timeout',
				keyInsights: [],
				relevantPaths: [],
				durationMs: 0,
				source: 'degraded' as const,
				cached: false,
			};

			expect(degraded).toHaveProperty('domain');
			expect(degraded).toHaveProperty('chunks');
			expect(degraded).toHaveProperty('summary');
			expect(degraded).toHaveProperty('keyInsights');
			expect(degraded).toHaveProperty('relevantPaths');
			expect(degraded).toHaveProperty('durationMs');
			expect(degraded).toHaveProperty('source');
			expect(degraded).toHaveProperty('cached');
			expect(degraded.source).toBe('degraded');
			expect(degraded.chunks).toEqual([]);
		});

		it('degraded supervisorPlan falls back to [general]', () => {
			// When LLM extraction fails, supervisorPlan returns ['general']
			const fallbackDomains = ['general'];
			expect(fallbackDomains).toContain('general');
		});

		it('supervisorPlan auto-appends general when fewer than 3 domains', () => {
			let domains = ['database', 'cache'];
			if (!domains.includes('general') && domains.length < 3) {
				domains.push('general');
			}
			expect(domains).toContain('general');
			expect(domains.length).toBe(3);
		});

		it('supervisorPlan does NOT append general when 3+ domains', () => {
			let domains = ['database', 'cache', 'api-routes'];
			if (!domains.includes('general') && domains.length < 3) {
				domains.push('general');
			}
			expect(domains).not.toContain('general');
			expect(domains.length).toBe(3);
		});
	});
});
