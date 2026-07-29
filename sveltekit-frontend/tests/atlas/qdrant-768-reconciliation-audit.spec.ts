// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  buildIdentityQuery,
  determinePointGeneration,
  maxAbsoluteDifference,
  resolvePointIdentity,
} from '../../../scripts/atlas/audit-qdrant-768-after-backfill.mjs';

describe('phase109 qdrant reconciliation audit helpers', () => {
  it('builds a keyset-safe Postgres query with no offset', () => {
    const sql = buildIdentityQuery(new Set(['id', 'relative_path', 'content_hash', 'embedding_model']));
    expect(sql).toContain('FROM codebase_chunk_index');
    expect(sql).toContain('WHERE content_embedding IS NOT NULL');
    expect(sql).not.toContain('OFFSET');
  });

  it('classifies numeric point ids by generation boundary', () => {
    expect(determinePointGeneration(17)).toBe('PREEXISTING_V1');
    expect(determinePointGeneration(1002)).toBe('BACKFILL_V2');
  });

  it('resolves a point by postgres id before secondary keys', () => {
    const row = {
      id: '11111111-1111-4111-8111-111111111111',
      qdrantId: '1002',
      relativePath: 'src/app.ts',
      chunkId: 'chunk-1',
      contentHash: 'a'.repeat(64),
      embeddingModel: 'embeddinggemma',
      embeddingNormalized: true,
      updatedAt: '2026-07-29T00:00:00.000Z',
    };

    const byPostgresId = new Map([[row.id, row]]);
    const byChunkId = new Map([[row.chunkId, [row]]]);
    const byPathHash = new Map([[`${row.relativePath}||${row.contentHash}`, [row]]]);
    const byQdrantId = new Map([[row.qdrantId, [row]]]);

    const result = resolvePointIdentity(
      { id: row.id, payload: { postgres_id: row.id, qdrant_id: row.qdrantId } },
      byPostgresId,
      byChunkId,
      byPathHash,
      byQdrantId,
    );

    expect(result.state).toBe('MATCHED_POSTGRES_ID');
    expect(result.postgresRows[0]?.id).toBe(row.id);
  });

  it('marks chunk collisions as ambiguous', () => {
    const rowA = {
      id: 'aaaaaaaa-1111-4111-8111-111111111111',
      qdrantId: null,
      relativePath: 'src/app.ts',
      chunkId: 'chunk-1',
      contentHash: 'a'.repeat(64),
      embeddingModel: 'embeddinggemma',
      embeddingNormalized: true,
      updatedAt: '2026-07-29T00:00:00.000Z',
    };
    const rowB = { ...rowA, id: 'bbbbbbbb-1111-4111-8111-111111111111' };
    const byPostgresId = new Map([[rowA.id, rowA], [rowB.id, rowB]]);
    const byChunkId = new Map([[rowA.chunkId, [rowA, rowB]]]);

    const result = resolvePointIdentity(
      { id: 42, payload: { chunk_id: rowA.chunkId } },
      byPostgresId,
      byChunkId,
      new Map(),
      new Map(),
    );

    expect(result.state).toBe('MATCHED_AMBIGUOUS');
  });

  it('computes the maximum absolute vector delta', () => {
    expect(maxAbsoluteDifference([1, 2, 3], [1.0005, 2.0001, 2.9999])).toBeLessThan(0.001);
  });
});
