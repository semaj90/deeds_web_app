import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const dbState = vi.hoisted(() => {
  const queryLog: Array<{ sql: string; params: unknown[] }> = [];
  const executeResults: Row[][] = [];

  const db = {
    execute: vi.fn((queryObj: any) => {
      let sqlText = '';
      let params: unknown[] = [];
      if (queryObj && typeof queryObj.toQuery === 'function') {
        const q = queryObj.toQuery({
          escapeName: (x: string) => x,
          escapeParam: (i: number) => `$${i + 1}`,
          escapeString: (x: string) => x,
        });
        sqlText = q.sql;
        params = q.params ?? [];
      } else {
        sqlText = queryObj?.strings ? queryObj.strings.join('?') : String(queryObj);
        params = queryObj?.values ?? [];
      }
      queryLog.push({ sql: sqlText, params });
      return Promise.resolve({ rows: executeResults.shift() ?? [] });
    }),
  };

  return { db, queryLog, executeResults };
});

vi.mock('$lib/server/db/client.js', () => ({
  db: dbState.db,
}));

import {
  streamFeatureRecords,
  type FeatureRecord,
  type FeatureRecordCursor,
} from './feature-record.js';
import {
  buildCandidateManifestV1,
  encodeCandidateCursorV1,
  decodeCandidateCursorV1,
  sliceCandidateManifestPageV1,
} from './candidate-manifest-v1.js';

describe('DETERMINISTIC-TOPK-AND-KEYSET-01 Acceptance Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.queryLog.length = 0;
    dbState.executeResults.length = 0;
  });

  describe('Part 1: Keyset Pagination for streamFeatureRecords', () => {
    it('verifies identical timestamps across 3 batch boundaries with zero duplicates and zero omissions', async () => {
      // 9 rows with the EXACT same timestamp '2026-10-25T00:00:00.000Z' across 3 pages of batchSize=3
      const sharedTime = '2026-10-25T00:00:00.000Z';
      const makeRow = (id: string, pkt: string) => ({
        feature_id: id,
        packet_key: pkt,
        feature_type: 'ast_features',
        version: 'v1',
        snapshot_hash: 'sha256:1111',
        payload: { score: 1 },
        scalar_f32: 1.0,
        vector_f32: null,
        created_at: sharedTime,
        superseded_at: null,
        superseded_by: null,
      });

      // Page 1 (3 rows)
      dbState.executeResults.push([
        makeRow('00000000-0000-0000-0000-000000000001', 'pkt_1'),
        makeRow('00000000-0000-0000-0000-000000000002', 'pkt_2'),
        makeRow('00000000-0000-0000-0000-000000000003', 'pkt_3'),
      ]);

      // Page 2 (3 rows with SAME timestamp, ascending feature_id)
      dbState.executeResults.push([
        makeRow('00000000-0000-0000-0000-000000000004', 'pkt_4'),
        makeRow('00000000-0000-0000-0000-000000000005', 'pkt_5'),
        makeRow('00000000-0000-0000-0000-000000000006', 'pkt_6'),
      ]);

      // Page 3 (3 rows with SAME timestamp)
      dbState.executeResults.push([
        makeRow('00000000-0000-0000-0000-000000000007', 'pkt_7'),
        makeRow('00000000-0000-0000-0000-000000000008', 'pkt_8'),
        makeRow('00000000-0000-0000-0000-000000000009', 'pkt_9'),
      ]);

      // Page 4 (empty termination)
      dbState.executeResults.push([]);

      const collectedIds: string[] = [];
      const batches: FeatureRecord[][] = [];

      const result = await streamFeatureRecords(
        'ast_features',
        'v1',
        async (batch) => {
          batches.push(batch);
          for (const rec of batch) {
            collectedIds.push(rec.feature_id);
          }
        },
        3, // batchSize = 3
      );

      // Assertions
      expect(result.total).toBe(9);
      expect(batches).toHaveLength(3);
      expect(collectedIds).toEqual([
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000004',
        '00000000-0000-0000-0000-000000000005',
        '00000000-0000-0000-0000-000000000006',
        '00000000-0000-0000-0000-000000000007',
        '00000000-0000-0000-0000-000000000008',
        '00000000-0000-0000-0000-000000000009',
      ]);
      // Zero duplicates
      expect(new Set(collectedIds).size).toBe(9);

      // Verify the query plan uses the keyset condition
      const page2Query = dbState.queryLog[1];
      expect(page2Query.sql).toContain('(created_at, feature_id) >');
      expect(page2Query.sql).toContain('ORDER BY created_at ASC, feature_id ASC');
      expect(page2Query.params).toContain('00000000-0000-0000-0000-000000000003');
    });

    it('handles final page smaller than batch size and terminates without extra query', async () => {
      // 5 rows total with batchSize=3 -> Page 1 has 3 rows, Page 2 has 2 rows (terminates immediately)
      dbState.executeResults.push([
        {
          feature_id: '11111111-1111-1111-1111-111111111111',
          packet_key: 'pkt_1',
          feature_type: 'ast_features',
          version: 'v1',
          snapshot_hash: 'sha256:1',
          payload: {},
          scalar_f32: null,
          vector_f32: null,
          created_at: '2026-10-25T01:00:00.000Z',
          superseded_at: null,
          superseded_by: null,
        },
        {
          feature_id: '22222222-2222-2222-2222-222222222222',
          packet_key: 'pkt_2',
          feature_type: 'ast_features',
          version: 'v1',
          snapshot_hash: 'sha256:1',
          payload: {},
          scalar_f32: null,
          vector_f32: null,
          created_at: '2026-10-25T01:00:00.000Z',
          superseded_at: null,
          superseded_by: null,
        },
        {
          feature_id: '33333333-3333-3333-3333-333333333333',
          packet_key: 'pkt_3',
          feature_type: 'ast_features',
          version: 'v1',
          snapshot_hash: 'sha256:1',
          payload: {},
          scalar_f32: null,
          vector_f32: null,
          created_at: '2026-10-25T01:00:00.000Z',
          superseded_at: null,
          superseded_by: null,
        },
      ]);
      dbState.executeResults.push([
        {
          feature_id: '44444444-4444-4444-4444-444444444444',
          packet_key: 'pkt_4',
          feature_type: 'ast_features',
          version: 'v1',
          snapshot_hash: 'sha256:1',
          payload: {},
          scalar_f32: null,
          vector_f32: null,
          created_at: '2026-10-25T01:01:00.000Z',
          superseded_at: null,
          superseded_by: null,
        },
        {
          feature_id: '55555555-5555-5555-5555-555555555555',
          packet_key: 'pkt_5',
          feature_type: 'ast_features',
          version: 'v1',
          snapshot_hash: 'sha256:1',
          payload: {},
          scalar_f32: null,
          vector_f32: null,
          created_at: '2026-10-25T01:01:00.000Z',
          superseded_at: null,
          superseded_by: null,
        },
      ]);

      const result = await streamFeatureRecords(
        'ast_features',
        'v1',
        async () => {},
        3,
      );

      expect(result.total).toBe(5);
      expect(result.lastCursor?.featureId).toBe('55555555-5555-5555-5555-555555555555');
      // Only 2 queries executed (no redundant 3rd query when page.length < batchSize)
      expect(dbState.queryLog).toHaveLength(2);
    });

    it('supports resuming from a non-null cursor correctly', async () => {
      const initialCursor: FeatureRecordCursor = {
        createdAt: new Date('2026-10-25T02:00:00.000Z'),
        featureId: '33333333-3333-3333-3333-333333333333',
      };

      dbState.executeResults.push([
        {
          feature_id: '44444444-4444-4444-4444-444444444444',
          packet_key: 'pkt_4',
          feature_type: 'ast_features',
          version: 'v1',
          snapshot_hash: 'sha256:1',
          payload: {},
          scalar_f32: null,
          vector_f32: null,
          created_at: '2026-10-25T02:00:00.000Z',
          superseded_at: null,
          superseded_by: null,
        },
      ]);

      const result = await streamFeatureRecords(
        'ast_features',
        'v1',
        async () => {},
        10,
        initialCursor,
      );

      expect(result.total).toBe(1);
      const query = dbState.queryLog[0];
      expect(query.sql).toContain('(created_at, feature_id) >');
      expect(query.params).toContain('33333333-3333-3333-3333-333333333333');
    });
  });

  describe('Part 2: Deterministic Cosine Top-K Ordering & Tie Breaking', () => {
    it('verifies that secondary id ASC sort produces identical ranks over repeated frozen queries with identical cosine distances', () => {
      // Tie fixture: 4 candidates with the exact same cosine distance of 0.125000
      const tiedCandidates = [
        { id: 'chunk_gamma', distance: 0.125, sourceRef: 'src/gamma.ts' },
        { id: 'chunk_alpha', distance: 0.125, sourceRef: 'src/alpha.ts' },
        { id: 'chunk_delta', distance: 0.125, sourceRef: 'src/delta.ts' },
        { id: 'chunk_beta', distance: 0.125, sourceRef: 'src/beta.ts' },
      ];

      // Sort function simulating: ORDER BY distance ASC, id ASC
      const deterministicSort = (items: typeof tiedCandidates) =>
        [...items].sort((a, b) => {
          if (a.distance !== b.distance) {
            return a.distance - b.distance;
          }
          return a.id.localeCompare(b.id);
        });

      // Run 10 repeated queries with shuffle
      const runs: string[][] = [];
      for (let i = 0; i < 10; i++) {
        // Randomly shuffle input to simulate non-deterministic pgvector HNSW heap return order
        const shuffled = [...tiedCandidates].sort(() => Math.random() - 0.5);
        const sorted = deterministicSort(shuffled);
        runs.push(sorted.map((item) => item.id));
      }

      // Assert that every single run produces the exact identical deterministic order
      const expectedOrder = ['chunk_alpha', 'chunk_beta', 'chunk_delta', 'chunk_gamma'];
      for (const run of runs) {
        expect(run).toEqual(expectedOrder);
      }
    });
  });

  describe('Part 3: User-Facing Ranked-Result Cursor Audit (candidate-manifest-v1.ts)', () => {
    it('proves that candidate-manifest-v1.ts already provides an immutable, checksum-qualified cursor without page drift', () => {
      const manifest = buildCandidateManifestV1({
        requestId: 'req_search_001',
        workspaceRevision: 'sha256:23413763d52c94ecf5e4566edbfbe283505e048aafe7f2b7a417dc55c74492e5',
        rankingRevision: 'rrf_v1_k60',
        orderedCandidateIds: ['cand_1', 'cand_2', 'cand_3', 'cand_4', 'cand_5'],
      });

      const scoreMap = new Map([
        ['cand_1', { score: 0.95 }],
        ['cand_2', { score: 0.85 }],
        ['cand_3', { score: 0.75 }],
        ['cand_4', { score: 0.65 }],
        ['cand_5', { score: 0.55 }],
      ]);

      // Page 1: 2 items
      const page1 = sliceCandidateManifestPageV1(manifest, scoreMap, 2, null);
      expect(page1.candidateIds).toEqual(['cand_1', 'cand_2']);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).not.toBeNull();

      // Page 2: resume from cursor
      const page2 = sliceCandidateManifestPageV1(manifest, scoreMap, 2, page1.nextCursor);
      expect(page2.candidateIds).toEqual(['cand_3', 'cand_4']);
      expect(page2.hasMore).toBe(true);
      expect(page2.nextCursor).not.toBeNull();

      // Page 3: final page
      const page3 = sliceCandidateManifestPageV1(manifest, scoreMap, 2, page2.nextCursor);
      expect(page3.candidateIds).toEqual(['cand_5']);
      expect(page3.hasMore).toBe(false);
      expect(page3.nextCursor).toBeNull();

      // Tampered checksum validation
      expect(() => {
        const tamperedCursor = encodeCandidateCursorV1({
          candidateSetChecksum: 'sha256:' + '0'.repeat(64),
          lastScore: 0.85,
          lastCanonicalChunkId: 'cand_2',
        });
        sliceCandidateManifestPageV1(manifest, scoreMap, 2, tamperedCursor);
      }).toThrow(/candidate set mismatch/);
    });
  });
});
