import type { Pool } from 'pg';
import {
  observationFeatureChecksum,
  observationFeatureRowSchema,
  type ObservationFeatureRowV1,
} from './observation-feature-compiler.js';

function vectorLiteral(values: readonly number[]): string {
  if (values.length !== 768) throw new RangeError(`semantic_768 requires 768 values; received ${values.length}`);
  if (values.some((value) => !Number.isFinite(value))) throw new TypeError('semantic_768 values must all be finite');
  return `[${values.join(',')}]`;
}

function suffixes(row: ObservationFeatureRowV1, field: 'ast_features' | 'ontology_features' | 'langextract_features', prefix: string): string[] {
  return row[field]
    .map((feature) => feature.feature_id.startsWith(prefix) ? feature.feature_id.slice(prefix.length) : feature.feature_id)
    .sort();
}

function continuousValue(row: ObservationFeatureRowV1, featureId: string): number | null {
  const feature = [...row.graph_features, ...row.context_features].find((value) => value.feature_id === featureId);
  return feature?.continuous_value ?? null;
}

function binaryValue(row: ObservationFeatureRowV1, featureId: string): boolean | null {
  const feature = row.context_features.find((value) => value.feature_id === featureId);
  return feature?.binary_value == null ? null : feature.binary_value === 1;
}

function categoricalValue(row: ObservationFeatureRowV1, featureId: string): string | null {
  return row.cluster_features.find((value) => value.feature_id === featureId)?.categorical_value ?? null;
}

export type ObservationFeatureRepository = ReturnType<typeof createObservationFeatureRepository>;

export type ObservationFeatureRepositoryOptions = {
  /**
   * This repository targets the pre-ORF candidate/vector schema. It must be
   * explicitly enabled until the repository is migrated to the packet-key
   * exact-filter contract used by SvelteKit.
   */
  schema?: 'LEGACY_CANDIDATE_VECTOR_V1';
};

export function createObservationFeatureRepository(pool: Pool, options: ObservationFeatureRepositoryOptions = {}) {
  const legacySchemaEnabled = options.schema === 'LEGACY_CANDIDATE_VECTOR_V1';
  const assertSchemaOptIn = () => {
    if (!legacySchemaEnabled) {
      throw new Error('OBSERVATION_FEATURE_REPOSITORY_SCHEMA_UNRESOLVED');
    }
  };

  return {
    async upsertFeatureRow(input: {
      row: ObservationFeatureRowV1;
      semantic768?: readonly number[] | null;
      embeddingRevision?: string | null;
    }): Promise<ObservationFeatureRowV1> {
      assertSchemaOptIn();
      const row = observationFeatureRowSchema.parse(input.row);
      const semantic = input.semantic768 ?? null;
      const embeddingRevision = input.embeddingRevision ?? null;
      if ((semantic === null) !== (embeddingRevision === null)) {
        throw new Error('OBSERVATION_FEATURE_SEMANTIC_REVISION_PAIR_REQUIRED');
      }
      const featureRowChecksum = observationFeatureChecksum(row);
      const kmeansRaw = categoricalValue(row, 'cluster.kmeans');
      const kmeans = kmeansRaw === null ? null : Number(kmeansRaw);
      if (kmeans !== null && (!Number.isInteger(kmeans) || kmeans < 0)) {
        throw new Error(`OBSERVATION_FEATURE_KMEANS_INVALID:${kmeansRaw}`);
      }

      await pool.query(`
        INSERT INTO atlas_observation_feature_rows (
          candidate_id, workspace_revision, source_ref, source_revision,
          row_ordinal, row_identity_checksum, registry_revision, feature_row_checksum,
          ontology_classes, ast_observation_kinds, langextract_classes, tags,
          pagerank, ppr, graph_degree, kmeans_cluster, som_cell, community_id,
          authority_weight, recency, validation_passed,
          semantic_768, embedding_revision, observation_refs, feature_payload,
          canonical_authority
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9::text[],$10::text[],$11::text[],$12::text[],
          $13,$14,$15,$16,$17,$18,$19,$20,$21,
          $22::vector,$23,$24::text[],$25::jsonb,false
        )
        ON CONFLICT (candidate_id, workspace_revision) DO UPDATE SET
          source_ref = EXCLUDED.source_ref,
          source_revision = EXCLUDED.source_revision,
          row_ordinal = EXCLUDED.row_ordinal,
          row_identity_checksum = EXCLUDED.row_identity_checksum,
          registry_revision = EXCLUDED.registry_revision,
          feature_row_checksum = EXCLUDED.feature_row_checksum,
          ontology_classes = EXCLUDED.ontology_classes,
          ast_observation_kinds = EXCLUDED.ast_observation_kinds,
          langextract_classes = EXCLUDED.langextract_classes,
          tags = EXCLUDED.tags,
          pagerank = EXCLUDED.pagerank,
          ppr = EXCLUDED.ppr,
          graph_degree = EXCLUDED.graph_degree,
          kmeans_cluster = EXCLUDED.kmeans_cluster,
          som_cell = EXCLUDED.som_cell,
          community_id = EXCLUDED.community_id,
          authority_weight = EXCLUDED.authority_weight,
          recency = EXCLUDED.recency,
          validation_passed = EXCLUDED.validation_passed,
          semantic_768 = EXCLUDED.semantic_768,
          embedding_revision = EXCLUDED.embedding_revision,
          observation_refs = EXCLUDED.observation_refs,
          feature_payload = EXCLUDED.feature_payload,
          updated_at = now()
      `, [
        row.candidate_id,
        row.workspace_revision,
        row.source_ref,
        row.source_revision,
        row.row_ordinal,
        row.row_identity_checksum,
        row.registry_revision,
        featureRowChecksum,
        suffixes(row, 'ontology_features', 'ontology.'),
        suffixes(row, 'ast_features', 'ast.'),
        suffixes(row, 'langextract_features', 'langextract.'),
        row.qdrant_tags,
        continuousValue(row, 'graph.pagerank'),
        continuousValue(row, 'graph.ppr'),
        continuousValue(row, 'graph.degree'),
        kmeans,
        categoricalValue(row, 'cluster.som'),
        categoricalValue(row, 'cluster.community'),
        continuousValue(row, 'context.authority'),
        continuousValue(row, 'context.recency'),
        binaryValue(row, 'context.validation_passed'),
        semantic === null ? null : vectorLiteral(semantic),
        embeddingRevision,
        row.observation_refs,
        JSON.stringify(row),
      ]);
      return row;
    },

    async findCandidates(input: {
      workspaceRevision: string;
      sourceRevision?: string;
      ontologyClasses?: string[];
      astObservationKinds?: string[];
      langextractClasses?: string[];
      tags?: string[];
      kmeansClusters?: number[];
      somCells?: string[];
      limit?: number;
    }): Promise<Array<{ candidate_id: string; row_ordinal: number; row_identity_checksum: string }>> {
      assertSchemaOptIn();
      const limit = Math.max(1, Math.min(input.limit ?? 200, 5000));
      const result = await pool.query<{ candidate_id: string; row_ordinal: string | number; row_identity_checksum: string }>(`
        SELECT candidate_id, row_ordinal, row_identity_checksum
        FROM atlas_observation_feature_rows
        WHERE workspace_revision = $1
          AND ($2::text IS NULL OR source_revision = $2)
          AND (cardinality($3::text[]) = 0 OR ontology_classes @> $3::text[])
          AND (cardinality($4::text[]) = 0 OR ast_observation_kinds @> $4::text[])
          AND (cardinality($5::text[]) = 0 OR langextract_classes @> $5::text[])
          AND (cardinality($6::text[]) = 0 OR tags @> $6::text[])
          AND (cardinality($7::integer[]) = 0 OR kmeans_cluster = ANY($7::integer[]))
          AND (cardinality($8::text[]) = 0 OR som_cell = ANY($8::text[]))
        ORDER BY row_ordinal
        LIMIT $9
      `, [
        input.workspaceRevision,
        input.sourceRevision ?? null,
        [...new Set(input.ontologyClasses ?? [])],
        [...new Set(input.astObservationKinds ?? [])],
        [...new Set(input.langextractClasses ?? [])],
        [...new Set(input.tags ?? [])],
        [...new Set(input.kmeansClusters ?? [])],
        [...new Set(input.somCells ?? [])],
        limit,
      ]);
      return result.rows.map((row) => ({
        candidate_id: row.candidate_id,
        row_ordinal: Number(row.row_ordinal),
        row_identity_checksum: row.row_identity_checksum,
      }));
    },

    async exactSemanticSearch(input: {
      workspaceRevision: string;
      semantic768: readonly number[];
      candidateIds?: string[];
      limit?: number;
    }): Promise<Array<{ candidate_id: string; distance: number }>> {
      assertSchemaOptIn();
      const limit = Math.max(1, Math.min(input.limit ?? 20, 500));
      const ids = [...new Set(input.candidateIds ?? [])];
      const result = await pool.query<{ candidate_id: string; distance: string | number }>(`
        SELECT candidate_id, semantic_768 <=> $1::vector AS distance
        FROM atlas_observation_feature_rows
        WHERE workspace_revision = $2
          AND semantic_768 IS NOT NULL
          AND (cardinality($3::text[]) = 0 OR candidate_id = ANY($3::text[]))
        ORDER BY semantic_768 <=> $1::vector
        LIMIT $4
      `, [vectorLiteral(input.semantic768), input.workspaceRevision, ids, limit]);
      return result.rows.map((row) => ({ candidate_id: row.candidate_id, distance: Number(row.distance) }));
    },
  };
}
