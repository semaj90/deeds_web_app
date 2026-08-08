/**
 * Feature Matrix Assembly — Domain 4 of the retrieval LOD taxonomy
 * (openspec/changes/parent-atlas-retrieval-lod-algorithm-taxonomy).
 *
 * Wires the canonical Postgres authority signal (`atlas_graph_authority_scores`,
 * confirmed live with 50,164 rows — the sibling `atlas_graph_authority_scores_v2`
 * table is schema-only, 0 rows, do not join against it) into the `SearchRuntime`
 * candidate-scoring stage. Domain 5 (weighted scoring) is NOT a new module — it
 * already exists correctly as `runtime-reranker.ts::blendScores()`; this module
 * only supplies the previously-missing `graph` signal input to that function.
 *
 * Postgres is truth for this table (project hard rule) — no Redis-fronted cache
 * is added here. `gpu:karpathy:scores` (Redis) is a separate, already-live
 * authority blend used by a different retrieval path (`orchestrator.ts`); it is
 * deliberately not read here to avoid coupling two authority sources into one
 * candidate-scoring stage in a single change.
 */

import { sql } from 'drizzle-orm';

async function getDb() {
  const mod = await import('$lib/server/db/client.js');
  return mod.db;
}

export interface AuthorityLookupInput {
  packetKeys: string[];
  sourceRefs: string[];
}

/**
 * Batch-fetch authority_percentile (already normalised 0-1, L1-normalised
 * PageRank per `drizzle/manual/0099_pagerank_authority_contract.sql`) for a set
 * of candidates, from the single `promoted` authority run (the schema's own
 * canonical-run marker — do not assume "latest by created_at", multiple
 * historical snapshots exist and only one is promoted).
 *
 * Keyed primarily by packet_key (most rows have a null packet_key — 41,458 of
 * 50,164 at last count — so source_ref is a required fallback join, not an
 * optional one), matching the packet_key > source_ref precedence already
 * established in `identity-resolution.ts`.
 *
 * Graceful degradation: returns an empty Map on any failure (missing table,
 * connection error, no promoted run) rather than throwing — matches the
 * pattern used by `neo4j-graph-signal.ts`'s empty-response fallback.
 */
export async function fetchAuthorityScores(
  input: AuthorityLookupInput,
): Promise<Map<string, number>> {
  const packetKeys = Array.from(new Set(input.packetKeys.filter((v) => v && v.trim() !== '')));
  const sourceRefs = Array.from(new Set(input.sourceRefs.filter((v) => v && v.trim() !== '')));

  if (packetKeys.length === 0 && sourceRefs.length === 0) {
    return new Map();
  }

  try {
    const db = await getDb();
    const result = await db.execute(sql`
      SELECT s.packet_key, s.source_ref, s.authority_percentile
      FROM atlas_graph_authority_scores s
      JOIN atlas_graph_authority_runs r ON r.run_id = s.run_id
      WHERE r.status = 'promoted'
        AND (
          s.packet_key = ANY(${packetKeys}::text[])
          OR s.source_ref = ANY(${sourceRefs}::text[])
        )
    `);

    type AuthorityRow = {
      packet_key: string | null;
      source_ref: string | null;
      authority_percentile: number | string;
    };

    const bySourceRef = new Map<string, number>();
    const byPacketKey = new Map<string, number>();

    for (const row of result.rows as AuthorityRow[]) {
      const score = typeof row.authority_percentile === 'string'
        ? Number.parseFloat(row.authority_percentile)
        : row.authority_percentile;
      if (!Number.isFinite(score)) continue;
      if (row.packet_key) byPacketKey.set(row.packet_key, score);
      if (row.source_ref) bySourceRef.set(row.source_ref, score);
    }

    // packet_key wins where both matched — same precedence as identity-resolution.ts
    return new Map([...bySourceRef, ...byPacketKey]);
  } catch (err) {
    console.warn('[feature-matrix] authority lookup unavailable:', err);
    return new Map();
  }
}

/**
 * Resolve one candidate's authority score from the batch map, trying
 * packet_key first, then source_ref. Returns undefined (not 0) when no row
 * matched, so `blendScores()`'s `score === undefined` guard correctly excludes
 * it from the weighted blend instead of treating "no data" as "zero authority".
 */
export function resolveAuthorityScore(
  authority: Map<string, number>,
  packetKey: string | null | undefined,
  sourceRef: string | null | undefined,
): number | undefined {
  if (packetKey && authority.has(packetKey)) return authority.get(packetKey);
  if (sourceRef && authority.has(sourceRef)) return authority.get(sourceRef);
  return undefined;
}
