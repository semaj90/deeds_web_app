import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  integer,
  real,
  jsonb,
  timestamp,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';

/**
 * ORF-2 exact metadata/filter materialization.
 *
 * No pgvector ANN index lives here by default. Semantic ANN remains a Qdrant
 * executor and bounded exact semantic remains cuVS/optional pgvector exact.
 */
export const atlasObservationFeatureRows = pgTable(
  'atlas_observation_feature_rows',
  {
    packetKey: text('packet_key').notNull(),
    featureRevision: text('feature_revision').notNull(),
    sourceRef: text('source_ref').notNull(),
    sourceVersionReceiptId: text('source_version_receipt_id'),
    workspaceRevision: integer('workspace_revision'),
    representationId: text('representation_id'),
    representationRevision: text('representation_revision'),
    treeNodeId: text('tree_node_id'),

    ontologyClasses: text('ontology_classes').array().notNull().default(sql`'{}'::text[]`),
    astObservationKinds: text('ast_observation_kinds').array().notNull().default(sql`'{}'::text[]`),
    langextractClasses: text('langextract_classes').array().notNull().default(sql`'{}'::text[]`),
    flattenedTags: text('flattened_tags').array().notNull().default(sql`'{}'::text[]`),

    ontologyMask: jsonb('ontology_mask').notNull(),
    astPatternMask: jsonb('ast_pattern_mask').notNull(),
    structuralFlags: jsonb('structural_flags').notNull(),
    evidenceRefs: text('evidence_refs').array().notNull().default(sql`'{}'::text[]`),

    kmeansClusterId: integer('kmeans_cluster_id'),
    somRow: integer('som_row'),
    somCol: integer('som_col'),
    communityId: text('community_id'),
    pagerank: real('pagerank'),
    personalizedPagerank: real('personalized_pagerank'),

    producerRevision: text('producer_revision').notNull(),
    inputDigest: text('input_digest').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({
      name: 'atlas_observation_feature_rows_pk',
      columns: [table.packetKey, table.featureRevision],
    }),
    sourceRefIdx: index('atlas_observation_feature_rows_source_ref_idx').on(table.sourceRef),
    workspaceFeatureIdx: index('atlas_observation_feature_rows_workspace_feature_idx').on(
      table.workspaceRevision,
      table.featureRevision,
    ),
    representationIdx: index('atlas_observation_feature_rows_representation_idx').on(
      table.representationId,
      table.representationRevision,
    ),
    treeNodeIdx: index('atlas_observation_feature_rows_tree_node_idx').on(table.treeNodeId),
    kmeansIdx: index('atlas_observation_feature_rows_kmeans_idx').on(table.kmeansClusterId),
    somIdx: index('atlas_observation_feature_rows_som_idx').on(table.somRow, table.somCol),
    communityIdx: index('atlas_observation_feature_rows_community_idx').on(table.communityId),
    ontologyGin: index('atlas_observation_feature_rows_ontology_gin').using('gin', table.ontologyClasses),
    astGin: index('atlas_observation_feature_rows_ast_gin').using('gin', table.astObservationKinds),
    extractGin: index('atlas_observation_feature_rows_extract_gin').using('gin', table.langextractClasses),
    tagsGin: index('atlas_observation_feature_rows_tags_gin').using('gin', table.flattenedTags),
  }),
);
