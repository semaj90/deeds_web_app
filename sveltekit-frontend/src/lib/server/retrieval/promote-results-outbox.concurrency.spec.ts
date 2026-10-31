// @vitest-environment node
/**
 * Real-PostgreSQL concurrency proof for the promotion outbox claim.
 *
 * Skipped unless OUTBOX_TEST_DATABASE_URL points at a DISPOSABLE database: the test creates and
 * fills `promotion_outbox` there. Never point it at the application database.
 *   docker run -d --rm --name outbox-scratch-pg -e POSTGRES_PASSWORD=scratch -e POSTGRES_USER=scratch \
 *     -e POSTGRES_DB=scratch -p 127.0.0.1:55432:5432 pgvector-pgsearch:pg18-local
 *   OUTBOX_TEST_DATABASE_URL=postgres://scratch:scratch@127.0.0.1:55432/scratch
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { PgDialect } from 'drizzle-orm/pg-core';

vi.mock('$lib/server/db/client', () => ({ db: { execute: vi.fn() } }));

import { buildPromotionClaimQuery } from './promote-results-outbox.js';

const url = process.env.OUTBOX_TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

function parseDisposableOutboxUrl(value: string | undefined): URL {
  if (!value) throw new Error('OUTBOX_TEST_DATABASE_URL is required');
  const parsed = new URL(value);
  if (
    parsed.protocol !== 'postgres:'
    || parsed.hostname !== '127.0.0.1'
    || parsed.port !== '55432'
    || parsed.pathname !== '/scratch'
    || decodeURIComponent(parsed.username) !== 'scratch'
  ) {
    throw new Error('Disposable outbox proof requires postgres://scratch on loopback port 55432 and database scratch');
  }
  return parsed;
}

const SCHEMA = `
  DROP TABLE IF EXISTS promotion_outbox;
  CREATE TABLE promotion_outbox (
    id bigserial PRIMARY KEY,
    packet_key text NOT NULL,
    source_ref text NOT NULL,
    content_hash text,
    summary text,
    operation text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    error_message text,
    retry_count integer NOT NULL DEFAULT 0,
    max_retries integer NOT NULL DEFAULT 3,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    completed_at timestamptz,
    CONSTRAINT promotion_outbox_status_check CHECK (status IN ('pending','processing','completed','failed'))
  );
`;

function claimStatement(batchSize: number) {
  const { sql, params } = new PgDialect().sqlToQuery(buildPromotionClaimQuery(batchSize));
  return { text: sql, values: params };
}

describe('promotion outbox disposable target guard', () => {
  it('accepts only the documented loopback scratch target', () => {
    expect(parseDisposableOutboxUrl('postgres://scratch:scratch@127.0.0.1:55432/scratch').pathname).toBe('/scratch');
  });

  it.each([
    undefined,
    'postgres://app:secret@127.0.0.1:5432/production',
    'postgres://scratch:scratch@example.test:55432/scratch',
    'postgres://app:scratch@127.0.0.1:55432/scratch',
    'postgres://scratch:scratch@127.0.0.1:55439/scratch',
  ])('rejects an unapproved or non-disposable target: %s', (candidate) => {
    expect(() => parseDisposableOutboxUrl(candidate)).toThrow();
  });
});

describeDb('promotion outbox claim (disposable PostgreSQL)', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    const parsed = parseDisposableOutboxUrl(url);

    pool = new pg.Pool({ connectionString: parsed.toString(), max: 8, connectionTimeoutMillis: 3000 });
    const identity = await pool.query<{ database_name: string; version: string }>(
      "SELECT current_database() AS database_name, current_setting('server_version_num') AS version"
    );
    if (identity.rows[0]?.database_name !== 'scratch') {
      throw new Error('Disposable outbox proof connected to an unexpected database');
    }
    const serverVersion = Number(identity.rows[0]?.version);
    if (!Number.isInteger(serverVersion) || serverVersion < 180000 || serverVersion >= 190000) {
      throw new Error('Disposable outbox proof requires PostgreSQL 18');
    }
    await pool.query(SCHEMA);
  });

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE promotion_outbox RESTART IDENTITY');
    await pool.query(
      `INSERT INTO promotion_outbox (packet_key, source_ref, operation, created_at)
       SELECT 'packet:' || g, 'src/f' || g || '.ts', 'promote_summary', now() + (g || ' ms')::interval
       FROM generate_series(1, 40) g`
    );
  });

  it('legacy two-statement claim double-claims rows (documents the race the fix removes)', async () => {
    const a = await pool.connect();
    const b = await pool.connect();
    try {
      const legacySelect = `SELECT id FROM promotion_outbox WHERE status = 'pending' ORDER BY created_at ASC LIMIT 10 FOR UPDATE SKIP LOCKED`;
      const first = await a.query(legacySelect);
      const second = await b.query(legacySelect); // autocommit: A's row locks are already released
      const firstIds = new Set(first.rows.map((row) => String(row.id)));
      expect(second.rows.some((row) => firstIds.has(String(row.id)))).toBe(true);
    } finally {
      a.release();
      b.release();
    }
  });

  it('two workers claim disjoint jobs', async () => {
    const [a, b] = await Promise.all([pool.query(claimStatement(10)), pool.query(claimStatement(10))]);
    const idsA = a.rows.map((row) => String(row.id));
    const idsB = b.rows.map((row) => String(row.id));
    expect(idsA).toHaveLength(10);
    expect(idsB).toHaveLength(10);
    expect(idsA.filter((id) => idsB.includes(id))).toEqual([]);
  });

  it('many concurrent workers drain the queue with every job claimed exactly once', async () => {
    const claimed: string[] = [];
    const worker = async () => {
      for (;;) {
        const result = await pool.query(claimStatement(3));
        if (result.rows.length === 0) return;
        claimed.push(...result.rows.map((row) => String(row.id)));
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    expect(claimed).toHaveLength(40);
    expect(new Set(claimed).size).toBe(40);
    const remaining = await pool.query(`SELECT count(*)::int AS n FROM promotion_outbox WHERE status = 'pending'`);
    expect(remaining.rows[0].n).toBe(0);
  });

  it('an empty queue returns no rows and no SQL error', async () => {
    await pool.query('TRUNCATE promotion_outbox');
    const result = await pool.query(claimStatement(10));
    expect(result.rows).toEqual([]);
  });

  it('claims oldest first and marks processing with started_at', async () => {
    const result = await pool.query(claimStatement(5));
    const rows = [...result.rows].sort((x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime());
    expect(rows.map((row) => row.packet_key)).toEqual(['packet:1', 'packet:2', 'packet:3', 'packet:4', 'packet:5']);
    const check = await pool.query(`SELECT count(*)::int AS n FROM promotion_outbox WHERE status = 'processing' AND started_at IS NOT NULL`);
    expect(check.rows[0].n).toBe(5);
  });
});
