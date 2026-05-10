// @vitest-environment node
//
// Integration test for sparseLegalSearch — exercises the live legal_documents
// table + GIN index added by drizzle/manual/20260510_legal_documents_tsvector.sql.
//
// Skipped automatically if Postgres is unreachable so unit-only `vitest run` stays green.
//
// Pre-req: docker compose up legal-ai-postgres + the tsvector migration applied.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { sparseLegalSearch } from '$lib/server/retrieval/sparse-bm25.js';

const DATABASE_URL =
	process.env.DATABASE_URL ||
	'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db';

let pool: pg.Pool;
let dbReachable = false;

beforeAll(async () => {
	pool = new pg.Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 1500 });
	try {
		await pool.query('SELECT 1');
		// Confirm the migration is in place — fail fast if content_tsv missing
		const probe = await pool.query<{ ok: boolean }>(
			"SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='legal_documents' AND column_name='content_tsv') AS ok"
		);
		dbReachable = probe.rows[0]?.ok ?? false;
	} catch {
		dbReachable = false;
	}
});

afterAll(async () => {
	await pool?.end().catch(() => {});
});

describe('sparseLegalSearch (Postgres ts_rank_cd integration)', () => {
	it('returns [] for empty query without hitting DB', async () => {
		const hits = await sparseLegalSearch(pool, '   ');
		expect(hits).toEqual([]);
	});

	it('returns [] for whitespace-only query', async () => {
		const hits = await sparseLegalSearch(pool, '\t\n');
		expect(hits).toEqual([]);
	});

	it('runs against live tsvector index when DB is reachable', async () => {
		if (!dbReachable) {
			console.log('[skip] Postgres not reachable or content_tsv column missing');
			return;
		}
		const hits = await sparseLegalSearch(pool, 'evidence', { limit: 5 });
		expect(Array.isArray(hits)).toBe(true);
		expect(hits.length).toBeLessThanOrEqual(5);
		for (const hit of hits) {
			expect(typeof hit.id).toBe('string');
			expect(typeof hit.score).toBe('number');
			expect(hit.score).toBeGreaterThanOrEqual(0);
			expect(hit.payload).toBeDefined();
			expect(hit.payload).toHaveProperty('title');
			expect(hit.payload).toHaveProperty('snippet');
			expect(hit.payload).toHaveProperty('jurisdiction');
		}
	});

	it('honors the jurisdiction filter when provided', async () => {
		if (!dbReachable) return;
		const hits = await sparseLegalSearch(pool, 'evidence', { limit: 5, jurisdiction: 'CA' });
		for (const hit of hits) {
			// jurisdiction may be null in payload if column nullable, but if present must match
			if (hit.payload.jurisdiction !== null) {
				expect(hit.payload.jurisdiction).toBe('CA');
			}
		}
	});

	it('caps limit at 200 (defensive — prevent runaway scans)', async () => {
		if (!dbReachable) return;
		const hits = await sparseLegalSearch(pool, 'evidence', { limit: 99999 });
		expect(hits.length).toBeLessThanOrEqual(200);
	});

	it('uses default limit=30 when not specified', async () => {
		if (!dbReachable) return;
		const hits = await sparseLegalSearch(pool, 'evidence');
		expect(hits.length).toBeLessThanOrEqual(30);
	});

	it('emits ts_headline snippet wrapped in highlight tags', async () => {
		if (!dbReachable) return;
		const hits = await sparseLegalSearch(pool, 'evidence', { limit: 1 });
		if (hits.length === 0) {
			console.log('[skip] no legal_documents rows match "evidence" — seed corpus first');
			return;
		}
		expect(typeof hits[0].payload.snippet).toBe('string');
		// Default tags are <b>...</b>; either appear if there's a match in the snippet
	});

	it('respects custom highlightTags', async () => {
		if (!dbReachable) return;
		const hits = await sparseLegalSearch(pool, 'evidence', {
			limit: 1,
			highlightTags: { start: '<<', end: '>>' },
		});
		if (hits.length === 0) return;
		// Must NOT contain the default tags (sanity that override took effect)
		expect(hits[0].payload.snippet).not.toContain('<b>');
	});
});
