import type { Pool } from 'pg';
import {
  dynamicHyperedgeCandidateSchema,
  type DynamicHyperedgeCandidateV1,
} from './hypergraph-retrieval.js';

export type DynamicHyperedgeNeighborhoodRowV1 = {
  evidence_id: string;
  evidence_kind: string;
  source_ref: string;
  source_revision: string;
  evidence_revision: string;
  participants: Array<{
    entity_type: string;
    entity_id: string;
    role: string;
    confidence?: number;
  }>;
  shared_entity_ids: string[];
  hop: number;
  confidence: number;
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/**
 * Reads SAG-style query-scoped latent hyperedges from the PostgreSQL event/entity
 * index. Returned candidates are explicitly dynamic/non-canonical and cannot be
 * persisted as canonical facts without a separate promotion review.
 */
export async function retrieveDynamicHyperedgeCandidates(input: {
  pool: Pool;
  query_id: string;
  seed_entity_ids: string[];
  source_snapshot_revision: string;
  limit?: number;
}): Promise<DynamicHyperedgeCandidateV1[]> {
  const seedEntityIds = unique(input.seed_entity_ids);
  if (seedEntityIds.length === 0) return [];
  const limit = Math.max(1, Math.min(input.limit ?? 50, 500));

  const result = await input.pool.query<DynamicHyperedgeNeighborhoodRowV1>(`
    SELECT *
    FROM atlas_dynamic_hyperedge_neighborhood($1::text[], $2::integer)
  `, [seedEntityIds, limit]);

  return result.rows.map((row) => dynamicHyperedgeCandidateSchema.parse({
    schema: 'atlas.dynamic-hyperedge-candidate.v1',
    dynamic_relationship_id: `dynamic:${input.query_id}:${row.evidence_id}`,
    query_id: input.query_id,
    relationship_type: `evidence_event:${row.evidence_kind}`,
    participants: row.participants.map((participant) => ({
      role: participant.role,
      entity_type: participant.entity_type,
      entity_id: participant.entity_id,
      source_ref: row.source_ref,
    })),
    join_keys: row.shared_entity_ids.map((entityId) => {
      const participant = row.participants.find((item) => item.entity_id === entityId);
      return {
        entity_type: participant?.entity_type ?? 'entity',
        entity_id: entityId,
      };
    }),
    source_refs: [row.source_ref],
    source_revisions: [row.source_revision],
    evidence_refs: [row.evidence_id],
    confidence: Number(row.confidence),
    persistence: 'dynamic',
    promotable: false,
    source_snapshot_revision: input.source_snapshot_revision,
  }));
}
