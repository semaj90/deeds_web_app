/**
 * Postgres 17 FTS wrapper — calls search_code_lexical() SQL function.
 * Uses 'simple' dictionary so camelCase tokens, dots, and path segments
 * are preserved as-is (not stemmed).
 */

import { pool } from '$lib/server/db/client';
import { ENV } from '$lib/server/env.server.js';

export interface FTSResult {
  stable_key: string;
  file_path: string;
  symbol_name: string | null;
  symbol_kind: string | null;
  language: string | null;
  content: string;
  tags: string;
  topo_class: string | null;
  graph_authority_score: number;
  lexical_score: number;
  headline: string;
}

export interface FTSOptions {
  limit?: number;
  topoClass?: string;
}

export async function searchCodeLexical(
  query: string,
  opts: FTSOptions = {}
): Promise<FTSResult[]> {
  const { limit = 20, topoClass = null } = opts;

  if (!query.trim()) return [];

  try {
    const { rows } = await pool.query<FTSResult>(
      'SELECT * FROM search_code_lexical($1, $2, $3)',
      [query, limit, topoClass]
    );
    return rows;
  } catch {
    return [];
  }
}

export interface HybridPgResult extends FTSResult {
  semantic_score: number;
  hybrid_score: number;
}

// ── Server-side Qdrant → Postgres FTS sync (callable from orchestrator) ───────

export interface SyncCodeRetrievalResult {
  upserted: number;
  skipped:  number;
  errors:   number;
  durationMs: number;
}

/**
 * Sync up to `limit` Qdrant codebase_chunks_768 points into Postgres
 * code_retrieval_chunks. Safe to call from the orchestrator after indexing.
 * Fire-and-forget friendly: never throws, returns stats.
 */
export async function syncCodeRetrievalChunks(opts: {
  limit?:     number;
  batchSize?: number;
  quiet?:     boolean;
  qdrantUrl?: string;
} = {}): Promise<SyncCodeRetrievalResult> {
  const { limit = 5000, batchSize = 100, qdrantUrl } = opts;
  const QDRANT = qdrantUrl ?? (ENV.QDRANT_URL);
  const COLLECTION = 'codebase_chunks_768';
  const t0 = Date.now();
  let upserted = 0, skipped = 0, errors = 0;

  const UPSERT_SQL = `
    INSERT INTO code_retrieval_chunks (
      stable_key, qdrant_id, file_path, symbol_name, symbol_kind, language,
      content, tags, topo_byte, topo_hex, topo_class,
      graph_authority_score, som_bmu_col, som_bmu_row, som_cluster,
      manifold4_x, manifold4_y, manifold4_z, manifold4_w
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
    )
    ON CONFLICT (stable_key) DO UPDATE SET
      content               = EXCLUDED.content,
      tags                  = EXCLUDED.tags,
      topo_byte             = EXCLUDED.topo_byte,
      topo_hex              = EXCLUDED.topo_hex,
      topo_class            = EXCLUDED.topo_class,
      graph_authority_score = EXCLUDED.graph_authority_score,
      som_bmu_col           = EXCLUDED.som_bmu_col,
      som_bmu_row           = EXCLUDED.som_bmu_row,
      som_cluster           = EXCLUDED.som_cluster,
      manifold4_x           = EXCLUDED.manifold4_x,
      manifold4_y           = EXCLUDED.manifold4_y,
      manifold4_z           = EXCLUDED.manifold4_z,
      manifold4_w           = EXCLUDED.manifold4_w,
      updated_at            = now()
    WHERE code_retrieval_chunks.content IS DISTINCT FROM EXCLUDED.content
       OR code_retrieval_chunks.topo_class IS DISTINCT FROM EXCLUDED.topo_class
  `;

  try {
    let offset: string | null = null;
    let fetched = 0;

    while (true) {
      const body: Record<string, unknown> = { limit: batchSize, with_payload: true, with_vector: false };
      if (offset !== null) body.offset = offset;

      const res = await fetch(`${QDRANT}/collections/${COLLECTION}/points/scroll`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  AbortSignal.timeout(15_000),
      });
      if (!res.ok) break;

      const data = await res.json() as { result?: { points?: Array<{ id: string; payload?: Record<string, unknown> }>; next_page_offset?: string } };
      const points = data.result?.points ?? [];
      if (!points.length) break;

      const batch = points.map(pt => {
        const p = pt.payload ?? {};
        const relPath = String(p.relativePath ?? p.path ?? '');
        const symbol  = String(p.symbol ?? p.symbol_name ?? '');
        return {
          stable_key:            symbol ? `file:${relPath}:${symbol}` : `qdrant:${pt.id}`,
          qdrant_id:             String(pt.id),
          file_path:             relPath,
          symbol_name:           symbol || null,
          symbol_kind:           String(p.kind ?? p.symbol_kind ?? ''),
          language:              String(p.language ?? ''),
          content:               String(p.content ?? ''),
          tags:                  Array.isArray(p.tags) ? p.tags.join(',') : String(p.tags ?? ''),
          topo_byte:             p.topo_byte != null ? Number(p.topo_byte) : null,
          topo_hex:              p.topo_hex != null ? String(p.topo_hex) : null,
          topo_class:            p.topo_class != null ? String(p.topo_class) : null,
          graph_authority_score: p.graphAuthorityScore != null ? Number(p.graphAuthorityScore) : 0,
          som_bmu_col:           p.som_bmu_col != null ? Number(p.som_bmu_col) : null,
          som_bmu_row:           p.som_bmu_row != null ? Number(p.som_bmu_row) : null,
          som_cluster:           p.som_cluster != null ? Number(p.som_cluster) : null,
          manifold4_x:           p.manifold4_x != null ? Number(p.manifold4_x) : null,
          manifold4_y:           p.manifold4_y != null ? Number(p.manifold4_y) : null,
          manifold4_z:           p.manifold4_z != null ? Number(p.manifold4_z) : null,
          manifold4_w:           p.manifold4_w != null ? Number(p.manifold4_w) : null,
        };
      });

      for (const row of batch) {
        try {
          const r = await pool.query(UPSERT_SQL, [
            row.stable_key, row.qdrant_id, row.file_path, row.symbol_name,
            row.symbol_kind, row.language, row.content, row.tags,
            row.topo_byte, row.topo_hex, row.topo_class,
            row.graph_authority_score,
            row.som_bmu_col, row.som_bmu_row, row.som_cluster,
            row.manifold4_x, row.manifold4_y, row.manifold4_z, row.manifold4_w,
          ]);
          if (r.rowCount && r.rowCount > 0) upserted++; else skipped++;
        } catch { errors++; }
      }

      fetched += points.length;
      offset = data.result?.next_page_offset ?? null;
      if (!offset) break;
      if (limit > 0 && fetched >= limit) break;
    }
  } catch { errors++; }

  return { upserted, skipped, errors, durationMs: Date.now() - t0 };
}

export async function searchCodeHybridPg(
  query: string,
  embedding: number[],
  opts: FTSOptions = {}
): Promise<HybridPgResult[]> {
  const { limit = 20, topoClass = null } = opts;

  if (!query.trim()) return [];

  try {
    const embStr = `[${embedding.join(',')}]`;
    const { rows } = await pool.query<HybridPgResult>(
      'SELECT * FROM search_code_hybrid_pg($1, $2::vector(768), $3, $4)',
      [query, embStr, limit, topoClass]
    );
    return rows;
  } catch {
    return [];
  }
}
