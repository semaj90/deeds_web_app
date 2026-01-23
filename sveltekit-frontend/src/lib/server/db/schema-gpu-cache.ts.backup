// Top imports (ensure these are present)
import {
    boolean,
    integer,
    jsonb,
    pgTable,
    real,
    serial,
    text,
    timestamp,
    uuid,
} from 'drizzle-orm/pg-core';
import { vector } from 'pgvector/drizzle-orm';

// ===============
// =============================================================
// CORE SHADER CACHE TABLES
// ============================================================================

/**
 * Primary shader cache entries with source code, compiled binaries, and metadata
 */
export const shaderCacheEntries = pgTable('shader_cache_entries', {
    id: uuid('id').defaultRandom().primaryKey(), // Core identification
    shaderKey: text('shader_key').notNull().unique(), // Human-readable cache key
    shaderHash: text('shader_hash').notNull().unique(), // Content hash for integrity
    shaderType: text('shader_type').notNull(), // 'vertex', 'fragment', 'compute', 'wgsl', 'glsl'
    // Source code and compilation
    sourceCode: text('source_code').notNull(), // Original WGSL/GLSL source
    compiledBinary: text('compiled_binary'), // Base64 encoded compiled binary (if supported)
    compilationLog: text('compilation_log'), // Compiler output/warnings
    compilationSuccess: boolean('compilation_success').default(false),
    // Semantic embeddings for similarity search
    sourceEmbedding: vector('source_embedding', { dimensions: 384 }), // nomic-embed-text
    semanticTags: text('semantic_tags').array().$type<string[]>().notNull(), // Array of semantic tags: e.g. ['legal-doc', 'timeline', 'evidence']
    // Legal workflow context
    legalContext: jsonb('legal_context').$type<Record<string, unknown> | null>(),
    // Performance metrics
    performanceMetrics: jsonb('performance_metrics').$type<Record<string, unknown> | null>(),
    // Reinforcement learning data
    reinforcementData: jsonb('reinforcement_data').$type<Record<string, unknown> | null>(),
    // Version and lifecycle
    version: integer('version').default(1),
    deprecated: boolean('deprecated').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
    // MinIO integration for large assets
    minioPath: text('minio_path'), // Optional path for large shader assets
    assetBundle: jsonb('asset_bundle').$type<Record<string, unknown> | null>(),
});

export const shaderUserPatterns = pgTable('shader_user_patterns', {
    id: serial('id').primaryKey(),
    // User and session context
    shaderId: uuid('shader_id').references(() => shaderCacheEntries.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    sessionId: text('session_id'),
    accessTimestamp: timestamp('access_timestamp', { withTimezone: true }).defaultNow(),
    timeOfDay: integer('time_of_day'), // hour of day (0-23)
    workflowStep: text('workflow_step'),
    loadLatencyMs: integer('load_latency_ms'),
    cacheHit: boolean('cache_hit'),
    preloadSuccessful: boolean('preload_successful'),
    userSatisfaction: real('user_satisfaction'), // -1 to 1
    // Contextual metadata
    documentContext: jsonb('document_context').$type<Record<string, unknown> | null>(),
    // Reinforcement learning features
    stateVector: vector('state_vector', { dimensions: 64 }), // Compressed workflow state
    actionVector: vector('action_vector', { dimensions: 32 }), // Action embedding
    reward: real('reward'), // Computed reward for this access
    reinforcement_data: jsonb('reinforcement_data').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const shaderPreloadRules = pgTable('shader_preload_rules', {
    id: serial('id').primaryKey(), // added primary key
    // ML model weights and thresholds
    modelWeights: vector('model_weights', { dimensions: 128 }),
    // Learned weights for specified ML model/algorithm
    confidence: real('confidence').notNull(), // 0-1 rule confidence
    ruleKey: text('rule_key').notNull().unique(),
    ruleName: text('rule_name').notNull(),
    ruleType: text('rule_type').notNull(), // 'sequential', 'conditional', 'temporal', 'similarity'
    // Condition matching
    triggerConditions: jsonb('trigger_conditions').$type<Record<string, unknown> | null>(),
    // Preload specifications
    preloadTargets: jsonb('preload_targets').$type<Record<string, unknown> | null>(),
    accuracy: real('accuracy').notNull(), // Historical accuracy
    // Performance metrics
    triggerCount: integer('trigger_count').default(0),
    successCount: integer('success_count').default(0),
    preloadSavingsMs: integer('preload_savings_ms').default(0),
    // Lifecycle
    active: boolean('active').default(true),
    learningRate: real('learning_rate').default(0.01),
    lastTriggered: timestamp('last_triggered', { withTimezone: true }),
    lastUpdated: timestamp('last_updated', { withTimezone: true }).defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const shaderDependencies = pgTable('shader_dependencies', {
    id: serial('id').primaryKey(),
    // Dependency relationship
    parentShaderId: uuid('parent_shader_id').references(() => shaderCacheEntries.id, {
        onDelete: 'cascade',
    }),
    childShaderId: uuid('child_shader_id').references(() => shaderCacheEntries.id, {
        onDelete: 'cascade',
    }),
    // Dependency metadata
    dependencyType: text('dependency_type').notNull(), // 'include', 'texture', 'uniform', 'buffer'
    dependencyStrength: real('dependency_strength'), // 0-1 how critical this dependency is
    loadOrder: integer('load_order'), // Relative load order
    // Performance impact
    parallelLoadSafe: boolean('parallel_load_safe').default(true),
    loadLatencyImpactMs: integer('load_latency_impact_ms'),
    // Usage statistics
    coUsageFrequency: real('co_usage_frequency'), // 0-1 how often used together
    lastCoUsed: timestamp('last_co_used', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Define valid status values as a union type
export type ShaderCompilationStatus =
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'cancelled';

/**
 * Validate ShaderCompilationStatus at runtime before insert/update.
 */
export function isValidShaderCompilationStatus(status: string): status is ShaderCompilationStatus {
    return ['pending', 'processing', 'completed', 'failed', 'cancelled'].includes(status);
}

export const shaderCompilationQueue = pgTable('shader_compilation_queue', {
    id: serial('id').primaryKey(), // Queue identification
    queueKey: text('queue_key').notNull().unique(),
    priority: text('priority').notNull(), // 'immediate', 'high', 'normal', 'low', 'preload'
    status: text('status').notNull().$type<ShaderCompilationStatus>(), // restrict to valid status values
    // Shader information
    shaderKey: text('shader_key').notNull(),
    sourceCode: text('source_code').notNull(),
    shaderType: text('shader_type').notNull(),
    targetGPU: text('target_gpu'), // GPU-specific compilation
    // Processing context
    userId: text('user_id'),
    sessionId: text('session_id'),
    workflowContext: jsonb('workflow_context').$type<Record<string, unknown> | null>(),
    // Queue timing
    queuedAt: timestamp('queued_at', { withTimezone: true }).defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    // Processing results
    compilationResult: jsonb('compilation_result').$type<Record<string, unknown> | null>(),
    // Retry logic
    retryCount: integer('retry_count').default(0),
    maxRetries: integer('max_retries').default(3),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

/**
 * shaderRecommendationsView is a regular table (not a database view or materialized view).
 * This is the single, correct declaration.
 */
export const shaderRecommendationsView = pgTable('shader_recommendations_view', {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    shaderKey: text('shader_key').notNull(),
    recommendationType: text('recommendation_type').notNull(), // 'similar', 'next', 'popular', 'optimal'
    confidence: real('confidence').notNull(),
    reasoning: text('reasoning'), // Recommendation context
    baseContext: jsonb('base_context').$type<Record<string, unknown> | null>(), // Context that triggered this recommendation
    expectedBenefit: real('expected_benefit'), // Expected performance/satisfaction improvement
    // Metadata
    computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    // Performance tracking
    timesRecommended: integer('times_recommended').default(0),
    timesAccepted: integer('times_accepted').default(0),
    averageUserSatisfaction: real('average_user_satisfaction'),
});

// ============================================================================
// EXPORT TYPES FOR TYPESCRIPT
// ============================================================================
export type ShaderCacheEntry = typeof shaderCacheEntries.$inferSelect;
export type InsertShaderCacheEntry = typeof shaderCacheEntries.$inferInsert;
export type ShaderUserPattern = typeof shaderUserPatterns.$inferSelect;
export type InsertShaderUserPattern = typeof shaderUserPatterns.$inferInsert;
export type ShaderPreloadRule = typeof shaderPreloadRules.$inferSelect;
export type InsertShaderPreloadRule = typeof shaderPreloadRules.$inferInsert;
export type ShaderDependency = typeof shaderDependencies.$inferSelect;
export type InsertShaderDependency = typeof shaderDependencies.$inferInsert;
export type ShaderCompilationQueue = typeof shaderCompilationQueue.$inferSelect;
export type InsertShaderCompilationQueue = typeof shaderCompilationQueue.$inferInsert;
export type ShaderRecommendation = typeof shaderRecommendationsView.$inferSelect;
export type InsertShaderRecommendation = typeof shaderRecommendationsView.$inferInsert;
