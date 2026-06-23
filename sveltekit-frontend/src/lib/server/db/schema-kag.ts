/**
 * KAG (Knowledge-Augmented Generation) Schema
 *
 * Domain knowledge layer for 4D manifold routing:
 *   X-axis: semantic (768-dim embeddings)
 *   Y-axis: graph (dependency paths)
 *   Z-axis: topology (SOM cells)
 *   W-axis: authority (PageRank)
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
  jsonb,
  index,
  unique,
  array,
  boolean,
  integer,
} from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core';

// ============================================================================
// TABLE: kag_knowledge_tuples
// ============================================================================

export const kagKnowledgeTuples = pgTable(
  'kag_knowledge_tuples',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tupleId: varchar('tuple_id', { length: 256 }).unique().notNull(),
    domainClass: varchar('domain_class', { length: 50 }).notNull(),
    concept: varchar('concept', { length: 200 }).notNull(),
    description: text('description').notNull(),
    sourceType: varchar('source_type', { length: 20 }).notNull(), // ldr, codebase, graph, manual
    sourceRef: varchar('source_ref', { length: 256 }),
    confidence: numeric('confidence', { precision: 3, scale: 2 }).notNull(),
    semanticEmbedding: vector('semantic_embedding', { dimensions: 768 }),

    // Ontology hierarchy
    parentConcept: varchar('parent_concept', { length: 200 }),
    childConcepts: array(varchar('child_concepts')),

    // Examples
    codeExamples: array(text('code_examples')),
    queryExamples: array(text('query_examples')),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    refreshedAt: timestamp('refreshed_at', { withTimezone: true }).defaultNow().notNull(),

    // Metadata
    metadata: jsonb('metadata').default('{}'),
  },
  (table) => [
    index('idx_kag_domain_class').on(table.domainClass),
    index('idx_kag_concept').on(table.concept),
    index('idx_kag_source_ref').on(table.sourceRef),
    index('idx_kag_confidence').on(table.confidence),
    index('idx_kag_parent_concept').on(table.parentConcept),
  ]
);

export type KagKnowledgeTuple = typeof kagKnowledgeTuples.$inferSelect;
export type NewKagKnowledgeTuple = typeof kagKnowledgeTuples.$inferInsert;

// ============================================================================
// TABLE: kag_domain_taxonomy
// ============================================================================

export const kagDomainTaxonomy = pgTable(
  'kag_domain_taxonomy',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    domainClass: varchar('domain_class', { length: 50 }).unique().notNull(),
    parentDomain: varchar('parent_domain', { length: 50 }),
    description: text('description'),
    exampleConcepts: array(varchar('example_concepts')),

    // Routing hints for 4D manifold
    preferXAxis: boolean('prefer_x_axis').default(false),
    preferYAxis: boolean('prefer_y_axis').default(false),
    preferZAxis: boolean('prefer_z_axis').default(false),
    preferWAxis: boolean('prefer_w_axis').default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_domain_parent').on(table.parentDomain),
  ]
);

export type KagDomainTaxonomy = typeof kagDomainTaxonomy.$inferSelect;
export type NewKagDomainTaxonomy = typeof kagDomainTaxonomy.$inferInsert;

// ============================================================================
// TABLE: kag_concept_relationships
// ============================================================================

export const kagConceptRelationships = pgTable(
  'kag_concept_relationships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceConcept: varchar('source_concept', { length: 200 }).notNull(),
    targetConcept: varchar('target_concept', { length: 200 }).notNull(),
    relationshipType: varchar('relationship_type', { length: 50 }).notNull(),
    confidence: numeric('confidence', { precision: 3, scale: 2 }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_concept_source').on(table.sourceConcept),
    index('idx_concept_target').on(table.targetConcept),
    index('idx_concept_type').on(table.relationshipType),
  ]
);

export type KagConceptRelationship = typeof kagConceptRelationships.$inferSelect;
export type NewKagConceptRelationship = typeof kagConceptRelationships.$inferInsert;

// ============================================================================
// TABLE: kag_ldr_tasks
// ============================================================================

export const kagLdrTasks = pgTable(
  'kag_ldr_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: varchar('task_id', { length: 128 }).unique().notNull(),
    query: varchar('query', { length: 500 }).notNull(),
    domainTarget: varchar('domain_target', { length: 50 }),
    status: varchar('status', { length: 20 }).notNull(),

    // Results
    summary: text('summary'),
    sources: jsonb('sources').default('{}'),
    extractedTuples: array(uuid('extracted_tuples')),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    // Metadata
    metadata: jsonb('metadata').default('{}'),
  },
  (table) => [
    index('idx_ldr_status').on(table.status),
    index('idx_ldr_domain').on(table.domainTarget),
    index('idx_ldr_created').on(table.createdAt),
  ]
);

export type KagLdrTask = typeof kagLdrTasks.$inferSelect;
export type NewKagLdrTask = typeof kagLdrTasks.$inferInsert;

// ============================================================================
// TABLE: kag_fusion_lane_metrics
// ============================================================================

export const kagFusionLaneMetrics = pgTable(
  'kag_fusion_lane_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    queryHash: varchar('query_hash', { length: 32 }).notNull(),
    laneName: varchar('lane_name', { length: 50 }).notNull(),

    // Performance
    latencyMs: integer('latency_ms'),
    candidateCount: integer('candidate_count'),
    hitCount: integer('hit_count'),
    precision: numeric('precision', { precision: 3, scale: 2 }),
    recall: numeric('recall', { precision: 3, scale: 2 }),

    // Axis values
    xCosine: numeric('x_cosine', { precision: 4, scale: 3 }),
    yGraph: integer('y_graph'),
    zSom: numeric('z_som', { precision: 4, scale: 2 }),
    wAuthority: numeric('w_authority', { precision: 4, scale: 3 }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_fusion_lane').on(table.laneName),
    index('idx_fusion_created').on(table.createdAt),
  ]
);

export type KagFusionLaneMetric = typeof kagFusionLaneMetrics.$inferSelect;
export type NewKagFusionLaneMetric = typeof kagFusionLaneMetrics.$inferInsert;

// ============================================================================
// Helper types & validators
// ============================================================================

export const DOMAIN_CLASSES = [
  'topology',
  'auth',
  'infra',
  'legal',
  'analysis',
  'retrieval',
] as const;

export const SOURCE_TYPES = ['ldr', 'codebase', 'graph', 'manual'] as const;

export const RELATIONSHIP_TYPES = [
  'parent_of',
  'depends_on',
  'similar_to',
  'extends',
  'implements',
] as const;

export const LANE_NAMES = [
  'dense_semantic',
  'sparse_bm25',
  'graph_1hop',
  'graph_khop',
  'som_neighborhood',
  'authority_rank',
  'fusion_4d',
  'dag_shortest_path',
  'som_tricubic',
  'hybrid_sparse_dense',
] as const;