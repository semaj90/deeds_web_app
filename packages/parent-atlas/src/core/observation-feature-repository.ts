import type { Pool } from 'pg';
import {
  observationFeatureChecksum,
  observationFeatureRowSchema,
  type ObservationFeatureRowV1,
} from './observation-feature-compiler.js';

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
  schema?: 'PACKET_KEY_ORF_V1';
};

export function createObservationFeatureRepository(pool: Pool, options: ObservationFeatureRepositoryOptions = {}) {
  void options;
  return {
    async upsertFeatureRow(input: {
      row: ObservationFeatureRowV1;
      packetKey: string;
      featureRevision: string;
      sourceVersionReceiptId?: string | null;
      representationId?: string | null;
      representationRevision?: string | null;
      treeNodeId?: string | null;
      producerRevision?: string;
    }): Promise<ObservationFeatureRowV1> {
      const row = observationFeatureRowSchema.parse(input.row);
      const featureRowChecksum = observationFeatureChecksum(row);
      const kmeansRaw = categoricalValue(row, 'cluster.kmeans');
      const kmeans = kmeansRaw === null ? null : Number(kmeansRaw);
      if (kmeans !== null && (!Number.isInteger(kmeans) || kmeans < 0)) {
        throw new Error(`OBSERVATION_FEATURE_KMEANS_INVALID:${kmeansRaw}`);
      }

      await pool.query(`
        INSERT INTO atlas_observation_feature_rows (
          packet_key, feature_revision, source_ref, source_version_receipt_id,
          workspace_revision, representation_id, representation_revision, tree_node_id,
          ontology_classes, ast_observation_kinds, langextract_classes, flattened_tags,
          ontology_mask, ast_pattern_mask, structural_flags, evidence_refs,
          kmeans_cluster_id, som_row, som_col, community_id,
          producer_revision, input_digest, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9::text[],$10::text[],$11::text[],$12::text[],
          $13::jsonb,$14::jsonb,$15::jsonb,$16::text[],$17,$18,$19,$20,$21,$22,now()
        )
        ON CONFLICT (packet_key, feature_revision) DO UPDATE SET
          source_ref = EXCLUDED.source_ref,
          ontology_classes = EXCLUDED.ontology_classes,
          ast_observation_kinds = EXCLUDED.ast_observation_kinds,
          langextract_classes = EXCLUDED.langextract_classes,
          flattened_tags = EXCLUDED.flattened_tags,
          ontology_mask = EXCLUDED.ontology_mask,
          ast_pattern_mask = EXCLUDED.ast_pattern_mask,
          structural_flags = EXCLUDED.structural_flags,
          evidence_refs = EXCLUDED.evidence_refs,
          kmeans_cluster_id = EXCLUDED.kmeans_cluster_id,
          som_row = EXCLUDED.som_row,
          som_col = EXCLUDED.som_col,
          community_id = EXCLUDED.community_id,
          producer_revision = EXCLUDED.producer_revision,
          input_digest = EXCLUDED.input_digest,
          updated_at = now()
      `, [
        input.packetKey,
        input.featureRevision,
        row.source_ref,
        input.sourceVersionReceiptId ?? null,
        Number.isInteger(Number(row.workspace_revision)) ? Number(row.workspace_revision) : null,
        input.representationId ?? null,
        input.representationRevision ?? null,
        input.treeNodeId ?? null,
        suffixes(row, 'ontology_features', 'ontology.'),
        suffixes(row, 'ast_features', 'ast.'),
        suffixes(row, 'langextract_features', 'langextract.'),
        row.qdrant_tags,
        JSON.stringify(Object.fromEntries(row.ontology_features.map((feature) => [feature.feature_id, feature.binary_value]))),
        JSON.stringify(Object.fromEntries(row.ast_features.map((feature) => [feature.feature_id, feature.binary_value]))),
        JSON.stringify({ hasFunction: row.ast_features.some((feature) => feature.feature_id.includes('function')) }),
        row.observation_refs,
        kmeans,
        categoricalValue(row, 'cluster.som')?.split(':')[0] ? Number(categoricalValue(row, 'cluster.som')?.split(':')[0]) || null : null,
        categoricalValue(row, 'cluster.som')?.split(':')[1] ? Number(categoricalValue(row, 'cluster.som')?.split(':')[1]) || null : null,
        categoricalValue(row, 'cluster.community'),
        input.producerRevision ?? 'parent-atlas-observation-feature-repository-v2',
        featureRowChecksum,
      ]);
      return row;
    },

    async findCandidates(input: {
      featureRevision: string;
      workspaceRevision?: string;
      ontologyClasses?: string[];
      astObservationKinds?: string[];
      langextractClasses?: string[];
      tags?: string[];
      kmeansClusters?: number[];
      somCells?: string[];
      limit?: number;
    }): Promise<Array<{ packet_key: string; feature_revision: string; source_ref: string }>> {
      const limit = Math.max(1, Math.min(input.limit ?? 200, 5000));
      const workspaceRevision = input.workspaceRevision && /^\d+$/.test(input.workspaceRevision)
        ? Number(input.workspaceRevision)
        : null;
      const result = await pool.query<{ packet_key: string; feature_revision: string; source_ref: string }>(`
        SELECT packet_key, feature_revision, source_ref
        FROM atlas_observation_feature_rows
        WHERE feature_revision = $1
          AND ($2::integer IS NULL OR workspace_revision = $2)
          AND (cardinality($3::text[]) = 0 OR ontology_classes @> $3::text[])
          AND (cardinality($4::text[]) = 0 OR ast_observation_kinds @> $4::text[])
          AND (cardinality($5::text[]) = 0 OR langextract_classes @> $5::text[])
          AND (cardinality($6::text[]) = 0 OR flattened_tags @> $6::text[])
          AND (cardinality($7::integer[]) = 0 OR kmeans_cluster_id = ANY($7::integer[]))
          AND (cardinality($8::text[]) = 0 OR concat(som_row, ':', som_col) = ANY($8::text[]))
        ORDER BY packet_key
        LIMIT $9
      `, [
        input.featureRevision,
        workspaceRevision,
        [...new Set(input.ontologyClasses ?? [])],
        [...new Set(input.astObservationKinds ?? [])],
        [...new Set(input.langextractClasses ?? [])],
        [...new Set(input.tags ?? [])],
        [...new Set(input.kmeansClusters ?? [])],
        [...new Set(input.somCells ?? [])],
        limit,
      ]);
      return result.rows.map((row) => ({
        packet_key: row.packet_key,
        feature_revision: row.feature_revision,
        source_ref: row.source_ref,
      }));
    },

    async exactSemanticSearch(): Promise<never> {
      throw new Error('OBSERVATION_FEATURE_SEMANTIC_SEARCH_OWNED_BY_CANONICAL_VECTOR_LANE');
    },
  };
}
