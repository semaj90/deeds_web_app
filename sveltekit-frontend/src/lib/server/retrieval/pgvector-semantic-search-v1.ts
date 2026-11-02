import { pool } from '$lib/server/db/client.js';
import type { Pool } from 'pg';

export interface PgvectorCodebaseHitV1 {
  id: string;
  relativePath: string;
  symbol: string | null;
  kind: string | null;
  sourceRef: string | null;
  similarity: number;
}

export interface PgvectorEvidenceHitV1 {
  id: string;
  evidenceId: string;
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

export interface PgvectorSearchOptionsV1 {
  limit?: number;
  efSearch?: number;
  caseId?: string | null;
  sourceRefPattern?: string | null;
}

/**
 * Validates that an embedding conforms to the canonical 768-D EmbeddingGemma contract.
 */
export function assertValidEmbedding768(vec: Float32Array | number[]): void {
  if (!vec || vec.length !== 768) {
    throw new Error(`EMBEDDING_DIMENSION_MISMATCH: expected 768, got ${vec?.length ?? 0}`);
  }
  for (let i = 0; i < vec.length; i++) {
    if (!Number.isFinite(vec[i])) {
      throw new Error(`EMBEDDING_NON_FINITE_VALUE: index ${i} is not finite`);
    }
  }
}

/**
 * Search codebase chunks in PostgreSQL 18 using the verified HNSW index
 * idx_codebase_chunk_content_embedding_768_hnsw (vector_cosine_ops, m=16, ef_construction=64).
 */
export async function searchCodebaseChunksPgvectorV1(
  queryVector: Float32Array | number[],
  options: PgvectorSearchOptionsV1 = {}
): Promise<PgvectorCodebaseHitV1[]> {
  assertValidEmbedding768(queryVector);

  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const efSearch = Math.min(Math.max(options.efSearch ?? 40, 10), 400);
  const vecString = `[${Array.from(queryVector).join(',')}]`;
  const refPrefix = options.sourceRefPattern
    ? `${String(options.sourceRefPattern).replace(/[%_\\]/g, '\\$&')}%`
    : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL hnsw.ef_search = ${efSearch}`);

    const sql = `
      SELECT 
        id,
        relative_path,
        symbol,
        kind,
        source_ref,
        1 - (content_embedding_768 <=> $1::vector(768)) AS similarity
      FROM codebase_chunk_index
      WHERE content_embedding_768 IS NOT NULL
        AND ($3::text IS NULL OR source_ref LIKE $3 ESCAPE '\\')
      ORDER BY content_embedding_768 <=> $1::vector(768), id
      LIMIT $2;
    `;

    const res = await client.query(sql, [vecString, limit, refPrefix]);
    await client.query('COMMIT');

    return res.rows.map((row) => ({
      id: String(row.id),
      relativePath: String(row.relative_path),
      symbol: row.symbol ? String(row.symbol) : null,
      kind: row.kind ? String(row.kind) : null,
      sourceRef: row.source_ref ? String(row.source_ref) : null,
      similarity: Number(row.similarity),
    }));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Search evidence chunks in PostgreSQL 18 using evidence_vectors_hnsw_idx
 * with SET LOCAL hnsw.iterative_scan = 'strict_order' for case-scoped filtering.
 */
export async function searchEvidenceVectorsPgvectorV1(
  queryVector: Float32Array | number[],
  options: PgvectorSearchOptionsV1 = {},
  databasePool: Pick<Pool, 'connect'> = pool,
): Promise<PgvectorEvidenceHitV1[]> {
  assertValidEmbedding768(queryVector);

  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const efSearch = Math.min(Math.max(options.efSearch ?? 40, 10), 400);
  const vecString = `[${Array.from(queryVector).join(',')}]`;
  const caseId = options.caseId ?? null;

  const client = await databasePool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL hnsw.ef_search = ${efSearch}`);
    // Iterative scan ensures LIMIT k results are returned even with restrictive case filters
    await client.query("SET LOCAL hnsw.iterative_scan = 'strict_order'");

    const sql = `
      SELECT 
        ev.id,
        ev.evidence_id,
        ev.chunk_index,
        ev.content,
        ev.metadata,
        1 - (ev.embedding <=> $1::vector(768)) AS similarity
      FROM evidence_vectors ev
      LEFT JOIN evidence e ON e.id = ev.evidence_id
      WHERE ev.embedding IS NOT NULL
        AND ($3::uuid IS NULL OR e.case_id = $3)
      ORDER BY ev.embedding <=> $1::vector(768), ev.id
      LIMIT $2;
    `;

    const res = await client.query(sql, [vecString, limit, caseId]);
    await client.query('COMMIT');

    return res.rows.map((row) => ({
      id: String(row.id),
      evidenceId: String(row.evidence_id),
      chunkIndex: Number(row.chunk_index),
      content: String(row.content),
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      similarity: Number(row.similarity),
    }));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
