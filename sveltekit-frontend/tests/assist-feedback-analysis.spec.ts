// @vitest-environment node
/**
 * Tests for:
 * 1. overlapScore — retrieved top paths overlap with edited files
 * 2. GET /api/codebase-index/claude-assist/feedback/analysis — breakdowns
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ── Hoisted mocks ──────────────────────────────────────────────── */
const mockSelect = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/db/client', () => ({
	db: {
		select: mockSelect.mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		}),
	},
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
	contextTimeline: { eventType: 'eventType', createdAt: 'createdAt' },
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn((_col: any, val: any) => ({ col: _col, val })),
	or: vi.fn((...args: any[]) => args),
	desc: vi.fn((col: any) => ({ desc: col })),
}));

let GET: any;

beforeEach(async () => {
	vi.clearAllMocks();
	const mod = await import(
		'../src/routes/api/codebase-index/claude-assist/feedback/analysis/+server.ts'
	);
	GET = mod.GET;
});

function makeCtx(params?: Record<string, string>) {
	const url = new URL('http://localhost/api/codebase-index/claude-assist/feedback/analysis');
	if (params) {
		for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	}
	return { locals: { user: { id: 'user-1' } }, url };
}

/* ── Auth & Degraded ────────────────────────────────────────────── */
describe('GET /feedback/analysis — guards', () => {
	it('returns 401 without user', async () => {
		const res = await GET({
			locals: {},
			url: new URL('http://localhost/'),
		});
		expect(res.status).toBe(401);
	});

	it('returns degraded shape on DB failure', async () => {
		mockSelect.mockReturnValueOnce({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockReturnValue({
						limit: vi.fn().mockRejectedValue(new Error('DB down')),
					}),
				}),
			}),
		});
		const res = await GET(makeCtx());
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.overallStats).toEqual({ total: 0, useful: 0, notUseful: 0, usefulPct: 0 });
		expect(body.overlapRate).toEqual({ mean: 0, samples: 0, withEdits: 0 });
		expect(body.byDomain).toEqual([]);
		expect(body.recentCorrelated).toEqual([]);
	});

	it('returns empty stats with no data', async () => {
		const res = await GET(makeCtx());
		const body = await res.json();
		expect(body.overallStats.total).toBe(0);
		expect(body.overlapRate.mean).toBe(0);
	});
});

/* ── Correlation & Overlap ──────────────────────────────────────── */
describe('GET /feedback/analysis — correlation', () => {
	function seedRows(rows: { eventType: string; payload: any }[]) {
		mockSelect.mockReturnValueOnce({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue(
							rows.map((r, i) => ({
								...r,
								id: `id-${i}`,
								createdAt: new Date(),
							})),
						),
					}),
				}),
			}),
		});
	}

	it('computes overall useful rate', async () => {
		seedRows([
			{ eventType: 'claude_assist.completed', payload: { queryHash: 'a' } },
			{ eventType: 'claude_assist.feedback', payload: { queryHash: 'a', useful: true } },
			{ eventType: 'claude_assist.feedback', payload: { queryHash: 'a', useful: false } },
			{ eventType: 'claude_assist.feedback', payload: { queryHash: 'a', useful: true } },
		]);
		const body = await (await GET(makeCtx())).json();
		expect(body.overallStats).toEqual({ total: 3, useful: 2, notUseful: 1, usefulPct: 67 });
	});

	it('computes overlap rate when editedFiles match topPaths', async () => {
		seedRows([
			{
				eventType: 'claude_assist.completed',
				payload: {
					queryHash: 'q1',
					topPaths: ['src/lib/server/cache.ts', 'src/lib/server/redis.ts', 'src/routes/api/chat/+server.ts'],
					researchDomains: ['cache'],
					cacheHit: false,
					compact: true,
					graphNeighborCount: 2,
					totalMs: 3500,
				},
			},
			{
				eventType: 'claude_assist.feedback',
				payload: {
					queryHash: 'q1',
					useful: true,
					editedFiles: ['src/lib/server/cache.ts', 'src/lib/server/redis.ts'],
				},
			},
		]);
		const body = await (await GET(makeCtx())).json();
		// 2 of 2 edited files are in topPaths → 100% overlap
		expect(body.overlapRate.mean).toBe(100);
		expect(body.overlapRate.samples).toBe(1);
		expect(body.overlapRate.withEdits).toBe(1);
	});

	it('computes partial overlap rate', async () => {
		seedRows([
			{
				eventType: 'claude_assist.completed',
				payload: {
					queryHash: 'q2',
					topPaths: ['src/lib/server/cache.ts'],
					researchDomains: ['cache'],
					cacheHit: false,
					compact: true,
					graphNeighborCount: 0,
					totalMs: 1500,
				},
			},
			{
				eventType: 'claude_assist.feedback',
				payload: {
					queryHash: 'q2',
					useful: false,
					editedFiles: ['src/lib/server/cache.ts', 'src/lib/utils/hash.ts'],
				},
			},
		]);
		const body = await (await GET(makeCtx())).json();
		// 1 of 2 edited files in topPaths → 50%
		expect(body.overlapRate.mean).toBe(50);
	});

	it('skips overlap when no editedFiles', async () => {
		seedRows([
			{
				eventType: 'claude_assist.completed',
				payload: { queryHash: 'q3', topPaths: ['src/a.ts'] },
			},
			{
				eventType: 'claude_assist.feedback',
				payload: { queryHash: 'q3', useful: true },
			},
		]);
		const body = await (await GET(makeCtx())).json();
		expect(body.overlapRate.mean).toBe(0);
		expect(body.overlapRate.samples).toBe(0);
	});

	it('breaks down by cache hit vs miss', async () => {
		seedRows([
			{ eventType: 'claude_assist.completed', payload: { queryHash: 'h1', cacheHit: true, compact: true, graphNeighborCount: 0, totalMs: 100 } },
			{ eventType: 'claude_assist.completed', payload: { queryHash: 'h2', cacheHit: false, compact: true, graphNeighborCount: 0, totalMs: 5000 } },
			{ eventType: 'claude_assist.feedback', payload: { queryHash: 'h1', useful: true } },
			{ eventType: 'claude_assist.feedback', payload: { queryHash: 'h2', useful: false } },
		]);
		const body = await (await GET(makeCtx())).json();
		expect(body.byCacheHit.hit.total).toBe(1);
		expect(body.byCacheHit.hit.pct).toBe(100);
		expect(body.byCacheHit.miss.total).toBe(1);
		expect(body.byCacheHit.miss.pct).toBe(0);
	});

	it('breaks down by domain', async () => {
		seedRows([
			{
				eventType: 'claude_assist.completed',
				payload: { queryHash: 'd1', researchDomains: ['cache', 'rag-pipeline'], cacheHit: false, compact: true, graphNeighborCount: 0, totalMs: 2000 },
			},
			{
				eventType: 'claude_assist.feedback',
				payload: { queryHash: 'd1', useful: true },
			},
		]);
		const body = await (await GET(makeCtx())).json();
		const cacheEntry = body.byDomain.find((d: any) => d.domain === 'cache');
		const ragEntry = body.byDomain.find((d: any) => d.domain === 'rag-pipeline');
		expect(cacheEntry).toBeTruthy();
		expect(cacheEntry.useful).toBe(1);
		expect(ragEntry).toBeTruthy();
		expect(ragEntry.useful).toBe(1);
	});

	it('breaks down by graph neighbor bucket', async () => {
		seedRows([
			{ eventType: 'claude_assist.completed', payload: { queryHash: 'g1', graphNeighborCount: 0, cacheHit: false, compact: true, totalMs: 1000 } },
			{ eventType: 'claude_assist.completed', payload: { queryHash: 'g2', graphNeighborCount: 7, cacheHit: false, compact: true, totalMs: 1000 } },
			{ eventType: 'claude_assist.feedback', payload: { queryHash: 'g1', useful: false } },
			{ eventType: 'claude_assist.feedback', payload: { queryHash: 'g2', useful: true } },
		]);
		const body = await (await GET(makeCtx())).json();
		const bucket0 = body.byGraphBucket.find((b: any) => b.bucket === '0');
		const bucket4_10 = body.byGraphBucket.find((b: any) => b.bucket === '4-10');
		expect(bucket0?.pct).toBe(0);
		expect(bucket4_10?.pct).toBe(100);
	});

	it('breaks down by latency bucket', async () => {
		seedRows([
			{ eventType: 'claude_assist.completed', payload: { queryHash: 'l1', totalMs: 800, cacheHit: true, compact: true, graphNeighborCount: 0 } },
			{ eventType: 'claude_assist.completed', payload: { queryHash: 'l2', totalMs: 15000, cacheHit: false, compact: true, graphNeighborCount: 0 } },
			{ eventType: 'claude_assist.feedback', payload: { queryHash: 'l1', useful: true } },
			{ eventType: 'claude_assist.feedback', payload: { queryHash: 'l2', useful: false } },
		]);
		const body = await (await GET(makeCtx())).json();
		const fast = body.latencyBuckets.find((b: any) => b.bucket.startsWith('fast'));
		const slow = body.latencyBuckets.find((b: any) => b.bucket.startsWith('slow'));
		expect(fast?.pct).toBe(100);
		expect(slow?.pct).toBe(0);
	});

	it('includes recent correlated entries', async () => {
		seedRows([
			{
				eventType: 'claude_assist.completed',
				payload: { queryHash: 'rc1', topPaths: ['a.ts'], researchDomains: ['general'], cacheHit: false, compact: true, graphNeighborCount: 1, totalMs: 2000 },
			},
			{
				eventType: 'claude_assist.feedback',
				payload: { queryHash: 'rc1', useful: true, comment: 'great' },
			},
		]);
		const body = await (await GET(makeCtx())).json();
		expect(body.recentCorrelated.length).toBe(1);
		expect(body.recentCorrelated[0].useful).toBe(true);
		expect(body.recentCorrelated[0].domains).toEqual(['general']);
		expect(body.recentCorrelated[0].topPaths).toEqual(['a.ts']);
	});
});

/* ── Overlap rate as regression test ────────────────────────────── */
describe('overlapScore regression', () => {
	// Import the internal helper indirectly via the endpoint behavior
	it('overlap is 0 when editedFiles have no intersection', async () => {
		const mockSelectImpl = {
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								eventType: 'claude_assist.completed',
								payload: { queryHash: 'no-overlap', topPaths: ['src/lib/a.ts', 'src/lib/b.ts'] },
								createdAt: new Date(),
							},
							{
								eventType: 'claude_assist.feedback',
								payload: { queryHash: 'no-overlap', useful: true, editedFiles: ['src/lib/x.ts', 'src/lib/y.ts'] },
								createdAt: new Date(),
							},
						]),
					}),
				}),
			}),
		};
		mockSelect.mockReturnValueOnce(mockSelectImpl);
		const body = await (await GET(makeCtx())).json();
		expect(body.overlapRate.mean).toBe(0);
		expect(body.overlapRate.samples).toBe(1);
	});

	it('overlap is 100 when all edited files were retrieved', async () => {
		const mockSelectImpl = {
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								eventType: 'claude_assist.completed',
								payload: { queryHash: 'full-overlap', topPaths: ['src/lib/a.ts', 'src/lib/b.ts', 'src/lib/c.ts'] },
								createdAt: new Date(),
							},
							{
								eventType: 'claude_assist.feedback',
								payload: { queryHash: 'full-overlap', useful: true, editedFiles: ['src/lib/a.ts', 'src/lib/b.ts'] },
								createdAt: new Date(),
							},
						]),
					}),
				}),
			}),
		};
		mockSelect.mockReturnValueOnce(mockSelectImpl);
		const body = await (await GET(makeCtx())).json();
		expect(body.overlapRate.mean).toBe(100);
	});
});

/* ── Edge-case regression guards ────────────────────────────────── */
describe('overlapScore edge cases', () => {
	function seedRows(rows: { eventType: string; payload: any }[]) {
		mockSelect.mockReturnValueOnce({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue(
							rows.map((r, i) => ({
								...r,
								id: `edge-${i}`,
								createdAt: new Date(),
							})),
						),
					}),
				}),
			}),
		});
	}

	it('handles feedback with no matching completed event', async () => {
		seedRows([
			// Only feedback, no completed event for this queryHash
			{ eventType: 'claude_assist.feedback', payload: { queryHash: 'orphan-fb', useful: true, editedFiles: ['src/lib/a.ts'] } },
		]);
		const body = await (await GET(makeCtx())).json();
		expect(body.overallStats.total).toBe(1);
		expect(body.overallStats.useful).toBe(1);
		// No completed event → overlap is not computable → 0 samples
		expect(body.overlapRate.samples).toBe(0);
		expect(body.overlapRate.mean).toBe(0);
		// Should still appear in correlated list but with empty topPaths
		expect(body.recentCorrelated[0].topPaths).toEqual([]);
	});

	it('handles completed event with empty topPaths', async () => {
		seedRows([
			{ eventType: 'claude_assist.completed', payload: { queryHash: 'empty-top', topPaths: [] } },
			{ eventType: 'claude_assist.feedback', payload: { queryHash: 'empty-top', useful: true, editedFiles: ['src/lib/x.ts'] } },
		]);
		const body = await (await GET(makeCtx())).json();
		// topPaths is empty → overlapScore returns 0, still counted as sample
		expect(body.overlapRate.mean).toBe(0);
		expect(body.overlapRate.samples).toBe(1);
	});

	it('handles path case variants (case-insensitive match)', async () => {
		seedRows([
			{ eventType: 'claude_assist.completed', payload: { queryHash: 'case-q', topPaths: ['src/lib/Server/Cache.ts'] } },
			{ eventType: 'claude_assist.feedback', payload: { queryHash: 'case-q', useful: true, editedFiles: ['src/lib/server/cache.ts'] } },
		]);
		const body = await (await GET(makeCtx())).json();
		// normalize() lowercases both sides → should match
		expect(body.overlapRate.mean).toBe(100);
		expect(body.overlapRate.samples).toBe(1);
	});

	it('handles src/ prefix stripping in path normalization', async () => {
		seedRows([
			// topPaths has src/ prefix, editedFiles does not
			{ eventType: 'claude_assist.completed', payload: { queryHash: 'prefix-q', topPaths: ['src/lib/utils.ts'] } },
			{ eventType: 'claude_assist.feedback', payload: { queryHash: 'prefix-q', useful: true, editedFiles: ['lib/utils.ts'] } },
		]);
		const body = await (await GET(makeCtx())).json();
		// normalize strips leading src/ → 'lib/utils.ts' matches
		expect(body.overlapRate.mean).toBe(100);
	});

	it('handles completed event with null/missing topPaths field', async () => {
		seedRows([
			{ eventType: 'claude_assist.completed', payload: { queryHash: 'null-top' } },
			{ eventType: 'claude_assist.feedback', payload: { queryHash: 'null-top', useful: false, editedFiles: ['src/a.ts'] } },
		]);
		const body = await (await GET(makeCtx())).json();
		expect(body.overlapRate.samples).toBe(0);
		expect(body.overallStats.total).toBe(1);
		expect(body.overallStats.notUseful).toBe(1);
	});

	it('degraded response includes recommendations array', async () => {
		mockSelect.mockReturnValueOnce({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockReturnValue({
						limit: vi.fn().mockRejectedValue(new Error('DB fail')),
					}),
				}),
			}),
		});
		const body = await (await GET(makeCtx())).json();
		expect(body.recommendations).toEqual([]);
	});
});

/* ── Recommendations engine ─────────────────────────────────────── */
describe('GET /feedback/analysis — recommendations', () => {
	/** Seed N feedback rows all pointing to one completed event */
	function seedMany(count: number, overrides: { useful?: boolean; graphNeighborCount?: number; cacheHit?: boolean; compact?: boolean; totalMs?: number; topPaths?: string[]; editedFiles?: string[]; researchDomains?: string[] } = {}) {
		const rows: any[] = [];
		rows.push({
			eventType: 'claude_assist.completed',
			id: 'c-0',
			createdAt: new Date(),
			payload: {
				queryHash: 'bulk',
				topPaths: overrides.topPaths ?? ['src/lib/a.ts'],
				researchDomains: overrides.researchDomains ?? ['cache'],
				cacheHit: overrides.cacheHit ?? false,
				compact: overrides.compact ?? true,
				graphNeighborCount: overrides.graphNeighborCount ?? 0,
				totalMs: overrides.totalMs ?? 3000,
			},
		});
		for (let i = 0; i < count; i++) {
			rows.push({
				eventType: 'claude_assist.feedback',
				id: `f-${i}`,
				createdAt: new Date(),
				payload: {
					queryHash: 'bulk',
					useful: overrides.useful ?? (i % 2 === 0),
					editedFiles: overrides.editedFiles ?? [],
				},
			});
		}
		mockSelect.mockReturnValueOnce({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue(rows),
					}),
				}),
			}),
		});
	}

	it('shows low-sample warning when fewer than 10 samples', async () => {
		seedMany(3, { useful: true });
		const body = await (await GET(makeCtx())).json();
		const info = body.recommendations.find((r: any) => r.icon === 'info');
		expect(info).toBeTruthy();
		expect(info.text).toContain('Only 3');
		expect(info.confidence).toBe('low');
	});

	it('includes domain recommendation with enough samples', async () => {
		seedMany(6, { useful: true, researchDomains: ['rag-pipeline'] });
		const body = await (await GET(makeCtx())).json();
		const domain = body.recommendations.find((r: any) => r.icon === 'target');
		expect(domain).toBeTruthy();
		expect(domain.text).toContain('rag-pipeline');
	});

	it('returns no recommendations with empty data', async () => {
		seedMany(0);
		const body = await (await GET(makeCtx())).json();
		expect(body.recommendations).toEqual([]);
	});

	it('recommendations array has correct shape', async () => {
		seedMany(7, { useful: true });
		const body = await (await GET(makeCtx())).json();
		for (const rec of body.recommendations) {
			expect(rec).toHaveProperty('icon');
			expect(rec).toHaveProperty('text');
			expect(rec).toHaveProperty('confidence');
			expect(['low', 'medium', 'high']).toContain(rec.confidence);
		}
	});

	it('warns about thin domain data when domain has <3 samples', async () => {
		// 2 samples in a single domain — below THIN_THRESHOLD of 3
		seedMany(2, { useful: true, researchDomains: ['tiny-domain'] });
		const body = await (await GET(makeCtx())).json();
		const thin = body.recommendations.find((r: any) => r.icon === 'alert-circle' && r.text.includes('Thin data for domains'));
		expect(thin).toBeTruthy();
		expect(thin.text).toContain('tiny-domain');
		expect(thin.confidence).toBe('low');
	});

	it('warns about thin graph bucket data', async () => {
		// 2 runs with graphNeighborCount=5 → bucket "4-10" has 2 samples
		seedMany(2, { useful: true, graphNeighborCount: 5 });
		const body = await (await GET(makeCtx())).json();
		const thin = body.recommendations.find((r: any) => r.icon === 'alert-circle' && r.text.includes('graph buckets'));
		expect(thin).toBeTruthy();
		expect(thin.confidence).toBe('low');
	});

	it('warns about thin cache split data', async () => {
		// 2 cache hits — miss has 0, hit has 2 (thin)
		seedMany(2, { useful: true, cacheHit: true });
		const body = await (await GET(makeCtx())).json();
		const thin = body.recommendations.find((r: any) => r.icon === 'alert-circle' && r.text.includes('Cache hit/miss'));
		expect(thin).toBeTruthy();
	});

	it('no thin-bucket warning when domain has >=3 samples', async () => {
		seedMany(5, { useful: true, researchDomains: ['big-domain'] });
		const body = await (await GET(makeCtx())).json();
		const thin = body.recommendations.find((r: any) => r.icon === 'alert-circle' && r.text.includes('Thin data for domains'));
		expect(thin).toBeUndefined();
	});
});

/* ── Suggested defaults ─────────────────────────────────────────── */
describe('GET /feedback/analysis — suggestedDefaults', () => {
	function seedMany(count: number, overrides: { useful?: boolean; graphNeighborCount?: number; cacheHit?: boolean; compact?: boolean; totalMs?: number; topPaths?: string[]; editedFiles?: string[]; researchDomains?: string[] } = {}) {
		const rows: any[] = [];
		rows.push({
			eventType: 'claude_assist.completed',
			id: 'c-0',
			createdAt: new Date(),
			payload: {
				queryHash: 'bulk',
				topPaths: overrides.topPaths ?? ['src/lib/a.ts'],
				researchDomains: overrides.researchDomains ?? ['cache'],
				cacheHit: overrides.cacheHit ?? false,
				compact: overrides.compact ?? true,
				graphNeighborCount: overrides.graphNeighborCount ?? 0,
				totalMs: overrides.totalMs ?? 3000,
			},
		});
		for (let i = 0; i < count; i++) {
			rows.push({
				eventType: 'claude_assist.feedback',
				id: `sd-${i}`,
				createdAt: new Date(),
				payload: {
					queryHash: 'bulk',
					useful: overrides.useful ?? (i % 2 === 0),
					editedFiles: overrides.editedFiles ?? [],
				},
			});
		}
		mockSelect.mockReturnValueOnce({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue(rows),
					}),
				}),
			}),
		});
	}

	it('returns null suggestedDefaults when fewer than 10 samples', async () => {
		seedMany(5, { useful: true });
		const body = await (await GET(makeCtx())).json();
		expect(body.suggestedDefaults).toBeNull();
	});

	it('returns suggestedDefaults when 10+ samples with low overlap', async () => {
		seedMany(12, { useful: true, editedFiles: ['src/lib/x.ts'], topPaths: ['src/lib/y.ts'] });
		const body = await (await GET(makeCtx())).json();
		// overlap is 0% (no intersection) → should suggest raising maxAceChunks
		expect(body.suggestedDefaults).not.toBeNull();
		expect(body.suggestedDefaults.maxAceChunks).toBe(10);
	});

	it('returns null suggestedDefaults when only one mode bucket exists', async () => {
		seedMany(12, { useful: true, compact: true });
		const body = await (await GET(makeCtx())).json();
		// Only compact data, no debug comparison → no mode suggestion
		// Also graph=0 only, cache=miss only → no suggestions emerge
		expect(body.suggestedDefaults).toBeNull();
	});

	it('suggestedDefaults shape has expected keys', async () => {
		seedMany(12, { useful: true, editedFiles: ['src/lib/x.ts'], topPaths: ['src/lib/y.ts'] });
		const body = await (await GET(makeCtx())).json();
		if (body.suggestedDefaults) {
			const keys = Object.keys(body.suggestedDefaults);
			for (const k of keys) {
				expect(['maxGraphNeighbors', 'maxAceChunks', 'compact', 'cacheTtlHint']).toContain(k);
			}
		}
	});
});

/* ── Defaults impact ────────────────────────────────────────────── */
describe('GET /feedback/analysis — defaultsImpact', () => {
	function seedWithApply(opts: {
		beforeCount: number;
		afterCount: number;
		beforeUseful?: boolean;
		afterUseful?: boolean;
		editedFiles?: string[];
		topPaths?: string[];
	}) {
		const applyTime = new Date('2026-04-15T12:00:00Z');
		const rows: any[] = [];

		// completed event
		rows.push({
			eventType: 'claude_assist.completed',
			id: 'c-0',
			createdAt: new Date('2026-04-10T00:00:00Z'),
			payload: {
				queryHash: 'bulk',
				topPaths: opts.topPaths ?? ['src/lib/a.ts'],
				researchDomains: ['cache'],
				cacheHit: false,
				compact: true,
				graphNeighborCount: 0,
				totalMs: 3000,
			},
		});

		// tuned_defaults event
		rows.push({
			eventType: 'assist.tuned_defaults',
			id: 'td-0',
			createdAt: applyTime,
			payload: { maxAceChunks: 10, compact: false },
		});

		// feedback before apply
		for (let i = 0; i < opts.beforeCount; i++) {
			rows.push({
				eventType: 'claude_assist.feedback',
				id: `fb-${i}`,
				createdAt: new Date('2026-04-14T00:00:00Z'),
				payload: {
					queryHash: 'bulk',
					useful: opts.beforeUseful ?? false,
					editedFiles: opts.editedFiles ?? [],
				},
			});
		}

		// feedback after apply
		for (let i = 0; i < opts.afterCount; i++) {
			rows.push({
				eventType: 'claude_assist.feedback',
				id: `fa-${i}`,
				createdAt: new Date('2026-04-16T00:00:00Z'),
				payload: {
					queryHash: 'bulk',
					useful: opts.afterUseful ?? true,
					editedFiles: opts.editedFiles ?? [],
				},
			});
		}

		mockSelect.mockReturnValueOnce({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue(rows),
					}),
				}),
			}),
		});
	}

	it('returns null when no tuned_defaults event', async () => {
		const rows = [
			{ eventType: 'claude_assist.feedback', id: 'f1', createdAt: new Date(), payload: { queryHash: 'q', useful: true, editedFiles: [] } },
		];
		mockSelect.mockReturnValueOnce({
			from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(rows) }) }) }),
		});
		const body = await (await GET(makeCtx())).json();
		expect(body.defaultsImpact).toBeNull();
	});

	it('splits feedback into before/after windows', async () => {
		seedWithApply({ beforeCount: 3, afterCount: 2, beforeUseful: false, afterUseful: true });
		const body = await (await GET(makeCtx())).json();
		expect(body.defaultsImpact).not.toBeNull();
		expect(body.defaultsImpact.before.total).toBe(3);
		expect(body.defaultsImpact.after.total).toBe(2);
		expect(body.defaultsImpact.before.usefulPct).toBe(0);
		expect(body.defaultsImpact.after.usefulPct).toBe(100);
	});

	it('computes positive delta when after is better', async () => {
		seedWithApply({ beforeCount: 4, afterCount: 4, beforeUseful: false, afterUseful: true });
		const body = await (await GET(makeCtx())).json();
		expect(body.defaultsImpact.delta.usefulPct).toBe(100);
	});

	it('includes current and previous defaults payloads', async () => {
		seedWithApply({ beforeCount: 1, afterCount: 1 });
		const body = await (await GET(makeCtx())).json();
		expect(body.defaultsImpact.current).toEqual({ maxAceChunks: 10, compact: false });
		expect(body.defaultsImpact.previous).toBeNull();
	});

	it('computes overlap delta when editedFiles provided', async () => {
		seedWithApply({
			beforeCount: 2,
			afterCount: 2,
			beforeUseful: true,
			afterUseful: true,
			editedFiles: ['src/lib/a.ts'],
			topPaths: ['src/lib/a.ts'],
		});
		const body = await (await GET(makeCtx())).json();
		expect(body.defaultsImpact.before.overlapMean).toBe(100);
		expect(body.defaultsImpact.after.overlapMean).toBe(100);
		expect(body.defaultsImpact.delta.overlapMean).toBe(0);
	});

	it('degraded response includes defaultsImpact: null', async () => {
		mockSelect.mockReturnValueOnce({
			from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockRejectedValue(new Error('fail')) }) }) }),
		});
		const body = await (await GET(makeCtx())).json();
		expect(body.defaultsImpact).toBeNull();
	});

	it('includes domainImpact with per-domain deltas', async () => {
		const applyTime = new Date('2026-04-15T12:00:00Z');
		const rows: any[] = [
			{
				eventType: 'claude_assist.completed', id: 'c-0',
				createdAt: new Date('2026-04-10T00:00:00Z'),
				payload: { queryHash: 'bulk', topPaths: ['a.ts'], researchDomains: ['cache', 'rag'], cacheHit: false, compact: true, graphNeighborCount: 0, totalMs: 3000 },
			},
			{ eventType: 'assist.tuned_defaults', id: 'td-0', createdAt: applyTime, payload: { maxAceChunks: 10 } },
		];
		// 3 before (not useful), 2 after (useful)
		for (let i = 0; i < 3; i++) {
			rows.push({ eventType: 'claude_assist.feedback', id: `fb-${i}`, createdAt: new Date('2026-04-14T00:00:00Z'), payload: { queryHash: 'bulk', useful: false, editedFiles: [] } });
		}
		for (let i = 0; i < 2; i++) {
			rows.push({ eventType: 'claude_assist.feedback', id: `fa-${i}`, createdAt: new Date('2026-04-16T00:00:00Z'), payload: { queryHash: 'bulk', useful: true, editedFiles: [] } });
		}
		mockSelect.mockReturnValueOnce({
			from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(rows) }) }) }),
		});
		const body = await (await GET(makeCtx())).json();
		expect(body.defaultsImpact.domainImpact).toBeDefined();
		expect(body.defaultsImpact.domainImpact.length).toBeGreaterThanOrEqual(1);
		const cacheDomain = body.defaultsImpact.domainImpact.find((d: any) => d.domain === 'cache');
		if (cacheDomain) {
			expect(cacheDomain.before.total).toBe(3);
			expect(cacheDomain.after.total).toBe(2);
			expect(cacheDomain.delta.usefulPct).toBe(100); // 0% → 100%
		}
	});
});

/* ── Sample window filtering ────────────────────────────────────── */
describe('GET /feedback/analysis — window param', () => {
	function seedWithDates() {
		const now = Date.now();
		const rows: any[] = [];
		rows.push({
			eventType: 'claude_assist.completed', id: 'c-0',
			createdAt: new Date(now - 1000),
			payload: { queryHash: 'q1', topPaths: ['a.ts'], researchDomains: ['cache'], cacheHit: false, compact: true, graphNeighborCount: 0, totalMs: 3000 },
		});
		// 30 feedback rows — 10 from last 3 days, 20 from 10 days ago
		for (let i = 0; i < 10; i++) {
			rows.push({
				eventType: 'claude_assist.feedback', id: `f-recent-${i}`,
				createdAt: new Date(now - i * 60000), // within minutes
				payload: { queryHash: 'q1', useful: true, editedFiles: [] },
			});
		}
		for (let i = 0; i < 20; i++) {
			rows.push({
				eventType: 'claude_assist.feedback', id: `f-old-${i}`,
				createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000 - i * 60000), // 10 days ago
				payload: { queryHash: 'q1', useful: false, editedFiles: [] },
			});
		}
		mockSelect.mockReturnValueOnce({
			from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(rows) }) }) }),
		});
	}

	it('window=all returns all feedback', async () => {
		seedWithDates();
		const body = await (await GET(makeCtx({ window: 'all' }))).json();
		expect(body.overallStats.total).toBe(30);
	});

	it('window=7d filters to last 7 days only', async () => {
		seedWithDates();
		const body = await (await GET(makeCtx({ window: '7d' }))).json();
		expect(body.overallStats.total).toBe(10);
		expect(body.overallStats.usefulPct).toBe(100); // only recent (useful) ones
	});

	it('window=25 limits to 25 most recent runs', async () => {
		seedWithDates();
		const body = await (await GET(makeCtx({ window: '25' }))).json();
		expect(body.overallStats.total).toBe(25);
	});

	it('no window param defaults to all', async () => {
		seedWithDates();
		const body = await (await GET(makeCtx())).json();
		expect(body.overallStats.total).toBe(30);
	});
});
