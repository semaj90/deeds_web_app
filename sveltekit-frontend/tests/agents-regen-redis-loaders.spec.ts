// @vitest-environment node
/**
 * Phase A1.3 + A1.4 — Redis loader contract tests.
 *
 * Covers loadKarpathyScores + loadClusterSummaries. Redis is mocked via
 * vi.mock('$lib/server/redis') with an in-memory FakeRedis — same pattern
 * the existing tests/agents-index.spec.ts uses.
 *
 * Each loader's failure modes (Redis unreachable, garbage JSON, empty key)
 * are tested against the spec §3 failure matrix.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── In-memory Redis stub ─────────────────────────────────────────────────────

class FakeRedis {
	hashes  = new Map<string, Record<string, string>>();
	keys    = new Map<string, string>();
	failHgetall = false;

	async hgetall(key: string): Promise<Record<string, string>> {
		if (this.failHgetall) throw new Error('mock hgetall failure');
		return this.hashes.get(key) ?? {};
	}

	async get(key: string): Promise<string | null> {
		return this.keys.get(key) ?? null;
	}

	async mget(keys: string[]): Promise<(string | null)[]> {
		return keys.map((k) => this.keys.get(k) ?? null);
	}

	async scan(cursor: string, _match: unknown, pattern: string, _count: unknown, _n: string): Promise<[string, string[]]> {
		if (cursor !== '0') return ['0', []];
		const prefix = String(pattern).replace(/\*$/, '');
		const matched = [...this.keys.keys()].filter((k) => k.startsWith(prefix));
		return ['0', matched];
	}
}

const fake = new FakeRedis();

vi.mock('$lib/server/redis', () => ({
	getRedis: () => fake,
}));

// Late imports (after vi.mock) ────────────────────────────────────────────────

import { loadKarpathyScores } from '../src/lib/server/agents/regen/loaders/karpathy.js';
import { loadClusterSummaries } from '../src/lib/server/agents/regen/loaders/cluster-summaries.js';

beforeEach(() => {
	fake.hashes.clear();
	fake.keys.clear();
	fake.failHgetall = false;
});

// ── loadKarpathyScores ───────────────────────────────────────────────────────

describe('loadKarpathyScores', () => {
	it('parses valid blend entries from hgetall', async () => {
		fake.hashes.set('gpu:karpathy:scores', {
			'src/lib/a.ts': JSON.stringify({ pr: 0.8, attn: 0.7, authority: 0.6, blend: 0.71 }),
			'src/lib/b.ts': JSON.stringify({ pr: 0.5, attn: 0.5, authority: 0.5, blend: 0.5 }),
		});
		const result = await loadKarpathyScores();
		expect(result.entryCount).toBe(2);
		expect(result.scores.get('src/lib/a.ts')?.blend).toBeCloseTo(0.71);
		expect(result.source).toBe('redis:gpu:karpathy:scores');
	});

	it('skips garbage JSON entries but keeps the rest', async () => {
		fake.hashes.set('gpu:karpathy:scores', {
			'good.ts':   JSON.stringify({ pr: 1, attn: 1, authority: 1, blend: 1 }),
			'bad.ts':    '{not-json',
			'partial.ts': JSON.stringify({ pr: 1 }), // missing fields
		});
		const result = await loadKarpathyScores();
		expect(result.entryCount).toBe(1);
		expect(result.scores.has('good.ts')).toBe(true);
		expect(result.scores.has('bad.ts')).toBe(false);
		expect(result.scores.has('partial.ts')).toBe(false);
	});

	it('returns empty Map when the hash key is missing (no exception)', async () => {
		const result = await loadKarpathyScores();
		expect(result.entryCount).toBe(0);
		expect(result.scores.size).toBe(0);
	});

	it('returns empty Map + marks source unreachable on redis error', async () => {
		fake.failHgetall = true;
		const result = await loadKarpathyScores();
		expect(result.entryCount).toBe(0);
		expect(result.source).toContain('unreachable');
	});

	it('honors a custom redisKey override', async () => {
		fake.hashes.set('custom:scores', {
			'x.ts': JSON.stringify({ pr: 1, attn: 1, authority: 1, blend: 1 }),
		});
		const result = await loadKarpathyScores({ redisKey: 'custom:scores' });
		expect(result.entryCount).toBe(1);
		expect(result.source).toBe('redis:custom:scores');
	});
});

// ── loadClusterSummaries ─────────────────────────────────────────────────────

describe('loadClusterSummaries', () => {
	it('returns empty Map when no keys match the pattern', async () => {
		const result = await loadClusterSummaries();
		expect(result.entryCount).toBe(0);
		expect(result.source).toBe('redis:ace:cluster:summary:*');
	});

	it('reads all summaries matching the default pattern', async () => {
		fake.keys.set('ace:cluster:summary:0', 'cluster 0 summary');
		fake.keys.set('ace:cluster:summary:5', 'cluster 5 summary');
		fake.keys.set('unrelated:key', 'should be skipped');
		const result = await loadClusterSummaries();
		expect(result.entryCount).toBe(2);
		expect(result.summaries.get('0')).toBe('cluster 0 summary');
		expect(result.summaries.get('5')).toBe('cluster 5 summary');
		expect(result.summaries.has('unrelated:key')).toBe(false);
	});

	it('extracts clusterId from the suffix after the pattern prefix', async () => {
		fake.keys.set('ace:cluster:summary:R3-C5', 'topology cell summary');
		const result = await loadClusterSummaries();
		expect(result.summaries.get('R3-C5')).toBe('topology cell summary');
	});

	it('skips empty-string values', async () => {
		fake.keys.set('ace:cluster:summary:7', '');
		const result = await loadClusterSummaries();
		expect(result.entryCount).toBe(0);
	});

	it('honors a custom keyPattern override', async () => {
		fake.keys.set('custom:cluster:42', 'custom-cluster prose');
		const result = await loadClusterSummaries({ keyPattern: 'custom:cluster:*' });
		expect(result.entryCount).toBe(1);
		expect(result.summaries.get('42')).toBe('custom-cluster prose');
	});
});
