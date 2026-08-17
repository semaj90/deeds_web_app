import type { Pool, PoolClient, QueryResultRow } from 'pg';
import {
  featureEvidenceSchema,
  featureRelationshipSchema,
  featureSchema,
  featureStateReceiptSchema,
  type FeatureEvidenceV1,
  type FeatureRelationshipV1,
  type FeatureStateReceiptV1,
  type FeatureV1,
} from './feature-intelligence.js';
import {
  dynamicHyperedgeCandidateSchema,
  relationshipEmbeddingProjectionSchema,
  type DynamicHyperedgeCandidateV1,
  type RelationshipEmbeddingProjectionV1,
} from './hypergraph-retrieval.js';

export type FeatureIntelligenceRepository = ReturnType<typeof createFeatureIntelligenceRepository>;

function vectorLiteral(values: readonly number[]): string {
  if (values.length !== 768) {
    throw new RangeError(`semantic_768 requires 768 values; received ${values.length}`);
  }
  if (values.some((value) => !Number.isFinite(value))) {
    throw new TypeError('semantic_768 values must all be finite');
  }
  return `[${values.join(',')}]`;
}

async function withTransaction<T>(pool: Pool, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function createFeatureIntelligenceRepository(pool: Pool) {
  return {
    async upsertFeature(input: FeatureV1): Promise<FeatureV1> {
      const feature = featureSchema.parse(input);
      await withTransaction(pool, async (client) => {
        const row = await client.query<{ feature_id: string }>(`
          INSERT INTO atlas_features (
            feature_id, feature_key, feature_label, domain, parent_feature_id,
            status, feature_revision, producer_revision, metadata
          )
          VALUES ($1::uuid, $2, $3, $4, NULLIF($5, '')::uuid, $6, $7, $8, '{}'::jsonb)
          ON CONFLICT (feature_key) DO UPDATE SET
            feature_label = EXCLUDED.feature_label,
            domain = EXCLUDED.domain,
            parent_feature_id = EXCLUDED.parent_feature_id,
            status = EXCLUDED.status,
            feature_revision = EXCLUDED.feature_revision,
            producer_revision = EXCLUDED.producer_revision,
            updated_at = now()
          RETURNING feature_id
        `, [
          feature.feature_id,
          feature.feature_key,
          feature.feature_label,
          feature.domain,
          feature.parent_feature_id ?? '',
          feature.status,
          feature.feature_revision,
          feature.producer_revision,
        ]);
        const featureId = row.rows[0]?.feature_id;
        if (!featureId) throw new Error('feature upsert returned no feature_id');

        await client.query('DELETE FROM atlas_feature_aliases WHERE feature_id = $1::uuid', [featureId]);
        for (const alias of feature.aliases) {
          await client.query(`
            INSERT INTO atlas_feature_aliases(feature_id, alias, normalized_alias)
            VALUES ($1::uuid, $2, lower(trim($2)))
            ON CONFLICT DO NOTHING
          `, [featureId, alias]);
        }
      });
      return feature;
    },

    async insertEvidence(input: FeatureEvidenceV1): Promise<FeatureEvidenceV1> {
      const evidence = featureEvidenceSchema.parse(input);
      await withTransaction(pool, async (client) => {
        await client.query(`
          INSERT INTO atlas_evidence (
            evidence_id, evidence_kind, source_ref, source_revision,
            evidence_revision, producer_revision, confidence, payload, search_text
          )
          VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
          ON CONFLICT (evidence_id) DO UPDATE SET
            evidence_kind = EXCLUDED.evidence_kind,
            source_ref = EXCLUDED.source_ref,
            source_revision = EXCLUDED.source_revision,
            evidence_revision = EXCLUDED.evidence_revision,
            producer_revision = EXCLUDED.producer_revision,
            confidence = EXCLUDED.confidence,
            payload = EXCLUDED.payload,
            search_text = EXCLUDED.search_text
        `, [
          evidence.evidence_id,
          evidence.evidence_kind,
          evidence.source_ref,
          evidence.source_revision,
          evidence.evidence_revision,
          evidence.producer_revision,
          evidence.confidence,
          JSON.stringify(evidence.payload),
          `${evidence.evidence_kind} ${evidence.relation_type} ${evidence.source_ref}`,
        ]);
        await client.query(`
          INSERT INTO atlas_feature_evidence (
            feature_id, evidence_id, relation_type, polarity, confidence, relationship_id
          )
          VALUES ($1::uuid, $2::uuid, $3, $4, $5, NULLIF($6, '')::uuid)
          ON CONFLICT (feature_id, evidence_id, relation_type) DO UPDATE SET
            polarity = EXCLUDED.polarity,
            confidence = EXCLUDED.confidence,
            relationship_id = EXCLUDED.relationship_id
        `, [
          evidence.feature_id,
          evidence.evidence_id,
          evidence.relation_type,
          evidence.polarity,
          evidence.confidence,
          evidence.relationship_id ?? '',
        ]);
      });
      return evidence;
    },

    async persistRelationship(input: FeatureRelationshipV1): Promise<FeatureRelationshipV1> {
      const relationship = featureRelationshipSchema.parse(input);
      await withTransaction(pool, async (client) => {
        await client.query(`
          INSERT INTO atlas_relationships (
            relationship_id, relationship_type, participant_count,
            relationship_degree, relationship_degree_kind, source_ref,
            source_revision, relationship_revision, producer_revision,
            confidence, metadata
          )
          VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
          ON CONFLICT (relationship_id) DO UPDATE SET
            relationship_type = EXCLUDED.relationship_type,
            participant_count = EXCLUDED.participant_count,
            relationship_degree = EXCLUDED.relationship_degree,
            relationship_degree_kind = EXCLUDED.relationship_degree_kind,
            source_ref = EXCLUDED.source_ref,
            source_revision = EXCLUDED.source_revision,
            relationship_revision = EXCLUDED.relationship_revision,
            producer_revision = EXCLUDED.producer_revision,
            confidence = EXCLUDED.confidence,
            metadata = EXCLUDED.metadata,
            updated_at = now()
        `, [
          relationship.relationship_id,
          relationship.relationship_type,
          relationship.participant_count,
          relationship.relationship_degree,
          relationship.relationship_degree_kind,
          relationship.source_ref,
          relationship.source_revision,
          relationship.relationship_revision,
          relationship.producer_revision,
          relationship.confidence,
          JSON.stringify(relationship.metadata),
        ]);

        await client.query('DELETE FROM atlas_relationship_members WHERE relationship_id = $1::uuid', [relationship.relationship_id]);
        await client.query('DELETE FROM atlas_relationship_cardinality WHERE relationship_id = $1::uuid', [relationship.relationship_id]);
        await client.query('DELETE FROM atlas_relationship_evidence WHERE relationship_id = $1::uuid', [relationship.relationship_id]);

        for (const [ordinal, participant] of relationship.participants.entries()) {
          await client.query(`
            INSERT INTO atlas_relationship_members (
              relationship_id, member_ordinal, role, entity_type, entity_id,
              entity_revision, source_ref
            ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
          `, [
            relationship.relationship_id,
            ordinal,
            participant.role,
            participant.entity_type,
            participant.entity_id,
            participant.entity_revision ?? null,
            participant.source_ref ?? null,
          ]);
        }

        for (const constraint of relationship.cardinality) {
          await client.query(`
            INSERT INTO atlas_relationship_cardinality (
              relationship_id, role, minimum_count, maximum_count
            ) VALUES ($1::uuid, $2, $3, $4)
          `, [
            relationship.relationship_id,
            constraint.role,
            constraint.min,
            constraint.max === 'many' ? null : constraint.max,
          ]);
        }

        for (const evidenceId of relationship.evidence_refs) {
          await client.query(`
            INSERT INTO atlas_relationship_evidence(relationship_id, evidence_id, confidence)
            VALUES ($1::uuid, $2::uuid, $3)
            ON CONFLICT DO NOTHING
          `, [relationship.relationship_id, evidenceId, relationship.confidence]);
        }

        const validation = await client.query<{ valid: boolean }>(
          'SELECT atlas_validate_relationship($1::uuid) AS valid',
          [relationship.relationship_id],
        );
        if (validation.rows[0]?.valid !== true) {
          throw new Error(`relationship ${relationship.relationship_id} failed participant/degree validation`);
        }
      });
      return relationship;
    },

    async upsertRelationshipEmbedding(
      projectionInput: RelationshipEmbeddingProjectionV1,
      embedding: readonly number[],
    ): Promise<RelationshipEmbeddingProjectionV1> {
      const projection = relationshipEmbeddingProjectionSchema.parse(projectionInput);
      await pool.query(`
        INSERT INTO atlas_relationship_embeddings (
          relationship_id, relationship_revision, embedding_model_revision,
          projection_revision, embedding, source_checksum, view_refs
        )
        VALUES ($1::uuid, $2, $3, $4, $5::vector, $6, $7::text[])
        ON CONFLICT (relationship_id, embedding_model_revision, projection_revision)
        DO UPDATE SET
          relationship_revision = EXCLUDED.relationship_revision,
          embedding = EXCLUDED.embedding,
          source_checksum = EXCLUDED.source_checksum,
          view_refs = EXCLUDED.view_refs,
          created_at = now()
      `, [
        projection.relationship_id,
        projection.relationship_revision,
        projection.embedding_model_revision,
        projection.projection_revision,
        vectorLiteral(embedding),
        projection.source_checksum,
        projection.view_refs,
      ]);
      return projection;
    },

    async searchRelationshipEmbeddings(
      embedding: readonly number[],
      limit = 20,
    ): Promise<Array<{ relationship_id: string; distance: number }>> {
      const boundedLimit = Math.max(1, Math.min(limit, 200));
      const result = await pool.query<{ relationship_id: string; distance: number }>(`
        SELECT relationship_id::text, embedding <=> $1::vector AS distance
        FROM atlas_relationship_embeddings
        ORDER BY embedding <=> $1::vector
        LIMIT $2
      `, [vectorLiteral(embedding), boundedLimit]);
      return result.rows.map((row) => ({
        relationship_id: row.relationship_id,
        distance: Number(row.distance),
      }));
    },

    async findRelationshipsForEntities(
      entityIds: readonly string[],
      relationshipTypes: readonly string[] = [],
      limit = 100,
    ): Promise<FeatureRelationshipV1[]> {
      const ids = [...new Set(entityIds.filter(Boolean))];
      if (ids.length === 0) return [];
      const boundedLimit = Math.max(1, Math.min(limit, 500));
      const result = await pool.query<QueryResultRow>(`
        WITH rels AS (
          SELECT DISTINCT r.*
          FROM atlas_relationships r
          JOIN atlas_relationship_members m USING (relationship_id)
          WHERE m.entity_id = ANY($1::text[])
            AND (cardinality($2::text[]) = 0 OR r.relationship_type = ANY($2::text[]))
          ORDER BY r.confidence DESC, r.relationship_id
          LIMIT $3
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
            SELECT jsonb_agg(re.evidence_id::text ORDER BY re.evidence_id)
            FROM atlas_relationship_evidence re
            WHERE re.relationship_id = r.relationship_id
          ), '[]'::jsonb) AS evidence_refs
        FROM rels r
        JOIN atlas_relationship_members m USING (relationship_id)
        GROUP BY r.relationship_id
        ORDER BY r.confidence DESC, r.relationship_id
      `, [ids, [...relationshipTypes], boundedLimit]);

      return result.rows.map((row) => featureRelationshipSchema.parse({
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
      }));
    },

    async persistDynamicHyperedge(input: DynamicHyperedgeCandidateV1): Promise<DynamicHyperedgeCandidateV1> {
      const candidate = dynamicHyperedgeCandidateSchema.parse(input);
      await pool.query(`
        INSERT INTO atlas_dynamic_hyperedge_candidates (
          dynamic_relationship_id, query_id, relationship_type, participants,
          join_keys, source_refs, source_revisions, evidence_refs, confidence,
          source_snapshot_revision
        ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::text[], $7::text[], $8::text[], $9, $10)
        ON CONFLICT (dynamic_relationship_id) DO UPDATE SET
          query_id = EXCLUDED.query_id,
          relationship_type = EXCLUDED.relationship_type,
          participants = EXCLUDED.participants,
          join_keys = EXCLUDED.join_keys,
          source_refs = EXCLUDED.source_refs,
          source_revisions = EXCLUDED.source_revisions,
          evidence_refs = EXCLUDED.evidence_refs,
          confidence = EXCLUDED.confidence,
          source_snapshot_revision = EXCLUDED.source_snapshot_revision
      `, [
        candidate.dynamic_relationship_id,
        candidate.query_id,
        candidate.relationship_type,
        JSON.stringify(candidate.participants),
        JSON.stringify(candidate.join_keys),
        candidate.source_refs,
        candidate.source_revisions,
        candidate.evidence_refs,
        candidate.confidence,
        candidate.source_snapshot_revision,
      ]);
      return candidate;
    },

    async insertStateReceipt(input: FeatureStateReceiptV1): Promise<FeatureStateReceiptV1> {
      const receipt = featureStateReceiptSchema.parse(input);
      await pool.query(`
        INSERT INTO atlas_feature_state_receipts (
          receipt_id, feature_id, feature_revision, evidence_snapshot_revision,
          state_revision, input_evidence_hash, evaluator_revision, state,
          completion, confidence, priority, blockers, recommendations,
          satisfied_evidence, blocking_evidence, priority_signals, payload, emitted_at
        ) VALUES (
          $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12::text[], $13::text[], $14::uuid[], $15::uuid[],
          $16::jsonb, $17::jsonb, $18::timestamptz
        )
      `, [
        receipt.receipt_id,
        receipt.feature_id,
        receipt.feature_revision,
        receipt.evidence_snapshot_revision,
        receipt.state_revision,
        receipt.input_evidence_hash,
        receipt.evaluator_revision,
        receipt.state.state,
        receipt.state.completion,
        receipt.state.confidence,
        receipt.state.priority,
        receipt.state.blockers,
        receipt.state.recommendations,
        receipt.state.satisfied_evidence,
        receipt.state.blocking_evidence,
        JSON.stringify(receipt.state.priority_signals),
        JSON.stringify(receipt.state),
        receipt.emitted_at,
      ]);
      return receipt;
    },
  };
}
