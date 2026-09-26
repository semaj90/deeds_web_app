import { describe, expect, it } from 'vitest';

import { runPacketDenseSearch, type PacketDenseSearchDeps } from './packet-dense-search';
import type { PgQueryable } from './packet-bitmap-prefilter';
import type { QdrantPointsQueryFn } from './packet-dense-rerank';
import { rankExactDenseCandidates } from './packet-dense-rerank';

const PREFILTER_ROWS = [
  { packet_key: 'pk-1', source_ref: 'a.ts', source_revision: 'src-rev-1', feature_id: 'auth', title_id: 't1', workspace_revision: 'rev-1' },
  { packet_key: 'pk-2', source_ref: 'b.ts', source_revision: 'src-rev-2', feature_id: 'auth', title_id: 't2', workspace_revision: 'rev-1' },
];

const JOIN_ROWS = [
  {
    packet_key: 'pk-1',
    title_id: 't1',
    workspace_revision: 'rev-1',
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
      return { rows: [] as T[] };
    },
  };
  const queryQdrantPoints: QdrantPointsQueryFn = async () => ({
    result: {
      points: [{ id: 1, score: 0.87, payload: { source_ref: 'a.ts' } }],
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
    expect(result.score).toBe(0.87);
    expect(result.controlWord.schema).toBe('atlas.packet-control-word.v1');
    expect(result.payload?.summary).toBe('summary one');
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
      queryQdrantPoints: async () => ({ result: { points: [{ id: 1, score: 0.87, payload: { source_ref: 'a.ts' } }] } }),
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
