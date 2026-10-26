import { describe, expect, it } from 'vitest';

import { runPacketDenseSearch, type PacketDenseSearchDeps } from './packet-dense-search';
import type { PgQueryable } from './packet-bitmap-prefilter';
import type { QdrantPointsQueryFn } from './packet-dense-rerank';
import { rankExactDenseCandidates } from './packet-dense-rerank';

const PREFILTER_ROWS = [
  { packet_key: 'pk-1', source_ref: 'a.ts', source_revision: 'src-rev-1', feature_id: 'auth', title_id: 't1', workspace_revision: '0', workspace_revision_key: 'rev-1' },
  { packet_key: 'pk-2', source_ref: 'b.ts', source_revision: 'src-rev-2', feature_id: 'auth', title_id: 't2', workspace_revision: '0', workspace_revision_key: 'rev-1' },
];

// Chunk-identity lineage: the Qdrant hit's payload.postgres_id resolves to pk-1 only.
const LINEAGE_ROWS = [{
  postgres_id: 'chunk-1',
  canonical_chunk_id: 'canonical-chunk-1',
  packet_key: 'pk-1',
  source_ref: 'a.ts',
  source_revision: 'src-rev-1',
  workspace_revision_key: 'rev-1',
  representation_revision: 'feat-rev-1',
}];

const JOIN_ROWS = [
  {
    packet_key: 'pk-1',
    title_id: 't1',
    workspace_revision: '0',
    workspace_revision_key: 'rev-1',
    source_revision: 'src-rev-1',
    representation_revision: 'feat-rev-1',
    source_ref: 'a.ts',
    feature_id: 'auth',
    summary: 'summary one',
    reward_prior: 0.5,
    community_id: 3,
    page_rank_score: 0.1,
    domain_class: 'backend',
    ast_score: 0.9,
    tree_node_id: 'tn-1',
    bm25_terms: ['auth'],
    trigrams: null,
    taxonomy_level: 1,
    ontology: { tags: ['x'] },
    neo4j_node_id: 'n-1',
    used_concepts: ['c1'],
    latent_64: null,
    qdrant_point_id: 'q-1',
    rerank_features: null,
    canonical: true,
  },
];

function fakeDeps(): PacketDenseSearchDeps {
  const db: PgQueryable = {
    async query<T>(sql: string) {
      if (sql.includes('WHERE feature_id')) return { rows: PREFILTER_ROWS as unknown as T[] };
      if (sql.includes('WHERE packet_key = ANY')) return { rows: JOIN_ROWS as unknown as T[] };
      if (sql.includes('FROM atlas_packet_chunk_lineage')) return { rows: LINEAGE_ROWS as unknown as T[] };
      return { rows: [] as T[] };
    },
  };
  const queryQdrantPoints: QdrantPointsQueryFn = async () => ({
    result: {
      points: [{ id: 1, score: 0.87, payload: { source_ref: 'a.ts', postgres_id: 'chunk-1' } }],
    },
  });
  return { db, queryQdrantPoints };
}

describe('runPacketDenseSearch', () => {
  const queryVector = Array.from({ length: 768 }, (_, i) => i / 768);
  it('runs the full 3-stage pipeline and returns a control-word-shaped result', async () => {
    const response = await runPacketDenseSearch(fakeDeps(), {
      featureId: 'auth',
      collection: 'codebase_chunks_768',
      queryVector,
    });

    expect(response.candidateSetTruncated).toBe(false);
    expect(response.candidateCount).toBe(2);
    expect(response.results).toHaveLength(1);

    const [result] = response.results;
    expect(result.packetKey).toBe('pk-1');
    expect(result.titleId).toBe('t1');
    expect(result.sourceRevision).toBe('src-rev-1');
    expect(result.workspaceRevision).toBe('rev-1');
    expect(result.revisionQualified).toBe(true);
    expect(result.missingLineageFields).toEqual([]);
    expect(result.identityResolutionSource).toBe('postgres_id_packet_chunk_lineage');
    expect(result.winningChunkRowId).toBe('chunk-1');
    expect(result.winningCanonicalChunkId).toBe('canonical-chunk-1');
    expect(result.matchedChunkRowIds).toEqual(['chunk-1']);
    expect(result.score).toBe(0.87);
    expect(result.controlWord.schema).toBe('atlas.packet-control-word.v1');
    expect(result.payload?.summary).toBe('summary one');
  });

  it('reports a Qdrant packet-key fallback hit as unresolved when it has no admitted chunk lineage', async () => {
    const deps = fakeDeps();
    const originalQuery = deps.db.query.bind(deps.db);
    deps.db = {
      async query<T>(sql: string, params?: unknown[]) {
        const result = await originalQuery<T>(sql, params);
        if (sql.includes('WHERE feature_id')) {
          return {
            rows: [{ ...PREFILTER_ROWS[0], workspace_revision_key: '0', source_revision: null }] as unknown as T[],
          };
        }
        if (sql.includes('WHERE packet_key = ANY')) {
          return {
            rows: [{ ...JOIN_ROWS[0], workspace_revision_key: '0', source_revision: null }] as unknown as T[],
          };
        }
        return result;
      },
    };

    const response = await runPacketDenseSearch(deps, {
      featureId: 'auth',
      collection: 'codebase_chunks_768',
      queryVector,
    });

    expect(response.results).toEqual([]);
    expect(response.unresolvedHits).toHaveLength(1);
    expect(response.unresolvedHits[0]).toMatchObject({
      qdrantPointId: 1,
      chunkRowId: 'chunk-1',
      revisionQualified: false,
      missingLineageFields: ['admitted_packet_lineage'],
    });
    expect(response.degradedReasons).toContain('CHUNK_LINEAGE_UNRESOLVED');
  });

  it('does not credit packets from a hit with no chunk identity, and flags it degraded', async () => {
    const deps: PacketDenseSearchDeps = {
      ...fakeDeps(),
      // Same source_ref as pk-1, but no postgres_id: source_ref alone must not credit the packet.
      queryQdrantPoints: async () => ({ result: { points: [{ id: 1, score: 0.87, payload: { source_ref: 'a.ts' } }] } }),
    };
    const response = await runPacketDenseSearch(deps, {
      featureId: 'auth',
      collection: 'codebase_chunks_768',
      queryVector,
    });
    expect(response.results).toEqual([]);
    expect(response.unresolvedHits).toHaveLength(1);
    expect(response.unresolvedHits[0].missingLineageFields).toEqual(['admitted_packet_lineage']);
    expect(response.degradedReasons).toContain('CHUNK_LINEAGE_UNRESOLVED');
  });

  it('filters Qdrant by resolved postgres_id plus packet-key fallback, then max-pools chunks per packet', async () => {
    let qdrantBody: Record<string, unknown> | undefined;
    const secondChunk = { ...LINEAGE_ROWS[0], postgres_id: 'chunk-2', canonical_chunk_id: 'canonical-chunk-2' };
    const deps = fakeDeps();
    const originalQuery = deps.db.query.bind(deps.db);
    deps.db = {
      async query<T>(sql: string, params?: unknown[]) {
        if (sql.includes('FROM atlas_packet_chunk_lineage')) {
          const requested = params?.[0] as string[];
          return {
            rows: (requested.includes('pk-1') ? [LINEAGE_ROWS[0], secondChunk] : [LINEAGE_ROWS[0], secondChunk]) as unknown as T[],
          };
        }
        return originalQuery<T>(sql, params);
      },
    };
    deps.queryQdrantPoints = async (_collection, body) => {
      qdrantBody = body;
      return { result: { points: [
        { id: 'point-low', score: 0.72, payload: { postgres_id: 'chunk-1', source_ref: 'a.ts' } },
        { id: 'point-high', score: 0.91, payload: { postgres_id: 'chunk-2', source_ref: 'src/a.ts' } },
      ] } };
    };

    const response = await runPacketDenseSearch(deps, {
      featureId: 'auth',
      collection: 'codebase_chunks_768_v2',
      queryVector,
    });

    expect(qdrantBody?.filter).toEqual({
      should: [
        { key: 'postgres_id', match: { any: ['chunk-1', 'chunk-2'] } },
        { key: 'packet_key', match: { any: ['pk-1', 'pk-2'] } },
      ],
    });
    expect(response.results).toHaveLength(1);
    expect(response.results[0]).toMatchObject({
      packetKey: 'pk-1',
      score: 0.91,
      winningChunkRowId: 'chunk-2',
      winningCanonicalChunkId: 'canonical-chunk-2',
      matchedChunkRowIds: ['chunk-1', 'chunk-2'],
    });
    expect(response.degradedReasons).toContain('QDRANT_SOURCE_REF_DRIFT');
  });

  it('omits full payload for results beyond expandTopK', async () => {
    const response = await runPacketDenseSearch(fakeDeps(), {
      featureId: 'auth',
      collection: 'codebase_chunks_768',
      queryVector,
      expandTopK: 0,
    });
    expect(response.results[0].payload).toBeUndefined();
  });

  it('returns an empty result set without calling Qdrant when Stage 1 finds nothing', async () => {
    let qdrantCalled = false;
    const deps: PacketDenseSearchDeps = {
      db: { async query<T>() { return { rows: [] as T[] }; } },
      queryQdrantPoints: async () => {
        qdrantCalled = true;
        return { result: { points: [] } };
      },
    };
    const response = await runPacketDenseSearch(deps, {
      featureId: 'nonexistent',
      collection: 'codebase_chunks_768',
      queryVector,
    });
    expect(response.results).toEqual([]);
    expect(qdrantCalled).toBe(false);
  });

  it('PDS-05 currentness: drops a result and flags degraded when the Stage 3 join-back row has ' +
     'diverged from the Stage 1 candidate (source_revision changed between reads)', async () => {
    const deps: PacketDenseSearchDeps = {
      db: {
        async query<T>(sql: string) {
          if (sql.includes('WHERE feature_id')) return { rows: PREFILTER_ROWS as unknown as T[] };
          if (sql.includes('FROM atlas_packet_chunk_lineage')) return { rows: LINEAGE_ROWS as unknown as T[] };
          if (sql.includes('WHERE packet_key = ANY')) {
            // Simulate a write landing between Stage 1 and Stage 3: source_revision now
            // disagrees with what Stage 1 observed for packet 'pk-1'.
            return {
              rows: [{ ...JOIN_ROWS[0], source_revision: 'src-rev-STALE' }] as unknown as T[],
            };
          }
          return { rows: [] as T[] };
        },
      },
      queryQdrantPoints: async () => ({ result: { points: [{ id: 1, score: 0.87, payload: { source_ref: 'a.ts', postgres_id: 'chunk-1' } }] } }),
    };
    const response = await runPacketDenseSearch(deps, {
      featureId: 'auth',
      collection: 'codebase_chunks_768',
      queryVector,
    });
    expect(response.results).toEqual([]);
    expect(response.status).toBe('IDENTITY_BRIDGE_UNAVAILABLE');
    expect(response.degradedReasons).toContain('IDENTITY_BRIDGE_UNAVAILABLE');
    expect(response.receipt?.degradedReasons).toContain('IDENTITY_BRIDGE_UNAVAILABLE');
    expect(response.receipt?.joinedResultCount).toBe(0);
  });

  it('PDS-05 currentness: drops a result when the Stage 3 source_ref changed after prefiltering', async () => {
    const deps: PacketDenseSearchDeps = {
      db: {
        async query<T>(sql: string) {
          if (sql.includes('WHERE feature_id')) return { rows: PREFILTER_ROWS as unknown as T[] };
          if (sql.includes('FROM atlas_packet_chunk_lineage')) return { rows: LINEAGE_ROWS as unknown as T[] };
          if (sql.includes('WHERE packet_key = ANY')) {
            return { rows: [{ ...JOIN_ROWS[0], source_ref: 'renamed/a.ts' }] as unknown as T[] };
          }
          return { rows: [] as T[] };
        },
      },
      queryQdrantPoints: async () => ({
        result: { points: [{ id: 1, score: 0.87, payload: { source_ref: 'a.ts', postgres_id: 'chunk-1' } }] },
      }),
    };
    const response = await runPacketDenseSearch(deps, {
      featureId: 'auth',
      collection: 'codebase_chunks_768',
      queryVector,
    });
    expect(response.results).toEqual([]);
    expect(response.status).toBe('IDENTITY_BRIDGE_UNAVAILABLE');
    expect(response.degradedReasons).toContain('IDENTITY_BRIDGE_UNAVAILABLE');
  });

  it('PDS-08 representation guard: fails closed with REPRESENTATION_MISMATCH when vector dimension != 768', async () => {
    const invalidVector = [0.1, 0.2, 0.3];
    const response = await runPacketDenseSearch(fakeDeps(), {
      featureId: 'auth',
      collection: 'codebase_chunks_768',
      queryVector: invalidVector,
    });
    expect(response.status).toBe('REPRESENTATION_MISMATCH');
    expect(response.degradedReasons).toContain('REPRESENTATION_MISMATCH');
    expect(response.receipt?.queryDimensions).toBe(3);
    expect(response.receipt?.degradedReasons).toContain('REPRESENTATION_MISMATCH');
  });

  it('issues an immutable receipt schema on valid run', async () => {
    const response = await runPacketDenseSearch(fakeDeps(), {
      featureId: 'auth',
      collection: 'codebase_chunks_768',
      queryVector,
    });
    expect(response.receipt).toBeDefined();
    expect(response.receipt?.schema).toBe('atlas.packet-dense-search-receipt.v1');
    expect(response.receipt?.queryDimensions).toBe(768);
    expect(response.receipt?.collection).toBe('codebase_chunks_768');
    expect(response.receipt?.candidateCount).toBe(2);
    expect(response.receipt?.qdrantHitCount).toBe(1);
    expect(response.receipt?.joinedResultCount).toBe(1);
    expect(response.receipt?.degradedReasons).toEqual([]);
  });
});

describe('exact dense correctness oracle', () => {
  it('orders equal-dimensional candidates deterministically', () => {
    const query = Array.from({ length: 768 }, () => 1);
    const result = rankExactDenseCandidates(query, [
      { packetKey: 'b', vector: Array.from({ length: 768 }, () => 0.5) },
      { packetKey: 'a', vector: Array.from({ length: 768 }, () => 1) },
    ]);
    expect(result.map((item) => item.packetKey)).toEqual(['a', 'b']);
    expect(result[0].score).toBeCloseTo(1, 8);
  });
});
