import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertScratchDatabaseUri,
  parseScratchDatabaseUri,
  decodeTaskRecordsAndLatents,
  upsertKanbanDagPrefill,
  type DecodedTaskRecordV2
} from './kanban-dag-prefill-v1.js';

const OPTED_IN = { ATLAS_SCRATCH_PG18_ALLOW_WRITES: '1' } as NodeJS.ProcessEnv;

function sample(i = 0): DecodedTaskRecordV2 {
  return {
    mortonCode: 12345, taskOrdinal: i, clusterId: 3, position: [1, 2, 3], finalScore: 0.85,
    features: [1, 2, 3, 4, 5, 6, 7, 8], latent64: new Float32Array(64).fill(0.1),
  };
}

/** Mock pg pool: identity, snapshot and write statements are answered by pattern. */
function mockPool(opts: { db?: string; version?: number; snapshots?: Array<{ n: number; digest: string }>; failOn?: RegExp; failRollback?: boolean } = {}) {
  const queries: string[] = [];
  const snapshots = [...(opts.snapshots ?? [{ n: 0, digest: 'd0' }, { n: 0, digest: 'd0' }])];
  const client = {
    query: vi.fn(async (text: string) => {
      const t = text.trim();
      queries.push(t);
      if (opts.failRollback && t === 'ROLLBACK;') throw new Error('ROLLBACK_FAILED');
      if (opts.failOn && opts.failOn.test(t)) throw new Error('SIMULATED_DB_ERROR');
      if (t.startsWith('SELECT current_database()')) return { rows: [{ db: opts.db ?? 'atlas_scratch', v: opts.version ?? 180004 }] };
      if (t.startsWith('SELECT count(*)')) return { rows: [snapshots.length > 1 ? snapshots.shift()! : snapshots[0]!] };
      return { rowCount: 1, rows: [] };
    }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn(async () => client) } as any;
  return { pool, client, queries };
}

describe('kanban-dag-prefill-v1', () => {
  describe('scratch database gate (structural, not substring)', () => {
    it('refuses a missing URL', () => {
      expect(() => parseScratchDatabaseUri('', {} as NodeJS.ProcessEnv)).toThrow(/SCRATCH_GATE.*missing/);
    });

    it('requires a *_scratch database name, whatever the host spells', () => {
      for (const uri of [
        'postgresql://a:b@127.0.0.1:5434/legal_ai_db',
        'postgresql://a:b@127.0.0.1:5434/atlas',
        'postgresql://a:b@127.0.0.1:5434/atlas_scratch_test_db',
        'postgresql://a:b@127.0.0.1:5434/Atlas_Scratch',
      ]) expect(() => parseScratchDatabaseUri(uri, {} as NodeJS.ProcessEnv)).toThrow(/database name must match/);
    });

    it('does not reject a harmless name that merely contains a word such as "live"', () => {
      expect(parseScratchDatabaseUri('postgresql://a:b@127.0.0.1:5434/alive_scratch', {} as NodeJS.ProcessEnv))
        .toEqual({ host: '127.0.0.1', database: 'alive_scratch' });
    });

    it('requires a loopback host unless that exact host is allowed', () => {
      const uri = 'postgresql://a:b@db.internal:5432/atlas_scratch';
      expect(() => parseScratchDatabaseUri(uri, {} as NodeJS.ProcessEnv)).toThrow(/not loopback/);
      expect(parseScratchDatabaseUri(uri, { ATLAS_SCRATCH_PG18_ALLOW_REMOTE_HOST: 'db.internal' } as NodeJS.ProcessEnv).host).toBe('db.internal');
    });

    it('never echoes the password in an error', () => {
      try { parseScratchDatabaseUri('postgresql://admin:s3cr3t-pw@127.0.0.1:5434/legal_ai_db', {} as NodeJS.ProcessEnv); }
      catch (e) { expect(String((e as Error).message)).not.toContain('s3cr3t-pw'); return; }
      throw new Error('EXPECTED_THROW');
    });

    it('assertScratchDatabaseUri returns the URL it accepted', () => {
      const ok = 'postgresql://a:b@127.0.0.1:5434/atlas_scratch';
      expect(assertScratchDatabaseUri(ok, {} as NodeJS.ProcessEnv)).toBe(ok);
    });
  });

  describe('decodeTaskRecordsAndLatents', () => {
    it('rejects buffers with wrong size', () => {
      expect(() => decodeTaskRecordsAndLatents(new Uint8Array(63).buffer, new Uint8Array(256).buffer, 1)).toThrow(/RECORD_LENGTH_MISMATCH/);
      expect(() => decodeTaskRecordsAndLatents(new Uint8Array(64).buffer, new Uint8Array(255).buffer, 1)).toThrow(/LATENT_LENGTH_MISMATCH/);
    });

    it('accepts a plain ArrayBuffer and a Buffer view with an offset', () => {
      const rec = new Uint8Array(64);
      new DataView(rec.buffer).setUint32(4, 7, true);
      const lat = new Uint8Array(256);
      expect(decodeTaskRecordsAndLatents(rec.buffer, lat.buffer, 1)[0]!.taskOrdinal).toBe(7);
      const padded = Buffer.concat([Buffer.alloc(8), Buffer.from(rec)]);
      const view = padded.subarray(8);
      expect(decodeTaskRecordsAndLatents(view, Buffer.from(lat), 1)[0]!.taskOrdinal).toBe(7);
    });

    it('rejects nonzero reserved bytes and non-finite values', () => {
      const lat = new Uint8Array(256);
      const rec = new Uint8Array(64);
      new DataView(rec.buffer).setUint16(10, 1, true);
      expect(() => decodeTaskRecordsAndLatents(rec.buffer, lat.buffer, 1)).toThrow(/RECORD_RESERVED_NONZERO:0/);
      const nan = new Uint8Array(64);
      new DataView(nan.buffer).setFloat64(24, Number.NaN, true);
      expect(() => decodeTaskRecordsAndLatents(nan.buffer, lat.buffer, 1)).toThrow(/RECORD_NON_FINITE:0/);
      const badLat = new Uint8Array(256);
      new DataView(badLat.buffer).setFloat32(0, Number.POSITIVE_INFINITY, true);
      expect(() => decodeTaskRecordsAndLatents(new Uint8Array(64).buffer, badLat.buffer, 1)).toThrow(/LATENT_NON_FINITE:0/);
    });

    it('decodes real 6,527 records if fixture exists', (ctx) => {
      const repoRoot = path.resolve(process.cwd(), '..');
      const recPath = path.join(repoRoot, '.tmp', 'atlas', 'openspec-task-lowrank-keyframes.bin');
      const latPath = path.join(repoRoot, '.tmp', 'atlas', 'openspec-task-lowrank-keyframes.latent64.f32le.bin');
      if (!fs.existsSync(recPath) || !fs.existsSync(latPath)) {
        // Fixtures are gitignored. The gate sets ATLAS_REQUIRE_FIXTURES=1 so a missing fixture is a hard failure,
        // never a silent pass; a plain local run reports the test as skipped (not passed).
        if (process.env.ATLAS_REQUIRE_FIXTURES === '1') throw new Error('BLOCKED_FIXTURE_MISSING: lowrank keyframes/latent64 under .tmp/atlas');
        ctx.skip();
        return;
      }
      const records = decodeTaskRecordsAndLatents(fs.readFileSync(recPath), fs.readFileSync(latPath), 6527);
      expect(records.length).toBe(6527);
      expect(records[0]!.taskOrdinal).toBe(0);
      expect(records[6526]!.taskOrdinal).toBe(6526);
      for (let i = 0; i < 50; i++) {
        expect(records[i]!.position[0]).toBeCloseTo(records[i]!.latent64[0]!, 5);
        expect(records[i]!.position[1]).toBeCloseTo(records[i]!.latent64[1]!, 5);
        expect(records[i]!.position[2]).toBeCloseTo(records[i]!.latent64[2]!, 5);
      }
    });
  });

  describe('upsertKanbanDagPrefill', () => {
    it('refuses to write without the explicit opt-in', async () => {
      const { pool } = mockPool();
      await expect(upsertKanbanDagPrefill(pool, [sample()], ['t:0'], { env: {} as NodeJS.ProcessEnv })).rejects.toThrow(/ALLOW_WRITES/);
      expect(pool.connect).not.toHaveBeenCalled();
    });

    it('rejects id/record count mismatch, duplicates and invalid ids before touching the database', async () => {
      const { pool } = mockPool();
      await expect(upsertKanbanDagPrefill(pool, [sample()], [], { env: OPTED_IN })).rejects.toThrow('TASK_ID_COUNT_MISMATCH');
      await expect(upsertKanbanDagPrefill(pool, [sample(0), sample(1)], ['t', 't'], { env: OPTED_IN })).rejects.toThrow('TASK_ID_DUPLICATE');
      await expect(upsertKanbanDagPrefill(pool, [sample()], [''], { env: OPTED_IN })).rejects.toThrow('TASK_ID_INVALID');
      expect(pool.connect).not.toHaveBeenCalled();
    });

    it('rehearse (default): reads identity, ROLLBACKs, and PASSes only with an unchanged independent readback', async () => {
      const { pool, queries, client } = mockPool();
      const receipt = await upsertKanbanDagPrefill(pool, [sample()], ['t:0'], { env: OPTED_IN });
      expect(queries[0]).toMatch(/^SELECT count\(\*\)/);
      expect(queries).toContain('BEGIN;');
      expect(queries.some((q) => q.startsWith('SELECT current_database()'))).toBe(true);
      expect(queries).toContain('ROLLBACK;');
      expect(queries).not.toContain('COMMIT;');
      expect(receipt).toMatchObject({ status: 'PASS', mode: 'rehearse', committed: false, rolledBack: true, independentlyVerified: true, canonicalAuthority: false, dbName: 'atlas_scratch' });
      expect(client.release).toHaveBeenCalled();
    });

    it('rehearse: FAILs when rows differ after ROLLBACK', async () => {
      const { pool } = mockPool({ snapshots: [{ n: 0, digest: 'd0' }, { n: 1, digest: 'LEAKED' }] });
      const receipt = await upsertKanbanDagPrefill(pool, [sample()], ['t:0'], { env: OPTED_IN });
      expect(receipt.status).toBe('FAIL');
      expect(receipt.independentlyVerified).toBe(false);
      expect(receipt.failReason).toMatch(/ROLLBACK_NOT_VERIFIED/);
    });

    it('apply: COMMITs and PASSes only when the rows read back', async () => {
      const ok = mockPool({ snapshots: [{ n: 0, digest: 'd0' }, { n: 1, digest: 'd1' }] });
      const receipt = await upsertKanbanDagPrefill(ok.pool, [sample()], ['t:0'], { env: OPTED_IN, mode: 'apply' });
      expect(ok.queries).toContain('COMMIT;');
      expect(receipt).toMatchObject({ status: 'PASS', mode: 'apply', committed: true, independentlyVerified: true });
      const missing = mockPool({ snapshots: [{ n: 0, digest: 'd0' }, { n: 0, digest: 'd0' }] });
      const bad = await upsertKanbanDagPrefill(missing.pool, [sample()], ['t:0'], { env: OPTED_IN, mode: 'apply' });
      expect(bad.status).toBe('FAIL');
      expect(bad.failReason).toMatch(/APPLY_NOT_VERIFIED/);
    });

    it('does not overwrite execution_status on conflict and never sets canonical authority', async () => {
      const { pool, client } = mockPool();
      await upsertKanbanDagPrefill(pool, [sample()], ['t:0'], { env: OPTED_IN });
      const insert = client.query.mock.calls.map((c) => String(c[0])).find((q) => q.includes('INSERT INTO'))!;
      const conflictClause = insert.slice(insert.indexOf('ON CONFLICT'));
      expect(conflictClause).not.toMatch(/execution_status/);
      expect(insert).toMatch(/'UNROUTED', false\)/);
    });

    it('a caller-supplied Pool is identity-checked too: a non-scratch database aborts with ROLLBACK', async () => {
      const { pool, queries, client } = mockPool({ db: 'legal_ai_db' });
      await expect(upsertKanbanDagPrefill(pool, [sample()], ['t:0'], { env: OPTED_IN })).rejects.toThrow(/SCRATCH_IDENTITY_MISMATCH/);
      expect(queries.some((q) => q.includes('INSERT INTO'))).toBe(false);
      expect(queries).toContain('ROLLBACK;');
      expect(client.release).toHaveBeenCalled();
    });

    it('refuses a server older than PostgreSQL 18', async () => {
      const { pool } = mockPool({ version: 170005 });
      await expect(upsertKanbanDagPrefill(pool, [sample()], ['t:0'], { env: OPTED_IN })).rejects.toThrow(/PostgreSQL 18/);
    });

    it('rolls back on a statement error and discards a connection whose rollback also fails', async () => {
      const a = mockPool({ failOn: /INSERT INTO/ });
      await expect(upsertKanbanDagPrefill(a.pool, [sample()], ['t:0'], { env: OPTED_IN })).rejects.toThrow('SIMULATED_DB_ERROR');
      expect(a.queries).toContain('ROLLBACK;');
      const b = mockPool({ failOn: /INSERT INTO/, failRollback: true });
      await expect(upsertKanbanDagPrefill(b.pool, [sample()], ['t:0'], { env: OPTED_IN })).rejects.toThrow('SIMULATED_DB_ERROR');
      expect(b.client.release).toHaveBeenCalledWith(true);
    });

    it('a connection string for a non-scratch database never reaches the driver', async () => {
      await expect(upsertKanbanDagPrefill('postgresql://a:b@127.0.0.1:5434/legal_ai_db', [sample()], ['t:0'], { env: OPTED_IN }))
        .rejects.toThrow(/database name must match/);
    });
  });
});
