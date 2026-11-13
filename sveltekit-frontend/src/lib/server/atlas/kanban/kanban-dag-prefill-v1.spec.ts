import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  KANBAN_DAG_PREFILL_V1_DDL,
  assertScratchDatabaseUri,
  parseScratchDatabaseUri,
  decodeTaskRecordsAndLatents,
  upsertKanbanDagPrefill,
  buildPrefillRows,
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
  describe('KANBAN_DAG_PREFILL_V1_DDL parity with candidate sidecar SQL', () => {
    it('matches 20261108_atlas_kanban_dag_prefill_v1.sql column and constraint contract', () => {
      const sqlPath = path.resolve(
        process.cwd(),
        'drizzle/manual/20261108_atlas_kanban_dag_prefill_v1.sql'
      );
      const sqlText = fs.readFileSync(sqlPath, 'utf8');
      for (const requiredToken of [
        'canonical_task_key  TEXT NOT NULL',
        'cohort_ordinal      INTEGER NOT NULL CHECK (cohort_ordinal >= 0)',
        'change_id           TEXT NOT NULL',
        "status              TEXT NOT NULL CHECK (status IN ('UNVERIFIED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'))",
        "routing_status      TEXT NOT NULL CHECK (routing_status IN ('ROUTED_ACTIVE', 'UNROUTED'))",
        'canonical_authority BOOLEAN NOT NULL DEFAULT FALSE CHECK (canonical_authority = FALSE)',
        'CONSTRAINT atlas_kanban_dag_prefill_v1_no_synthetic_ordinal_chk',
        // provenance extension (nullable, non-canonical)
        'cohort_revision          TEXT,',
        'workspace_revision       TEXT,',
        'vector_artifact_sha256   TEXT,',
        'fusion_packet_sha256     TEXT,',
        'glyph_instance64         BYTEA,',
        'CONSTRAINT atlas_kanban_dag_prefill_v1_array_shape_chk',
        'CONSTRAINT atlas_kanban_dag_prefill_v1_provenance_format_chk',
        'idx_atlas_kanban_dag_prefill_v1_cohort'
      ]) {
        expect(KANBAN_DAG_PREFILL_V1_DDL).toContain(requiredToken);
        expect(sqlText).toContain(requiredToken);
      }
    });
  });
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

  describe('buildPrefillRows (aligned to atlas_kanban_dag_prefill_v1)', () => {
    const key = (i: number) => `change-a#${i.toString(16).padStart(16, '0')}`;
    const member = (i: number, over: Record<string, unknown> = {}) => ({
      task_ordinal: i, canonical_task_key: key(i), change_id: 'change-a', community_id: 3, routing_active_bit: i % 2 === 0,
      priority_score: 0.5, umap_xyz: [0.1, 0.2, 0.3], rot_6d: [1, 0, 0, 0, 1, 0], ...over,
    });
    const recs = (n: number) => Array.from({ length: n }, (_, i) => sample(i));

    it('joins members and binary records by ordinal and maps exactly the table columns', () => {
      const rows = buildPrefillRows([member(0), member(1)] as never, recs(2));
      expect(rows[0]).toMatchObject({ taskId: key(0), canonicalTaskKey: key(0), cohortOrdinal: 0, changeId: 'change-a', communityId: 3, domainId: 0, mortonCode: 12345, finalScore: 0.85, routingActiveBit: true });
      expect(rows[0]!.latent64d).toHaveLength(64);
      expect(rows[1]!.routingActiveBit).toBe(false);
    });

    it('fails closed on ordinal, key, change and count mismatches', () => {
      expect(() => buildPrefillRows([member(0)] as never, recs(2))).toThrow(/COHORT_SIZE_MISMATCH/);
      expect(() => buildPrefillRows([member(1)] as never, recs(1))).toThrow(/ORDINAL_MISMATCH:0/);
      expect(() => buildPrefillRows([member(0, { canonical_task_key: 'task:ordinal:0' })] as never, recs(1))).toThrow(/KEY_INVALID/);
      expect(() => buildPrefillRows([member(0, { canonical_task_key: 'change-a#zz' })] as never, recs(1))).toThrow(/KEY_INVALID/);
      expect(() => buildPrefillRows([member(0, { change_id: 'other' })] as never, recs(1))).toThrow(/CHANGE_ID_MISMATCH/);
      expect(() => buildPrefillRows([member(0), member(1, { canonical_task_key: key(0) })] as never, recs(2))).toThrow(/KEY_DUPLICATE/);
    });

    it('never defaults priority_score, umap_xyz or rot_6d, and never relabels the binary position as umap', () => {
      expect(() => buildPrefillRows([member(0, { priority_score: undefined })] as never, recs(1))).toThrow(/PRIORITY_SCORE_MISSING/);
      expect(() => buildPrefillRows([member(0, { umap_xyz: undefined })] as never, recs(1))).toThrow(/UMAP_XYZ_MISSING/);
      expect(() => buildPrefillRows([member(0, { umap_xyz: [1, 2] })] as never, recs(1))).toThrow(/UMAP_XYZ_MISSING/);
      expect(() => buildPrefillRows([member(0, { rot_6d: [1, 2, 3] })] as never, recs(1))).toThrow(/ROT_6D_MISSING/);
      expect(() => buildPrefillRows([member(0, { rot_6d: [1, 0, 0, 0, 1, Number.NaN] })] as never, recs(1))).toThrow(/ROT_6D_MISSING/);
    });

    it('carries optional provenance only when it is a sha256:<64 hex> value, and never defaults it', () => {
      const h = 'sha256:' + 'a'.repeat(64);
      const plain = buildPrefillRows([member(0)] as never, recs(1))[0]!;
      expect([plain.cohortRevision, plain.sourceRevision, plain.sourceSha256]).toEqual([null, null, null]);
      const withP = buildPrefillRows([{ ...member(0), cohort_revision: h, source_revision: h, source_sha256: h }] as never, recs(1))[0]!;
      expect([withP.cohortRevision, withP.sourceRevision, withP.sourceSha256]).toEqual([h, h, h]);
      expect(() => buildPrefillRows([{ ...member(0), source_revision: 'abc' }] as never, recs(1))).toThrow(/SOURCE_REVISION_INVALID:0/);
      expect(() => buildPrefillRows([{ ...member(0), cohort_revision: 'sha256:' + 'A'.repeat(64) }] as never, recs(1))).toThrow(/COHORT_REVISION_INVALID:0/);
    });

    it('validates routing bit, community and domain byte', () => {
      expect(() => buildPrefillRows([member(0, { routing_active_bit: 'yes' })] as never, recs(1))).toThrow(/ROUTING_BIT_INVALID/);
      expect(() => buildPrefillRows([member(0, { community_id: 1.5 })] as never, recs(1))).toThrow(/COMMUNITY_ID_INVALID/);
      expect(() => buildPrefillRows([member(0, { domain_id: 256 })] as never, recs(1))).toThrow(/DOMAIN_ID_INVALID/);
      expect(buildPrefillRows([member(0, { domain_id: 3 })] as never, recs(1))[0]!.domainId).toBe(3);
    });
  });

  describe('upsertKanbanDagPrefill (aligned)', () => {
    const k = (i: number) => `change-a#${i.toString(16).padStart(16, '0')}`;
    const rowOf = (i: number, active = true) => buildPrefillRows(
      Array.from({ length: i + 1 }, (_, j) => ({ task_ordinal: j, canonical_task_key: k(j), change_id: 'change-a', community_id: 1, routing_active_bit: j === i ? active : false,
        priority_score: 0.4, umap_xyz: [0, 0, 0], rot_6d: [1, 0, 0, 0, 1, 0] })) as never,
      Array.from({ length: i + 1 }, (_, j) => sample(j)),
    )[i]!;

    it('refuses to write without the opt-in and rejects duplicate or synthetic ids before any connection', async () => {
      const { pool } = mockPool();
      await expect(upsertKanbanDagPrefill(pool, [rowOf(0)], { env: {} as NodeJS.ProcessEnv })).rejects.toThrow(/ALLOW_WRITES/);
      await expect(upsertKanbanDagPrefill(pool, [rowOf(0), rowOf(0)], { env: OPTED_IN })).rejects.toThrow('TASK_ID_DUPLICATE');
      await expect(upsertKanbanDagPrefill(pool, [{ ...rowOf(0), taskId: 'task:ordinal:0' }], { env: OPTED_IN })).rejects.toThrow('TASK_ID_INVALID');
      expect(pool.connect).not.toHaveBeenCalled();
    });

    it('rehearse (default) rolls back and PASSes only with an unchanged independent readback', async () => {
      const { pool, queries } = mockPool();
      const receipt = await upsertKanbanDagPrefill(pool, [rowOf(0)], { env: OPTED_IN });
      expect(queries).toContain('BEGIN;');
      expect(queries).toContain('ROLLBACK;');
      expect(queries).not.toContain('COMMIT;');
      expect(receipt).toMatchObject({ status: 'PASS', mode: 'rehearse', committed: false, rolledBack: true, independentlyVerified: true, canonicalAuthority: false, dbName: 'atlas_scratch' });
      const bad = mockPool({ snapshots: [{ n: 0, digest: 'd0' }, { n: 1, digest: 'LEAKED' }] });
      expect((await upsertKanbanDagPrefill(bad.pool, [rowOf(0)], { env: OPTED_IN })).status).toBe('FAIL');
    });

    it('apply commits and PASSes only when the rows read back', async () => {
      const ok = mockPool({ snapshots: [{ n: 0, digest: 'd0' }, { n: 1, digest: 'd1' }] });
      expect(await upsertKanbanDagPrefill(ok.pool, [rowOf(0)], { env: OPTED_IN, mode: 'apply' })).toMatchObject({ status: 'PASS', committed: true });
      expect(ok.queries).toContain('COMMIT;');
      const missing = mockPool({ snapshots: [{ n: 0, digest: 'd0' }, { n: 0, digest: 'd0' }] });
      expect((await upsertKanbanDagPrefill(missing.pool, [rowOf(0)], { env: OPTED_IN, mode: 'apply' })).failReason).toMatch(/APPLY_NOT_VERIFIED/);
    });

    it('inserts status as UNVERIFIED, never overwrites it, derives routing_status from the routing bit, and keeps canonical_authority false', async () => {
      const { pool, client } = mockPool();
      await upsertKanbanDagPrefill(pool, [rowOf(1, true)], { env: OPTED_IN });
      const call = client.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO'))!;
      const sql = String(call[0]);
      const conflict = sql.slice(sql.indexOf('ON CONFLICT'));
      expect(sql).toMatch(/'UNVERIFIED'/);
      expect(sql).toMatch(/, false\)\s*ON CONFLICT/);
      expect(conflict).not.toMatch(/\bstatus\s*=/);
      expect(conflict).not.toMatch(/canonical_authority/);
      expect((call[1] as unknown[])[4]).toBe('ROUTED_ACTIVE');
      const un = mockPool();
      await upsertKanbanDagPrefill(un.pool, [rowOf(1, false)], { env: OPTED_IN });
      expect((un.client.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO'))![1] as unknown[])[4]).toBe('UNROUTED');
    });

    it('identity-checks a caller-supplied Pool, refuses PostgreSQL < 18, and rolls back on a statement error', async () => {
      const wrong = mockPool({ db: 'legal_ai_db' });
      await expect(upsertKanbanDagPrefill(wrong.pool, [rowOf(0)], { env: OPTED_IN })).rejects.toThrow(/SCRATCH_IDENTITY_MISMATCH/);
      expect(wrong.queries.some((q) => q.includes('INSERT INTO'))).toBe(false);
      await expect(upsertKanbanDagPrefill(mockPool({ version: 170005 }).pool, [rowOf(0)], { env: OPTED_IN })).rejects.toThrow(/PostgreSQL 18/);
      const a = mockPool({ failOn: /INSERT INTO/ });
      await expect(upsertKanbanDagPrefill(a.pool, [rowOf(0)], { env: OPTED_IN })).rejects.toThrow('SIMULATED_DB_ERROR');
      expect(a.queries).toContain('ROLLBACK;');
      const b = mockPool({ failOn: /INSERT INTO/, failRollback: true });
      await expect(upsertKanbanDagPrefill(b.pool, [rowOf(0)], { env: OPTED_IN })).rejects.toThrow('SIMULATED_DB_ERROR');
      expect(b.client.release).toHaveBeenCalledWith(true);
    });

    it('a non-scratch connection string never reaches the driver', async () => {
      await expect(upsertKanbanDagPrefill('postgresql://a:b@127.0.0.1:5434/legal_ai_db', [rowOf(0)], { env: OPTED_IN })).rejects.toThrow(/database name must match/);
    });

    it('drift guard: when the candidate DDL is on disk, every column this module writes exists in it and no extra column is written', (ctx) => {
      const sqlPath = path.resolve(process.cwd(), 'drizzle/manual/20261108_atlas_kanban_dag_prefill_v1.sql');
      if (!fs.existsSync(sqlPath)) { ctx.skip(); return; }
      const ddl = fs.readFileSync(sqlPath, 'utf8');
      const body = ddl.slice(ddl.indexOf('(', ddl.indexOf('CREATE TABLE')), ddl.indexOf(');'));
      const ddlColumns = new Set([...body.matchAll(/^\s{2,}([a-z_0-9]+)\s+(?:TEXT|INTEGER|SMALLINT|BIGINT|REAL|BOOLEAN|TIMESTAMPTZ)/gm)].map((m) => m[1]!));
      const written = ['task_id', 'canonical_task_key', 'cohort_ordinal', 'change_id', 'status', 'routing_status', 'community_id', 'domain_id', 'morton_code', 'priority_score', 'final_score', 'routing_active_bit', 'umap_xyz', 'rot_6d', 'latent_64d', 'cohort_revision', 'source_revision', 'source_sha256', 'canonical_authority'];
      for (const c of written) expect(ddlColumns.has(c), `column ${c} missing from the candidate DDL`).toBe(true);
      expect(ddl).toMatch(/canonical_authority\s+BOOLEAN\s+NOT NULL DEFAULT FALSE CHECK \(canonical_authority = FALSE\)/);
    });
  });
});
