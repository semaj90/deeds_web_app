import type { Pool, QueryResultRow } from 'pg';
import {
  featureRelationshipSchema,
  type FeatureRelationshipV1,
} from './feature-intelligence.js';

function parseRelationshipRow(row: QueryResultRow): FeatureRelationshipV1 {
  return featureRelationshipSchema.parse({
    schema: 'atlas.feature-relationship.v1',
    relationship_id: String(row.relationship_id),
    relationship_type: String(row.relationship_type),
    participant_count: Number(row.participant_count),
    relationship_degree: Number(row.relationship_degree),
    relationship_degree_kind: String(row.relationship_degree_kind),
    participants: row.participants,
    cardinality: (row.cardinality as Array<Record<string, unknown>>).map((item) => ({
      role: item.role,
      min: Number(item.min),
      max: item.max === 'many' ? 'many' : Number(item.max),
    })),
    source_ref: String(row.source_ref),
    source_revision: String(row.source_revision),
    relationship_revision: String(row.relationship_revision),
    producer_revision: String(row.producer_revision),
    evidence_refs: row.evidence_refs,
    confidence: Number(row.confidence),
    metadata: row.metadata ?? {},
  });
}

/**
 * Exact canonical relationship lookup for first-stage relationship candidates.
 * This is deliberately separate from semantic relationship search: a vector ID
 * or ANN result must be promoted to the canonical relationship_id before use.
 */
export async function findCanonicalRelationshipsByIds(
  pool: Pool,
  relationshipIds: readonly string[],
): Promise<FeatureRelationshipV1[]> {
  const ids = [...new Set(relationshipIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const result = await pool.query<QueryResultRow>(`
    WITH rels AS (
      SELECT *
      FROM atlas_relationships
      WHERE relationship_id = ANY($1::text[])
    )
    SELECT
      r.*,
      COALESCE(jsonb_agg(jsonb_build_object(
        'role', m.role,
        'entity_type', m.entity_type,
        'entity_id', m.entity_id,
        'entity_revision', m.entity_revision,
        'source_ref', m.source_ref
      ) ORDER BY m.member_ordinal), '[]'::jsonb) AS participants,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'role', c.role,
          'min', c.minimum_count,
          'max', CASE WHEN c.maximum_count IS NULL THEN 'many'::text ELSE c.maximum_count::text END
        ) ORDER BY c.role)
        FROM atlas_relationship_cardinality c
        WHERE c.relationship_id = r.relationship_id
      ), '[]'::jsonb) AS cardinality,
      COALESCE((
        SELECT jsonb_agg(re.evidence_id ORDER BY re.evidence_id)
        FROM atlas_relationship_evidence re
        WHERE re.relationship_id = r.relationship_id
      ), '[]'::jsonb) AS evidence_refs
    FROM rels r
    JOIN atlas_relationship_members m USING (relationship_id)
    GROUP BY r.relationship_id
    ORDER BY array_position($1::text[], r.relationship_id), r.relationship_id
  `, [ids]);

  return result.rows.map(parseRelationshipRow);
}
