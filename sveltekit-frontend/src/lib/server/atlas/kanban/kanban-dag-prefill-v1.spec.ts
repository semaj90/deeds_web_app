import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  KANBAN_DAG_PREFILL_V1_DDL,
  assertScratchDatabaseUri,
  assertScratchPoolSafety,
  decodeTaskRecordsAndLatents,
  deriveRoutingStatusFromRecord,
  upsertKanbanDagPrefill,
  type DecodedTaskRecordV2
} from './kanban-dag-prefill-v1.js';

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
      const rec = new Uint8Array(63);
      const lat = new Uint8Array(256);
      expect(() => decodeTaskRecordsAndLatents(rec.buffer, lat.buffer, 1)).toThrow(
        /RECORD_LENGTH_MISMATCH/
      );
    });

    it('decodes real 6,527 records if fixture exists', () => {
      const repoRoot = path.resolve(process.cwd(), '..');
      const recPath = path.join(repoRoot, '.tmp', 'atlas', 'openspec-task-lowrank-keyframes.bin');
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

      const recBuf = fs.readFileSync(recPath);
      const latBuf = fs.readFileSync(latPath);

      const records = decodeTaskRecordsAndLatents(recBuf, latBuf, 6527);
      expect(records.length).toBe(6527);
      expect(records[0].taskOrdinal).toBe(0);
      expect(records[6526].taskOrdinal).toBe(6526);

      for (let i = 0; i < 50; i++) {
        expect(records[i].position[0]).toBeCloseTo(records[i].latent64[0], 5);
        expect(records[i].position[1]).toBeCloseTo(records[i].latent64[1], 5);
        expect(records[i].position[2]).toBeCloseTo(records[i].latent64[2], 5);
      }
    });
  });

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
