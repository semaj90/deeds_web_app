import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  KANBAN_DAG_PREFILL_V1_DDL,
  assertScratchDatabaseUri,
  parseScratchDatabaseUri,
  assertScratchPoolSafety,
  decodeTaskRecordsAndLatents,
  deriveRoutingStatusFromRecord,
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
describe('kanban-dag-prefill-v1 (Option A unified contract)', () => {
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

  describe('assertScratchDatabaseUri & assertScratchPoolSafety', () => {
    it('throws error when URL is missing', () => {
      expect(() => assertScratchDatabaseUri('')).toThrow(
        '[SECURITY GATE P0] ATLAS_SCRATCH_PG18_URL environment variable is missing.'
      );
    });

    it('throws error when URL contains forbidden production tokens', () => {
      const forbidden = [
        'postgresql://admin:pass@127.0.0.1:5432/legal_ai_db',
        'postgresql://admin:pass@production-db:5432/scratch',
        'postgresql://admin:pass@live.db.internal:5432/scratch',
        'postgresql://admin:pass@127.0.0.1:5432/main_db'
      ];
      for (const uri of forbidden.slice(0, 2).concat(forbidden.slice(3))) {
        expect(() => assertScratchDatabaseUri(uri)).toThrow(/contains forbidden production token/);
      }
      expect(() => assertScratchDatabaseUri(forbidden[2])).toThrow(/must be loopback/);
    });

    it('rejects non-loopback hosts and non-scratch database names', () => {
      expect(() =>
        assertScratchDatabaseUri('postgresql://admin:pass@10.0.0.15:5434/atlas_scratch_test_db')
      ).toThrow(/must be loopback/);
      expect(() =>
        assertScratchDatabaseUri('postgresql://admin:pass@127.0.0.1:5434/other_db')
      ).toThrow(/must include 'scratch'/);
    });

    it('accepts valid loopback scratch database URL', () => {
      const cleanUri = 'postgresql://admin:pass@127.0.0.1:5434/legal_ai_live_integration_scratch';
      expect(assertScratchDatabaseUri(cleanUri)).toBe(cleanUri);
      expect(assertScratchDatabaseUri('postgresql://admin:pass@127.0.0.1:5434/legal_ai_live_integration_scratch'))
        .toContain('/legal_ai_live_integration_scratch');
    });

    it('assertScratchPoolSafety throws error if pool targets production or non-scratch database', () => {
      const forbiddenPool = {
        options: { database: 'legal_ai_db', host: '127.0.0.1' }
      } as any;
      expect(() => assertScratchPoolSafety(forbiddenPool)).toThrow(
        /contains forbidden production token/
      );

      const remotePool = {
        options: { database: 'atlas_scratch_db', host: '192.168.1.50' }
      } as any;
      expect(() => assertScratchPoolSafety(remotePool)).toThrow(/must be loopback/);

      const wrongScratchPool = {
        options: { database: 'another_scratch', host: '127.0.0.1', port: 5434 }
      } as any;
      expect(() => assertScratchPoolSafety(wrongScratchPool)).toThrow(/exact authorized scratch database/);
    });
  });

  describe('deriveRoutingStatusFromRecord', () => {
    it('uses features[5] routing_active_bit rather than finalScore > 0.5', () => {
      const unroutedHighScore: DecodedTaskRecordV2 = {
        mortonCode: 10,
        taskOrdinal: 1,
        clusterId: 4,
        position: [0, 0, 0],
        finalScore: 0.99,
        features: [0.5, 0, 0, 0, 0, 0.0, 0, 0],
        latent64: new Float32Array(64)
      };
      expect(deriveRoutingStatusFromRecord(unroutedHighScore)).toEqual({
        routingActiveBit: false,
        routingStatus: 'UNROUTED'
      });

      const routedLowScore: DecodedTaskRecordV2 = {
        ...unroutedHighScore,
        finalScore: 0.12,
        features: [0.5, 0, 0, 0, 0, 1.0, 0, 0]
      };
      expect(deriveRoutingStatusFromRecord(routedLowScore)).toEqual({
        routingActiveBit: true,
        routingStatus: 'ROUTED_ACTIVE'
      });
    });

    it('rejects a score-like non-binary routing feature instead of thresholding it', () => {
      const record: DecodedTaskRecordV2 = {
        mortonCode: 10,
        taskOrdinal: 1,
        clusterId: 4,
        position: [0, 0, 0],
        finalScore: 0.99,
        features: [0, 0, 0, 0, 0, 0.75, 0, 0],
        latent64: new Float32Array(64)
      };
      expect(() => deriveRoutingStatusFromRecord(record)).toThrow(/MUST_BE_EXPLICIT_BINARY/);
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
      expect(() => decodeTaskRecordsAndLatents(rec.buffer, lat.buffer, 1)).toThrow(
        /RECORD_LENGTH_MISMATCH/
      );
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
      const latPath = path.join(
        repoRoot,
        '.tmp',
        'atlas',
        'openspec-task-lowrank-keyframes.latent64.f32le.bin'
      );

      if (!fs.existsSync(recPath) || !fs.existsSync(latPath)) {
        if (process.env.ATLAS_REQUIRE_FIXTURES === '1') {
          throw new Error(
            `BLOCKED_FIXTURE_MISSING: Required low-rank binary fixtures missing at ${recPath}`
          );
        }
        return;
      }
      const records = decodeTaskRecordsAndLatents(fs.readFileSync(recPath), fs.readFileSync(latPath), 6527);
      expect(records.length).toBe(6527);
      expect(records[0]!.taskOrdinal).toBe(0);
      expect(records[6526]!.taskOrdinal).toBe(6526);
      expect(records[0].taskOrdinal).toBe(0);
      expect(records[6526].taskOrdinal).toBe(6526);

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
      const written = ['task_id', 'canonical_task_key', 'cohort_ordinal', 'change_id', 'status', 'routing_status', 'community_id', 'domain_id', 'morton_code', 'priority_score', 'final_score', 'routing_active_bit', 'umap_xyz', 'rot_6d', 'latent_64d', 'canonical_authority'];
      for (const c of written) expect(ddlColumns.has(c), `column ${c} missing from the candidate DDL`).toBe(true);
      expect(ddl).toMatch(/canonical_authority\s+BOOLEAN\s+NOT NULL DEFAULT FALSE CHECK \(canonical_authority = FALSE\)/);
  describe('upsertKanbanDagPrefill mock transaction', () => {
    const sourceRevision = `sha256:${'a'.repeat(64)}`;
    const cohortRevision = `sha256:${'b'.repeat(64)}`;
    const metadata = (canonicalTaskKey: string): { canonicalTaskKey: string; sourceRevision: string; cohortRevision: string } => ({
      canonicalTaskKey,
      sourceRevision,
      cohortRevision,
    });

    it('executes atomic batch transaction using Option A schema columns', async () => {
      const mockQueries: Array<{ text: string; values?: unknown[] }> = [];
      const mockClient = {
        query: vi.fn(async (text: string, values?: unknown[]) => {
          mockQueries.push({ text: text.trim(), values });
          if (text.includes('SELECT current_database()')) {
            return { rowCount: 1, rows: [{ database_name: 'legal_ai_live_integration_scratch', server_version_num: 180004 }] };
          }
          if (text.includes('SELECT task_id, canonical_task_key')) {
            return { rowCount: 1, rows: [{
              task_id: 'ast-grep-lsp#0123456789abcdef',
              canonical_task_key: 'ast-grep-lsp#0123456789abcdef',
              cohort_ordinal: 0,
              change_id: 'ast-grep-lsp',
              status: 'UNVERIFIED',
              routing_status: 'ROUTED_ACTIVE',
              community_id: 6,
              domain_id: 0,
              morton_code: 12345,
              priority_score: 0.75,
              final_score: 0.85,
              routing_active_bit: true,
              cohort_revision: cohortRevision,
              source_revision: sourceRevision,
              source_sha256: sourceRevision,
              umap_xyz: [1, 2, 3],
              rot_6d: [1, 0, 0, 0, 1, 0],
              latent_64d: new Array(64).fill(Math.fround(0.1)),
              canonical_authority: false,
            }] };
          }
          return { rowCount: 1, rows: [] };
        }),
        release: vi.fn()
      };
      const mockPool = {
        options: { database: 'legal_ai_live_integration_scratch', host: '127.0.0.1', port: 5434 },
        connect: vi.fn(async () => mockClient)
      } as any;

      const sampleRecord: DecodedTaskRecordV2 = {
        mortonCode: 12345,
        taskOrdinal: 0,
        clusterId: 6,
        position: [1.0, 2.0, 3.0],
        finalScore: 0.85,
        features: [0.75, 2, 3, 4, 5, 1.0, 7, 8],
        latent64: new Float32Array(64).fill(0.1)
      };

      const receipt = await upsertKanbanDagPrefill(mockPool, [sampleRecord], [
        metadata('ast-grep-lsp#0123456789abcdef')
      ]);
      expect(receipt.success).toBe(true);
      expect(receipt.rowsProcessed).toBe(1);
      expect(receipt.canonicalAuthority).toBe(false);
      expect(receipt.readbackVerifiedRows).toBe(1);
      expect(receipt.cohortRevision).toBe(cohortRevision);
      expect(mockQueries[0].text).toBe('BEGIN;');
      expect(mockQueries[2].text).toContain('canonical_task_key, cohort_ordinal, change_id');
      expect(mockQueries[2].text).toContain('cohort_revision, source_revision, source_sha256');
      expect(mockQueries[2].values?.[0]).toBe('ast-grep-lsp#0123456789abcdef');
      expect(mockQueries[2].values?.[3]).toBe('ast-grep-lsp');
      expect(mockQueries[2].values?.[4]).toBe('UNVERIFIED');
      expect(mockQueries[2].values?.[5]).toBe('ROUTED_ACTIVE');
      expect(mockQueries[2].values?.[12]).toBe(cohortRevision);
      expect(mockQueries[2].values?.[13]).toBe(sourceRevision);
      expect(mockQueries[mockQueries.length - 2].text).toBe('COMMIT;');
      expect(mockQueries[mockQueries.length - 1].text).toContain('WHERE task_id = ANY');
      expect(mockPool.connect).toHaveBeenCalledTimes(2);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('rejects records missing a mapped canonical task ID or using synthetic task:ordinal:* IDs', async () => {
      const mockClient = {
        query: vi.fn(async (text: string) => text.includes('SELECT current_database()')
          ? ({ rowCount: 1, rows: [{ database_name: 'legal_ai_live_integration_scratch', server_version_num: 180004 }] })
          : ({ rowCount: 1, rows: [] })),
        release: vi.fn()
      };
      const mockPool = {
        options: { database: 'legal_ai_live_integration_scratch', host: '127.0.0.1', port: 5434 },
        connect: vi.fn(async () => mockClient)
      } as any;

      const sampleRecord: DecodedTaskRecordV2 = {
        mortonCode: 12345,
        taskOrdinal: 42,
        clusterId: 3,
        position: [1.0, 2.0, 3.0],
        finalScore: 0.85,
        features: [1, 2, 3, 4, 5, 1, 7, 8],
        latent64: new Float32Array(64)
      };

      await expect(upsertKanbanDagPrefill(mockPool, [sampleRecord], [metadata('')]))
        .rejects.toThrow(/PREFILL_TASK_IDENTITY_INVALID/);

      await expect(
        upsertKanbanDagPrefill(mockPool, [sampleRecord], [metadata('task:ordinal:42')])
      ).rejects.toThrow(/SYNTHETIC_ORDINAL_ID_FORBIDDEN/);
    });

    it('rejects duplicate task identities and metadata cardinality mismatch before connecting', async () => {
      const connect = vi.fn();
      const mockPool = {
        options: { database: 'legal_ai_live_integration_scratch', host: '127.0.0.1', port: 5434 },
        connect,
      } as any;
      const sampleRecord: DecodedTaskRecordV2 = {
        mortonCode: 1, taskOrdinal: 0, clusterId: 1, position: [0, 0, 0],
        finalScore: 0, features: [0, 0, 0, 0, 0, 0], latent64: new Float32Array(64),
      };
      await expect(upsertKanbanDagPrefill(mockPool, [sampleRecord], []))
        .rejects.toThrow(/PREFILL_INPUT_CARDINALITY_MISMATCH/);
      await expect(upsertKanbanDagPrefill(mockPool, [sampleRecord, sampleRecord], [
        metadata('same#task'), metadata('same#task'),
      ])).rejects.toThrow(/PREFILL_TASK_IDENTITY_INVALID/);
      expect(connect).not.toHaveBeenCalled();
    });

    it('rolls back on client query error', async () => {
      const mockQueries: string[] = [];
      const mockClient = {
        query: vi.fn(async (text: string) => {
          mockQueries.push(text.trim());
          if (text.includes('INSERT INTO')) {
            throw new Error('SIMULATED_DB_ERROR');
          }
          if (text.includes('SELECT current_database()')) {
            return { rowCount: 1, rows: [{ database_name: 'legal_ai_live_integration_scratch', server_version_num: 180004 }] };
          }
          return { rowCount: 1, rows: [] };
        }),
        release: vi.fn()
      };
      const mockPool = {
        options: { database: 'legal_ai_live_integration_scratch', host: '127.0.0.1', port: 5434 },
        connect: vi.fn(async () => mockClient)
      } as any;

      const sampleRecord: DecodedTaskRecordV2 = {
        mortonCode: 12345,
        taskOrdinal: 0,
        clusterId: 3,
        position: [1.0, 2.0, 3.0],
        finalScore: 0.85,
        features: [1, 2, 3, 4, 5, 1, 7, 8],
        latent64: new Float32Array(64)
      };

      await expect(
        upsertKanbanDagPrefill(mockPool, [sampleRecord], [metadata('change-a#0123456789abcdef')])
      ).rejects.toThrow('SIMULATED_DB_ERROR');
      expect(mockQueries).toContain('ROLLBACK;');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('aborts before any upsert when current_database() is not the exact expected scratch target', async () => {
      const calls: string[] = [];
      const mockClient = {
        query: vi.fn(async (text: string) => {
          calls.push(text.trim());
          return text.includes('SELECT current_database()')
            ? { rowCount: 1, rows: [{ database_name: 'legal_ai_db', server_version_num: 180004 }] }
            : { rowCount: 1, rows: [] };
        }),
        release: vi.fn(),
      };
      const mockPool = { options: { database: 'legal_ai_live_integration_scratch', host: '127.0.0.1', port: 5434 }, connect: vi.fn(async () => mockClient) } as any;
      const sampleRecord: DecodedTaskRecordV2 = {
        mortonCode: 1, taskOrdinal: 0, clusterId: 1, position: [0, 0, 0],
        finalScore: 0, features: [0, 0, 0, 0, 0, 0], latent64: new Float32Array(64),
      };

      await expect(upsertKanbanDagPrefill(mockPool, [sampleRecord], [metadata('change-a#one')]))
        .rejects.toThrow(/exact PostgreSQL 18 scratch database/);
      expect(calls).toContain('ROLLBACK;');
      expect(calls.some((sql) => sql.includes('INSERT INTO'))).toBe(false);
    });

    it('rolls back instead of counting a row when revision-bound readback digest mismatches', async () => {
      const calls: string[] = [];
      const mockClient = {
        query: vi.fn(async (text: string) => {
          calls.push(text.trim());
          if (text.includes('SELECT current_database()')) {
            return { rowCount: 1, rows: [{ database_name: 'legal_ai_live_integration_scratch', server_version_num: 180004 }] };
          }
          if (text.includes('SELECT task_id, canonical_task_key')) {
            return { rowCount: 1, rows: [{
              task_id: 'change-a#one', canonical_task_key: 'change-a#one', cohort_ordinal: 0,
              change_id: 'change-a', status: 'UNVERIFIED', routing_status: 'UNROUTED',
              community_id: 1, domain_id: 0, morton_code: 1, priority_score: 0,
              final_score: 0, routing_active_bit: false, cohort_revision: cohortRevision,
              source_revision: `sha256:${'c'.repeat(64)}`, source_sha256: sourceRevision,
              umap_xyz: [0, 0, 0], rot_6d: [1, 0, 0, 0, 1, 0], latent_64d: new Array(64).fill(0),
              canonical_authority: false,
            }] };
          }
          return { rowCount: 1, rows: [] };
        }),
        release: vi.fn(),
      };
      const mockPool = { options: { database: 'legal_ai_live_integration_scratch', host: '127.0.0.1', port: 5434 }, connect: vi.fn(async () => mockClient) } as any;
      const sampleRecord: DecodedTaskRecordV2 = {
        mortonCode: 1, taskOrdinal: 0, clusterId: 1, position: [0, 0, 0],
        finalScore: 0, features: [0, 0, 0, 0, 0, 0], latent64: new Float32Array(64),
      };

      await expect(upsertKanbanDagPrefill(mockPool, [sampleRecord], [metadata('change-a#one')]))
        .rejects.toThrow(/PREFILL_POST_UPSERT_READBACK_MISMATCH/);
      expect(calls.at(-1)).toBe('ROLLBACK;');
    });
  });
});
