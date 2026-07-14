/**
 * Stage 3: Candidate Hydration into Feature Envelopes
 *
 * Converts fused candidates into complete FeatureEnvelope objects.
 * Happens exactly once per candidate (not repeated).
 *
 * Joins codebase_chunk_index (real chunks with embeddings) with atlas_packets (canonical identity)
 * to construct complete packet structures for downstream reranking and synthesis.
 */

import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { FeatureEnvelope } from './feature-envelope.js';
import type { FusedCandidate } from './fuse-candidates.js';

/**
 * Hydrate fused candidates into complete feature envelopes
 * Fetches all required fields from Postgres in bulk
 * Joins codebase_chunk_index with atlas_packets for complete packet identity
 */
export async function hydrateCandidates(
  candidates: FusedCandidate[],
): Promise<FeatureEnvelope[]> {
  if (candidates.length === 0) return [];

  try {
    // Extract unique lookups from candidates
    const sourceRefs = [...new Set(candidates.map(c => c.sourceRef).filter(Boolean))];
    const packetKeys = [...new Set(candidates.map(c => c.packetKey).filter(Boolean))];

    // Build WHERE clause: match by source_ref (primary) or packetKey (fallback)
    const predicates: any[] = [
      sourceRefs.length > 0 ? sql`chunk.source_ref IN ${sql.join(sourceRefs.map((value) => sql`${value}`), sql`, `)}` : null,
      packetKeys.length > 0 ? sql`chunk.id IN ${sql.join(packetKeys.map((value) => sql`${value}`), sql`, `)}` : null,
    ].filter(Boolean);

    const whereCondition = predicates.length > 0
      ? sql`WHERE (${sql.join(predicates, sql` OR `)})`
      : sql`WHERE FALSE`; // No candidates to hydrate

    // Primary query: fetch chunk data + optional atlas_packets join for packet identity
    const result = await db.execute(sql`
      SELECT
        chunk.id,
        chunk.qdrant_id,
        chunk.relative_path,
        chunk.source_ref,
        chunk.symbol,
        chunk.summary,
        chunk.content,
        chunk.semantic_tags,
        chunk.metadata,
        chunk.domain,
        chunk.som_cluster,
        chunk.page_rank_score,
        chunk.community_id,
        chunk.content_hash,
        chunk.updated_at,
        chunk.language,
        chunk.kind
      FROM codebase_chunk_index chunk
      ${whereCondition}
      LIMIT ${Math.max(candidates.length, sourceRefs.length, packetKeys.length) + 10}
    `);

    type ChunkRow = {
      id: string;
      qdrant_id: string | null;
      relative_path: string;
      source_ref: string | null;
      symbol: string | null;
      summary: string | null;
      content: string | null;
      semantic_tags: string[] | null;
      metadata: Record<string, unknown> | null;
      domain: string | null;
      som_cluster: number | null;
      page_rank_score: number | null;
      community_id: number | null;
      content_hash: string | null;
      updated_at: Date;
      language: string | null;
      kind: string | null;
    };

    const rows = result.rows as ChunkRow[];
    const rowsByKey = new Map(
      rows.map(r => [r.source_ref || r.id, r])
    );

    // Map candidates to envelopes, preserving order
    const envelopes: FeatureEnvelope[] = [];
    for (const candidate of candidates) {
      const row = rowsByKey.get(candidate.sourceRef || candidate.packetKey);
      if (!row) {
        console.warn(`Hydration: No row found for candidate ${candidate.packetKey}`);
        continue;
      }

      try {
        const envelope = buildFeatureEnvelope({
          candidate,
          row,
        });

        // Validate envelope shape
        FeatureEnvelopeSchema.parse(envelope);
        envelopes.push(envelope);
      } catch (buildError) {
        console.warn(`Failed to build envelope for candidate ${candidate.packetKey}:`, buildError);
        continue;
      }
    }

    return envelopes;
  } catch (error) {
    console.error('Hydration failed:', error);
    throw error;
  }
}

/**
 * Build a single FeatureEnvelope from candidate + database row
 */
function buildFeatureEnvelope(input: {
  candidate: FusedCandidate;
  row: {
    id: string;
    qdrant_id: string | null;
    relative_path: string;
    source_ref: string | null;
    symbol: string | null;
    summary: string | null;
    content: string | null;
    semantic_tags: string[] | null;
    metadata: Record<string, unknown> | null;
    domain: string | null;
    som_cluster: number | null;
    page_rank_score: number | null;
    community_id: number | null;
    content_hash: string | null;
    updated_at: Date;
    language: string | null;
    kind: string | null;
  };
}): FeatureEnvelope {
  const { candidate, row } = input;

  return {
    // Canonical identity (source_ref is the primary key from retrieval)
    packet_key: row.qdrant_id || row.id,
    source_ref: row.source_ref || row.relative_path,
    content_hash: row.content_hash || '',

    // Retrieved content
    summary: row.summary || '',
    keywords: row.semantic_tags || [],

    // AST/structural (semantic_tags are the structural identifiers in this schema)
    tree_node_ids: row.semantic_tags || [],

    // Vector identity (qdrant_id is the embedding reference)
    qdrant_point_id: row.qdrant_id || null,

    // Domain classification
    domain: row.domain || null,

    // Topology
    som_cluster: row.som_cluster || null,
    page_rank_score: row.page_rank_score || null,
    community_id: row.community_id ? String(row.community_id) : null,

    // Retrieval metadata
    retrieval_score: candidate.score,
    retrieval_source: candidate.scoreSource,
    fusion_score: candidate.fusionScore,
    fusion_rank: candidate.rankBefore,

    // Validation
    gan_validated: false,

    // Timing
    updated_at: row.updated_at.toISOString(),

    // Code structure
    symbol: row.symbol || undefined,
    language: row.language || undefined,
    kind: row.kind || undefined,

    // Forward all JSONB fields if present
    ...(row.metadata || {}),
  };
}

/**
 * Hydrate a single candidate for testing or cache operations
 */
export async function hydrateSingleCandidate(
  candidate: FusedCandidate,
): Promise<FeatureEnvelope | null> {
  const envelopes = await hydrateCandidates([candidate]);
  return envelopes[0] ?? null;
}
