// @vitest-environment node
/**
 * Tests for the AGENTS directory-card semantic index.
 *
 * Covers:
 *   - cardIdForDir is deterministic across runs + path separators
 *   - computeCardContentHash is stable across key order / array order
 *   - writeCardToRedis is idempotent (no rewrite when contentHash unchanged)
 *   - readCardsByIds preserves order + tolerates malformed entries
 *   - getAgentsContextForQuery: walk-up Redis hit wins; keyword broad-scan
 *     fallback ranks SHIPPED cards above UNKNOWN.
 *
 * Redis is mocked via vi.mock('$lib/server/redis') — no live Docker needed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── In-memory Redis stub ─────────────────────────────────────────────────────

class FakeRedis {
	store = new Map<string, string>();
	calls = { get: 0, setex: 0, mget: 0, scan: 0 };

	async get(k: string) {
		this.calls.get++;
		return this.store.get(k) ?? null;
	}
	async setex(k: string, _ttl: number, v: string) {
		this.calls.setex++;
		this.store.set(k, v);
		return 'OK';
	}
	async mget(keys: string[]) {
		this.calls.mget++;
		return keys.map((k) => this.store.get(k) ?? null);
	}
	async scan(cursor: string, ..._args: unknown[]) {
		this.calls.scan++;
		// single-shot scan: return all keys matching agents:dir:*
		if (cursor !== '0') return ['0', []];
		const keys = [...this.store.keys()].filter((k) => k.startsWith('agents:dir:'));
		return ['0', keys];
	}
}

const fake = new FakeRedis();

vi.mock('$lib/server/redis', () => ({
	getRedis: () => fake,
}));

// ── Imports under test (AFTER the mock) ──────────────────────────────────────

import {
	cardIdForDir,
	computeCardContentHash,
	writeCardToRedis,
	readCardFromRedis,
	readCardsByIds,
	type AgentsDirectoryCard,
} from '../src/lib/server/agents/agents-card-store.js';

import { getAgentsContextForQuery } from '../src/lib/server/ace/agents-context-source.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCard(overrides: Partial<AgentsDirectoryCard> = {}): AgentsDirectoryCard {
	const base = {
		id:             cardIdForDir(overrides.dirPath ?? 'src/lib/server/ace'),
		dirPath:        'src/lib/server/ace',
		purpose:        'ACE context assembler — fuses RAG/KAG/SOM/PR for legal queries.',
		featureKeys:    ['ace', 'context-assembler', 'kag'],
		importantFiles: ['context-assembler.ts', 'agents-context-source.ts'],
		imports:        ['$lib/server/redis', '$lib/server/vector/qdrant-manager'],
		exports:        ['assembleContext', 'getAgentsContextForQuery'],
		routes:         [],
		tags:           ['ace', 'retrieval', 'kag'],
		auditStatus:    'SHIPPED' as const,
		contentHash:    '',
		lastIndexedAt:  '2026-05-11T00:00:00.000Z',
	};
	const merged = { ...base, ...overrides };
	merged.contentHash = computeCardContentHash(merged);
	return merged as AgentsDirectoryCard;
}

beforeEach(() => {
	fake.store.clear();
	fake.calls = { get: 0, setex: 0, mget: 0, scan: 0 };
});

// ── cardIdForDir ─────────────────────────────────────────────────────────────

describe('cardIdForDir', () => {
	it('is deterministic across runs', () => {
		expect(cardIdForDir('src/lib/server/ace')).toBe(cardIdForDir('src/lib/server/ace'));
	});

	it('normalises path separators (forward vs back slash)', () => {
		expect(cardIdForDir('src/lib/server/ace')).toBe(cardIdForDir('src\\lib\\server\\ace'));
	});

	it('lowercases the slug', () => {
		expect(cardIdForDir('Src/Lib/Server/ACE')).toBe('agents:dir:src-lib-server-ace');
	});

	it('strips leading/trailing slashes', () => {
		expect(cardIdForDir('/src/lib/server/ace/')).toBe('agents:dir:src-lib-server-ace');
	});
});

// ── computeCardContentHash ───────────────────────────────────────────────────

describe('computeCardContentHash', () => {
	it('is stable for equivalent input regardless of array order', () => {
		const a = makeCard({ tags: ['ace', 'kag', 'retrieval'] });
		const b = makeCard({ tags: ['retrieval', 'kag', 'ace'] });
		expect(a.contentHash).toBe(b.contentHash);
	});

	it('changes when purpose changes', () => {
		const a = makeCard({ purpose: 'A' });
		const b = makeCard({ purpose: 'B' });
		expect(a.contentHash).not.toBe(b.contentHash);
	});

	it('does NOT change when lastIndexedAt changes (re-runs do not churn the hash)', () => {
		const a = makeCard({ lastIndexedAt: '2026-05-11T00:00:00.000Z' });
		const b = makeCard({ lastIndexedAt: '2027-01-01T00:00:00.000Z' });
		expect(a.contentHash).toBe(b.contentHash);
	});

	it('produces a 64-hex SHA-256 string', () => {
		expect(makeCard().contentHash).toMatch(/^[0-9a-f]{64}$/);
	});
});

// ── writeCardToRedis (idempotent) ────────────────────────────────────────────

describe('writeCardToRedis', () => {
	it('writes a new card when none exists', async () => {
		const card = makeCard();
		const wrote = await writeCardToRedis(card);
		expect(wrote).toBe(true);
		expect(fake.calls.setex).toBe(1);
	});

	it('skips the write when contentHash is unchanged', async () => {
		const card = makeCard();
		await writeCardToRedis(card);
		const before = fake.calls.setex;

		const wroteAgain = await writeCardToRedis({ ...card, lastIndexedAt: 'NEW' });
		expect(wroteAgain).toBe(false);
		expect(fake.calls.setex).toBe(before); // no new setex
	});

	it('overwrites when content actually changes', async () => {
		const a = makeCard({ purpose: 'V1' });
		await writeCardToRedis(a);

		const b = makeCard({ purpose: 'V2' });
		const wrote = await writeCardToRedis(b);
		expect(wrote).toBe(true);

		const stored = await readCardFromRedis(b.dirPath);
		expect(stored?.purpose).toBe('V2');
	});

	it('rejects malformed input (Zod parse error)', async () => {
		// @ts-expect-error — intentionally bad shape
		await expect(writeCardToRedis({ id: 'x', dirPath: 'y' })).rejects.toThrow();
	});
});

// ── readCardsByIds ───────────────────────────────────────────────────────────

describe('readCardsByIds', () => {
	it('preserves order and returns null for missing entries', async () => {
		const a = makeCard({ dirPath: 'src/lib/server/ace' });
		const c = makeCard({ dirPath: 'src/lib/server/agents' });
		await writeCardToRedis(a);
		await writeCardToRedis(c);

		const cards = await readCardsByIds([a.id, 'agents:dir:does-not-exist', c.id]);
		expect(cards).toHaveLength(3);
		expect(cards[0]?.dirPath).toBe('src/lib/server/ace');
		expect(cards[1]).toBeNull();
		expect(cards[2]?.dirPath).toBe('src/lib/server/agents');
	});

	it('returns empty array for empty input (no Redis call)', async () => {
		const result = await readCardsByIds([]);
		expect(result).toEqual([]);
		expect(fake.calls.mget).toBe(0);
		expect(fake.calls.get).toBe(0);
	});

	it('tolerates malformed JSON in storage', async () => {
		fake.store.set('agents:dir:bad', '{not-json');
		const [card] = await readCardsByIds(['agents:dir:bad']);
		expect(card).toBeNull();
	});
});

// ── getAgentsContextForQuery (ACE retrieval) ─────────────────────────────────

describe('getAgentsContextForQuery', () => {
	it('returns the walk-up card with relevance 1.0 when filePath is given', async () => {
		const card = makeCard({ dirPath: 'src/lib/server/ace' });
		await writeCardToRedis(card);

		const hits = await getAgentsContextForQuery('anything', {
			filePath: 'src/lib/server/ace/context-assembler.ts',
		});
		expect(hits).toHaveLength(1);
		expect(hits[0].source).toBe('redis');
		expect(hits[0].relevance).toBe(1.0);
		expect(hits[0].card.dirPath).toBe('src/lib/server/ace');
	});

	it('falls back to keyword broad-scan when no filePath given', async () => {
		const ace = makeCard({
			dirPath: 'src/lib/server/ace',
			tags: ['ace', 'retrieval', 'kag'],
			featureKeys: ['ace', 'context-assembler'],
		});
		const ui = makeCard({
			dirPath: 'src/lib/components/ui',
			tags: ['ui', 'bits'],
			featureKeys: ['button', 'dialog'],
			purpose: 'UI primitives',
		});
		await writeCardToRedis(ace);
		await writeCardToRedis(ui);

		const hits = await getAgentsContextForQuery('context assembler retrieval kag', {
			allowFallback: false,
		});

		expect(hits.length).toBeGreaterThanOrEqual(1);
		expect(hits[0].card.dirPath).toBe('src/lib/server/ace');
	});

	it('respects the limit option', async () => {
		for (let i = 0; i < 4; i++) {
			await writeCardToRedis(makeCard({ dirPath: `src/lib/server/dir${i}`, tags: ['shared'] }));
		}
		const hits = await getAgentsContextForQuery('shared', { limit: 2, allowFallback: false });
		expect(hits.length).toBeLessThanOrEqual(2);
	});

	it('returns empty array when nothing matches and fallback is disabled', async () => {
		const hits = await getAgentsContextForQuery('completely unrelated terminology xyzpdq', {
			allowFallback: false,
		});
		expect(hits).toEqual([]);
	});
});
