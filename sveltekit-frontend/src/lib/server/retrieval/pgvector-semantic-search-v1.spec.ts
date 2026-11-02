import { describe, expect, it, vi } from 'vitest';
import {
  assertValidEmbedding768,
  searchCodebaseChunksPgvectorV1,
  searchEvidenceVectorsPgvectorV1,
} from './pgvector-semantic-search-v1.js';
import { pool } from '$lib/server/db/client.js';

describe('pgvector-semantic-search-v1 contract', () => {
  it('validates 768-dimensional Float32Array properly', () => {
    const valid = new Float32Array(768).fill(0.01);
    expect(() => assertValidEmbedding768(valid)).not.toThrow();

    const tooShort = new Float32Array(384).fill(0.01);
    expect(() => assertValidEmbedding768(tooShort)).toThrowError(/EMBEDDING_DIMENSION_MISMATCH/);

    const withNaN = new Float32Array(768).fill(0.01);
    withNaN[42] = NaN;
    expect(() => assertValidEmbedding768(withNaN)).toThrowError(/EMBEDDING_NON_FINITE_VALUE/);
  });

  it('executes codebase chunks pgvector search using HNSW vector_cosine_ops and read-only transaction', async () => {
    const queriesExecuted: string[] = [];
    const mockClient = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queriesExecuted.push(sql);
        if (sql.includes('SELECT') && sql.includes('codebase_chunk_index')) {
          return {
            rows: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                relative_path: 'src/lib/auth.ts',
                symbol: 'authenticateUser',
                kind: 'function',
                source_ref: 'src/lib/auth.ts:authenticateUser',
                similarity: 0.884,
              },
            ],
          };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    vi.spyOn(pool, 'connect').mockResolvedValueOnce(mockClient as never);

    const queryVec = new Float32Array(768).fill(0.02);
    const hits = await searchCodebaseChunksPgvectorV1(queryVec, { limit: 10, efSearch: 50 });

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN READ ONLY');
    expect(mockClient.query).toHaveBeenCalledWith('SET LOCAL hnsw.ef_search = 50');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();

    expect(hits).toHaveLength(1);
    expect(hits[0].relativePath).toBe('src/lib/auth.ts');
    expect(hits[0].symbol).toBe('authenticateUser');
    expect(hits[0].similarity).toBeCloseTo(0.884);
  });

  it('executes evidence vectors search with hnsw.iterative_scan = strict_order for case-scoped filtering', async () => {
    const mockClient = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('SELECT') && sql.includes('evidence_vectors')) {
          return {
            rows: [
              {
                id: '22222222-2222-4222-8222-222222222222',
                evidence_id: '33333333-3333-4333-8333-333333333333',
                chunk_index: 0,
                content: 'Exhibit A contract excerpt',
                metadata: { page: 1 },
                similarity: 0.912,
              },
            ],
          };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    vi.spyOn(pool, 'connect').mockResolvedValueOnce(mockClient as never);

    const queryVec = new Float32Array(768).fill(0.03);
    const caseId = '44444444-4444-4444-8444-444444444444';
    const hits = await searchEvidenceVectorsPgvectorV1(queryVec, { caseId, limit: 5 });

    expect(mockClient.query).toHaveBeenCalledWith("SET LOCAL hnsw.iterative_scan = 'strict_order'");
    expect(mockClient.query).toHaveBeenCalledWith('SET LOCAL hnsw.ef_search = 40');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();

    expect(hits).toHaveLength(1);
    expect(hits[0].evidenceId).toBe('33333333-3333-4333-8333-333333333333');
    expect(hits[0].content).toContain('Exhibit A');
    expect(hits[0].similarity).toBeCloseTo(0.912);
  });
});
