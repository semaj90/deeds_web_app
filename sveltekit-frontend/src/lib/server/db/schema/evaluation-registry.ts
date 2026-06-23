import { pgTable, bigserial, text, integer, real, boolean, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

// Task-Function Effectiveness Registry
export const taskFunctionEvals = pgTable('task_function_evals', {
  id: bigserial('id').primaryKey(),

  // Task Identity
  taskId: text('task_id').notNull(),
  storyId: text('story_id').notNull(),

  // Function Being Tested
  functionName: text('function_name').notNull(),
  functionCategory: text('function_category').notNull(),  // 'retrieval' | 'inference' | 'clustering' | 'validation'

  // Execution Context
  inputShape: text('input_shape').notNull(),
  inputCount: integer('input_count'),
  outputShape: text('output_shape'),
  outputCount: integer('output_count'),

  // Performance
  latencyMs: integer('latency_ms'),
  throughputItemsPerSec: real('throughput_items_per_sec'),
  memoryPeakMb: integer('memory_peak_mb'),

  // Correctness
  accuracy: real('accuracy'),
  matchesExpected: boolean('matches_expected'),
  errorRate: real('error_rate'),

  // Quality Metrics
  confidence: real('confidence'),
  repeatScore: real('repeat_score'),

  // Metadata
  metadata: jsonb('metadata').default({}),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  idxTaskId: index('idx_task_function_evals_task_id').on(table.taskId),
  idxFunction: index('idx_task_function_evals_function').on(table.functionName),
  idxCategory: index('idx_task_function_evals_category').on(table.functionCategory),
  idxConfidence: index('idx_task_function_evals_confidence').on(table.confidence),
}));

export type TaskFunctionEval = typeof taskFunctionEvals.$inferSelect;
export type NewTaskFunctionEval = typeof taskFunctionEvals.$inferInsert;

// Domain-Function Mapping
export const domainFunctionMapping = pgTable('domain_function_mapping', {
  id: bigserial('id').primaryKey(),

  // Domain Identification
  domain: text('domain').notNull(),
  problemType: text('problem_type').notNull(),

  // Optimal Function
  functionName: text('function_name').notNull(),
  functionCategory: text('function_category').notNull(),

  // Ranking
  rank: integer('rank'),
  confidence: real('confidence'),
  reasoning: text('reasoning'),

  // Performance Baseline
  expectedLatencyMs: integer('expected_latency_ms'),
  expectedThroughputItemsPerSec: real('expected_throughput_items_per_sec'),
  expectedAccuracy: real('expected_accuracy'),

  // Alternative Paths
  alternatives: text('alternatives').array(),

  metadata: jsonb('metadata').default({}),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  idxDomain: index('idx_domain_function_mapping_domain').on(table.domain),
  idxProblem: index('idx_domain_function_mapping_problem').on(table.problemType),
  idxRank: index('idx_domain_function_mapping_rank').on(table.rank),
}));

export type DomainFunctionMapping = typeof domainFunctionMapping.$inferSelect;
export type NewDomainFunctionMapping = typeof domainFunctionMapping.$inferInsert;

// Path Selection History
export const pathSelectionHistory = pgTable('path_selection_history', {
  id: bigserial('id').primaryKey(),

  // Decision Context
  taskId: text('task_id').notNull(),
  storyId: text('story_id').notNull(),
  agent: text('agent').notNull(),

  // The Path Taken
  domain: text('domain').notNull(),
  problemType: text('problem_type').notNull(),
  selectedFunction: text('selected_function').notNull(),
  selectedRank: integer('selected_rank'),

  // Result
  success: boolean('success'),
  latencyMs: integer('latency_ms'),
  accuracy: real('accuracy'),
  outputQuality: real('output_quality'),

  // Learning
  shouldRepeat: boolean('should_repeat'),
  reasonIfNot: text('reason_if_not'),

  metadata: jsonb('metadata').default({}),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  idxTaskId: index('idx_path_selection_task_id').on(table.taskId),
  idxDomain: index('idx_path_selection_domain').on(table.domain),
  idxSuccess: index('idx_path_selection_success').on(table.success),
  idxShouldRepeat: index('idx_path_selection_should_repeat').on(table.shouldRepeat),
}));

export type PathSelectionHistory = typeof pathSelectionHistory.$inferSelect;
export type NewPathSelectionHistory = typeof pathSelectionHistory.$inferInsert;

// Schema Matching Registry
export const schemaMatchRegistry = pgTable('schema_match_registry', {
  id: bigserial('id').primaryKey(),

  // Entity Being Matched
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),

  // Redis KMeans Topology Match
  kmeansClusterId: integer('kmeans_cluster_id'),
  somRow: integer('som_row'),
  somCol: integer('som_col'),
  topologyConfidence: real('topology_confidence'),

  // Postgres Canonical Match
  canonicalTable: text('canonical_table'),
  canonicalRowId: text('canonical_row_id'),

  // Qdrant Mirror Match
  qdrantCollection: text('qdrant_collection'),
  qdrantPointId: text('qdrant_point_id'),

  // CouchDB Source Match
  couchdbDocId: text('couchdb_doc_id'),

  // Traversal Metadata
  traversalCost: integer('traversal_cost'),
  isOptimal: boolean('is_optimal'),
  alternativePaths: integer('alternative_paths'),

  metadata: jsonb('metadata').default({}),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  idxEntity: index('idx_schema_match_entity').on(table.entityType, table.entityId),
  idxKmeans: index('idx_schema_match_kmeans').on(table.kmeansClusterId),
  idxCanonical: index('idx_schema_match_canonical').on(table.canonicalTable, table.canonicalRowId),
  idxQdrant: index('idx_schema_match_qdrant').on(table.qdrantCollection, table.qdrantPointId),
  idxCouchdb: index('idx_schema_match_couchdb').on(table.couchdbDocId),
}));

export type SchemaMatchRegistry = typeof schemaMatchRegistry.$inferSelect;
export type NewSchemaMatchRegistry = typeof schemaMatchRegistry.$inferInsert;

// GAN Validation Registry
export const ganValidationRegistry = pgTable('gan_validation_registry', {
  id: bigserial('id').primaryKey(),

  // Feature Being Validated
  featureName: text('feature_name').notNull(),
  featureVersion: text('feature_version'),
  featureCategory: text('feature_category'),

  // Validation Test
  testId: text('test_id').notNull(),
  testInput: jsonb('test_input'),
  expectedOutput: jsonb('expected_output'),
  actualOutput: jsonb('actual_output'),

  // Scoring
  ganScore: real('gan_score'),
  matchesExpected: boolean('matches_expected'),
  qualityPasses: boolean('quality_passes'),

  // Actionability
  isProductionReady: boolean('is_production_ready'),
  blockingIssues: text('blocking_issues').array(),
  recommendedActions: text('recommended_actions').array(),

  metadata: jsonb('metadata').default({}),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  idxFeature: index('idx_gan_validation_feature').on(table.featureName),
  idxCategory: index('idx_gan_validation_category').on(table.featureCategory),
  idxReady: index('idx_gan_validation_ready').on(table.isProductionReady),
  idxScore: index('idx_gan_validation_score').on(table.ganScore),
}));

export type GanValidationRegistry = typeof ganValidationRegistry.$inferSelect;
export type NewGanValidationRegistry = typeof ganValidationRegistry.$inferInsert;
