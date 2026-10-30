import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { Pool, type PoolClient } from 'pg';
import {
  buildPromotionClaimQuery,
  buildPromotionSummaryQuery,
  PromotionOperation,
} from './promote-results-outbox.js';

const databaseUrl = process.env.PROMOTION_OUTBOX_TEST_DATABASE_URL;
const describeDisposable = databaseUrl ? describe : describe.skip;
const dialect = new PgDialect();
let pool: Pool;
let schemaName: string;

function compile(query: Parameters<typeof dialect.sqlToQuery>[0]) {
  const compiled = dialect.sqlToQuery(query);
  return { text: compiled.sql, values: compiled.params };
}

async function setSearchPath(client: PoolClient) {
  await client.query(`SET search_path TO "${schemaName}"`);
}

describeDisposable('Promotion outbox PostgreSQL concurrency proof', () => {
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('PROMOTION_OUTBOX_TEST_DATABASE_URL is required');
    const parsed = new URL(databaseUrl);
    if (
      parsed.hostname !== '127.0.0.1'
      || parsed.port !== '55439'
      || parsed.pathname !== '/promotion_outbox_disposable'
    ) {
      throw new Error('Disposable outbox proof requires loopback PostgreSQL on port 55439 and database promotion_outbox_disposable');
    }

    pool = new Pool({ connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 3000 });
    const identity = await pool.query<{ database_name: string; version: string }>(
      'SELECT current_database() AS database_name, current_setting(\'server_version_num\') AS version'
    );
    expect(identity.rows[0]?.database_name).toBe('promotion_outbox_disposable');
    expect(Number(identity.rows[0]?.version)).toBeGreaterThanOrEqual(180000);
    expect(Number(identity.rows[0]?.version)).toBeLessThan(190000);
  });

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    schemaName = `outbox_test_${randomUUID().replaceAll('-', '')}`;
    await pool.query(`CREATE SCHEMA "${schemaName}"`);
    await pool.query(`
      CREATE TABLE "${schemaName}".promotion_outbox (
        id BIGSERIAL PRIMARY KEY,
        packet_key TEXT NOT NULL,
        source_ref TEXT NOT NULL,
        content_hash TEXT,
        summary TEXT,
        operation TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        payload JSONB NOT NULL DEFAULT '{}',
        retry_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at TIMESTAMPTZ
      )
    `);
    await pool.query(`
      CREATE TABLE "${schemaName}".atlas_packets (
        packet_id TEXT PRIMARY KEY,
        packet_key TEXT NOT NULL,
        source_ref TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        source_revision TEXT NOT NULL,
        summary TEXT,
        domain_class TEXT,
        title_id TEXT,
        title_generator_version TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  });

  afterEach(async () => {
    if (schemaName) await pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  });

  it('claims disjoint IDs while the first worker still holds its row locks', async () => {
    const firstWorker = await pool.connect();
    const secondWorker = await pool.connect();
    try {
      await setSearchPath(firstWorker);
      await setSearchPath(secondWorker);
      for (let index = 0; index < 6; index += 1) {
        await firstWorker.query(
          `INSERT INTO promotion_outbox (packet_key, source_ref, operation, created_at)
           VALUES ($1, 'src/example.ts', 'promote_summary', NOW() + ($2 * INTERVAL '1 millisecond'))`,
          [`packet:${index}`, index]
        );
      }

      await firstWorker.query('BEGIN');
      const claim = compile(buildPromotionClaimQuery(3));
      const first = await firstWorker.query<{ id: string }>(claim.text, claim.values);
      expect(first.rows).toHaveLength(3);

      const second = await secondWorker.query<{ id: string }>(claim.text, claim.values);
      expect(second.rows).toHaveLength(3);
      expect(second.rows.map((row) => row.id).some((id) => first.rows.some((row) => row.id === id))).toBe(false);

      await firstWorker.query('COMMIT');
      const states = await pool.query<{ status: string; count: string }>(
        `SELECT status, count(*)::text AS count
         FROM "${schemaName}".promotion_outbox GROUP BY status`
      );
      expect(states.rows).toEqual([{ status: 'processing', count: '6' }]);
    } catch (error) {
      await firstWorker.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      firstWorker.release();
      secondWorker.release();
    }
  });

  it('returns an empty result without SQL syntax errors when the queue is empty', async () => {
    const client = await pool.connect();
    try {
      await setSearchPath(client);
      const claim = compile(buildPromotionClaimQuery(5));
      const result = await client.query(claim.text, claim.values);
      expect(result.rows).toEqual([]);
    } finally {
      client.release();
    }
  });

  it('cannot let a stale summary retry overwrite a newer packet revision', async () => {
    const client = await pool.connect();
    try {
      await setSearchPath(client);
      const currentContentHash = `sha256:${'b'.repeat(64)}`;
      const currentSourceRevision = `sha256:${'c'.repeat(64)}`;
      const staleSourceRevision = `sha256:${'a'.repeat(64)}`;
      await client.query(
        `INSERT INTO atlas_packets
         (packet_id, packet_key, source_ref, content_hash, source_revision, summary)
         VALUES ('packet-row', 'packet:one', 'src/one.ts', $1, $2, 'newer canonical summary')`,
        [currentContentHash, currentSourceRevision]
      );

      const staleJob = {
        id: 9n,
        packet_key: 'packet:one',
        source_ref: 'src/one.ts',
        content_hash: currentContentHash,
        summary: 'old job summary',
        operation: PromotionOperation.PROMOTE_SUMMARY,
        payload: {},
      };
      const staleUpdate = compile(buildPromotionSummaryQuery(staleJob, staleSourceRevision));
      expect((await client.query(staleUpdate.text, staleUpdate.values)).rows).toEqual([]);
      expect((await client.query(staleUpdate.text, staleUpdate.values)).rows).toEqual([]);

      const currentRow = await client.query<{ summary: string }>(
        `SELECT summary FROM atlas_packets WHERE packet_key = 'packet:one'`
      );
      expect(currentRow.rows[0]?.summary).toBe('newer canonical summary');
    } finally {
      client.release();
    }
  });
});
