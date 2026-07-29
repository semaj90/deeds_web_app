// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  buildKeysetQuery,
  buildProjectionPayload,
  buildProjectionPoint,
  classifyExistingPointStrategy,
  detectQdrantVectorTarget,
  parseHalfvecText,
  type PointSample,
} from '../../../scripts/atlas/phase109-qdrant-pointwise-backfill.mts';

describe('phase109-qdrant-pointwise-backfill helpers', () => {
  it('parses pgvector text and rejects invalid lengths', () => {
    expect(parseHalfvecText('[1, 2, 3]', 3)).toEqual([1, 2, 3]);
    expect(() => parseHalfvecText('[1, 2]', 3)).toThrow(/expected 3 values/);
  });

  it('builds keyset pagination and never uses OFFSET', () => {
    const sql = buildKeysetQuery(new Set(['id', 'content_embedding', 'relative_path']));
    expect(sql).toContain('id > $1::uuid');
    expect(sql).toContain('ORDER BY id ASC');
    expect(sql).not.toContain('OFFSET');
  });

  it('detects named and unnamed Qdrant vector targets', () => {
    expect(
      detectQdrantVectorTarget({
        semantic_768: { size: 768, distance: 'Cosine' },
      }),
    ).toMatchObject({ mode: 'named', vectorName: 'semantic_768', dimension: 768 });

    expect(
      detectQdrantVectorTarget({
        size: 768,
        distance: 'Cosine',
      }),
    ).toMatchObject({ mode: 'unnamed', dimension: 768 });
  });

  it('classifies UUID point IDs as canonical and non-UUID IDs as legacy', () => {
    const samples: PointSample[] = [
      {
        id: '9c1c75f7-3c96-4db8-95a5-9fdc8e46d540',
        payload: { postgres_id: '9c1c75f7-3c96-4db8-95a5-9fdc8e46d540' },
      },
      { id: 17, payload: { postgres_id: '9c1c75f7-3c96-4db8-95a5-9fdc8e46d540' } },
    ];

    const result = classifyExistingPointStrategy(samples);
    expect(result.strategy).toBe('legacy-non-uuid');
    expect(result.blockers).toContain('QDRANT_POINT_IDS_ARE_NOT_UUIDS');
  });

  it('builds a bounded payload from canonical Postgres columns', () => {
    const payload = buildProjectionPayload(
      {
        id: '9c1c75f7-3c96-4db8-95a5-9fdc8e46d540',
        qdrantId: null,
        relativePath: 'src/lib/server/example.ts',
        symbol: 'example',
        kind: 'function',
        lineStart: 10,
        lineEnd: 20,
        domain: 'server',
        language: 'typescript',
        extension: 'ts',
        contentHash: 'a'.repeat(64),
        embeddingModel: 'embeddinggemma',
        metadata: { foo: 'bar', nested: { keep: true } },
        semanticTags: ['tag-a', 'tag-b'],
        gpuCluster: 7,
        somCluster: 2,
        pageRankScore: 0.42,
        communityId: 9,
        updatedAt: '2026-07-29T00:00:00.000Z',
        embeddingText: '[1,0,0]',
      },
      [1, 0, 0],
    );

    expect(payload).toMatchObject({
      postgres_id: '9c1c75f7-3c96-4db8-95a5-9fdc8e46d540',
      relative_path: 'src/lib/server/example.ts',
      representation_id: 'semantic_768',
      embedding_dimension: 768,
      embedding_lane: 'dense_768',
      embedding_role: 'canonical_native_semantic',
      embedding_status: 'ACTIVE',
      embedding_model: 'embeddinggemma',
      content_hash: 'a'.repeat(64),
    });
    expect(payload).not.toHaveProperty('source_ref');
  });

  it('builds a named-vector point when the collection declares one', () => {
    const point = buildProjectionPoint(
      {
        id: '9c1c75f7-3c96-4db8-95a5-9fdc8e46d540',
        qdrantId: null,
        relativePath: 'src/lib/server/example.ts',
        symbol: null,
        kind: null,
        lineStart: null,
        lineEnd: null,
        domain: null,
        language: null,
        extension: null,
        contentHash: 'a'.repeat(64),
        embeddingModel: 'embeddinggemma',
        metadata: {},
        semanticTags: [],
        gpuCluster: null,
        somCluster: null,
        pageRankScore: null,
        communityId: null,
        updatedAt: '2026-07-29T00:00:00.000Z',
        embeddingText: '[1,0,0]',
      },
      [1, 0, 0],
      { mode: 'named', vectorName: 'semantic_768', dimension: 768, distance: 'Cosine' },
    );

    expect(point).toMatchObject({
      id: '9c1c75f7-3c96-4db8-95a5-9fdc8e46d540',
      vector: { semantic_768: [1, 0, 0] },
    });
  });
});
