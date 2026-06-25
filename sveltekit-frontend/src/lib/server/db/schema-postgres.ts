// Updated PostgreSQL schema based on database introspection // This schema matches the actual database structure (drizzle/schema.ts)
import { sql } from 'drizzle-orm';
import {
    bigint,
    boolean,
    date,
    foreignKey,
    index,
    integer,
    jsonb,
    numeric,
    pgEnum,
    pgTable,
    primaryKey,
    real,
    serial,
    text,
    timestamp,
    unique,
    uuid,
    varchar,
    vector,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm/relations';

// Re-export chatMessages and toolTraces from schema-chat for broader availability
export { chatMessages, toolTraces, type ChatMessage, type NewChatMessage, type ToolTrace, type NewToolTrace } from './schema-chat';

// === ENUMS FOR LEGAL AI APPLICATION ===
export const userRoleEnum = pgEnum('user_role', ['prosecutor',
 'detective',
 'admin',
 'analyst',
 'paralegal',
 'investigator',
 'viewer',
 'user']);
export const caseStatusEnum = pgEnum('case_status', ['open',
 'in_progress',
 'pending_review',
 'closed',
 'archived',
 'active',
 'pending',
 'under_review']);
export const casePriorityEnum = pgEnum('case_priority', ['low',
 'medium',
 'high',
 'critical',
 'urgent']);
export const evidenceTypeEnum = pgEnum('evidence_type', [
 'document',
 'photo',
 'video',
 'audio',
 'physical',
 'digital',
 'witness_statement',
 'forensic',
 'documentary',
 'testimonial',
 'demonstrative',
 'real',
 'circumstantial',
 'hearsay',
 'expert',
 'scientific']);
export const relationTypeEnum = pgEnum('relation_type', ['supports',
 'contradicts',
 'same_person',
 'timeline',
 'chain_of_custody',
 'corroborates',
 'alibi',
 'motive',
 'opportunity',
 'means',
 'witness_statement',
 'physical_evidence',
 'digital_evidence',
 'circumstantial',
 'direct_evidence',
 'hearsay',
 'privileged',
 'inadmissible']);

export const threatLevelEnum = pgEnum('threat_level', ['low', 'medium', 'high', 'critical']);
export const patchStatusEnum = pgEnum('patch_status', ['suggested', 'applied', 'rejected']);
export const documentStatusEnum = pgEnum('document_status', ['queued', 'processing', 'completed', 'failed']);
export const documentTypeEnum = pgEnum('document_type', ['pleading', 'motion', 'brief', 'contract', 'evidence', 'correspondence', 'court_order', 'transcript', 'affidavit', 'other']);
export const summaryTypeEnum = pgEnum('summary_type', ['brief', 'detailed', 'executive', 'technical']);
export const activityStatusEnum = pgEnum('activity_status', ['pending', 'in_progress', 'completed', 'cancelled']);
export const verificationStatusEnum = pgEnum('verification_status', ['pending', 'verified', 'failed', 'rejected']);
export const reportStatusEnum = pgEnum('report_status', ['draft', 'pending', 'completed', 'published']);
export const caseRiskLevelEnum = pgEnum('case_risk_level', ['low', 'medium', 'high', 'critical']);

// === TABLES FOR LEGAL AI APPLICATION ===

export const users = pgTable('users', {
  id: serial('id').primaryKey().notNull(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('hashed_password', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }), // Legacy field - use firstName/lastName instead
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  role: userRoleEnum('role').notNull().default('prosecutor'),
  isActive: boolean('is_active').notNull().default(true),
  avatarUrl: varchar('avatar_url', { length: 2048 }),
  hasCompletedOnboarding: boolean('has_completed_onboarding').notNull().default(false),
  onboardingStep: integer('onboarding_step').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});
export const sessions = pgTable('sessions',
 {
 id: text('id').primaryKey().notNull(),
 userId: integer('user_id').notNull(),
 expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
 },
	(table) => ({
 foreignKeys: [
 foreignKey({
 columns: [table.userId],
 foreignColumns: [users.id],
 name: 'sessions_user_id_users_id_fk',
 }).onDelete('cascade')],
 })
);
export const emailVerificationCodes = pgTable('email_verification_codes',
 {
 id: serial('id').primaryKey().notNull(), // Assuming serial ID
 userId: integer('user_id').notNull(),
 email: varchar('email', { length: 255 }).notNull(),
 code: varchar('code', { length: 8 }).notNull(),
 expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
 },
	(table) => ({
 foreignKeys: [
 foreignKey({
 columns: [table.userId],
 foreignColumns: [users.id],
 name: `email_verification_codes_user_id_users_id_fk`,
 }).onDelete('cascade')],
 uniqueConstraints: [unique('email_verification_codes_user_id_unique').on(table.userId)],
 })
);
export const passwordResetTokens = pgTable('password_reset_tokens',
 {
 tokenHash: varchar('token_hash', { length: 63 }).primaryKey().notNull(), // Assuming tokenHash is primary key
 userId: integer('user_id').notNull(), // FK to users.id (integer, DB migrated 2026-05-10)
 expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
 },
	(table) => ({
 foreignKeys: [
 foreignKey({
 columns: [table.userId],
 foreignColumns: [users.id],
 name: `password_reset_tokens_user_id_users_id_fk`,
 }).onDelete('cascade')],
 })
);

// === CASE MANAGEMENT ===
export const cases = pgTable('cases',
 {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(),
 title: varchar('title', { length: 255 }).notNull(),
 description: text('description'),
 caseNumber: varchar('case_number', { length: 100 }),
 priority: casePriorityEnum('priority').notNull(), // Using enum directly
 practiceArea: varchar('practice_area', { length: 100 }),
 jurisdiction: varchar('jurisdiction', { length: 100 }),
 court: varchar('court', { length: 200 }),
 clientName: varchar('client_name', { length: 200 }),
 opposingParty: varchar('opposing_party', { length: 200 }),
 userId: integer('user_id'), // owner of the case (FK to users.id integer; DB migrated 2026-05-10)
 assignedAttorney: integer('assigned_attorney'),
 filingDate: timestamp('filing_date', { withTimezone: true }),
 dueDate: timestamp('due_date', { withTimezone: true }),
 closedDate: timestamp('closed_date', { withTimezone: true }),
 qdrantId: uuid('qdrant_id'),
 qdrantCollection: varchar('qdrant_collection', { length: 100 }),
 metadata: jsonb('metadata'),
 createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
 .notNull()
 .defaultNow(),
 updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
 .notNull()
 .defaultNow(),
 status: caseStatusEnum('status').notNull(), // Using enum directly
 },
	(table) => ({
 indexes: [
 index('idx_cases_created_at').on(table.createdAt),
 index('idx_cases_status_priority').on(table.status, table.priority),
 index('idx_cases_status_priority_created').on(table.status, table.priority, table.createdAt)],
 foreignKeys: [
 // Added foreign key for userId
 foreignKey({
 columns: [table.userId],
 foreignColumns: [users.id],
 name: 'cases_user_id_users_id_fk',
 }).onDelete('set null')],
 })
);

// === CRIMINAL RECORDS ===
export const criminals = pgTable('criminals',
 {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(),
 firstName: varchar('first_name', { length: 100 }).notNull(),
 lastName: varchar('last_name', { length: 100 }).notNull(),
 middleName: varchar('middle_name', { length: 100 }),
 aliases: jsonb('aliases').default([]).notNull().$type<string[]>(),
 dateOfBirth: timestamp('date_of_birth', { mode: 'string' }),
 placeOfBirth: varchar('place_of_birth', { length: 200 }),
 address: text('address'),
 phone: varchar('phone', { length: 20 }),
 email: varchar('email', { length: 255 }),
 ssn: varchar('ssn', { length: 11 }),
 driversLicense: varchar('drivers_license', { length: 50 }),
 height: integer('height'),
 weight: integer('weight'),
 eyeColor: varchar('eye_color', { length: 20 }),
 hairColor: varchar('hair_color', { length: 20 }),
 distinguishingMarks: text('distinguishing_marks'),
 photoUrl: text('photo_url'),
 fingerprints: jsonb('fingerprints').default({}).notNull(),
 threatLevel: threatLevelEnum('threat_level').default('low').notNull(),
 status: varchar('status', { length: 20 }).default('active').notNull(),
 notes: text('notes'),
 aiSummary: text('ai_summary'),
 aiTags: jsonb('ai_tags').default([]).notNull().$type<string[]>(),
 createdBy: integer('created_by'), // Foreign key to users.id
 createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
 updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
 },
	(table) => ({
 indexes: [
 index('criminals_first_name_idx').on(table.firstName),
 index('criminals_last_name_idx').on(table.lastName),
 index('criminals_threat_level_idx').on(table.threatLevel),
 index('criminals_status_idx').on(table.status),
 index('criminals_created_by_idx').on(table.createdBy),
 index('criminals_ssn_idx').on(table.ssn)],
 foreignKeys: [
 // Added foreign key for createdBy
 foreignKey({
 columns: [table.createdBy],
 foreignColumns: [users.id],
 name: 'criminals_created_by_users_id_fk',
 }).onDelete('set null')],
 })
);

// === EVIDENCE MANAGEMENT ===
export const evidence = pgTable('evidence', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(),
 caseId: uuid('case_id'), // Foreign key to cases.id
 userId: integer('user_id'), // Foreign key to users.id - owner of the evidence
 title: varchar('title', { length: 255 }).notNull(),
 description: text('description'),
 // OLD COLUMNS (preserve existing data)
 filePath: varchar('file_path', { length: 500 }),
 fileType: varchar('file_type', { length: 100 }),
 fileSize: bigint('file_size', { mode: 'number' }),
 hash: varchar('hash', { length: 255 }),
 source: varchar('source', { length: 255 }),
 dateObtained: timestamp('date_obtained', { withTimezone: true }),
 chainOfCustody: jsonb('chain_of_custody'),
 metadata: jsonb('metadata'),
 createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
 // NEW COLUMNS (for enhanced functionality - graceful fallback if null)
 criminalId: uuid('criminal_id'), // Foreign key to criminals.id
 evidenceType: evidenceTypeEnum('evidence_type'), // Optional enum
 subType: varchar('sub_type', { length: 50 }),
 fileUrl: text('file_url'), // S3/MinIO URL
 fileName: varchar('file_name', { length: 255 }),
 canvasPosition: jsonb('canvas_position').default({}),
 uploadedBy: integer('uploaded_by'), // FK to users.id (integer; DB migrated 2026-05-10)
 uploadedAt: timestamp('uploaded_at', { mode: 'string' }),
 // ENHANCED COLUMNS (evidence board, AI analysis, forensics)
 evidenceNumber: varchar('evidence_number', { length: 50 }),
 type: varchar('type', { length: 100 }), // e.g. 'video','testimonial','digital','photo','scientific','audio','physical','documentary','forensic'
 summary: text('summary'),
 posX: integer('pos_x'),
 posY: integer('pos_y'),
 collectedAt: timestamp('collected_at', { withTimezone: true }),
 collectedBy: varchar('collected_by', { length: 255 }),
 mimeType: varchar('mime_type', { length: 100 }),
 tags: jsonb('tags'),
 aiTags: jsonb('ai_tags'),
 aiAnalysis: jsonb('ai_analysis'),
 aiSummary: text('ai_summary'),
 // DB-SYNC: columns present in native PG but previously missing from Drizzle
 verifiedAt: timestamp('verified_at'),
 verified: boolean('verified').default(false),
 status: varchar('status', { length: 50 }).default('pending'),
 extractedText: text('extracted_text'),
 entities: jsonb('entities').default([]),
 keywords: jsonb('keywords').default([]),
 embedding: vector('embedding', { dimensions: 768 }),
 deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// === ANALYSIS JOBS ===
export const analysisJobs = pgTable('analysis_jobs', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	evidenceId: uuid('evidence_id').notNull(),
	caseId: uuid('case_id'),
	jobType: varchar('job_type', { length: 64 }).notNull(),
	status: varchar('status', { length: 32 }).notNull().default('queued'),
	progress: varchar('progress', { length: 32 }).default('0'),
	result: jsonb('result').default({}),
	error: text('error'),
	startedAt: timestamp('started_at', { withTimezone: true }),
	completedAt: timestamp('completed_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
	evidenceIdx: index('analysis_jobs_evidence_idx').on(t.evidenceId),
	statusIdx: index('analysis_jobs_status_idx').on(t.status),
	typeIdx: index('analysis_jobs_type_idx').on(t.jobType),
}));

export type AnalysisJob = typeof analysisJobs.$inferSelect;
export type NewAnalysisJob = typeof analysisJobs.$inferInsert;

// === INTENT SYNTHESIS (ACE captures non-blocking synthesis records) ===
export const intentSynthesis = pgTable('intent_synthesis', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  queryHash: text('query_hash'),
  contextPackKey: text('context_pack_key'),
  authority: jsonb('authority').default({}),
  sourceRefs: jsonb('source_refs').default([]).$type<string[]>(),
  chunkIds: jsonb('chunk_ids').default([]).$type<string[]>(),
  summaryIds: jsonb('summary_ids').default([]).$type<string[]>(),
  retrievalTrace: jsonb('retrieval_trace').default({}),
  cachedSteps: jsonb('cached_steps').default({}),
  // NOTE: Postgres stores reward scores as floating-point (real) in production.
  // This is a non-destructive TypeScript schema alignment to match the live DB.
  rewardScore: numeric('reward_score'),
  degraded: boolean('degraded').notNull().default(false),
  degradedReason: text('degraded_reason'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export type IntentSynthesis = typeof intentSynthesis.$inferSelect;
export type NewIntentSynthesis = typeof intentSynthesis.$inferInsert;

// === SCENARIO CACHE ===
/**
 * Lightweight scenario cache for ACE/context assembly results.
 * Primary access is Redis L1 (fast TTL'd JSON). Qdrant L2 persistence is optional
 * and can be used for longer-term, deduplicated retrieval across restarts.
 */
export const scenarioCache = pgTable(
  'scenario_cache',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
    queryHash: text('query_hash').notNull(), // sha256 of query+pipeline
    pipelineKey: varchar('pipeline_key', { length: 255 }).notNull(),
    qdrantCollection: varchar('qdrant_collection', { length: 200 }),
    qdrantPointIds: jsonb('qdrant_point_ids').default([]).$type<string[]>(),
    contextChunks: jsonb('context_chunks').default([]).$type<string[]>(),
    cachedResult: jsonb('cached_result').default({}).notNull(),
    ttlSeconds: integer('ttl_seconds').default(3600).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  },
  (t) => ({
    indexes: [
      index('idx_scenario_cache_query_hash').on(t.queryHash),
      index('idx_scenario_cache_pipeline').on(t.pipelineKey),
    ],
  })
);

export type ScenarioCache = typeof scenarioCache.$inferSelect;
export type NewScenarioCache = typeof scenarioCache.$inferInsert;

// === AGENT MEMORY OBSERVATIONS (Claude-Mem/OpenCode mirror, Postgres canonical) ===
export const agentMemoryObservations = pgTable(
  'agent_memory_observations',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    source: text('source').notNull().default('claude-mem'),
    ide: text('ide').default('opencode'),
    sessionId: text('session_id'),
    observationId: text('observation_id'),
    projectPath: text('project_path'),
    summary: text('summary').notNull(),
    tags: jsonb('tags').default([]).$type<string[]>(),
    sourceRefs: jsonb('source_refs').default([]).$type<string[]>(),
    toolCalls: jsonb('tool_calls').default([]).$type<Array<Record<string, unknown> | string>>(),
    rawJson: jsonb('raw_json').default({}),
    embedding: vector('embedding', { dimensions: 768 }),
    embeddingModel: text('embedding_model').default('embeddinggemma:latest'),
    embeddingDim: integer('embedding_dim').default(768),
    qdrantPointId: text('qdrant_point_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    sessionIdx: index('agent_memory_observations_session_idx').on(table.sessionId),
    observationIdx: index('agent_memory_observations_observation_idx').on(table.observationId),
    qdrantIdx: index('agent_memory_observations_qdrant_idx').on(table.qdrantPointId),
    createdIdx: index('agent_memory_observations_created_idx').on(table.createdAt),
  })
);

export type AgentMemoryObservation = typeof agentMemoryObservations.$inferSelect;
export type NewAgentMemoryObservation = typeof agentMemoryObservations.$inferInsert;

// === AGENT OBSERVATIONS (OpenCode progressive memory timeline / ingest canonical) ===
export const agentObservations = pgTable(
  'agent_observations',
  {
    id: serial('id').primaryKey().notNull(),
    sessionType: text('session_type').notNull(), // 'decision', 'bugfix', 'feature'
    filePath: text('file_path'),
    observationText: text('observation_text').notNull(),
    charIntervalStart: integer('char_interval_start'),
    somClusterId: integer('som_cluster_id'), // 64D projected latent tag mapping to SOM centroid id
    timestamp: timestamp('timestamp', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    somIdx: index('agent_observations_som_idx').on(table.somClusterId),
    tsIdx: index('agent_observations_ts_idx').on(table.timestamp),
  })
);

export type AgentObservation = typeof agentObservations.$inferSelect;
export type NewAgentObservation = typeof agentObservations.$inferInsert;

// === GLYPH RECORDS & LORA TRAINING RUNS ===
// glyphRecords is declared below at the canonical location (~line 3748).
// Types are exported alongside the table definition.

export const loraTrainingRuns = pgTable(
  'lora_training_runs',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    runId: text('run_id').notNull(),
    modelId: text('model_id').notNull(),
    baseModel: text('base_model'),
    datasetUri: text('dataset_uri'),
    checkpointUri: text('checkpoint_uri'),
    seaweedObjectKey: text('seaweed_object_key'),
    status: text('status').notNull().default('planned'),
    metricsJson: jsonb('metrics_json').default({}),
    configJson: jsonb('config_json').default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    indexes: [
      index('lora_runs_run_id_idx').on(t.runId),
      index('lora_runs_model_id_idx').on(t.modelId),
      index('lora_runs_checkpoint_idx').on(t.checkpointUri),
      index('lora_runs_created_at_idx').on(t.createdAt),
    ],
  })
);

export type LoraTrainingRun = typeof loraTrainingRuns.$inferSelect;
export type NewLoraTrainingRun = typeof loraTrainingRuns.$inferInsert;

// === EVIDENCE RELATIONSHIPS ===
export const evidenceRelationships = pgTable(
  'evidence_relationships',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    caseId: uuid('case_id').notNull(),
    fromEvidenceId: uuid('from_evidence_id').notNull(),
    toEvidenceId: uuid('to_evidence_id').notNull(),
    relationshipType: relationTypeEnum('relationship_type').notNull(),
    label: text('label'),
    strength: varchar('strength', { length: 20 }).default('medium').notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => ({
    indexes: [
      index('evidence_relationships_case_id_idx').on(table.caseId),
      index('evidence_relationships_from_idx').on(table.fromEvidenceId),
      index('evidence_relationships_to_idx').on(table.toEvidenceId),
    ],
    foreignKeys: [
      foreignKey({
        columns: [table.caseId],
        foreignColumns: [cases.id],
        name: 'evidence_relationships_case_id_fk',
      }).onDelete('cascade'),
      foreignKey({
        columns: [table.fromEvidenceId],
        foreignColumns: [evidence.id],
        name: 'evidence_relationships_from_fk',
      }).onDelete('cascade'),
      foreignKey({
        columns: [table.toEvidenceId],
        foreignColumns: [evidence.id],
        name: 'evidence_relationships_to_fk',
      }).onDelete('cascade'),
    ],
  })
);

// Define documents table
export const documents = pgTable('documents', {
  id: text('id').primaryKey().notNull(),
  caseId: uuid('case_id'),
  title: text('title').notNull(),
  // OLD COLUMNS (preserve existing data)
  description: text('description'),
  filePath: varchar('file_path', { length: 500 }),
  fileType: varchar('file_type', { length: 100 }),
  fileSize: bigint('file_size', { mode: 'number' }),
  content: text('content'),
  summary: text('summary'),
  embeddingId: varchar('embedding_id', { length: 255 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  status: varchar('status', { length: 50 }).default('pending'),
  // NEW COLUMNS (for S3/MinIO integration - graceful fallback if null)
  s3Key: text('s3_key'),
  s3Bucket: text('s3_bucket').default('legal-documents'),
  originalName: text('original_name'),
  mimeType: text('mime_type'),
  userId: integer('user_id'),
});

// Define legalDocuments table (based on documents, with additional fields for Qdrant integration)
export const legalDocuments = pgTable(
  'legal_documents',
  {
    id: text('id').primaryKey().notNull(),
    title: text('title').notNull(),
    content: text('content'),
    s3Key: text('s3_key').notNull(),
    s3Bucket: text('s3_bucket').notNull().default('legal-documents'),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: bigint('file_size', { mode: 'number' }).notNull().default(0),
    caseId: uuid('case_id'), // Foreign key to cases table
    userId: integer('user_id'), // Foreign key to users table
    evidenceId: uuid('evidence_id'), // Added: Foreign key to evidence table
    createdBy: integer('created_by'), // Added: Foreign key to users table
    status: documentStatusEnum('status').notNull().default('queued'),
    documentType: documentTypeEnum('document_type'), // Specific legal document type
    practiceArea: varchar('practice_area', { length: 100 }),
    metadata: jsonb('metadata'), // General metadata
    contentEmbedding: vector('content_embedding', { dimensions: 768 }),
    qdrantId: uuid('qdrant_id'), // ID in Qdrant
    qdrantCollection: varchar('qdrant_collection', { length: 100 }), // Qdrant collection name
    lastSyncedToQdrant: timestamp('last_synced_to_qdrant', { withTimezone: true, mode: 'string' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }), // Soft delete
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    indexes: [
      index('idx_legal_documents_case_id').on(table.caseId),
      index('idx_legal_documents_user_id').on(table.userId),
      index('idx_legal_documents_status').on(table.status),
      index('idx_legal_documents_qdrant_id').on(table.qdrantId),
      // HNSW index for contentEmbedding for fast similarity search
      // Note: HNSW indexes must be created via raw SQL migration, not in schema
      index('idx_legal_documents_content_embedding_hnsw').on(table.contentEmbedding),
    ],
    foreignKeys: [
      foreignKey({
        columns: [table.caseId],
        foreignColumns: [cases.id],
        name: 'legal_documents_case_id_cases_id_fk',
      }).onDelete('cascade'),
      foreignKey({
        columns: [table.userId],
        foreignColumns: [users.id],
        name: 'legal_documents_user_id_users_id_fk',
      }).onDelete('set null'),
      foreignKey({
        // Added foreign key for evidenceId
        columns: [table.evidenceId],
        foreignColumns: [evidence.id],
        name: 'legal_documents_evidence_id_evidence_id_fk',
      }).onDelete('set null'),
      foreignKey({
        // Added foreign key for createdBy
        columns: [table.createdBy],
        foreignColumns: [users.id],
        name: 'legal_documents_created_by_users_id_fk',
      }).onDelete('set null'),
    ],
  })
);

// Define storageFiles table
export const storageFiles = pgTable(
  'storage_files',
  {
    id: uuid('id')
      .primaryKey()
      .notNull()
      .default(sql`gen_random_uuid()`),
    key: text('key').notNull(),
    original_name: text('original_name'),
    bucket: text('bucket').notNull(),
    userId: integer('user_id'), // Foreign key to users table
    size: bigint('size', { mode: 'bigint' }).notNull(),
    mime: text('mime'),
    uploadedAt: timestamp('uploaded_at').defaultNow().notNull(), // Changed to uploadedAt for consistency
  },
  (table) => ({
    foreignKeys: [
      foreignKey({
        columns: [table.userId],
        foreignColumns: [users.id],
        name: 'storage_files_user_id_users_id_fk',
      }).onDelete('set null'),
    ],
  })
);

// === VECTOR METADATA ===
export const vectorMetadata = pgTable(
  'vector_metadata',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    documentId: text('document_id').notNull(), // This might be a foreign key to documents.id or legalDocuments.id
    collectionName: varchar('collection_name', { length: 100 }).notNull(),
    metadata: jsonb('metadata').default({}).notNull(),
    contentHash: text('content_hash').notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow(),
  },
  (table) => [unique('vector_metadata_document_id_unique').on(table.documentId)]
);

// === CASE SCORING SYSTEM ===
export const caseScores = pgTable(
  'case_scores',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    // Foreign key to users.id; who performed the calculation (nullable to allow on delete set null)
    calculatedBy: integer('calculated_by'),
    caseId: uuid('case_id').notNull(),
    score: numeric('score', { precision: 5, scale: 2 }).notNull(),
    riskLevel: caseRiskLevelEnum('risk_level').notNull(),
    breakdown: jsonb('breakdown').default({}).notNull(),
    criteria: jsonb('criteria').default({}).notNull(),
    recommendations: jsonb('recommendations').default([]).notNull().$type<string[]>(),
    calculatedAt: timestamp('calculated_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.caseId],
      foreignColumns: [cases.id],
      name: `case_scores_case_id_cases_id_fk`,
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.calculatedBy],
      foreignColumns: [users.id],
      name: `case_scores_calculated_by_users_id_fk`,
    }).onDelete('set null'),
  ]
);

// === EMBEDDING CACHE ===
export const embeddingCache = pgTable(
  'embedding_cache',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    textHash: text('text_hash').notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    // vector(768) — matches embeddinggemma:latest native dimensions
    embedding: vector('embedding', { dimensions: 768 }).notNull(),
  },
  (table) => [unique('embedding_cache_text_hash_unique').on(table.textHash)]
);

// === USER AI QUERIES ===
export const userAiQueries = pgTable(
  'user_ai_queries',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    userId: integer('user_id').notNull(),
    caseId: uuid('case_id'),
    query: text('query').notNull(),
    response: text('response').notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    queryType: varchar('query_type', { length: 50 }).notNull(),
    confidence: numeric('confidence', { precision: 3, scale: 2 }),
    processingTime: integer('processing_time'), // in ms
    contextUsed: jsonb('context_used').default([]).$type<string[]>(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => ({
    foreignKeys: [
      foreignKey({
        columns: [table.userId],
        foreignColumns: [users.id],
        name: 'user_ai_queries_user_id_users_id_fk',
      }).onDelete('cascade'),
      foreignKey({
        columns: [table.caseId],
        foreignColumns: [cases.id],
        name: 'user_ai_queries_case_id_cases_id_fk',
      }).onDelete('set null'),
    ],
  })
);

// === AUTO TAGS ===
export const autoTags = pgTable(
  'auto_tags',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    entityId: uuid('entity_id').notNull(), // Polymorphic
    entityType: varchar('entity_type', { length: 50 }).notNull(), // e.g., 'evidence', 'document'
    tag: varchar('tag', { length: 100 }).notNull(),
    confidence: real('confidence').notNull(),
    source: varchar('source', { length: 100 }).notNull(), // e.g., 'ai_analysis', 'user'
    model: varchar('model', { length: 100 }),
    isConfirmed: boolean('is_confirmed').default(false).notNull(),
    confirmedBy: integer('confirmed_by'), // FK to users.id
    confirmedAt: timestamp('confirmed_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => ({
    foreignKeys: [
      foreignKey({
        columns: [table.confirmedBy],
        foreignColumns: [users.id],
        name: 'auto_tags_confirmed_by_users_id_fk',
      }).onDelete('set null'),
    ],
    indexes: [index('idx_autotags_entity').on(table.entityId, table.entityType)],
  })
);

// === VECTOR OUTBOX ===
export const vectorOutbox = pgTable('vector_outbox', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  ownerType: varchar('owner_type', { length: 256 }).notNull(),
  ownerId: varchar('owner_id', { length: 256 }).notNull(),
  event: varchar('event', { length: 256 }).notNull(),
  // vector(768) — embeddinggemma:latest native dimensions (was incorrectly typed as text/384)
  vector: text('vector'),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const vectorJobs = pgTable('vector_jobs', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  status: varchar('status', { enum: ['pending', 'processing', 'success', 'failed'] }).notNull(),
  progress: integer('progress').default(0).notNull(),
  result: jsonb('result'),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// === ADDITIONAL TABLES ===
export const caseActivities = pgTable('case_activities', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  caseId: uuid('case_id'),
  assignedTo: integer('assigned_to'),
  createdBy: integer('created_by'),
  activityType: varchar('activity_type', { length: 100 }),
  description: text('description'),
  status: activityStatusEnum('status'),
  dueDate: timestamp('due_date'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const attachmentVerifications = pgTable('attachment_verifications', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  attachmentId: uuid('attachment_id'), // FK to evidence.id or legalDocuments.id
  verifiedBy: integer('verified_by'), // FK to users.id
  status: verificationStatusEnum('status'),
  verificationDate: timestamp('verification_date'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});

export const canvasStates = pgTable('canvas_states', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  caseId: uuid('case_id'), // FK to cases.id
  userId: integer('user_id'), // FK to users.id
  stateData: jsonb('state_data').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const canvasAnnotations = pgTable('canvas_annotations', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  canvasStateId: uuid('canvas_state_id'), // FK to canvasStates
  createdBy: integer('created_by'), // FK to users.id
  annotationData: jsonb('annotation_data').default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});

export const canvasAutosaves = pgTable('canvas_autosaves', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  canvasStateId: uuid('canvas_state_id'), // FK to canvasStates
  createdAt: timestamp('created_at').defaultNow(),
});

export const aiReports = pgTable('ai_reports', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }), // FK to cases.id
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }), // FK to users.id
  reportType: varchar('report_type', { length: 100 }).notNull(),
  summary: text('summary'),
  fullReport: text('full_report'),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// === GPU AUDIT REPORTS (Codebase + Graph Analysis) ===
/**
 * Stores comprehensive GPU-accelerated audit reports combining Neo4j graph analysis,
 * LibTorch similarity/clustering, and Qdrant vector retrieval results.
 *
 * Result schema (JSONB):
 * {
 *   graphAnalysis: { nodeCount, edgeCount, pageRank[], communities[], gpuClusters, similarityMatrix, gpu },
 *   evidenceAnalysis: { totalEvidence, similarityResults, clusterResults, caseEmbedding },
 *   codebaseAnalysis: { vectorCount, clusters, duplicates, topMatches },
 *   performance: { graphMs, evidenceMs, codebaseMs, totalMs },
 *   timestamp: ISO string,
 *   source: 'gpu' | 'cpu'
 * }
 */
export const codebaseAuditReports = pgTable(
  'codebase_audit_reports',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    reportType: varchar('report_type', { length: 50 }).notNull().default('full'), // 'graph', 'evidence', 'codebase', 'full'

    // GPU metrics
    cudaAvailable: boolean('cuda_available').notNull().default(false),
    gpuMemoryMb: integer('gpu_memory_mb'),
    gpuMemoryFreeMb: integer('gpu_memory_free_mb'),

    // Analysis components (JSONB)
    graphAnalysis: jsonb('graph_analysis'), // Neo4j + GPU clustering results
    evidenceAnalysis: jsonb('evidence_analysis'), // Evidence similarity + case embeddings
    codebaseAnalysis: jsonb('codebase_analysis'), // Code duplicate detection + clustering

    // Performance metrics
    durationMs: integer('duration_ms').notNull(),
    graphDurationMs: integer('graph_duration_ms'),
    evidenceDurationMs: integer('evidence_duration_ms'),
    codebaseDurationMs: integer('codebase_duration_ms'),

    // Status
    status: varchar('status', { length: 32 }).notNull().default('completed'), // 'queued', 'running', 'completed', 'failed'
    error: text('error'),

    // Cache key for CouchDB integration
    cacheKey: varchar('cache_key', { length: 255 }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    caseIdx: index('codebase_audit_reports_case_idx').on(t.caseId),
    statusIdx: index('codebase_audit_reports_status_idx').on(t.status),
    typeIdx: index('codebase_audit_reports_type_idx').on(t.reportType),
    createdIdx: index('codebase_audit_reports_created_idx').on(t.createdAt),
  })
);

// === AGENT SESSIONS (Phase 76+ / Lane-Aware Store) ===
/**
 * Stores interactive and background agent sessions.
 * This is the 'Hypergraph Store' for Lane 1 and background lanes.
 */
export const agentSessions = pgTable(
  'agent_sessions',
  {
    id: serial('id').primaryKey().notNull(),
    sessionId: varchar('session_id', { length: 255 }).unique().notNull(),
    lane: varchar('lane', { length: 64 }).notNull(), // 'interactive-agent', 'background-analysis'
    taskType: varchar('task_type', { length: 64 }).notNull(), // 'fix-recommender', 'wiki-generation', etc.
    status: varchar('status', { length: 32 }).notNull().default('active'),
    outcome: text('outcome'),
    metadata: jsonb('metadata').default({}),
    startTime: timestamp('start_time', { withTimezone: true }).defaultNow().notNull(),
    endTime: timestamp('end_time', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sessionIdx: index('idx_agent_sessions_id').on(t.sessionId),
    laneIdx: index('idx_agent_sessions_lane').on(t.lane),
    statusIdx: index('idx_agent_sessions_status').on(t.status),
  })
);

export type AgentSession = typeof agentSessions.$inferSelect;
export type NewAgentSession = typeof agentSessions.$inferInsert;

export type CodebaseAuditReport = typeof codebaseAuditReports.$inferSelect;
export type NewCodebaseAuditReport = typeof codebaseAuditReports.$inferInsert;

export const citations = pgTable('citations', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  documentId: text('document_id'), // FK to legalDocuments.id
  caseId: uuid('case_id'), // FK to cases.id
  citationText: text('citation_text').notNull(),
  sourceUrl: text('source_url'),
  pageNumber: integer('page_number'),
  confidence: real('confidence'),
  createdBy: integer('created_by'), // FK to users.id
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  // Added columns (April 2026 migration)
  citationType: varchar('citation_type', { length: 100 }),
  title: varchar('title', { length: 500 }),
  annotation: text('annotation'),
  isKeyAuthority: boolean('is_key_authority').default(false),
  tags: jsonb('tags').default([]),
  embedding: vector('embedding', { dimensions: 768 }),
});

// === CITATION TAGS ===
// User-defined labels on citations (e.g., "key authority", "opposing", "supporting")
export const citationTags = pgTable(
  'citation_tags',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    citationId: uuid('citation_id')
      .notNull()
      .references(() => citations.id, { onDelete: 'cascade' }),
    tag: varchar('tag', { length: 100 }).notNull(),
    color: varchar('color', { length: 7 }).default('#6b7280'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    citationIdIdx: index('citation_tags_citation_id_idx').on(table.citationId),
    uniqueTag: unique('citation_tags_unique').on(table.citationId, table.tag),
  })
);

// === CITATION COLLECTIONS ===
// User-created collections to organize citations
export const citationCollections = pgTable(
  'citation_collections',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    color: varchar('color', { length: 7 }).default('#8B2332'),
    isPublic: boolean('is_public').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    userIdIdx: index('citation_collections_user_id_idx').on(table.userId),
  })
);

// === COLLECTION CITATIONS (M2M) ===
// Junction table for many-to-many relationship between collections and citations
export const collectionCitations = pgTable(
  'collection_citations',
  {
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => citationCollections.id, { onDelete: 'cascade' }),
    citationId: uuid('citation_id')
      .notNull()
      .references(() => citations.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.collectionId, table.citationId] }),
    collectionIdIdx: index('collection_citations_collection_id_idx').on(table.collectionId),
    citationIdIdx: index('collection_citations_citation_id_idx').on(table.citationId),
  })
);

// Citation Collections Type Exports
export type CitationCollection = typeof citationCollections.$inferSelect;
export type NewCitationCollection = typeof citationCollections.$inferInsert;
export type CollectionCitation = typeof collectionCitations.$inferSelect;
export type NewCollectionCitation = typeof collectionCitations.$inferInsert;

export const reports = pgTable('reports', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  caseId: uuid('case_id'), // FK to cases.id
  createdBy: integer('created_by'), // FK to users.id
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content'),
  type: varchar('type', { length: 64 }),
  status: reportStatusEnum('status').default('draft').notNull(),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
  metadata: jsonb('metadata'),
  // DB-SYNC: columns present in native PG
  reportType: varchar('report_type', { length: 100 }),
  format: varchar('format', { length: 50 }).default('html'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const reportAuditLog = pgTable(
  'report_audit_log',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 50 }).notNull(), // 'created', 'updated', 'deleted', 'published', 'exported'
    changes: jsonb('changes'), // What changed (old vs new values)
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    timestamp: timestamp('timestamp', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    reportIdIdx: index('report_audit_log_report_id_idx').on(table.reportId),
    userIdIdx: index('report_audit_log_user_id_idx').on(table.userId),
    timestampIdx: index('report_audit_log_timestamp_idx').on(table.timestamp),
  })
);

export const reportVersions = pgTable(
  'report_versions',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    title: varchar('title', { length: 255 }),
    content: text('content'),
    metadata: jsonb('metadata'),
    changedBy: integer('changed_by').references(() => users.id, { onDelete: 'set null' }),
    changeReason: text('change_reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    reportIdIdx: index('report_versions_report_id_idx').on(table.reportId),
    versionIdx: index('report_versions_version_idx').on(table.reportId, table.version),
  })
);

export type ReportVersion = typeof reportVersions.$inferSelect;
export type NewReportVersion = typeof reportVersions.$inferInsert;

export const savedReports = pgTable('saved_reports', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  userId: integer('user_id').notNull(), // FK to users.id
  reportId: uuid('report_id').notNull(), // FK to reports.id
  caseId: uuid('case_id'), // FK to cases.id
  savedAt: timestamp('saved_at').defaultNow().notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const themes = pgTable('themes', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  userId: integer('user_id').notNull(), // FK to users.id
  name: varchar('name', { length: 100 }).notNull(),
  config: jsonb('config').notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const personsOfInterest = pgTable('persons_of_interest', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  name: text('name').notNull(),
  aliases: text('aliases').array(),
  description: text('description').default(''),
  threatLevel: varchar('threat_level', { enum: ['low', 'medium', 'high', 'critical'] })
    .default('low')
    .notNull(),
  status: varchar('status', { enum: ['surveillance', 'wanted', 'active', 'cleared'] })
    .default('surveillance')
    .notNull(),
  relationship: text('relationship'),
  aiProfile: jsonb('ai_profile').$type<{
    riskScore: number;
    patterns: string[];
    recommendations: string[];
    lastUpdated: string;
  }>(),
  who: jsonb('who'),
  what: jsonb('what'),
  why: jsonb('why'),
  how: jsonb('how'),
  risk: jsonb('risk'),
  confidence: real('confidence'),
  modelVersion: text('model_version'),
  generatedAt: timestamp('generated_at'),
  lastUpdated: timestamp('last_updated'),
  crimes: text('crimes').array(),
  caseIds: text('case_ids').array(),
  caseId: uuid('case_id'),
  profileData: jsonb('profile_data').default({}),
  tags: jsonb('tags').default([]),
  position: jsonb('position').default({}),
  photoUrl: text('photo_url'),
  notes: text('notes'),
  metadata: jsonb('metadata').default({}),
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// POI Photos table for better organization
export const poiPhotos = pgTable(
  'poi_photos',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    poiId: uuid('poi_id').notNull(),
    minioKey: text('minio_key').notNull(),
    thumbnailKey: text('thumbnail_key'),
    url: text('url').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    aiCaption: text('ai_caption'),
    aiTags: jsonb('ai_tags').default([]).$type<string[]>(),
    exifData: jsonb('exif_data'),
    forensicData: jsonb('forensic_data'),
    faceEmbedding: vector('face_embedding', { dimensions: 768 }),
    uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
  },
  (table) => ({
    foreignKeys: [
      foreignKey({
        columns: [table.poiId],
        foreignColumns: [personsOfInterest.id],
        name: 'poi_photos_poi_id_persons_id_fk',
      }).onDelete('cascade'),
    ],
    indexes: [
      index('idx_poi_photos_poi_id').on(table.poiId),
      index('idx_poi_photos_uploaded_at').on(table.uploadedAt),
    ],
  })
);

// POI Relationships table
export const poiRelationships = pgTable(
  'poi_relationships',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    poiId1: uuid('poi_id_1')
      .notNull()
      .references(() => personsOfInterest.id, { onDelete: 'cascade' }),
    poiId2: uuid('poi_id_2')
      .notNull()
      .references(() => personsOfInterest.id, { onDelete: 'cascade' }),
    relationshipType: varchar('relationship_type', { length: 100 }).notNull().default('unknown'),
    strength: numeric('strength', { precision: 3, scale: 2 }).default('0.70'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    poi1Idx: index('poi_relationships_poi1_idx').on(table.poiId1),
    poi2Idx: index('poi_relationships_poi2_idx').on(table.poiId2),
  })
);

export type PoiRelationship = typeof poiRelationships.$inferSelect;

// === TIMELINE EVENTS ===

export const timelineEvents = pgTable(
  'timeline_events',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    poiId: uuid('poi_id').references(() => personsOfInterest.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id'),
    title: varchar('title', { length: 500 }).notNull(),
    description: text('description'),
    eventDate: timestamp('event_date', { withTimezone: true }).notNull(),
    eventType: varchar('event_type', { length: 100 }).default('general'),
    location: varchar('location', { length: 500 }),
    severity: varchar('severity', { length: 20 }).default('low'),
    metadata: jsonb('metadata'),
    // DB-SYNC: legacy columns present in native PG
    timestamp: timestamp('timestamp'),
    type: varchar('type', { length: 100 }),
    evidenceIds: jsonb('evidence_ids').default([]),
    personIds: jsonb('person_ids').default([]),
    locationIds: jsonb('location_ids').default([]),
    createdBy: integer('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`now()`),
  },
  (table) => [
    index('idx_timeline_events_poi_id').on(table.poiId),
    index('idx_timeline_events_case_id').on(table.caseId),
    index('idx_timeline_events_event_date').on(table.eventDate),
  ]
);

// === VLM IMAGE TAGS ===
export const vlmImageTags = pgTable('vlm_image_tags', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  name: varchar('name', { length: 200 }).unique().notNull(),
  description: text('description'),
  source: varchar('source', { length: 50 }).notNull().default('manual'),
  hitCount: integer('hit_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// === AI/VECTOR TABLES (Missing Definitions) ===

export const hashVerifications = pgTable('hash_verifications', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  evidenceId: uuid('evidence_id').notNull(),
  verifiedBy: integer('verified_by'),
  hashValue: text('hash_value').notNull(),
  algorithm: varchar('algorithm', { length: 50 }).notNull(),
  status: verificationStatusEnum('status').default('pending').notNull(),
  verificationDate: timestamp('verification_date').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const contentEmbeddings = pgTable('content_embeddings', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  documentId: uuid('document_id').notNull(),
  embedding: text('embedding').notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userEmbeddings = pgTable('user_embeddings', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  userId: integer('user_id').notNull(),
  embedding: text('embedding').notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const chatEmbeddings = pgTable('chat_embeddings', {
  id: serial('id').primaryKey().notNull(),
  text: text('text').notNull(),
  embedding: vector('embedding', { dimensions: 384 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const evidenceVectors = pgTable('evidence_vectors', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  evidenceId: uuid('evidence_id').notNull(),
  vector: vector('vector', { dimensions: 768 }).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Evidence Analysis Cache — queryable analysis results for fast client hits.
 * Stores YOLO detections, VLM findings, LLM synthesis, and graph connections
 * so the client can query by case_id + analysis_type without parsing JSONB metadata.
 */
export const evidenceAnalysisCache = pgTable(
  'evidence_analysis_cache',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    evidenceId: uuid('evidence_id').notNull(),
    caseId: uuid('case_id'),
    analysisType: varchar('analysis_type', { length: 50 }).notNull(), // 'yolo', 'vlm', 'llm_synthesis', 'combined'
    result: jsonb('result').notNull(), // full analysis payload
    resultEmbedding: vector('result_embedding', { dimensions: 768 }), // embedded summary for semantic search
    confidence: real('confidence').default(0.0),
    objectCount: integer('object_count').default(0),
    tags: jsonb('tags').$type<string[]>().default([]),
    llmEscalated: boolean('llm_escalated').default(false),
    processingTimeMs: integer('processing_time_ms').default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    evidenceIdIdx: index('evidence_analysis_cache_evidence_id_idx').on(table.evidenceId),
    caseIdIdx: index('evidence_analysis_cache_case_id_idx').on(table.caseId),
    analysisTypeIdx: index('evidence_analysis_cache_type_idx').on(table.analysisType),
    caseTypeIdx: index('evidence_analysis_cache_case_type_idx').on(
      table.caseId,
      table.analysisType
    ),
  })
);

export const caseEmbeddings = pgTable('case_embeddings', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  caseId: uuid('case_id').notNull(),
  embedding: text('embedding').notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const ragSessions = pgTable('rag_sessions', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  userId: integer('user_id').notNull(),
  caseId: uuid('case_id'),
  title: varchar('title', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const ragMessages = pgTable('rag_messages', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  sessionId: uuid('session_id').notNull(),
  role: varchar('role', { length: 50 }).notNull(), // e.g., 'user', 'assistant'
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const statutes = pgTable('statutes', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content').notNull(),
  jurisdiction: varchar('jurisdiction', { length: 100 }),
  section: varchar('section', { length: 100 }), // e.g., §187(a)
  category: varchar('category', { length: 100 }), // criminal, civil, probate, etc.
  sourceUrl: text('source_url'),
  effectiveDate: timestamp('effective_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// === CASE ↔ STATUTE JUNCTION TABLE ===
export const caseLinkTypeEnum = pgEnum('case_link_type', [
  'CHARGED_UNDER',
  'CITED_IN',
  'RELATED_TO',
  'OVERRULED_BY',
  'AFFIRMED_BY',
]);

export const caseStatuteLinks = pgTable(
  'case_statute_links',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    statuteId: uuid('statute_id').references(() => statutes.id, { onDelete: 'set null' }),
    citationId: uuid('citation_id').references(() => citations.id, { onDelete: 'set null' }),
    linkType: caseLinkTypeEnum('link_type').notNull().default('CITED_IN'),
    notes: text('notes'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    caseIdIdx: index('case_statute_links_case_id_idx').on(table.caseId),
    statuteIdIdx: index('case_statute_links_statute_id_idx').on(table.statuteId),
    citationIdIdx: index('case_statute_links_citation_id_idx').on(table.citationId),
  })
);

// Chunked statute sections for RAG search
export const statuteChunks = pgTable(
  'statute_chunks',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    statuteId: uuid('statute_id')
      .notNull()
      .references(() => statutes.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 768 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    statuteIdIdx: index('statute_chunks_statute_id_idx').on(table.statuteId),
    chunkIndexIdx: index('statute_chunks_chunk_index_idx').on(table.chunkIndex),
  })
);

export const legalPrecedents = pgTable('legal_precedents', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  caseId: uuid('case_id'),
  title: varchar('title', { length: 255 }).notNull(),
  summary: text('summary').notNull(),
  citation: varchar('citation', { length: 255 }),
  court: varchar('court', { length: 200 }),
  decisionDate: timestamp('decision_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const legalAnalysisSessions = pgTable('legal_analysis_sessions', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  userId: integer('user_id').notNull(),
  caseId: uuid('case_id'),
  analysisType: varchar('analysis_type', { length: 100 }).notNull(),
  inputData: jsonb('input_data'),
  outputSummary: text('output_summary'),
  status: varchar('status', { length: 50 }).default('pending').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Legal glossary terms for search and education
export const legalGlossary = pgTable('legal_glossary', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  term: varchar('term', { length: 255 }).notNull(),
  definition: text('definition').notNull(),
  category: varchar('category', { length: 100 }),
  jurisdiction: varchar('jurisdiction', { length: 100 }),
  relatedTerms: jsonb('related_terms'),
  sources: jsonb('sources'),
  embedding: vector('embedding', { dimensions: 768 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const legalResearch = pgTable('legal_research', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  caseId: uuid('case_id'),
  createdBy: integer('created_by').notNull(),
  query: text('query').notNull(),
  results: jsonb('results'),
  status: varchar('status', { length: 50 }).default('completed').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const documentProcessing = pgTable('document_processing', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  documentId: uuid('document_id').notNull(),
  status: documentStatusEnum('status').notNull().default('queued'),
  processor: varchar('processor', { length: 100 }),
  metadata: jsonb('metadata'),
  error: text('error'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const documentChunks = pgTable('document_chunks', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  // document_id is a UUID in Postgres; align Drizzle type to avoid drift
  documentId: text('document_id').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  // Embedding column: optional 384-dim vector. Some deployments store document
  // chunk embeddings here; keep it optional to match mixed-state DBs.
  embedding: vector('embedding', { dimensions: 384 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const documentSummaries = pgTable('document_summaries', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  documentId: uuid('document_id').notNull(),
  summaryType: summaryTypeEnum('summary_type').notNull(),
  summaryText: text('summary_text').notNull(),
  model: varchar('model', { length: 100 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// === RELATIONS ===
// (All relations are now defined only once, with syntax fixed and duplicates removed)

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  emailVerificationCodes: many(emailVerificationCodes),
  passwordResetTokens: many(passwordResetTokens),
  criminalsCreated: many(criminals),
  evidenceUploaded: many(evidence),
  legalDocumentsCreated: many(legalDocuments, { relationName: 'createdBy' }),
  legalDocumentsOwned: many(legalDocuments, { relationName: 'ownedDocuments' }),
  storageFiles: many(storageFiles), // Added storageFiles relation
  caseActivitiesAssigned: many(caseActivities, { relationName: `assignedTo` }),
  caseActivitiesCreated: many(caseActivities, { relationName: `createdBy` }),
  attachmentVerificationsPerformed: many(attachmentVerifications),
  canvasAnnotationsCreated: many(canvasAnnotations),
  canvasStatesCreated: many(canvasStates),
  aiReportsCreated: many(aiReports),
  citationsCreated: many(citations),
  citationCollections: many(citationCollections),
  reportsCreated: many(reports),
  savedReportsCreated: many(savedReports),
  themesCreated: many(themes),
  personsOfInterestCreated: many(personsOfInterest),
  hashVerificationsPerformed: many(hashVerifications),
  userEmbeddings: many(userEmbeddings),
  ragSessions: many(ragSessions),
  legalAnalysisSessions: many(legalAnalysisSessions),
  legalResearchCreated: many(legalResearch, { relationName: 'createdBy' }),
  caseScoresCalculated: many(caseScores, { relationName: 'calculatedBy' }),
  userAiQueries: many(userAiQueries),
  autoTagsConfirmed: many(autoTags, { relationName: 'confirmedBy' }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const emailVerificationCodesRelations = relations(emailVerificationCodes, ({ one }) => ({
  user: one(users, { fields: [emailVerificationCodes.userId], references: [users.id] }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, { fields: [passwordResetTokens.userId], references: [users.id] }),
}));

export const casesRelations = relations(cases, ({ one, many }) => ({
  assignedAttorney: one(users, { fields: [cases.assignedAttorney], references: [users.id] }),
  evidence: many(evidence),
  activities: many(caseActivities),
  legalDocuments: many(legalDocuments),
  aiReports: many(aiReports),
  citations: many(citations),
  reports: many(reports),
  savedReports: many(savedReports),
  personsOfInterest: many(personsOfInterest),
  caseEmbeddings: many(caseEmbeddings),
  ragSessions: many(ragSessions),
  legalAnalysisSessions: many(legalAnalysisSessions),
  legalResearch: many(legalResearch),
  caseScores: many(caseScores),
  userAiQueries: many(userAiQueries),
  canvasStates: many(canvasStates),
  statuteLinks: many(caseStatuteLinks),
}));

export const caseStatuteLinksRelations = relations(caseStatuteLinks, ({ one }) => ({
  case: one(cases, { fields: [caseStatuteLinks.caseId], references: [cases.id] }),
  statute: one(statutes, { fields: [caseStatuteLinks.statuteId], references: [statutes.id] }),
  citation: one(citations, { fields: [caseStatuteLinks.citationId], references: [citations.id] }),
  createdBy: one(users, { fields: [caseStatuteLinks.createdBy], references: [users.id] }),
}));

export const criminalsRelations = relations(criminals, ({ one, many }) => ({
  createdBy: one(users, { fields: [criminals.createdBy], references: [users.id] }),
  evidence: many(evidence),
}));

export const evidenceRelations = relations(evidence, ({ one, many }) => ({
  uploadedBy: one(users, { fields: [evidence.uploadedBy], references: [users.id] }),
  case: one(cases, { fields: [evidence.caseId], references: [cases.id] }),
  criminal: one(criminals, { fields: [evidence.criminalId], references: [criminals.id] }),
  legalDocuments: many(legalDocuments),
  canvasAnnotations: many(canvasAnnotations),
  evidenceVectors: many(evidenceVectors),
  hashVerifications: many(hashVerifications),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  case: one(cases, { fields: [documents.caseId], references: [cases.id] }),
  user: one(users, { fields: [documents.userId], references: [users.id] }),
  documentProcessing: many(documentProcessing),
  documentChunks: many(documentChunks),
  documentSummaries: many(documentSummaries),
}));

export const legalDocumentsRelations = relations(legalDocuments, ({ one, many }) => ({
  case: one(cases, { fields: [legalDocuments.caseId], references: [cases.id] }),
  user: one(users, {
    fields: [legalDocuments.userId],
    references: [users.id],
    relationName: 'ownedDocuments',
  }),
  evidence: one(evidence, { fields: [legalDocuments.evidenceId], references: [evidence.id] }),
  createdBy: one(users, {
    fields: [legalDocuments.createdBy],
    references: [users.id],
    relationName: 'createdBy',
  }),
  citations: many(citations),
}));

export const storageFilesRelations = relations(storageFiles, ({ one }) => ({
  user: one(users, { fields: [storageFiles.userId], references: [users.id] }),
}));

export const caseActivitiesRelations = relations(caseActivities, ({ one }) => ({
  case: one(cases, { fields: [caseActivities.caseId], references: [cases.id] }),
  assignedTo: one(users, {
    fields: [caseActivities.assignedTo],
    references: [users.id],
    relationName: `assignedTo`,
  }),
  createdBy: one(users, {
    fields: [caseActivities.createdBy],
    references: [users.id],
    relationName: `createdBy`,
  }),
}));

export const attachmentVerificationsRelations = relations(attachmentVerifications, ({ one }) => ({
  verifiedBy: one(users, { fields: [attachmentVerifications.verifiedBy], references: [users.id] }),
  attachment: one(evidence, {
    fields: [attachmentVerifications.attachmentId],
    references: [evidence.id],
  }), // Assuming attachmentId refers to evidence
}));

export const canvasStatesRelations = relations(canvasStates, ({ one, many }) => ({
  case: one(cases, { fields: [canvasStates.caseId], references: [cases.id] }),
  user: one(users, { fields: [canvasStates.userId], references: [users.id] }),
  annotations: many(canvasAnnotations),
  autosaves: many(canvasAutosaves),
}));

export const canvasAnnotationsRelations = relations(canvasAnnotations, ({ one }) => ({
  canvasState: one(canvasStates, {
    fields: [canvasAnnotations.canvasStateId],
    references: [canvasStates.id],
  }),
  createdBy: one(users, { fields: [canvasAnnotations.createdBy], references: [users.id] }),
}));

export const canvasAutosavesRelations = relations(canvasAutosaves, ({ one }) => ({
  canvasState: one(canvasStates, {
    fields: [canvasAutosaves.canvasStateId],
    references: [canvasStates.id],
  }),
}));

export const aiReportsRelations = relations(aiReports, ({ one }) => ({
  case: one(cases, { fields: [aiReports.caseId], references: [cases.id] }),
  createdBy: one(users, { fields: [aiReports.createdBy], references: [users.id] }),
}));

export const codebaseAuditReportsRelations = relations(codebaseAuditReports, ({ one }) => ({
  case: one(cases, { fields: [codebaseAuditReports.caseId], references: [cases.id] }),
  createdBy: one(users, { fields: [codebaseAuditReports.createdBy], references: [users.id] }),
}));

export const citationsRelations = relations(citations, ({ one, many }) => ({
  document: one(legalDocuments, {
    fields: [citations.documentId],
    references: [legalDocuments.id],
  }),
  case: one(cases, { fields: [citations.caseId], references: [cases.id] }),
  createdBy: one(users, { fields: [citations.createdBy], references: [users.id] }),
  collectionCitations: many(collectionCitations),
}));

export const citationCollectionsRelations = relations(citationCollections, ({ one, many }) => ({
  user: one(users, { fields: [citationCollections.userId], references: [users.id] }),
  collectionCitations: many(collectionCitations),
}));

export const collectionCitationsRelations = relations(collectionCitations, ({ one }) => ({
  collection: one(citationCollections, {
    fields: [collectionCitations.collectionId],
    references: [citationCollections.id],
  }),
  citation: one(citations, {
    fields: [collectionCitations.citationId],
    references: [citations.id],
  }),
}));

export const reportsRelations = relations(reports, ({ one, many }) => ({
  case: one(cases, { fields: [reports.caseId], references: [cases.id] }),
  createdBy: one(users, { fields: [reports.createdBy], references: [users.id] }),
  savedReports: many(savedReports),
  auditLogs: many(reportAuditLog),
}));

export const reportAuditLogRelations = relations(reportAuditLog, ({ one }) => ({
  report: one(reports, { fields: [reportAuditLog.reportId], references: [reports.id] }),
  user: one(users, { fields: [reportAuditLog.userId], references: [users.id] }),
}));

export const savedReportsRelations = relations(savedReports, ({ one }) => ({
  user: one(users, { fields: [savedReports.userId], references: [users.id] }),
  report: one(reports, { fields: [savedReports.reportId], references: [reports.id] }),
  case: one(cases, { fields: [savedReports.caseId], references: [cases.id] }),
}));

export const themesRelations = relations(themes, ({ one }) => ({
  user: one(users, { fields: [themes.userId], references: [users.id] }),
}));

export const personsOfInterestRelations = relations(personsOfInterest, ({ one, many }) => ({
  photos: many(poiPhotos),
  case: one(cases, { fields: [personsOfInterest.caseId], references: [cases.id] }),
}));

export const poiPhotosRelations = relations(poiPhotos, ({ one }) => ({
  poi: one(personsOfInterest, { fields: [poiPhotos.poiId], references: [personsOfInterest.id] }),
}));

export const hashVerificationsRelations = relations(hashVerifications, ({ one }) => ({
  evidence: one(evidence, { fields: [hashVerifications.evidenceId], references: [evidence.id] }),
  verifiedBy: one(users, { fields: [hashVerifications.verifiedBy], references: [users.id] }),
}));

export const contentEmbeddingsRelations = relations(contentEmbeddings, ({ one }) => ({
  document: one(legalDocuments, {
    fields: [contentEmbeddings.documentId],
    references: [legalDocuments.id],
  }),
}));

export const userEmbeddingsRelations = relations(userEmbeddings, ({ one }) => ({
  user: one(users, { fields: [userEmbeddings.userId], references: [users.id] }),
}));

// === EVIDENCE BOARD MANAGEMENT ===
export const evidenceBoardConnections = pgTable(
  'evidence_board_connections',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    fromEvidenceId: uuid('from_evidence_id')
      .notNull()
      .references(() => evidence.id, { onDelete: 'cascade' }),
    toEvidenceId: uuid('to_evidence_id')
      .notNull()
      .references(() => evidence.id, { onDelete: 'cascade' }),
    connectionType: varchar('connection_type', { length: 50 }).default('related').notNull(), // 'related', 'contradicts', 'supports', 'references'
    label: varchar('label', { length: 255 }),
    notes: text('notes'),
    strength: real('strength').default(1.0), // 0.0 to 1.0 confidence
    isVisible: boolean('is_visible').default(true),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    caseIdIdx: index('evidence_board_connections_case_id_idx').on(table.caseId),
    fromEvidenceIdIdx: index('evidence_board_connections_from_evidence_id_idx').on(
      table.fromEvidenceId
    ),
    toEvidenceIdIdx: index('evidence_board_connections_to_evidence_id_idx').on(table.toEvidenceId),
    connectionTypeIdx: index('evidence_board_connections_type_idx').on(table.connectionType),
  })
);

// === CASE NOTES ===
// User notes attached to cases (searchable, with optional AI-generated content)
export const caseNotes = pgTable(
  'case_notes',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }),
    content: text('content').notNull(),
    isAI: boolean('is_ai').default(false),
    isPinned: boolean('is_pinned').default(false),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    caseIdIdx: index('case_notes_case_id_idx').on(table.caseId),
    isPinnedIdx: index('case_notes_is_pinned_idx').on(table.isPinned),
    createdAtIdx: index('case_notes_created_at_idx').on(table.createdAt),
  })
);

// === CASE NOTE VERSIONS ===
// Tracks edit history for case notes (snapshot before each update)
export const caseNoteVersions = pgTable(
  'case_note_versions',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    noteId: uuid('note_id')
      .notNull()
      .references(() => caseNotes.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }),
    content: text('content').notNull(),
    versionNumber: integer('version_number').notNull(),
    editedBy: integer('edited_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    noteIdIdx: index('case_note_versions_note_id_idx').on(table.noteId),
    versionIdx: index('case_note_versions_version_idx').on(table.noteId, table.versionNumber),
  })
);

// === CASE NOTE EVIDENCE REFERENCES ===
// Links case notes to evidence items for cross-referencing
export const caseNoteEvidenceRefs = pgTable(
  'case_note_evidence_refs',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    noteId: uuid('note_id')
      .notNull()
      .references(() => caseNotes.id, { onDelete: 'cascade' }),
    evidenceId: uuid('evidence_id')
      .notNull()
      .references(() => evidence.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    noteIdIdx: index('case_note_refs_note_id_idx').on(table.noteId),
    evidenceIdIdx: index('case_note_refs_evidence_id_idx').on(table.evidenceId),
    uniqueRef: unique('case_note_refs_unique').on(table.noteId, table.evidenceId),
  })
);

// === MULTI-PANEL WORKSPACE MANAGEMENT ===
// Workspaces group chat sessions with evidence, statutes, notes, and citations
export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    title: text('title').notNull(),
    description: text('description'),
    caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    caseIdIdx: index('workspaces_case_id_idx').on(table.caseId),
    createdByIdx: index('workspaces_created_by_idx').on(table.createdBy),
  })
);

// Link chat sessions to workspaces (one workspace can have multiple chat sessions)
export const workspaceSessions = pgTable(
  'workspace_sessions',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => ragSessions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    workspaceIdIdx: index('workspace_sessions_workspace_id_idx').on(table.workspaceId),
    sessionIdIdx: index('workspace_sessions_session_id_idx').on(table.sessionId),
  })
);

// Evidence panel: link evidence items to workspaces
export const workspaceEvidence = pgTable(
  'workspace_evidence',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    evidenceId: uuid('evidence_id')
      .notNull()
      .references(() => evidence.id, { onDelete: 'cascade' }),
    relevanceScore: real('relevance_score').default(0),
    addedBy: varchar('added_by', { length: 50 }).default('user'), // 'system', 'user'
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    workspaceIdIdx: index('workspace_evidence_workspace_id_idx').on(table.workspaceId),
    evidenceIdIdx: index('workspace_evidence_evidence_id_idx').on(table.evidenceId),
  })
);

// Statute panel: link statutes/laws to workspaces
export const workspaceStatutes = pgTable(
  'workspace_statutes',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    statuteId: uuid('statute_id').references(() => statutes.id, { onDelete: 'cascade' }),
    statuteText: text('statute_text'), // Fallback if statute not in DB
    relevanceScore: real('relevance_score').default(0),
    source: varchar('source', { length: 50 }).default('user'), // 'ai', 'user', 'citation'
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    workspaceIdIdx: index('workspace_statutes_workspace_id_idx').on(table.workspaceId),
    statuteIdIdx: index('workspace_statutes_statute_id_idx').on(table.statuteId),
  })
);

// User notes and legal memos (searchable via vector embeddings)
export const workspaceNotes = pgTable(
  'workspace_notes',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    isAI: boolean('is_ai').default(false),
    embedding: vector('embedding', { dimensions: 768 }),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    workspaceIdIdx: index('workspace_notes_workspace_id_idx').on(table.workspaceId),
    isAIIdx: index('workspace_notes_is_ai_idx').on(table.isAI),
  })
);

// Citations and references (links messages to legal sources)
export const workspaceCitations = pgTable(
  'workspace_citations',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => ragMessages.id, { onDelete: 'cascade' }),
    citationText: text('citation_text').notNull(), // e.g., "Penal Code 187(a)"
    citationURL: text('citation_url'),
    citationType: varchar('citation_type', { length: 50 }).default('statute'), // 'statute', 'case', 'regulation', 'precedent'
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    workspaceIdIdx: index('workspace_citations_workspace_id_idx').on(table.workspaceId),
    messageIdIdx: index('workspace_citations_message_id_idx').on(table.messageId),
  })
);

export const evidenceVectorsRelations = relations(evidenceVectors, ({ one }) => ({
  evidence: one(evidence, { fields: [evidenceVectors.evidenceId], references: [evidence.id] }),
}));

export const caseEmbeddingsRelations = relations(caseEmbeddings, ({ one }) => ({
  case: one(cases, { fields: [caseEmbeddings.caseId], references: [cases.id] }),
}));

export const ragSessionsRelations = relations(ragSessions, ({ one, many }) => ({
  user: one(users, { fields: [ragSessions.userId], references: [users.id] }),
  messages: many(ragMessages),
}));

export const ragMessagesRelations = relations(ragMessages, ({ one }) => ({
  session: one(ragSessions, { fields: [ragMessages.sessionId], references: [ragSessions.id] }),
}));

export const statutesRelations = relations(statutes, ({ many }) => ({
 chunks: many(statuteChunks),
}));

export const statuteChunksRelations = relations(statuteChunks, ({ one }) => ({
 statute: one(statutes, { fields: [statuteChunks.statuteId], references: [statutes.id] }),
}));

export const legalPrecedentsRelations = relations(legalPrecedents, ({ one }) => ({
 case: one(cases, { fields: [legalPrecedents.caseId], references: [cases.id] }),
}));

export const legalAnalysisSessionsRelations = relations(legalAnalysisSessions, ({ one }) => ({
 user: one(users, { fields: [legalAnalysisSessions.userId], references: [users.id] }),
 case: one(cases, { fields: [legalAnalysisSessions.caseId], references: [cases.id] }),
}));

export const legalResearchRelations = relations(legalResearch, ({ one }) => ({
 case: one(cases, { fields: [legalResearch.caseId], references: [cases.id] }),
 createdBy: one(users, { fields: [legalResearch.createdBy], references: [users.id] }),
}));

export const vectorMetadataRelations = relations(vectorMetadata, () => ({
 // documentId is text, not a direct Drizzle relation
}));

export const caseScoresRelations = relations(caseScores, ({ one }) => ({
 case: one(cases, { fields: [caseScores.caseId], references: [cases.id] }),
 calculatedBy: one(users, { fields: [caseScores.calculatedBy], references: [users.id] }),
}));

export const embeddingCacheRelations = relations(embeddingCache, () => ({
 // No explicit relations
}));

export const documentProcessingRelations = relations(documentProcessing, ({ one }) => ({
 document: one(documents, { fields: [documentProcessing.documentId], references: [documents.id] }),
}));

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
 document: one(documents, { fields: [documentChunks.documentId], references: [documents.id] }),
}));

export const documentSummariesRelations = relations(documentSummaries, ({ one }) => ({
 document: one(documents, { fields: [documentSummaries.documentId], references: [documents.id] }),
}));

export const userAiQueriesRelations = relations(userAiQueries, ({ one }) => ({
 user: one(users, { fields: [userAiQueries.userId], references: [users.id] }),
 case: one(cases, { fields: [userAiQueries.caseId], references: [cases.id] }),
}));

export const autoTagsRelations = relations(autoTags, ({ one }) => ({
 confirmedBy: one(users, { fields: [autoTags.confirmedBy], references: [users.id] }),
}));

export const vectorOutboxRelations = relations(vectorOutbox, () => ({
 // No explicit relations
}));

export const vectorJobsRelations = relations(vectorJobs, () => ({
 // No explicit relations
}));

export const evidenceBoardConnectionsRelations = relations(evidenceBoardConnections, ({ one }) => ({
 case: one(cases, { fields: [evidenceBoardConnections.caseId], references: [cases.id] }),
 fromEvidence: one(evidence, {
 fields: [evidenceBoardConnections.fromEvidenceId],
 references: [evidence.id],
 relationName: 'from_evidence',
 }),
 toEvidence: one(evidence, {
 fields: [evidenceBoardConnections.toEvidenceId],
 references: [evidence.id],
 relationName: 'to_evidence',
 }),
 createdByUser: one(users, {
 fields: [evidenceBoardConnections.createdBy],
 references: [users.id],
 }),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
 case: one(cases, { fields: [workspaces.caseId], references: [cases.id] }),
 createdByUser: one(users, { fields: [workspaces.createdBy], references: [users.id] }),
 sessions: many(workspaceSessions),
 evidence: many(workspaceEvidence),
 statutes: many(workspaceStatutes),
 notes: many(workspaceNotes),
 citations: many(workspaceCitations),
}));

export const workspaceSessionsRelations = relations(workspaceSessions, ({ one }) => ({
 workspace: one(workspaces, {
 fields: [workspaceSessions.workspaceId],
 references: [workspaces.id],
 }),
 session: one(ragSessions, {
 fields: [workspaceSessions.sessionId],
 references: [ragSessions.id],
 }),
}));

export const workspaceEvidenceRelations = relations(workspaceEvidence, ({ one }) => ({
 workspace: one(workspaces, {
 fields: [workspaceEvidence.workspaceId],
 references: [workspaces.id],
 }),
 evidence: one(evidence, { fields: [workspaceEvidence.evidenceId], references: [evidence.id] }),
}));

export const workspaceStatutesRelations = relations(workspaceStatutes, ({ one }) => ({
 workspace: one(workspaces, {
 fields: [workspaceStatutes.workspaceId],
 references: [workspaces.id],
 }),
 statute: one(statutes, { fields: [workspaceStatutes.statuteId], references: [statutes.id] }),
}));

export const workspaceNotesRelations = relations(workspaceNotes, ({ one }) => ({
 workspace: one(workspaces, { fields: [workspaceNotes.workspaceId], references: [workspaces.id] }),
 createdByUser: one(users, { fields: [workspaceNotes.createdBy], references: [users.id] }),
}));

export const workspaceCitationsRelations = relations(workspaceCitations, ({ one }) => ({
 workspace: one(workspaces, {
 fields: [workspaceCitations.workspaceId],
 references: [workspaces.id],
 }),
 message: one(ragMessages, {
 fields: [workspaceCitations.messageId],
 references: [ragMessages.id],
 }),
}));

// === DATABASE CONNECTION & HELPERS ===
// Export commonly used query helpers for consistency
// Keep helpers minimal here to avoid importing unavailable symbols in this environment.
export const helpers = { sql };

// === YORHA DETECTIVE INTERFACE SCHEMA ===

/**
 * YoRHa Cases table - stores detective cases
 */
export const yorhaCases = pgTable('yorha_cases',
 {
 id: uuid('id').primaryKey().defaultRandom(),
 case_number: varchar('case_number', { length: 100 }).notNull().unique(),
 title: varchar('title', { length: 500 }).notNull(),
 description: text('description'),
 status: varchar('status', { length: 50 }).default('active').notNull(),
 priority: varchar('priority', { length: 20 }).default('medium').notNull(),
 case_type: varchar('case_type', { length: 100 }),
 jurisdiction: varchar('jurisdiction', { length: 200 }),
 filed_date: timestamp('filed_date', { withTimezone: true }),
 closed_date: timestamp('closed_date', { withTimezone: true }),
 created_by: integer('created_by').notNull(),
 assigned_to: integer('assigned_to'),
 metadata: jsonb('metadata'),
 created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
 updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
 },
	(table) => ({
 case_number_idx: index('yorha_cases_case_number_idx').on(table.case_number),
 created_by_idx: index('yorha_cases_created_by_idx').on(table.created_by),
 status_idx: index('yorha_cases_status_idx').on(table.status),
 })
);

/**
 * YoRHa Evidence Nodes table - stores evidence items on the evidence board
 */
export const yorhaEvidenceNodes = pgTable('yorha_evidence_nodes',
 {
 id: uuid('id').primaryKey().defaultRandom(),
 case_id: uuid('case_id').notNull(),
 title: varchar('title', { length: 500 }).notNull(),
 description: text('description'),
 evidence_type: varchar('evidence_type', { length: 100 }).notNull(),
 position_x: integer('position_x').default(0),
 position_y: integer('position_y').default(0),
 color: varchar('color', { length: 20 }).default('blue'),
 icon: varchar('icon', { length: 100 }),
 source: varchar('source', { length: 500 }),
 date_collected: timestamp('date_collected', { withTimezone: true }),
 relevance_score: integer('relevance_score').default(0),
 file_path: varchar('file_path', { length: 1000 }),
 file_type: varchar('file_type', { length: 100 }),
 file_size: integer('file_size'),
 ai_summary: text('ai_summary'),
 ai_tags: jsonb('ai_tags'),
 key_entities: jsonb('key_entities'),
 status: varchar('status', { length: 50 }).default('active').notNull(),
 created_by: integer('created_by').notNull(),
 created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
 updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
 },
	(table) => ({
 case_id_idx: index('yorha_evidence_nodes_case_id_idx').on(table.case_id),
 evidence_type_idx: index('yorha_evidence_nodes_type_idx').on(table.evidence_type),
 created_by_idx: index('yorha_evidence_nodes_created_by_idx').on(table.created_by),
 })
);

/**
 * YoRHa Evidence Connections table - stores relationships between evidence nodes
 */
export const yorhaEvidenceConnections = pgTable('yorha_evidence_connections',
 {
 id: uuid('id').primaryKey().defaultRandom(),
 case_id: uuid('case_id').notNull(),
 source_node_id: uuid('source_node_id').notNull(),
 target_node_id: uuid('target_node_id').notNull(),
 connection_type: varchar('connection_type', { length: 100 }).notNull(),
 strength: integer('strength').default(50),
 description: text('description'),
 ai_reasoning: text('ai_reasoning'),
 confidence_score: integer('confidence_score').default(0),
 created_by: integer('created_by').notNull(),
 created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
 updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
 },
	(table) => ({
 case_id_idx: index('yorha_evidence_connections_case_id_idx').on(table.case_id),
 source_node_idx: index('yorha_evidence_connections_source_idx').on(table.source_node_id),
 target_node_idx: index('yorha_evidence_connections_target_idx').on(table.target_node_id),
 connection_type_idx: index('yorha_evidence_connections_type_idx').on(table.connection_type),
 })
);

/**
 * YoRHa Chat Sessions table - stores conversation sessions
 */
export const yorhaChatSessions = pgTable('yorha_chat_sessions',
 {
 id: uuid('id').primaryKey().defaultRandom(),
 case_id: uuid('case_id').notNull(),
 user_id: integer('user_id').notNull(),
 title: varchar('title', { length: 500 }),
 context_type: varchar('context_type', { length: 100 }),
 context_id: uuid('context_id'),
 status: varchar('status', { length: 50 }).default('active').notNull(),
 message_count: integer('message_count').default(0),
 created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
 updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
 last_message_at: timestamp('last_message_at', { withTimezone: true }),
 },
	(table) => ({
 case_id_idx: index('yorha_chat_sessions_case_id_idx').on(table.case_id),
 user_id_idx: index('yorha_chat_sessions_user_id_idx').on(table.user_id),
 status_idx: index('yorha_chat_sessions_status_idx').on(table.status),
 })
);

/**
 * Chat Document Attachments - files uploaded to chat context
 * Links documents to chat sessions with embedding status tracking
 */
export const chatDocumentAttachments = pgTable(
	'chat_document_attachments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		chat_session_id: uuid('chat_session_id')
			.notNull()
			.references(() => yorhaChatSessions.id, { onDelete: 'cascade' }),
		document_id: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
		file_name: varchar('file_name', { length: 255 }).notNull(),
		file_size: integer('file_size').notNull(),
		file_type: varchar('file_type', { length: 100 }),
		minio_path: varchar('minio_path', { length: 500 }),
		upload_timestamp: timestamp('upload_timestamp', { withTimezone: true }).defaultNow(),
		embedding_status: varchar('embedding_status', { length: 50 }).default('pending'), // 'pending' | 'processing' | 'completed' | 'failed'
		qdrant_id: uuid('qdrant_id'), // ID in Qdrant chat_documents collection
		metadata: jsonb('metadata').default({})
	},
	(table) => ({
		session_idx: index('chat_attachments_session_idx').on(table.chat_session_id),
		status_idx: index('chat_attachments_status_idx').on(table.embedding_status),
		document_idx: index('chat_attachments_document_idx').on(table.document_id)
	})
);

export type ChatDocumentAttachment = typeof chatDocumentAttachments.$inferSelect;
export type NewChatDocumentAttachment = typeof chatDocumentAttachments.$inferInsert;

/**
 * YoRHa Chat Messages table - stores individual messages in chat sessions
 */
export const yorhaChatMessages = pgTable('yorha_chat_messages',
 {
 id: uuid('id').primaryKey().defaultRandom(),
 session_id: uuid('session_id').notNull(),
 role: varchar('role', { length: 50 }).notNull(),
 content: text('content').notNull(),
 message_type: varchar('message_type', { length: 50 }).default('text'),
 referenced_evidence: jsonb('referenced_evidence'),
 model_used: varchar('model_used', { length: 100 }),
 tokens_used: integer('tokens_used'),
 created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
 updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
 },
	(table) => ({
 session_id_idx: index('yorha_chat_messages_session_id_idx').on(table.session_id),
 role_idx: index('yorha_chat_messages_role_idx').on(table.role),
 created_at_idx: index('yorha_chat_messages_created_at_idx').on(table.created_at),
 })
);

/**
 * YoRHa System Metrics table - stores historical system metrics
 */
export const yorhaSystemMetrics = pgTable('yorha_system_metrics',
 {
 id: serial('id').primaryKey(),
 cpu_usage: integer('cpu_usage'),
 cpu_cores: integer('cpu_cores'),
 memory_usage: integer('memory_usage'),
 memory_total_gb: integer('memory_total_gb'),
 memory_used_gb: integer('memory_used_gb'),
 gpu_usage: integer('gpu_usage'),
 gpu_memory_usage: integer('gpu_memory_usage'),
 gpu_temperature: integer('gpu_temperature'),
 disk_usage: integer('disk_usage'),
 disk_total_gb: integer('disk_total_gb'),
 disk_used_gb: integer('disk_used_gb'),
 network_latency_ms: integer('network_latency_ms'),
 network_bandwidth_mbps: integer('network_bandwidth_mbps'),
 system_health: varchar('system_health', { length: 50 }).default('healthy'),
 active_cases: integer('active_cases').default(0),
 active_sessions: integer('active_sessions').default(0),
 recorded_at: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
 },
	(table) => ({
 recorded_at_idx: index('yorha_system_metrics_recorded_at_idx').on(table.recorded_at),
 })
);

// === YORHA RELATIONS ===

export const yorhaCasesRelations = relations(yorhaCases, ({ many }) => ({
 evidence_nodes: many(yorhaEvidenceNodes),
 evidence_connections: many(yorhaEvidenceConnections),
 chat_sessions: many(yorhaChatSessions),
}));

export const yorhaEvidenceNodesRelations = relations(yorhaEvidenceNodes, ({ one, many }) => ({
 case: one(yorhaCases, {
 fields: [yorhaEvidenceNodes.case_id],
 references: [yorhaCases.id],
 }),
 outgoing_connections: many(yorhaEvidenceConnections, {
 relationName: 'source',
 }),
 incoming_connections: many(yorhaEvidenceConnections, {
 relationName: 'target',
 }),
}));

export const yorhaEvidenceConnectionsRelations = relations(yorhaEvidenceConnections, ({ one }) => ({
 case: one(yorhaCases, {
 fields: [yorhaEvidenceConnections.case_id],
 references: [yorhaCases.id],
 }),
 source_node: one(yorhaEvidenceNodes, {
 fields: [yorhaEvidenceConnections.source_node_id],
 references: [yorhaEvidenceNodes.id],
 relationName: 'source',
 }),
 target_node: one(yorhaEvidenceNodes, {
 fields: [yorhaEvidenceConnections.target_node_id],
 references: [yorhaEvidenceNodes.id],
 relationName: 'target',
 }),
}));

export const yorhaChatSessionsRelations = relations(yorhaChatSessions, ({ one, many }) => ({
 case: one(yorhaCases, {
 fields: [yorhaChatSessions.case_id],
 references: [yorhaCases.id],
 }),
 messages: many(yorhaChatMessages),
}));

export const yorhaChatMessagesRelations = relations(yorhaChatMessages, ({ one }) => ({
 session: one(yorhaChatSessions, {
 fields: [yorhaChatMessages.session_id],
 references: [yorhaChatSessions.id],
 }),
}));

// === TYPE EXPORTS ===

export type YoRHaCase = typeof yorhaCases.$inferSelect;
export type NewYoRHaCase = typeof yorhaCases.$inferInsert;

export type YoRHaEvidenceNode = typeof yorhaEvidenceNodes.$inferSelect;
export type NewYoRHaEvidenceNode = typeof yorhaEvidenceNodes.$inferInsert;

export type YoRHaEvidenceConnection = typeof yorhaEvidenceConnections.$inferSelect;
export type NewYoRHaEvidenceConnection = typeof yorhaEvidenceConnections.$inferInsert;

export type YoRHaChatSession = typeof yorhaChatSessions.$inferSelect;
export type NewYoRHaChatSession = typeof yorhaChatSessions.$inferInsert;

export type YoRHaChatMessage = typeof yorhaChatMessages.$inferSelect;
export type NewYoRHaChatMessage = typeof yorhaChatMessages.$inferInsert;

export type YoRHaSystemMetrics = typeof yorhaSystemMetrics.$inferSelect;
export type NewYoRHaSystemMetrics = typeof yorhaSystemMetrics.$inferInsert;

// ============================================================================
// PHASE 78: CUTLASS ERROR BRAIN SCHEMA
// ============================================================================
export const routeHealthStateEnum = pgEnum('route_health_state', ['healthy', 'degraded', 'unhealthy']);
export const errorKindEnum = pgEnum('error_kind', ['runtime', 'api', 'other']);
export const errorSeverityEnum = pgEnum('error_severity', ['info', 'warn', 'error', 'critical']);
export const suggestionStateEnum = pgEnum('suggestion_state', ['pending', 'applied', 'dismissed', 'snoozed']);

/**
 * route_health: Current health state of each route (HMM-style state tracking)
 */
export const routeHealth = pgTable('route_health',
 {
 id: uuid('id').primaryKey().defaultRandom(),
 routePath: varchar('route_path', { length: 255 }).notNull().unique(),
 file: varchar('file', { length: 500 }),
 state: routeHealthStateEnum('state').notNull().default('healthy'),
 recentErrorCount: integer('recent_error_count').notNull().default(0),
 totalErrorCount: integer('total_error_count').notNull().default(0),
 lastErrorAt: timestamp('last_error_at'),
 lastErrorClusterId: uuid('last_error_cluster_id'),
 lastErrorMessageShort: text('last_error_message_short'),
 routeCluster: varchar('route_cluster', { length: 100 }),
 routeOwner: varchar('route_owner', { length: 100 }),
 updatedAt: timestamp('updated_at').notNull().defaultNow(),
 createdAt: timestamp('created_at').notNull().defaultNow(),
 },
	(table) => ({
 idxRoutePath: index('idx_route_health_path').on(table.routePath),
 idxState: index('idx_route_health_state').on(table.state),
 idxUpdatedAt: index('idx_route_health_updated').on(table.updatedAt),
 idxCluster: index('idx_route_health_cluster').on(table.routeCluster),
 })
);

/**
 * error_events: Individual error occurrences
 */
export const errorEvents = pgTable('error_events',
 {
 id: uuid('id').primaryKey().defaultRandom(),
 routePath: varchar('route_path', { length: 255 }).notNull(),
 file: varchar('file', { length: 500 }),
 kind: errorKindEnum('kind').notNull().default('other'),
 severity: errorSeverityEnum('severity').notNull().default('warn'),
 tsCode: varchar('ts_code', { length: 50 }),
 message: text('message').notNull(),
 stack: text('stack'),
 lineNumber: integer('line_number'),
 columnNumber: integer('column_number'),
 clusterId: uuid('cluster_id'),
 collectedAt: timestamp('collected_at').notNull().defaultNow(),
 createdAt: timestamp('created_at').notNull().defaultNow(),
 },
	(table) => ({
 idxRoutePath: index('idx_error_events_route').on(table.routePath),
 idxKind: index('idx_error_events_kind').on(table.kind),
 idxClusterId: index('idx_error_events_cluster').on(table.clusterId),
 idxCollectedAt: index('idx_error_events_collected').on(table.collectedAt),
 })
);

/**
 * error_clusters: Grouped similar errors with embeddings
 */
export const errorClusters = pgTable('error_clusters',
 {
 id: uuid('id').primaryKey().defaultRandom(),
 kind: errorKindEnum('kind').notNull(),
 severity: errorSeverityEnum('severity').notNull().default('warn'),
 pattern: text('pattern').notNull(),
 errorCount: integer('error_count').notNull().default(1),
 routePaths: text('route_paths').array(),
 radius: numeric('radius'),
 lastUpdated: timestamp('last_updated').notNull().defaultNow(),
 createdAt: timestamp('created_at').notNull().defaultNow(),
 },
	(table) => ({
 idxKind: index('idx_error_clusters_kind').on(table.kind),
 idxSeverity: index('idx_error_clusters_severity').on(table.severity),
 })
);

/**
 * error_suggestions: LLM-generated fix suggestions
 */
export const errorSuggestions = pgTable('error_suggestions',
 {
 id: uuid('id').primaryKey().defaultRandom(),
 clusterId: uuid('cluster_id')
 .notNull()
 .references(() => errorClusters.id),
 title: varchar('title', { length: 255 }).notNull(),
 explanation: text('explanation').notNull(),
 patch: text('patch'),
 confidence: numeric('confidence'),
 hints: text('hints').array(),
 generatedAt: timestamp('generated_at').notNull().defaultNow(),
 appliedCount: integer('applied_count').notNull().default(0),
 successCount: integer('success_count').notNull().default(0),
 createdAt: timestamp('created_at').notNull().defaultNow(),
 },
	(table) => ({
 idxClusterId: index('idx_error_suggestions_cluster').on(table.clusterId),
 })
);

/**
 * route_error_patches: Track patches applied to routes
 */
export const routeErrorPatches = pgTable('route_error_patches',
 {
 id: uuid('id').primaryKey().defaultRandom(),
 routePath: varchar('route_path', { length: 255 }).notNull(),
 routeFile: varchar('route_file', { length: 500 }),
 errorCode: varchar('error_code', { length: 64 }).notNull(),
 suggestionTitle: varchar('suggestion_title', { length: 255 }),
 patchText: text('patch_text').notNull(),
 patchExplanation: text('patch_explanation'),
 confidence: numeric('confidence')
 .notNull()
 .default(sql`0.50`),
 hints: text('hints').array(),
 status: patchStatusEnum('status').notNull().default('suggested'),
 source: varchar('source', { length: 64 }).notNull().default('phase78'),
 metadata: jsonb('metadata').notNull().default({}),
 createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
 appliedAt: timestamp('applied_at'),
 createdAt: timestamp('created_at').notNull().defaultNow(),
 updatedAt: timestamp('updated_at').notNull().defaultNow(),
 },
	(table) => ({
 idxRoutePath: index('idx_route_patches_route').on(table.routePath),
 idxStatus: index('idx_route_patches_status').on(table.status),
 idxErrorCode: index('idx_route_patches_error_code').on(table.errorCode),
 })
);

/**
 * error_timeline: Timeline of error events for audit trail
 */
export const errorTimeline = pgTable('error_timeline',
 {
 id: uuid('id').primaryKey().defaultRandom(),
 routePath: varchar('route_path', { length: 255 }).notNull(),
 eventType: varchar('event_type', { length: 50 }).notNull(),
 description: text('description'),
 metadata: jsonb('metadata'),
 occurredAt: timestamp('occurred_at').notNull().defaultNow(),
 createdAt: timestamp('created_at').notNull().defaultNow(),
 },
	(table) => ({
 idxRoutePath: index('idx_error_timeline_route').on(table.routePath),
 idxEventType: index('idx_error_timeline_event').on(table.eventType),
 })
);

/**
 * error_suggestion_states: Track user feedback on AI suggestions (dismiss, snooze, apply)
 */
export const errorSuggestionStates = pgTable('error_suggestion_states',
 {
 id: uuid('id').primaryKey().defaultRandom(),
 suggestionId: uuid('suggestion_id')
 .notNull()
 .references(() => errorSuggestions.id, { onDelete: 'cascade' }),
 routePath: varchar('route_path', { length: 255 }).notNull(),
 userId: integer('user_id'),
 state: suggestionStateEnum('state').notNull().default('pending'),
 createdAt: timestamp('created_at').notNull().defaultNow(),
 updatedAt: timestamp('updated_at').notNull().defaultNow(),
 },
	(table) => ({
 idxSuggestionRoute: index('idx_error_suggestion_states_suggestion_route').on(
 table.suggestionId, table.routePath
 ),
 uniqueSuggestionRouteUser: unique('uq_error_suggestion_states_suggestion_route_user').on(
 table.suggestionId, table.routePath,
 table.userId
 ),
 })
);

/**
 * error_feedback: User feedback on suggestions
 */
export const errorFeedback = pgTable('error_feedback',
 {
 id: uuid('id').primaryKey().defaultRandom(),
 suggestionId: uuid('suggestion_id')
 .notNull()
 .references(() => errorSuggestions.id),
 routePath: varchar('route_path', { length: 255 }).notNull(),
 helpful: boolean('helpful'),
 accurate: boolean('accurate'),
 worksSoon: boolean('works_soon'),
 feedback: text('feedback'),
 createdAt: timestamp('created_at').notNull().defaultNow(),
 },
	(table) => ({
 idxSuggestionId: index('idx_error_feedback_suggestion').on(table.suggestionId),
 idxRoutePath: index('idx_error_feedback_route').on(table.routePath),
 })
);

// ============================================================================
// DIAGNOSIS HISTORY (Page-aware AI diagnosis persistence)
// ============================================================================

/**
 * diagnosis_events: Persisted AI diagnosis results from the error-brain pipeline.
 * Stores the full typed DiagnosisResult so we can:
 *   - Learn from past diagnoses (reranking, pattern detection)
 *   - Show diagnosis history per route
 *   - Track accuracy via feedback (was the root cause correct?)
 *   - Measure latency trends
 */
export const diagnosisEvents = pgTable('diagnosis_events',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		routePath: varchar('route_path', { length: 255 }),
		filePath: varchar('file_path', { length: 500 }),
		query: text('query').notNull(),
		mode: varchar('mode', { length: 20 }).notNull().default('route'),
		probableRootCauseType: varchar('probable_root_cause_type', { length: 50 }).notNull().default('unknown'),
		riskLevel: varchar('risk_level', { length: 10 }).notNull().default('medium'),
		diagnosis: text('diagnosis').notNull(),
		likelyFiles: jsonb('likely_files').default([]).notNull(),
		impactedFiles: jsonb('impacted_files').default([]).notNull(),
		fixPlan: jsonb('fix_plan').default([]).notNull(),
		evidence: jsonb('evidence').default([]).notNull(),
		rankedFiles: jsonb('ranked_files').default([]).notNull(),
		suggestedTests: jsonb('suggested_tests').default([]).notNull(),
		sources: jsonb('sources').default({}).notNull(),
		needsHumanReview: boolean('needs_human_review').notNull().default(true),
		unsafeToAutoPatch: boolean('unsafe_to_auto_patch').notNull().default(false),
		cached: boolean('cached').notNull().default(false),
		totalMs: integer('total_ms'),
		stages: jsonb('stages').default({}).notNull(),
		userId: integer('user_id'),
		feedbackAccurate: boolean('feedback_accurate'),
		feedbackHelpful: boolean('feedback_helpful'),
		queryEmbedding: vector('query_embedding', { dimensions: 768 }),
		createdAt: timestamp('created_at').notNull().defaultNow(),
	},
	(table) => ({
		idxRoutePath: index('idx_diagnosis_events_route').on(table.routePath),
		idxMode: index('idx_diagnosis_events_mode').on(table.mode),
		idxRootCause: index('idx_diagnosis_events_root_cause').on(table.probableRootCauseType),
		idxCreatedAt: index('idx_diagnosis_events_created').on(table.createdAt),
	})
);

// ============================================================================
// PHASE 78 TYPE EXPORTS
// ============================================================================

export type RouteHealth = typeof routeHealth.$inferSelect;
export type NewRouteHealth = typeof routeHealth.$inferInsert;

export type ErrorEvent = typeof errorEvents.$inferSelect;
export type NewErrorEvent = typeof errorEvents.$inferInsert;

export type ErrorCluster = typeof errorClusters.$inferSelect;
export type NewErrorCluster = typeof errorClusters.$inferInsert;

export type ErrorSuggestion = typeof errorSuggestions.$inferSelect;
export type NewErrorSuggestion = typeof errorSuggestions.$inferInsert;

export type RouteErrorPatch = typeof routeErrorPatches.$inferSelect;
export type NewRouteErrorPatch = typeof routeErrorPatches.$inferInsert;

export type ErrorTimeline = typeof errorTimeline.$inferSelect;
export type NewErrorTimeline = typeof errorTimeline.$inferInsert;

export type ErrorSuggestionState = typeof errorSuggestionStates.$inferSelect;
export type NewErrorSuggestionState = typeof errorSuggestionStates.$inferInsert;

export type ErrorFeedback = typeof errorFeedback.$inferSelect;
export type NewErrorFeedback = typeof errorFeedback.$inferInsert;

export type DiagnosisEvent = typeof diagnosisEvents.$inferSelect;
export type NewDiagnosisEvent = typeof diagnosisEvents.$inferInsert;

// === CASE REPORTS ===
export const caseReports = pgTable('case_reports', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	caseId: uuid('case_id').notNull(),
	version: integer('version').notNull(),
	isCurrent: boolean('is_current').default(true).notNull(),
	summaryText: text('summary_text').notNull(),
	citations: jsonb('citations').default([]).notNull(),
	holding: text('holding'),
	createdBy: varchar('created_by', { length: 255 }),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

// === AUDIT LOG ===
export const auditLog = pgTable('audit_log', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	userId: integer('user_id').notNull(),
	action: varchar('action', { length: 100 }).notNull(),
	resourceType: varchar('resource_type', { length: 100 }).notNull(),
	resourceId: varchar('resource_id', { length: 255 }).notNull(),
	details: jsonb('details').default({}).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

// === TOPIC MODELING & RECOMMENDATIONS ===

/**
 * document_topics: Maps documents to k-means topic clusters
 * One document can belong to multiple topics with varying membership probability
 * Indexed by both documentId and topicId for efficient filtering
 */
export const documentTopics = pgTable(
	'document_topics',
	{
		id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
		documentId: uuid('document_id').notNull(),
		topicId: integer('topic_id').notNull(), // 0-14 (k=15 clusters)
		membershipProbability: real('membership_probability').notNull(), // 0.0-1.0, sum across topics ≤ 1.0
		centroidDistance: real('centroid_distance').notNull(), // Euclidean distance to cluster centroid
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	},
	(table) => ({
		documentIdIdx: index('document_topics_document_id_idx').on(table.documentId),
		topicIdIdx: index('document_topics_topic_id_idx').on(table.topicId),
		uniqueDocTopic: unique('document_topics_document_id_topic_id_unique').on(table.documentId, table.topicId),
	})
);

export type DocumentTopic = typeof documentTopics.$inferSelect;
export type NewDocumentTopic = typeof documentTopics.$inferInsert;

/**
 * user_interaction_history: Tracks clicks, views, and saves for recommendation ranking
 * Used for collaborative filtering + content-based scoring (7-day exponential decay window)
 */
export const userInteractionHistory = pgTable(
	'user_interaction_history',
	{
		id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
		userId: integer('user_id').notNull(),
		recommendationId: uuid('recommendation_id'), // Reference to earlier /api/recommendations response
		documentId: uuid('document_id'),
		caseId: uuid('case_id'),
		interactionType: varchar('interaction_type', { length: 50 }).notNull(), // 'view', 'click', 'save', 'share', 'dismiss'
		durationSeconds: integer('duration_seconds'), // How long user viewed the recommendation
		searchContext: text('search_context'), // User's search query at time of interaction
		topicPreferences: jsonb('topic_preferences').default([]).notNull(), // Array of { topicId, affinity } inferred from interaction
		metadata: jsonb('metadata').default({}).notNull(), // Custom interaction data
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	},
	(table) => ({
		userIdIdx: index('user_interaction_history_user_id_idx').on(table.userId),
		documentIdIdx: index('user_interaction_history_document_id_idx').on(table.documentId),
		caseIdIdx: index('user_interaction_history_case_id_idx').on(table.caseId),
		createdAtIdx: index('user_interaction_history_created_at_idx').on(table.createdAt),
	})
);

export type UserInteractionHistory = typeof userInteractionHistory.$inferSelect;
export type NewUserInteractionHistory = typeof userInteractionHistory.$inferInsert;






export type NewUserAiQuery = typeof userAiQueries.$inferInsert;
export type NewAutoTag = typeof autoTags.$inferInsert;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;

// === EVIDENCE AUDIT LOG (chain of custody compliance) ===

export const evidenceAuditLog = pgTable('evidence_audit_log', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	evidenceId: uuid('evidence_id')
		.notNull()
		.references(() => evidence.id, { onDelete: 'cascade' }),
	userId: integer('user_id')
		.references(() => users.id, { onDelete: 'set null' }),
	action: varchar('action', { length: 50 }).notNull(), // 'uploaded', 'viewed', 'updated', 'deleted', 'exported', 'tagged', 'analyzed'
	changes: jsonb('changes'), // { field: { old, new } } diff
	ipAddress: varchar('ip_address', { length: 45 }),
	userAgent: text('user_agent'),
	timestamp: timestamp('timestamp', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	evidenceIdIdx: index('evidence_audit_log_evidence_id_idx').on(table.evidenceId),
	userIdIdx: index('evidence_audit_log_user_id_idx').on(table.userId),
	timestampIdx: index('evidence_audit_log_timestamp_idx').on(table.timestamp),
	actionIdx: index('evidence_audit_log_action_idx').on(table.action),
}));

export type EvidenceAuditLog = typeof evidenceAuditLog.$inferSelect;
export type NewEvidenceAuditLog = typeof evidenceAuditLog.$inferInsert;

// === EVIDENCE VERSIONS (metadata change tracking) ===

export const evidenceVersions = pgTable('evidence_versions', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	evidenceId: uuid('evidence_id')
		.notNull()
		.references(() => evidence.id, { onDelete: 'cascade' }),
	version: integer('version').notNull(),
	title: varchar('title', { length: 255 }),
	description: text('description'),
	metadata: jsonb('metadata'),
	changedBy: uuid('changed_by')
		.references(() => users.id, { onDelete: 'set null' }),
	changeReason: text('change_reason'),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	evidenceIdIdx: index('evidence_versions_evidence_id_idx').on(table.evidenceId),
	versionIdx: index('evidence_versions_version_idx').on(table.evidenceId, table.version),
}));

export type EvidenceVersion = typeof evidenceVersions.$inferSelect;
export type NewEvidenceVersion = typeof evidenceVersions.$inferInsert;

// === EVIDENCE ENTITIES (normalized entity extraction results) ===

export const evidenceEntities = pgTable('evidence_entities', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	evidenceId: uuid('evidence_id')
		.notNull()
		.references(() => evidence.id, { onDelete: 'cascade' }),
	caseId: uuid('case_id')
		.references(() => cases.id, { onDelete: 'set null' }),
	entityText: text('entity_text').notNull(),
	entityLabel: varchar('entity_label', { length: 50 }).notNull(),
	confidence: real('confidence'),
	startOffset: integer('start_offset'),
	endOffset: integer('end_offset'),
	source: varchar('source', { length: 20 }).default('llm'), // 'llm' | 'regex' | 'yolo' | 'vlm'
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	evidenceIdIdx: index('evidence_entities_evidence_id_idx').on(table.evidenceId),
	caseIdIdx: index('evidence_entities_case_id_idx').on(table.caseId),
	labelIdx: index('evidence_entities_label_idx').on(table.entityLabel),
	textLabelIdx: index('evidence_entities_text_label_idx').on(table.entityText, table.entityLabel),
}));

export type EvidenceEntity = typeof evidenceEntities.$inferSelect;
export type NewEvidenceEntity = typeof evidenceEntities.$inferInsert;

// === EVIDENCE FORENSIC FLAGS (normalized forensic detection results) ===

export const evidenceForensicFlags = pgTable('evidence_forensic_flags', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	evidenceId: uuid('evidence_id')
		.notNull()
		.references(() => evidence.id, { onDelete: 'cascade' }),
	caseId: uuid('case_id')
		.references(() => cases.id, { onDelete: 'set null' }),
	flagType: varchar('flag_type', { length: 50 }).notNull(),
	description: text('description').notNull(),
	severity: varchar('severity', { length: 10 }).notNull(), // 'high' | 'medium' | 'low'
	metadata: jsonb('metadata'),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	evidenceIdIdx: index('evidence_forensic_flags_evidence_id_idx').on(table.evidenceId),
	caseIdIdx: index('evidence_forensic_flags_case_id_idx').on(table.caseId),
	flagTypeIdx: index('evidence_forensic_flags_type_idx').on(table.flagType),
	severityIdx: index('evidence_forensic_flags_severity_idx').on(table.severity),
}));

export type EvidenceForensicFlag = typeof evidenceForensicFlags.$inferSelect;
export type NewEvidenceForensicFlag = typeof evidenceForensicFlags.$inferInsert;

// === ANALYTICS EVENTS (durable event log for RabbitMQ analytics consumer) ===

export const analyticsEvents = pgTable('analytics_events', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	eventType: varchar('event_type', { length: 100 }).notNull(),
	userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
	sessionId: varchar('session_id', { length: 255 }),
	payload: jsonb('payload').default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	eventTypeIdx: index('analytics_events_event_type_idx').on(table.eventType),
	createdAtIdx: index('analytics_events_created_at_idx').on(table.createdAt),
	userIdIdx: index('analytics_events_user_id_idx').on(table.userId),
}));

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert;

// === FAILED JOBS (durable log for RabbitMQ dead-lettered messages) ===

export const failedJobs = pgTable('failed_jobs', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	queue: varchar('queue', { length: 100 }).notNull(),
	dlqQueue: varchar('dlq_queue', { length: 100 }).notNull(),
	reason: varchar('reason', { length: 100 }).notNull().default('unknown'),
	retryCount: integer('retry_count').notNull().default(0),
	payload: jsonb('payload').default({}),
	error: text('error'),
	deadLetteredAt: timestamp('dead_lettered_at', { withTimezone: true }).default(sql`now()`).notNull(),
	resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (table) => ({
	queueIdx: index('failed_jobs_queue_idx').on(table.queue),
	deadLetteredAtIdx: index('failed_jobs_dead_lettered_at_idx').on(table.deadLetteredAt),
	resolvedAtIdx: index('failed_jobs_resolved_at_idx').on(table.resolvedAt),
}));

export type FailedJob = typeof failedJobs.$inferSelect;
export type NewFailedJob = typeof failedJobs.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// LEGAL LIBRARY (hierarchy-first corpus model)
// Tables: jurisdictions, library_documents, library_document_versions,
//         legal_nodes, legal_chunks, legal_definitions,
//         legal_citations, case_library_links, page_artifacts, ingestion_jobs
// ═══════════════════════════════════════════════════════════════════════════

// --- Enums (created in SQL migration, referenced here) ---

export const sourceTypeEnum = pgEnum('source_type', [
	'upload', 'govinfo', 'state_official', 'openstates', 'lii_reference',
]);

export const corpusTypeEnum = pgEnum('corpus_type', [
	'constitution', 'statute', 'regulation', 'bill', 'case', 'glossary', 'treatise', 'other',
]);

export const legalNodeTypeEnum = pgEnum('legal_node_type', [
	'document', 'title', 'article', 'amendment', 'chapter', 'part', 'section',
	'subsection', 'paragraph', 'clause', 'definition', 'appendix', 'note',
]);

export const processingStatusEnum = pgEnum('processing_status', [
	'queued', 'extracting', 'ocr', 'structuring', 'chunking', 'embedding', 'graphing', 'complete', 'failed',
]);

export const citationTypeEnum = pgEnum('citation_type', [
	'statutory', 'constitutional', 'regulatory', 'judicial', 'other',
]);

export const caseLinkCategoryEnum = pgEnum('case_link_category', [
  'charged_under',
  'cited_authority',
  'defense_authority',
  'court_ruling',
  'related_regulation',
  'constitutional_basis',
  'sentencing_guideline',
  'glossary_concept',
]);

// --- Jurisdictions lookup ---

export const jurisdictions = pgTable('jurisdictions', {
	id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
	code: text('code').unique().notNull(),
	name: text('name').notNull(),
	level: text('level').notNull(),
	parentId: bigint('parent_id', { mode: 'number' }),
});

export type Jurisdiction = typeof jurisdictions.$inferSelect;
export type NewJurisdiction = typeof jurisdictions.$inferInsert;

// --- Library Documents ---

export const libraryDocuments = pgTable('library_documents', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	sourceType: sourceTypeEnum('source_type').notNull().default('upload'),
	corpusType: corpusTypeEnum('corpus_type').notNull().default('other'),
	jurisdictionId: bigint('jurisdiction_id', { mode: 'number' }).references(() => jurisdictions.id),
	title: text('title').notNull(),
	shortTitle: text('short_title'),
	citation: text('citation'),
	officialUrl: text('official_url'),
	sourceHash: text('source_hash'),
	mimeType: text('mime_type').default('application/pdf'),
	minioKey: text('minio_key').notNull(),
	pageCount: integer('page_count'),
	effectiveDate: date('effective_date'),
	updatedAtSource: timestamp('updated_at_source', { withTimezone: true }),
	isOfficial: boolean('is_official').default(false),
	processingStatus: processingStatusEnum('processing_status').notNull().default('queued'),
	uploadedBy: integer('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
	sourceConfidence: text('source_confidence'),
	fetchedAt: timestamp('fetched_at', { withTimezone: true }),
	minioKeyNormalized: text('minio_key_normalized'),
	sourceKind: text('source_kind').default('uploaded_pdf'),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	jurisdictionIdx: index('library_docs_jurisdiction_idx').on(table.jurisdictionId),
	corpusIdx: index('library_docs_corpus_idx').on(table.corpusType),
	statusIdx: index('library_docs_status_idx').on(table.processingStatus),
}));

export type LibraryDocument = typeof libraryDocuments.$inferSelect;
export type NewLibraryDocument = typeof libraryDocuments.$inferInsert;

// --- Library Document Versions ---

export const libraryDocumentVersions = pgTable('library_document_versions', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	documentId: uuid('document_id').notNull().references(() => libraryDocuments.id, { onDelete: 'cascade' }),
	versionLabel: text('version_label'),
	sourceDate: date('source_date'),
	isCurrent: boolean('is_current').default(false),
	parentVersionId: uuid('parent_version_id'),
	diffSummary: text('diff_summary'),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
});

export type LibraryDocumentVersion = typeof libraryDocumentVersions.$inferSelect;

// --- Legal Nodes (hierarchy tree) ---

export const legalNodes = pgTable('legal_nodes', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	documentId: uuid('document_id').notNull().references(() => libraryDocuments.id, { onDelete: 'cascade' }),
	versionId: uuid('version_id').references(() => libraryDocumentVersions.id, { onDelete: 'cascade' }),
	parentNodeId: uuid('parent_node_id'),
	nodeType: legalNodeTypeEnum('node_type').notNull().default('section'),
	ordinal: text('ordinal'),
	heading: text('heading'),
	citationLabel: text('citation_label'),
	nodePath: text('node_path').notNull(),
	depth: integer('depth').notNull().default(0),
	pageStart: integer('page_start'),
	pageEnd: integer('page_end'),
	charStart: integer('char_start'),
	charEnd: integer('char_end'),
	fullText: text('full_text').notNull(),
	textClean: text('text_clean').notNull(),
	tagsJson: jsonb('tags_json').default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	docIdx: index('legal_nodes_doc_idx').on(table.documentId),
	parentIdx: index('legal_nodes_parent_idx').on(table.parentNodeId),
	pathIdx: index('legal_nodes_path_idx').on(table.documentId, table.nodePath),
}));

export type LegalNode = typeof legalNodes.$inferSelect;
export type NewLegalNode = typeof legalNodes.$inferInsert;

// --- Legal Chunks (section → chunk → embedding) ---

export const legalChunks = pgTable('legal_chunks', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	legalNodeId: uuid('legal_node_id').notNull().references(() => legalNodes.id, { onDelete: 'cascade' }),
	chunkIndex: integer('chunk_index').notNull(),
	chunkText: text('chunk_text').notNull(),
	tokenCount: integer('token_count'),
	pageStart: integer('page_start'),
	pageEnd: integer('page_end'),
	charStart: integer('char_start'),
	charEnd: integer('char_end'),
	embedding: vector('embedding', { dimensions: 768 }),
	summary: text('summary'),
	qdrantPointId: text('qdrant_point_id'),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	nodeIdx: index('legal_chunks_node_idx').on(table.legalNodeId),
	nodeChunkUnique: unique('legal_chunks_node_chunk_unique').on(table.legalNodeId, table.chunkIndex),
}));

export type LegalChunk = typeof legalChunks.$inferSelect;
export type NewLegalChunk = typeof legalChunks.$inferInsert;

// --- Legal Definitions (glossary terms within documents) ---

export const legalDefinitions = pgTable('legal_definitions', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	term: text('term').notNull(),
	normalizedTerm: text('normalized_term').notNull(),
	definedInNodeId: uuid('defined_in_node_id').notNull().references(() => legalNodes.id, { onDelete: 'cascade' }),
	definitionText: text('definition_text').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	termIdx: index('legal_defs_term_idx').on(table.normalizedTerm),
}));

export type LegalDefinition = typeof legalDefinitions.$inferSelect;

// --- Legal Citations (cross-references between nodes) ---

export const legalCitations = pgTable('legal_citations', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	fromNodeId: uuid('from_node_id').notNull().references(() => legalNodes.id, { onDelete: 'cascade' }),
	toNodeId: uuid('to_node_id').references(() => legalNodes.id, { onDelete: 'set null' }),
	citationText: text('citation_text').notNull(),
	citationType: citationTypeEnum('citation_type').notNull().default('other'),
	normalizedTarget: text('normalized_target'),
	confidence: real('confidence').default(1.0),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	fromIdx: index('idx_legal_citations_from').on(table.fromNodeId),
	toIdx: index('idx_legal_citations_to').on(table.toNodeId),
	targetIdx: index('idx_legal_citations_target').on(table.normalizedTarget),
}));

export type LegalCitation = typeof legalCitations.$inferSelect;

// --- Case ↔ Library Links ---

export const caseLibraryLinks = pgTable('case_library_links', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
	documentId: uuid('document_id').references(() => libraryDocuments.id, { onDelete: 'cascade' }),
	nodeId: uuid('node_id').references(() => legalNodes.id, { onDelete: 'set null' }),
	category: caseLinkCategoryEnum('category').notNull().default('cited_authority'),
	relevanceScore: real('relevance_score'),
	citationText: text('citation_text'),
	notes: text('notes'),
	addedBy: uuid('added_by'),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	caseIdx: index('case_lib_links_case_idx').on(table.caseId),
	docIdx: index('case_lib_links_doc_idx').on(table.documentId),
	nodeIdx: index('case_lib_links_node_idx').on(table.nodeId),
}));

export type CaseLibraryLink = typeof caseLibraryLinks.$inferSelect;

// --- Page Artifacts (per-page extraction) ---

export const pageArtifacts = pgTable('page_artifacts', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	documentId: uuid('document_id').notNull().references(() => libraryDocuments.id, { onDelete: 'cascade' }),
	pageNumber: integer('page_number').notNull(),
	imageMinioKey: text('image_minio_key'),
	extractedText: text('extracted_text'),
	ocrText: text('ocr_text'),
	finalText: text('final_text'),
	hasNativeText: boolean('has_native_text').default(false),
	ocrConfidence: numeric('ocr_confidence', { precision: 5, scale: 4 }),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	docIdx: index('page_artifacts_doc_idx').on(table.documentId),
	docPageUnique: unique('page_artifacts_doc_page_unique').on(table.documentId, table.pageNumber),
}));

export type PageArtifact = typeof pageArtifacts.$inferSelect;

// --- Ingestion Jobs (pipeline progress tracking) ---

export const ingestionJobs = pgTable('ingestion_jobs', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	documentId: uuid('document_id').notNull().references(() => libraryDocuments.id, { onDelete: 'cascade' }),
	stage: processingStatusEnum('stage').notNull().default('queued'),
	status: text('status').notNull().default('running'),
	progress: numeric('progress', { precision: 5, scale: 2 }).default('0'),
	errorText: text('error_text'),
	metricsJson: jsonb('metrics_json').default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	docIdx: index('ingestion_jobs_doc_idx').on(table.documentId),
	statusIdx: index('ingestion_jobs_status_idx').on(table.status),
}));

export type IngestionJob = typeof ingestionJobs.$inferSelect;

// ============================================================================
// AI USAGE LOG — Token tracking for LLM inference
// ============================================================================

export const aiUsageLog = pgTable('ai_usage_log', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
	endpoint: varchar('endpoint', { length: 255 }).notNull(),
	model: varchar('model', { length: 100 }).notNull(),
	promptTokens: integer('prompt_tokens').default(0).notNull(),
	completionTokens: integer('completion_tokens').default(0).notNull(),
	totalTokens: integer('total_tokens').default(0).notNull(),
	durationMs: integer('duration_ms'),
	cached: boolean('cached').default(false).notNull(),
	metadata: jsonb('metadata'),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	userIdx: index('ai_usage_log_user_idx').on(table.userId),
	endpointIdx: index('ai_usage_log_endpoint_idx').on(table.endpoint),
	createdAtIdx: index('ai_usage_log_created_at_idx').on(table.createdAt),
	modelIdx: index('ai_usage_log_model_idx').on(table.model),
}));

export type AiUsageLog = typeof aiUsageLog.$inferSelect;
export type NewAiUsageLog = typeof aiUsageLog.$inferInsert;

// === CANONICAL LEGAL DOCUMENTS (Prosecutor Simulation — Phase 1) ===
// Real laws, opinions, and rules with jurisdiction tags and authority levels

export const authorityLevelEnum = pgEnum('authority_level', [
	'primary',      // statutes, regulations, binding opinions, jury instructions
	'persuasive',   // non-binding opinions, treatises, agency guidance
	'secondary',    // LII, Shouse, legal encyclopedias
	'fictional',    // generated fictional case materials
]);

export const jurisdictionEnum = pgEnum('jurisdiction', [
	'US-FED', 'CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC',
	'MI', 'NJ', 'VA', 'WA', 'AZ', 'MA', 'TN', 'IN', 'MO', 'MD',
	'WI', 'CO', 'MN', 'SC', 'AL', 'LA', 'KY', 'OR', 'OK', 'CT',
	'UT', 'IA', 'NV', 'AR', 'MS', 'KS', 'NM', 'NE', 'ID', 'WV',
	'HI', 'NH', 'ME', 'MT', 'RI', 'DE', 'SD', 'ND', 'AK', 'VT', 'WY', 'DC',
]);

export const canonicalDocuments = pgTable('canonical_documents', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	title: varchar('title', { length: 500 }).notNull(),
	docType: varchar('doc_type', { length: 100 }).notNull(), // 'statute', 'opinion', 'rule', 'jury_instruction', 'treatise'
	citation: varchar('citation', { length: 500 }),           // e.g. "18 U.S.C. § 1343" or "FRE 401"
	jurisdiction: jurisdictionEnum('jurisdiction').notNull(),
	authorityLevel: authorityLevelEnum('authority_level').notNull(),
	sourceUrl: text('source_url'),
	sourceName: varchar('source_name', { length: 200 }),      // 'CourtListener', 'CAP', 'Cornell LII'
	licenseTag: varchar('license_tag', { length: 100 }),       // 'CC0', 'public_domain', 'pointer_only'
	retrievedAt: timestamp('retrieved_at', { withTimezone: true }),
	fullText: text('full_text'),
	metadata: jsonb('metadata').default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	jurisdictionIdx: index('canonical_docs_jurisdiction_idx').on(table.jurisdiction),
	authorityIdx: index('canonical_docs_authority_idx').on(table.authorityLevel),
	docTypeIdx: index('canonical_docs_doc_type_idx').on(table.docType),
	citationIdx: index('canonical_docs_citation_idx').on(table.citation),
}));

export type CanonicalDocument = typeof canonicalDocuments.$inferSelect;
export type NewCanonicalDocument = typeof canonicalDocuments.$inferInsert;

// === CANONICAL CHUNKS ===
// Stable chunk IDs: {doc_id}:{chunk_index}:{sha256_16}

export const canonicalChunks = pgTable('canonical_chunks', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	chunkId: varchar('chunk_id', { length: 200 }).notNull().unique(), // deterministic: {doc_id_short}:{index}:{sha16}
	documentId: uuid('document_id').notNull().references(() => canonicalDocuments.id, { onDelete: 'cascade' }),
	chunkIndex: integer('chunk_index').notNull(),
	content: text('content').notNull(),
	tokenCount: integer('token_count'),
	semanticLabel: varchar('semantic_label', { length: 200 }), // 'elements_of_offense', 'standard_of_review', 'holding'
	domains: jsonb('domains').default([]),       // ['criminal', 'evidence', 'constitutional']
	keyTerms: jsonb('key_terms').default([]),     // ['probable_cause', 'fourth_amendment']
	embedding: vector('embedding', { dimensions: 768 }),
	metadata: jsonb('metadata').default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	documentIdx: index('canonical_chunks_document_idx').on(table.documentId),
	chunkIdIdx: index('canonical_chunks_chunk_id_idx').on(table.chunkId),
	semanticLabelIdx: index('canonical_chunks_semantic_label_idx').on(table.semanticLabel),
}));

export type CanonicalChunk = typeof canonicalChunks.$inferSelect;
export type NewCanonicalChunk = typeof canonicalChunks.$inferInsert;

// === LEGAL TERMS (Glossary / ExampleBank) ===

export const legalTerms = pgTable('legal_terms', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	term: varchar('term', { length: 300 }).notNull(),
	domain: varchar('domain', { length: 100 }).notNull(),      // 'criminal', 'evidence', 'civil_procedure'
	jurisdiction: jurisdictionEnum('jurisdiction'),
	formalDefinition: text('formal_definition').notNull(),
	plainDefinition: text('plain_definition'),
	relatedChunkIds: jsonb('related_chunk_ids').default([]),     // references to canonical_chunks.chunk_id
	metadata: jsonb('metadata').default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	termIdx: index('legal_terms_term_idx').on(table.term),
	domainIdx: index('legal_terms_domain_idx').on(table.domain),
}));

export type LegalTerm = typeof legalTerms.$inferSelect;
export type NewLegalTerm = typeof legalTerms.$inferInsert;

// === TERM EXAMPLES (ExampleBank M2M) ===

export const termExamples = pgTable('term_examples', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	termId: uuid('term_id').notNull().references(() => legalTerms.id, { onDelete: 'cascade' }),
	exampleText: text('example_text').notNull(),
	relationship: varchar('relationship', { length: 50 }).notNull(), // 'illustrates', 'contrast_with', 'element_of'
	sourceChunkId: varchar('source_chunk_id', { length: 200 }),      // reference to canonical_chunks.chunk_id
	metadata: jsonb('metadata').default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	termIdx: index('term_examples_term_idx').on(table.termId),
	relationshipIdx: index('term_examples_relationship_idx').on(table.relationship),
}));

// === FICTIONAL CASES (Prosecutor Simulation — Phase 3) ===
// Generated cases with full procedural structure, linked to canonical legal authority

export const fictionalCaseCategoryEnum = pgEnum('fictional_case_category', [
	'wire_fraud', 'drug_trafficking', 'firearms', 'cybercrime', 'obstruction',
	'verbal_contracts', 'tort_federal', 'federal_employee_liability',
]);

export const fictionalCases = pgTable('fictional_cases', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	caseId: varchar('case_id', { length: 200 }).notNull().unique(),   // deterministic: category_hash
	category: fictionalCaseCategoryEnum('category').notNull(),
	charge: varchar('charge', { length: 300 }).notNull(),
	primaryStatute: varchar('primary_statute', { length: 200 }),       // e.g. "18 U.S.C. § 1343"
	defendantName: varchar('defendant_name', { length: 200 }).notNull(),
	incidentDate: date('incident_date'),
	jurisdictionCity: varchar('jurisdiction_city', { length: 200 }),
	jurisdiction: jurisdictionEnum('jurisdiction'),
	financialLoss: real('financial_loss'),
	narrative: text('narrative').notNull(),
	disclaimer: text('disclaimer'),
	isFictional: boolean('is_fictional').default(true).notNull(),
	generatedBy: varchar('generated_by', { length: 100 }),            // model name
	guardrailTriggered: boolean('guardrail_triggered').default(false),
	metadata: jsonb('metadata').default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	caseIdIdx: index('fictional_cases_case_id_idx').on(table.caseId),
	categoryIdx: index('fictional_cases_category_idx').on(table.category),
	jurisdictionIdx: index('fictional_cases_jurisdiction_idx').on(table.jurisdiction),
}));

export type FictionalCase = typeof fictionalCases.$inferSelect;
export type NewFictionalCase = typeof fictionalCases.$inferInsert;

// === FICTIONAL CASE CHARGES ===
// Each charge linked to canonical chunks for citation-faithful generation

export const fictionalCaseCharges = pgTable('fictional_case_charges', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	fictionalCaseId: uuid('fictional_case_id').notNull().references(() => fictionalCases.id, { onDelete: 'cascade' }),
	chargeName: varchar('charge_name', { length: 300 }).notNull(),
	statute: varchar('statute', { length: 200 }),
	elements: jsonb('elements').default([]),                           // array of element strings
	canonChunkIds: jsonb('canon_chunk_ids').default([]),                // references to canonical_chunks.chunk_id
	isPrimary: boolean('is_primary').default(false),
	metadata: jsonb('metadata').default({}),
}, (table) => ({
	caseIdx: index('fictional_charges_case_idx').on(table.fictionalCaseId),
}));

// === FICTIONAL CASE ACTORS ===
// Parties: defendant, prosecutor, judge, witnesses, victims, agents

export const fictionalCaseActorRoleEnum = pgEnum('fictional_actor_role', [
	'defendant', 'prosecutor', 'judge', 'defense_attorney',
	'witness', 'victim', 'agent', 'expert_witness', 'informant',
]);

export const fictionalCaseActors = pgTable('fictional_case_actors', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	fictionalCaseId: uuid('fictional_case_id').notNull().references(() => fictionalCases.id, { onDelete: 'cascade' }),
	name: varchar('name', { length: 200 }).notNull(),
	role: fictionalCaseActorRoleEnum('role').notNull(),
	description: text('description'),
	metadata: jsonb('metadata').default({}),
}, (table) => ({
	caseIdx: index('fictional_actors_case_idx').on(table.fictionalCaseId),
	roleIdx: index('fictional_actors_role_idx').on(table.role),
}));

// === FICTIONAL CASE EVENTS ===
// Procedural timeline: arrest, arraignment, discovery, motions, trial, verdict

export const fictionalCaseEvents = pgTable('fictional_case_events', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	fictionalCaseId: uuid('fictional_case_id').notNull().references(() => fictionalCases.id, { onDelete: 'cascade' }),
	eventType: varchar('event_type', { length: 100 }).notNull(),       // 'arrest', 'arraignment', 'discovery', 'motion', 'trial', 'verdict'
	eventDate: date('event_date'),
	description: text('description'),
	canonChunkIds: jsonb('canon_chunk_ids').default([]),                // supporting legal authority
	orderIndex: integer('order_index').default(0),
	metadata: jsonb('metadata').default({}),
}, (table) => ({
	caseIdx: index('fictional_events_case_idx').on(table.fictionalCaseId),
	typeIdx: index('fictional_events_type_idx').on(table.eventType),
}));

// === API AUDIT LOG ===
// Immutable audit trail for all API requests (batched insert from hooks.server.ts)

export const apiAuditLog = pgTable('api_audit_log', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	requestId: varchar('request_id', { length: 64 }),
	method: varchar('method', { length: 10 }).notNull(),
	path: varchar('path', { length: 500 }).notNull(),
	statusCode: integer('status_code').notNull(),
	durationMs: integer('duration_ms'),
	userId: integer('user_id'),
	ipAddress: varchar('ip_address', { length: 45 }),
	userAgent: varchar('user_agent', { length: 500 }),
	requestBodySize: integer('request_body_size'),
	errorMessage: text('error_message'),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	createdAtIdx: index('api_audit_created_at_idx').on(table.createdAt),
	userIdIdx: index('api_audit_user_id_idx').on(table.userId),
	pathIdx: index('api_audit_path_idx').on(table.path),
	statusCodeIdx: index('api_audit_status_code_idx').on(table.statusCode),
}));

export type ApiAuditLogEntry = typeof apiAuditLog.$inferSelect;
export type NewApiAuditLogEntry = typeof apiAuditLog.$inferInsert;

// === MODEL REGISTRY ===
// Central registry of all AI models available across backends (Ollama, TRT-LLM, PyTorch, ONNX)

export const inferenceBackendEnum = pgEnum('inference_backend', [
	'ollama', 'tensorrt', 'bifrost', 'litellm', 'pytorch', 'onnx',
]);

export const modelCapabilityEnum = pgEnum('model_capability', [
	'chat', 'embedding', 'vlm', 'code', 'summarization', 'rerank',
]);

export const modelRegistry = pgTable('model_registry', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	name: varchar('name', { length: 200 }).notNull(),
	backend: inferenceBackendEnum('backend').notNull(),
	capability: modelCapabilityEnum('capability').notNull().default('chat'),
	version: varchar('version', { length: 50 }),
	parameterCount: bigint('parameter_count', { mode: 'number' }),
	quantization: varchar('quantization', { length: 50 }),
	contextWindow: integer('context_window'),
	embeddingDims: integer('embedding_dims'),
	isActive: boolean('is_active').default(true).notNull(),
	isDefault: boolean('is_default').default(false).notNull(),
	healthEndpoint: varchar('health_endpoint', { length: 500 }),
	metadata: jsonb('metadata'),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	backendIdx: index('model_registry_backend_idx').on(table.backend),
	capabilityIdx: index('model_registry_capability_idx').on(table.capability),
	activeIdx: index('model_registry_active_idx').on(table.isActive),
	nameBackend: unique('model_registry_name_backend_unique').on(table.name, table.backend),
}));

export type ModelRegistryEntry = typeof modelRegistry.$inferSelect;
export type NewModelRegistryEntry = typeof modelRegistry.$inferInsert;

// === SERVICE CAPABILITY MATRIX ===
// Tracks live infrastructure services, their tier, and health state

export const serviceTierEnum = pgEnum('service_tier', [
	'core', 'data', 'inference', 'future',
]);

export const serviceCapabilities = pgTable('service_capabilities', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	serviceName: varchar('service_name', { length: 100 }).notNull(),
	tier: serviceTierEnum('tier').notNull(),
	port: integer('port'),
	healthEndpoint: varchar('health_endpoint', { length: 500 }),
	fallbackService: varchar('fallback_service', { length: 100 }),
	isRequired: boolean('is_required').default(false).notNull(),
	dockerProfile: varchar('docker_profile', { length: 50 }),
	lastHealthCheck: timestamp('last_health_check', { withTimezone: true }),
	lastHealthStatus: boolean('last_health_status'),
	lastLatencyMs: integer('last_latency_ms'),
	metadata: jsonb('metadata'),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	tierIdx: index('svc_capabilities_tier_idx').on(table.tier),
	nameUnique: unique('svc_capabilities_name_unique').on(table.serviceName),
}));

export type ServiceCapability = typeof serviceCapabilities.$inferSelect;
export type NewServiceCapability = typeof serviceCapabilities.$inferInsert;

// === AUDIO TRANSCRIPTION TABLES ===
// Structured storage for Whisper transcriptions and per-segment vectors

export const audioTranscripts = pgTable('audio_transcripts', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	evidenceId: uuid('evidence_id').references(() => evidence.id, { onDelete: 'cascade' }).notNull(),
	caseId: uuid('case_id'),
	language: varchar('language', { length: 10 }).default('en').notNull(),
	duration: real('duration').notNull(),
	fullText: text('full_text').notNull(),
	segmentCount: integer('segment_count').default(0).notNull(),
	whisperModel: varchar('whisper_model', { length: 50 }),
	metadata: jsonb('metadata'),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	evidenceIdx: index('audio_transcripts_evidence_idx').on(table.evidenceId),
	caseIdx: index('audio_transcripts_case_idx').on(table.caseId),
}));

export type AudioTranscript = typeof audioTranscripts.$inferSelect;
export type NewAudioTranscript = typeof audioTranscripts.$inferInsert;

export const whisperSegments = pgTable('whisper_segments', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	transcriptId: uuid('transcript_id').references(() => audioTranscripts.id, { onDelete: 'cascade' }).notNull(),
	evidenceId: uuid('evidence_id').references(() => evidence.id, { onDelete: 'cascade' }).notNull(),
	segmentIndex: integer('segment_index').notNull(),
	startMs: integer('start_ms').notNull(),
	endMs: integer('end_ms').notNull(),
	text: text('text').notNull(),
	language: varchar('language', { length: 10 }),
	embedding: vector('embedding', { dimensions: 768 }),
	embeddingModel: varchar('embedding_model', { length: 50 }),
	qdrantPointId: varchar('qdrant_point_id', { length: 200 }),
	speaker: varchar('speaker', { length: 100 }),
	confidence: real('confidence'),
	metadata: jsonb('metadata'),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	evidenceSegmentIdx: index('whisper_segments_evidence_segment_idx').on(table.evidenceId, table.segmentIndex),
	caseIdx: index('whisper_segments_case_idx').on(table.transcriptId),
	evidenceTimeIdx: index('whisper_segments_evidence_time_idx').on(table.evidenceId, table.startMs),
}));

export type WhisperSegment = typeof whisperSegments.$inferSelect;
export type NewWhisperSegment = typeof whisperSegments.$inferInsert;

// === ACE CONTEXT CACHE ===
export const aceContextCache = pgTable('ace_context_cache', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
  queryHash: text('query_hash').notNull(),
  userId: integer('user_id'),
  policyTier: varchar('policy_tier', { length: 30 }).notNull(),
  contextJson: jsonb('context_json').notNull(),
  chunkCount: integer('chunk_count').default(0).notNull(),
  totalTokens: integer('total_tokens').default(0).notNull(),
  cacheSource: varchar('cache_source', { length: 20 }).default('miss').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
  queryHashIdx: index('ace_context_cache_query_hash_idx').on(table.queryHash),
  userIdx: index('ace_context_cache_user_idx').on(table.userId),
}));
export type AceContextCache = typeof aceContextCache.$inferSelect;
export type NewAceContextCache = typeof aceContextCache.$inferInsert;

// === LLM CONTEXT CACHE ===
export const llmContextCache = pgTable('llm_context_cache', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
  cacheKey: text('cache_key').notNull(),
  modelName: text('model_name').notNull(),
  modelQuant: text('model_quant'),
  backend: text('backend').notNull(),
  tokenizerHash: text('tokenizer_hash').notNull(),
  systemPromptHash: text('system_prompt_hash').notNull(),
  toolDefinitionsHash: text('tool_definitions_hash').notNull(),
  repoGitSha: text('repo_git_sha'),
  corpusHash: text('corpus_hash'),
  ragBundleHash: text('rag_bundle_hash'),
  graphSnapshotHash: text('graph_snapshot_hash'),
  contextPackJson: jsonb('context_pack_json').notNull(),
  summary: text('summary').notNull(),
  chunkIds: jsonb('chunk_ids').notNull().default(sql`'[]'::jsonb`),
  graphPaths: jsonb('graph_paths').notNull().default(sql`'[]'::jsonb`),
  toolPolicy: jsonb('tool_policy').notNull().default(sql`'{}'::jsonb`),
  estimatedPrefixTokens: integer('estimated_prefix_tokens').notNull().default(0),
  hitCount: integer('hit_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
  cacheKeyIdx: index('llm_context_cache_key_idx').on(table.cacheKey),
  cacheKeyUnique: unique('llm_context_cache_key_unique').on(table.cacheKey),
  modelBackendIdx: index('llm_context_cache_model_backend_idx').on(table.modelName, table.backend),
  graphSnapshotIdx: index('llm_context_cache_graph_snapshot_idx').on(table.graphSnapshotHash),
}));
export type LlmContextCache = typeof llmContextCache.$inferSelect;
export type NewLlmContextCache = typeof llmContextCache.$inferInsert;

// === KNOWLEDGE ARTIFACTS ===
export const knowledgeArtifacts = pgTable('knowledge_artifacts', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
  sourceType: varchar('source_type', { length: 30 }).notNull(), // codebase|evidence|case|doc
  sourceId: text('source_id').notNull(),
  summary: text('summary'),
  tags: jsonb('tags').default(sql`'[]'::jsonb`).notNull(),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(),
  embedText: text('embed_text'),
  somCluster: integer('som_cluster'),
  schemaVersion: integer('schema_version').default(1).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
  sourceIdx: index('knowledge_artifacts_source_idx').on(table.sourceType, table.sourceId),
  clusterIdx: index('knowledge_artifacts_cluster_idx').on(table.somCluster),
}));
export type KnowledgeArtifact = typeof knowledgeArtifacts.$inferSelect;
export type NewKnowledgeArtifact = typeof knowledgeArtifacts.$inferInsert;

// === SYNTHESIS RUNS ===
export const synthesisRuns = pgTable('synthesis_runs', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
  userId: integer('user_id'),
  query: text('query').notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  cacheHit: varchar('cache_hit', { length: 10 }),
  latencyMs: integer('latency_ms'),
  confidence: real('confidence'),
  grpoRewardScore: real('grpo_reward_score'),
  policyTier: varchar('policy_tier', { length: 30 }),
  citations: jsonb('citations').default(sql`'[]'::jsonb`).notNull(),
  answer: text('answer').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
  userIdx: index('synthesis_runs_user_idx').on(table.userId),
  createdIdx: index('synthesis_runs_created_idx').on(table.createdAt),
}));
export type SynthesisRun = typeof synthesisRuns.$inferSelect;
export type NewSynthesisRun = typeof synthesisRuns.$inferInsert;

// === GLYPH RECORDS ===
// Durable JSONB-backed store for canonical GlyphRecord schema.
// Scalar columns for common filters/sorts; JSONB for evolving fields.
// record_json preserves the full canonical GlyphRecord for round-trip fidelity.
export const glyphRecords = pgTable('glyph_records', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
  glyphId: text('glyph_id').notNull(),
  sourceId: text('source_id').notNull(),
  caseId: uuid('case_id'),
  kind: varchar('kind', { length: 30 }).notNull(),
  section: varchar('section', { length: 30 }).notNull().default('UNKNOWN'),
  schemaVersion: integer('schema_version').notNull().default(1),

  // Scalar columns for indexed queries
  somCluster: integer('som_cluster'),
  centroidId: integer('centroid_id'),
  grpoRewardScore: real('grpo_reward_score'),

  // Semantic layer (denormalised for fast text search)
  summary: text('summary').notNull(),
  tags: jsonb('tags').notNull().default(sql`'[]'::jsonb`),
  entities: jsonb('entities').notNull().default(sql`'[]'::jsonb`),
  kagNeighbors: jsonb('kag_neighbors').notNull().default(sql`'[]'::jsonb`),
  dagPrev: jsonb('dag_prev').notNull().default(sql`'[]'::jsonb`),
  dagNext: jsonb('dag_next').notNull().default(sql`'[]'::jsonb`),

  // Full nested layers as JSONB (forward-compat for schema evolution)
  topology: jsonb('topology').notNull().default(sql`'{}'::jsonb`),
  render: jsonb('render').notNull().default(sql`'{}'::jsonb`),

  // Full canonical GlyphRecord for round-trip fidelity (embedding omitted — stays in Qdrant)
  recordJson: jsonb('record_json').notNull().default(sql`'{}'::jsonb`),

  // Atlas training metadata
  sourceRef: text('source_ref'),
  glyphKind: text('glyph_kind'),
  embeddingModel: text('embedding_model').notNull().default('embeddinggemma:latest'),
  batchId: text('batch_id'),

  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
  glyphIdIdx:    index('glyph_records_glyph_id_idx').on(table.glyphId),
  sourceIdx:     index('glyph_records_source_idx').on(table.sourceId),
  caseIdx:       index('glyph_records_case_idx').on(table.caseId),
  clusterIdx:    index('glyph_records_cluster_idx').on(table.somCluster),
  centroidIdx:   index('glyph_records_centroid_idx').on(table.centroidId),
  sectionIdx:    index('glyph_records_section_idx').on(table.section),
  rewardIdx:     index('glyph_records_reward_idx').on(table.grpoRewardScore),
  sourceRefIdx:  index('glyph_records_source_ref_idx').on(table.sourceRef),
  glyphKindIdx:  index('glyph_records_glyph_kind_idx').on(table.glyphKind),
  batchIdIdx:    index('glyph_records_batch_id_idx').on(table.batchId),
}));

// All glyph type aliases in one place
export type GlyphRecordRow  = typeof glyphRecords.$inferSelect;
export type NewGlyphRecordRow = typeof glyphRecords.$inferInsert;
/** @deprecated use GlyphRecordRow */
export type GlyphRecord     = GlyphRecordRow;
/** @deprecated use NewGlyphRecordRow */
export type NewGlyphRecord  = NewGlyphRecordRow;

// QLoRA training examples live in schema/search-analytics.ts (drizzle-kit managed).
// Import from there: import { qloraExamples } from '$lib/server/db/schema';

// ── Ingestion Buffers ────────────────────────────────────────────────────────

export const ingestionBuffers = pgTable('ingestion_buffers', {
  id:               uuid('id').defaultRandom().primaryKey(),
  scope:            text('scope').notNull(),
  clusterId:        integer('cluster_id'),
  k:                integer('k').notNull().default(20),
  bufferJsonb:      jsonb('buffer_jsonb').notNull().default(sql`'{}'::jsonb`),
  tokenEstimate:    integer('token_estimate').notNull().default(0),
  compressionRatio: real('compression_ratio').notNull().default(1),
  generatedAt:      timestamp('generated_at', { withTimezone: true }).default(sql`now()`).notNull(),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
  scopeClusterK: unique('ingestion_buffers_scope_cluster_k').on(table.scope, table.clusterId, table.k),
}));

// ── Cluster Narratives ───────────────────────────────────────────────────────

export const clusterNarratives = pgTable('cluster_narratives', {
  id:                 uuid('id').defaultRandom().primaryKey(),
  clusterId:          integer('cluster_id').notNull(),
  k:                  integer('k').notNull().default(20),
  summary:            text('summary').notNull(),
  purpose:            text('purpose').notNull(),
  patterns:           jsonb('patterns').notNull().default(sql`'[]'::jsonb`),
  keyFiles:           jsonb('key_files').notNull().default(sql`'[]'::jsonb`),
  warnings:           jsonb('warnings').notNull().default(sql`'[]'::jsonb`),
  crossReferences:    jsonb('cross_references').notNull().default(sql`'[]'::jsonb`),
  memberCount:        integer('member_count').notNull().default(0),
  dominantAstCluster: text('dominant_ast_cluster'),
  tags:               jsonb('tags').notNull().default(sql`'[]'::jsonb`),
  narrativeEmbedding: vector('narrative_embedding', { dimensions: 768 }),
  generatedAt:        timestamp('generated_at', { withTimezone: true }).default(sql`now()`).notNull(),
  updatedAt:          timestamp('updated_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
  clusterIdx: index('cluster_narratives_cluster_idx').on(table.clusterId),
}));

// ── Research Summaries ────────────────────────────────────────────────────────
// Unified durable store for all summarised content: web crawl, legal corpus,
// uploaded documents/images/videos, reports, case notes, etc.
// GIN trigram + HNSW vector + tag GIN indexes are in the manual SQL migration
// (Drizzle cannot express USING gin(..._ops) or USING hnsw natively).
export const researchSummaries = pgTable('research_summaries', {
  id:             uuid('id').defaultRandom().primaryKey(),
  /** Broad content type: web | corpus | document | image | video | report | note | case */
  source:         text('source').notNull(),
  pipeline:       text('pipeline').notNull().default('ace'),
  /** Same as source — kept separate for future sub-typing without a join */
  entityType:     text('entity_type').notNull(),
  query:          text('query').notNull(),
  queryHash:      varchar('query_hash', { length: 8 }).notNull(),
  title:          text('title'),
  /** Web URL or MinIO object path */
  url:            text('url'),
  /** Canonical provenance anchor for joins back to source files / atlas cards */
  sourceRef:      text('source_ref'),
  /** All provenance anchors for this summary, stored as a dense join surface */
  sourceRefs:     text('source_refs').array().notNull().default(sql`'{}'::text[]`),
  /** Qdrant collection name (corpus only) */
  collection:     text('collection'),
  citationLabel:  text('citation_label'),
  sectionPath:    text('section_path'),
  jurisdiction:   text('jurisdiction'),
  summary:        text('summary').notNull(),
  entityTags:     text('entity_tags').array().notNull().default(sql`'{}'::text[]`),
  relevanceScore: real('relevance_score').notNull().default(0),
  /** 768-dim embeddinggemma vector — NULL if embedding unavailable at ingest time */
  embedding:      vector('embedding', { dimensions: 768 }),
  /** NULL = anonymous / system-generated summary */
  userId:         integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  /** Set when the user promotes this summary to a saved citation */
  savedCitationId: uuid('saved_citation_id').references(() => citations.id, { onDelete: 'set null' }),
  /**
   * 4D hypergraph manifold coordinates — set by buildHypergraph4D() after SOM+k-means.
   * [som_x, som_y, semantic_z, grpo_w]
   *   som_x:      SOM BMU x-coordinate on the 12×12 research grid (0–11)
   *   som_y:      SOM BMU y-coordinate on the 12×12 research grid (0–11)
   *   semantic_z: cosine distance to assigned cluster centroid [0,1] (0=at centroid)
   *   grpo_w:     GRPO reward score [0,1] (quality grade: A≥0.75, B≥0.55, C≥0.35)
   *
   * NULL until the first hypergraph build runs. Enables direct SQL queries over 4D
   * bounding regions without hitting Redis (offline analytics, batch reranking, cursor
   * pagination by manifold region).
   */
  manifold4:      real('manifold4').array(),
  /** Structured output envelope from deep-research / ACE synthesis */
  outputMeta:     jsonb('output_meta').notNull().default(sql`'{}'::jsonb`),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
  index('rs_pipeline_score_id').on(t.pipeline, t.relevanceScore, t.id),
  index('rs_entity_type_score').on(t.entityType, t.relevanceScore, t.id),
  index('rs_source_score').on(t.source, t.relevanceScore, t.id),
  index('rs_source_ref').on(t.sourceRef),
  index('rs_user_created').on(t.userId, t.createdAt),
  index('rs_query_hash').on(t.queryHash),
]);

export type ResearchSummary    = typeof researchSummaries.$inferSelect;
export type NewResearchSummary = typeof researchSummaries.$inferInsert;

/**
 * A research summary that has been incorporated into the 4D hypergraph.
 * manifold4 is guaranteed non-null: [som_x, som_y, semantic_z, grpo_w].
 * Use this type when querying summaries after a hypergraph build has run.
 */
export type ResearchArtifact = Omit<ResearchSummary, 'manifold4'> & {
  manifold4: [number, number, number, number];
};

// ── User Research Tasks ───────────────────────────────────────────────────────
// Persistent task list created from text highlights, deep-research topics, or
// manual entry. Anonymous tasks use sessionId only; logged-in tasks sync to user.
export const userResearchTasks = pgTable('user_research_tasks', {
  id:           uuid('id').defaultRandom().primaryKey(),
  userId:       integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  sessionId:    text('session_id'),
  title:        text('title').notNull(),
  selfPrompt:   text('self_prompt').notNull(),
  pipelineHint: text('pipeline_hint').notNull().default('ace'),
  priority:     text('priority').notNull().default('medium'),
  status:       text('status').notNull().default('pending'),
  sourceText:   text('source_text'),
  summary:      text('summary'),
  result:       jsonb('result'),
  notified:     boolean('notified').notNull().default(false),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  completedAt:  timestamp('completed_at', { withTimezone: true }),
}, (t) => [
  index('urt_user_status').on(t.userId, t.status),
  index('urt_user_created').on(t.userId, t.createdAt),
  index('urt_session').on(t.sessionId),
]);

export type UserResearchTask    = typeof userResearchTasks.$inferSelect;
export type NewUserResearchTask = typeof userResearchTasks.$inferInsert;

// ── Web Search Index ──────────────────────────────────────────────────────────
// Durable store for agentic deep-research web search results.
// Populated by the orchestrator's Stage 10 (deep_research) which uses codebase
// cluster summaries as query seeds, fetches + parses web pages, embeds them,
// and upserts here + into Qdrant knowledge_base for RAG retrieval.
export const webSearchIndex = pgTable('web_search_index', {
  id:             uuid('id').defaultRandom().primaryKey(),
  /** The search query used to find this page (derived from cluster purpose/patterns) */
  query:          text('query').notNull(),
  /** Which codebase GPU cluster triggered this search (0-19, or null for manual) */
  clusterId:      integer('cluster_id'),
  /** Source page URL */
  url:            text('url').notNull(),
  /** Page title */
  title:          text('title'),
  /** Extracted full text content (stripped HTML) */
  content:        text('content').notNull(),
  /** Short excerpt for display / context snippets */
  snippet:        text('snippet'),
  /** Web search provider used: searxng | google | duckduckgo */
  provider:       text('provider').notNull().default('searxng'),
  /** SHA-256 prefix of URL for deduplication */
  contentHash:    varchar('content_hash', { length: 16 }).notNull(),
  /** 768-dim embeddinggemma vector for RAG retrieval */
  embedding:      vector('embedding', { dimensions: 768 }),
  /** Cross-encoder rerank score vs cluster query [0,1] */
  relevanceScore: real('relevance_score').notNull().default(0),
  /** Orchestrator run_id that produced this row */
  runId:          text('run_id'),
  indexedAt:      timestamp('indexed_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
  unique('wsi_content_hash_unique').on(t.contentHash),
  index('wsi_cluster_score').on(t.clusterId, t.relevanceScore),
  index('wsi_indexed_at').on(t.indexedAt),
  index('wsi_run_id').on(t.runId),
]);

export type WebSearchIndexRow    = typeof webSearchIndex.$inferSelect;
export type NewWebSearchIndexRow = typeof webSearchIndex.$inferInsert;

// ── Context Timeline ──────────────────────────────────────────────────────────
// Durable write-path for the RL self-modification loop.
// Every user interaction that influences rlpolicy:pipeline_weights or triggers
// a hypergraph rebuild is recorded here, closing the loop:
//
//   user signal → adaptFromAnalytics
//     → Redis policy update + context_timeline row
//     → threshold (8 signals) → hypergraph rebuild → X_prime centroids reset
//     → selectAdaptiveMemory returns updated knowledge anchors
//     → LLM system prompt shaped by accumulated feedback
//
// event_type: 'research' | 'feedback' | 'citation' | 'graph_edge' | 'rl_adapt' | 'tool_call' | 'summary'
// signal:     'thumbs_up' | 'thumbs_down' | 'dwell_long' | 'dwell_short' | 'citation_saved' | null
export const contextTimeline = pgTable('context_timeline', {
  id:                  uuid('id').defaultRandom().primaryKey(),
  /** null = anonymous / system-generated event */
  userId:              integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  sessionId:           text('session_id').notNull().default(''),
  /** Broad event class — drives downstream QLoRA distillation selector */
  eventType:           text('event_type').notNull(),
  /** Which pipeline produced the context for this event */
  pipeline:            text('pipeline').notNull().default('ace'),
  /** research_summaries row that triggered or was affected by this event */
  summaryId:           uuid('summary_id').references(() => researchSummaries.id, { onDelete: 'set null' }),
  /** 8-char FNV-1a key of the active hyperedge at signal time */
  hyperedgeHash:       varchar('hyperedge_hash', { length: 8 }),
  /** User feedback signal; null for non-feedback event types */
  signal:              text('signal'),
  /** GRPO reward delta applied by this signal (positive = good) */
  grpoReward:          real('grpo_reward'),
  /** New pipeline weight after RL delta was applied */
  pipelineWeightAfter: real('pipeline_weight_after'),
  /** True when this event was the one that crossed the rebuild threshold */
  triggeredRebuild:    boolean('triggered_rebuild').notNull().default(false),
  /** Autoencoder reconstruction error — helps decide if routing was 'noisy' */
  reconstructionError: real('reconstruction_error'),
  /** Compressed vector index (centroid/cluster ID) from the routing layer */
  routingCluster:      integer('routing_cluster'),
  /** Catch-all for evolving fields (previousWeight, loraHint, etc.) */
  payload:             jsonb('payload').notNull().default(sql`'{}'::jsonb`),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
  index('ctx_user_created').on(t.userId, t.createdAt),
  index('ctx_session_created').on(t.sessionId, t.createdAt),
  index('ctx_event_type').on(t.eventType, t.createdAt),
  index('ctx_pipeline_reward').on(t.pipeline, t.grpoReward),
  index('ctx_hyperedge').on(t.hyperedgeHash),
]);

export type ContextTimelineRow    = typeof contextTimeline.$inferSelect;
export type NewContextTimelineRow = typeof contextTimeline.$inferInsert;

// === ERROR FINGERPRINT STORE ===
// Queried by error-fingerprint.ts (lookupErrorFingerprint, findSimilarErrors)
// and ngram-retrieval.ts (ngramRecall error lane).
// GIN trigram + FTS + array indexes are in drizzle/manual/20260506_error_fingerprints.sql
// (Drizzle cannot express USING GIN(...gin_trgm_ops) natively).
export const errorFingerprints = pgTable('error_fingerprints', {
	errorHash:      text('error_hash').primaryKey(),
	normalizedText: text('normalized_text').notNull(),
	rawText:        text('raw_text').notNull(),
	topSymbols:     text('top_symbols').array().notNull().default(sql`'{}'`),
	topFiles:       text('top_files').array().notNull().default(sql`'{}'`),
	priorFix:       text('prior_fix'),
	confidence:     real('confidence').notNull().default(0.5),
	seenCount:      integer('seen_count').notNull().default(1),
	firstSeen:      timestamp('first_seen', { withTimezone: true }).notNull().default(sql`now()`),
	lastSeen:       timestamp('last_seen', { withTimezone: true }).notNull().default(sql`now()`),
});

export type ErrorFingerprintRow    = typeof errorFingerprints.$inferSelect;
export type NewErrorFingerprintRow = typeof errorFingerprints.$inferInsert;

// === CODEBASE RELATIONSHIP SPINE ===
// Semantic edges extracted by relationship-extractor.ts from every TS/Svelte source file.
// Edge types: EXPORTS_SYMBOL, READS/WRITES_REDIS_KEY, QUERIES_TABLE,
//   QUERIES_QDRANT_COLLECTION, QUERIES_NEO4J_LABEL, HAS_AGENTS_SCOPE

export const codeRelations = pgTable('code_relations', {
	id:           integer('id').generatedAlwaysAsIdentity().primaryKey(),
	sourceFile:   text('source_file').notNull(),     // relative path, e.g. src/lib/server/ace/context-assembler.ts
	targetKey:    text('target_key').notNull(),      // symbol name, table name, redis key, etc.
	relationType: text('relation_type').notNull(),   // SemanticRelationType union value
	confidence:   real('confidence').notNull().default(0.8),
	evidence:     jsonb('evidence').default({}),     // { line, snippet, matchKind }
	runId:        text('run_id'),                    // extraction run that created this row
	createdAt:    timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
	updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});

export type CodeRelationRow    = typeof codeRelations.$inferSelect;
export type NewCodeRelationRow = typeof codeRelations.$inferInsert;

// === COURTROOM 3D ANIMATION SYSTEM ===
// Timeline-driven 3D reconstruction: Mixamo-rigged models with keyframe animation

export const courtroomAnimTypeEnum = pgEnum('courtroom_anim_type', [
	'idle', 'speaking', 'objection', 'walk', 'gesture', 'point', 'sit', 'stand',
	'present_evidence', 'react_surprised', 'react_angry', 'react_sad', 'nod', 'shake_head',
]);

/** Available 3D character models (Mixamo-rigged .glb files) */
export const courtroomModels = pgTable('courtroom_models', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	name: varchar('name', { length: 100 }).notNull(),
	role: varchar('role', { length: 50 }).notNull(),     // prosecutor, defense, judge, witness, etc.
	modelUrl: varchar('model_url', { length: 500 }).notNull(), // path to .glb file (static/ or CDN)
	thumbnailUrl: varchar('thumbnail_url', { length: 500 }),
	skeletonType: varchar('skeleton_type', { length: 50 }).notNull().default('mixamo'), // mixamo, custom
	scaleX: real('scale_x').notNull().default(1),
	scaleY: real('scale_y').notNull().default(1),
	scaleZ: real('scale_z').notNull().default(1),
	metadata: jsonb('metadata').default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	roleIdx: index('courtroom_models_role_idx').on(table.role),
}));

/** Animation clips that can be applied to models */
export const courtroomAnimations = pgTable('courtroom_animations', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	name: varchar('name', { length: 100 }).notNull(),
	animType: courtroomAnimTypeEnum('anim_type').notNull(),
	animationUrl: varchar('animation_url', { length: 500 }).notNull(), // path to .glb animation file
	durationMs: integer('duration_ms').notNull(),
	loop: boolean('loop').notNull().default(false),
	blendWeight: real('blend_weight').notNull().default(1),
	skeletonType: varchar('skeleton_type', { length: 50 }).notNull().default('mixamo'),
	metadata: jsonb('metadata').default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	typeIdx: index('courtroom_anims_type_idx').on(table.animType),
}));

/** Keyframe entries for timeline-driven 3D scene reconstruction */
export const courtroomKeyframes = pgTable('courtroom_keyframes', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	sessionId: varchar('session_id', { length: 64 }).notNull(),      // simulation session UUID
	timeMs: integer('time_ms').notNull(),                             // millisecond offset from session start
	characterRole: varchar('character_role', { length: 50 }).notNull(),
	animType: courtroomAnimTypeEnum('anim_type').notNull(),
	animationId: uuid('animation_id').references(() => courtroomAnimations.id),
	// Position overrides (null = keep current position)
	posX: real('pos_x'),
	posY: real('pos_y'),
	posZ: real('pos_z'),
	rotY: real('rot_y'),                                              // Y-axis rotation (facing direction)
	// Camera
	cameraView: varchar('camera_view', { length: 50 }),               // prosecution, defense, judge, witness, wide
	// Dialogue link
	dialogueTurn: integer('dialogue_turn'),                           // links to dialogueHistory turn index
	// Visual effects
	effect: varchar('effect', { length: 50 }),                        // screen_flash, shake, spotlight, dim
	// Evidence display
	evidenceUrl: varchar('evidence_url', { length: 500 }),            // PDF/image to show on evidence stand
	// Phase metadata
	phase: varchar('phase', { length: 50 }),
	metadata: jsonb('metadata').default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => ({
	sessionTimeIdx: index('courtroom_kf_session_time_idx').on(table.sessionId, table.timeMs),
	sessionRoleIdx: index('courtroom_kf_session_role_idx').on(table.sessionId, table.characterRole),
}));

export type CourtroomModel = typeof courtroomModels.$inferSelect;
export type NewCourtroomModel = typeof courtroomModels.$inferInsert;
export type CourtroomAnimation = typeof courtroomAnimations.$inferSelect;
export type NewCourtroomAnimation = typeof courtroomAnimations.$inferInsert;
export type CourtroomKeyframe = typeof courtroomKeyframes.$inferSelect;
export type NewCourtroomKeyframe = typeof courtroomKeyframes.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Code-intel tables (codebase_chunk_index, cluster_summaries, enrichment_jobs)
// These mirror the GPU-enriched codebase index built by the indexer pipeline.
// NOTE: content_embedding uses halfvec(768) in the DB — modelled as text here
//       so Drizzle can read/write rows; do NOT use Drizzle for HNSW queries on
//       that column (use raw SQL or Qdrant instead).
// ─────────────────────────────────────────────────────────────────────────────

/** GPU-enriched codebase chunk index — mirrors codebase_chunk_index in Postgres */
export const codebaseChunkIndex = pgTable('codebase_chunk_index', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	qdrantId: varchar('qdrant_id', { length: 64 }),
	chunkId: text('chunk_id'),

	repoId: uuid('repo_id'),
	relativePath: text('relative_path').notNull(),
	symbol: varchar('symbol', { length: 255 }),
	kind: varchar('kind', { length: 50 }),
	domain: varchar('domain', { length: 50 }),
	language: varchar('language', { length: 20 }),
	extension: varchar('extension', { length: 20 }),

	lineStart: integer('line_start'),
	lineEnd: integer('line_end'),
	tokenCount: integer('token_count'),

	content: text('content'),
	contentHash: text('content_hash'),
	signature: text('summary'), // summary field doubles as chunk signature

	gpuCluster: integer('gpu_cluster'),
	somCluster: integer('som_cluster'),
	somBmuRow: integer('som_bmu_row'),
	somBmuCol: integer('som_bmu_col'),
	neo4jGpuCluster: integer('neo4j_gpu_cluster'),
	communityId: integer('community_id'),
	clusterSummary: jsonb('cluster_summary').default(sql`'{}'::jsonb`),
	pageRankScore: real('page_rank_score'),

	// text[] semantic tags from karpathy-tag enrichment
	semanticTags: text('semantic_tags').array().notNull().default(sql`'{}'::text[]`),
	// jsonb tags from heuristic enrichment (older field, array inside JSONB)
	tags: jsonb('tags').default(sql`'[]'::jsonb`),
	neo4jMeta: jsonb('neo4j_meta').default(sql`'{}'::jsonb`),
	metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
	/**
	 * Structured 1-3 sentence summary + citations + confidence.
	 * Stored as JSONB so simdjson AVX2 fast-parse can decode at 2-5× V8 speed.
	 * Schema matches CodeLlmOutputMeta from code_llm_index.
	 */
	outputMeta: jsonb('output_meta').notNull().default(sql`'{}'::jsonb`),

	embeddingModel: varchar('embedding_model', { length: 100 }),
	summaryModel: varchar('summary_model', { length: 100 }),

	// vector(768) summary embedding — use for cluster/semantic queries
	summaryEmbedding: vector('summary_embedding', { dimensions: 768 }),
	signatureEmbedding: vector('signature_embedding', { dimensions: 768 }),
	// NOTE: content_embedding is halfvec(768) — not modelled here, use raw SQL

	// 4D manifold coords: [som_x, som_y, semantic_z, grpo_w] — matches research_summaries.manifold4
	manifold4: real('manifold4').array(),

	// ── Layer 2: Routing tier (compressed 64d centroid assignment) ──────────
	// Set by the autoencoder pipeline after 768d embedding is complete.
	// centroid_id → FK to centroid_registry; used to filter Qdrant ANN.
	centroidId:           uuid('centroid_id'),
	// compressedEmbedding:  vector('compressed_embedding', { dimensions: 64 }),
	reconstructionError:  real('reconstruction_error'), // MSE of 768d→64d→768d round-trip
	routingTier:          varchar('routing_tier', { length: 10 }).default('cold'),
	// routingTier: 'cold' (no centroid), 'warm' (centroid assigned), 'hot' (in Redis cluster card)

	indexedAt: timestamp('indexed_at', { withTimezone: true }).notNull().default(sql`now()`),
	enrichedAt: timestamp('enriched_at', { withTimezone: true }),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
	qdrantIdUq:   unique('codebase_chunk_index_qdrant_id_key').on(table.qdrantId),
	repoIdIdx:    index('codebase_chunk_index_repo_id_idx').on(table.repoId),
	gpuClusterIdx: index('codebase_chunk_index_gpu_cluster_idx').on(table.gpuCluster),
	domainIdx:    index('codebase_chunk_index_domain_idx').on(table.domain),
	extensionIdx: index('codebase_chunk_index_extension_idx').on(table.extension),
	centroidIdx:  index('codebase_chunk_index_centroid_idx').on(table.centroidId),
	routingTierIdx: index('codebase_chunk_index_routing_tier_idx').on(table.routingTier),
}));

/** Cluster-level LLM summaries — one row per (repo_id, gpu_cluster) pair */
export const clusterSummaries = pgTable('cluster_summaries', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	// repo_id is TEXT 'default' — not a FK to avoid coupling to non-existent code_repos
	repoId: text('repo_id').notNull().default('default'),
	gpuCluster: integer('gpu_cluster').notNull(),

	summary: text('summary').notNull(),
	purpose: text('purpose'),
	patterns: text('patterns').array(),
	warnings: text('warnings').array(),
	tags: text('tags').array().notNull().default(sql`'{}'::text[]`),

	representativeChunkIds: uuid('representative_chunk_ids').array().notNull().default(sql`'{}'::uuid[]`),
	memberCount: integer('member_count').notNull().default(0),
	centroidDistanceMean: real('centroid_distance_mean'),

	summaryModel: varchar('summary_model', { length: 100 }),
	summaryEmbedding: vector('summary_embedding', { dimensions: 768 }),

	metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
	repoClusterUq: unique('cluster_summaries_repo_cluster_uq').on(table.repoId, table.gpuCluster),
	repoClusterIdx: index('cluster_summaries_repo_cluster_idx').on(table.repoId, table.gpuCluster),
}));

// ── Vector Routing Tier (Layer 2) ─────────────────────────────────────────────
// Compressed 64d centroids + cluster cards enable fast candidate routing
// before the full 768d Qdrant ANN pass.  Pipeline:
//   embed(768d) → autoencode(64d) → nearest centroid → cluster card
//   → filter Qdrant by centroid_id → rerank 768d → ACE packet → Gemma4

/**
 * Centroid Registry — one row per k-means centroid per collection.
 * centroid_key is stable across re-runs: "{collection}:k{k}:c{idx}"
 * Migration: drizzle/manual/20260516_storage_tier_routing.sql
 */
export const centroidRegistry = pgTable('centroid_registry', {
    id:             uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
    centroidKey:    varchar('centroid_key', { length: 128 }).unique().notNull(),
    collection:     varchar('collection', { length: 100 }).notNull(),
    dimIn:          integer('dim_in').notNull().default(768),
    dimOut:         integer('dim_out').notNull().default(64),
    clusterK:       integer('cluster_k').notNull(),
    clusterIdx:     integer('cluster_idx').notNull(),
    centroidVector: vector('centroid_vector', { dimensions: 64 }),
    memberCount:    integer('member_count').notNull().default(0),
    semanticLabel:  text('semantic_label'),
    topTags:        text('top_tags').array().notNull().default(sql`'{}'::text[]`),
    authorityScore: real('authority_score').notNull().default(0),
    builtAt:        timestamp('built_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
    collectionKIdx:  index('centroid_registry_collection_k_idx').on(table.collection, table.clusterK, table.clusterIdx),
    authorityIdx:    index('centroid_registry_authority_idx').on(table.collection, table.authorityScore),
}));

export type CentroidRegistry    = typeof centroidRegistry.$inferSelect;
export type NewCentroidRegistry = typeof centroidRegistry.$inferInsert;

/**
 * Cluster Cards — denormalized fast-access card per centroid.
 * Synced to Redis at `cluster:card:{centroid_id}` (TTL 3600s).
 * Postgres is durable ground truth; Redis is the hot-path cache.
 */
export const clusterCards = pgTable('cluster_cards', {
    centroidId:              uuid('centroid_id').primaryKey().notNull(),
    collection:              varchar('collection', { length: 100 }).notNull(),
    sourceRefs:              jsonb('source_refs').notNull().default([]).$type<string[]>(),
    methodAnchors:           text('method_anchors').array().notNull().default(sql`'{}'::text[]`),
    topChunkIds:             uuid('top_chunk_ids').array().notNull().default(sql`'{}'::uuid[]`),
    topFilePaths:            text('top_file_paths').array().notNull().default(sql`'{}'::text[]`),
    topTags:                 text('top_tags').array().notNull().default(sql`'{}'::text[]`),
    summaryHints:            text('summary_hints').array().notNull().default(sql`'{}'::text[]`),
    clusterSummary:          text('cluster_summary'),
    representativeEmbedding: vector('representative_embedding', { dimensions: 768 }),
    authorityScore:          real('authority_score').notNull().default(0),
    memberCount:             integer('member_count').notNull().default(0),
    lastRebuiltAt:           timestamp('last_rebuilt_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
    collectionAuthorityIdx: index('cluster_cards_collection_authority_idx').on(table.collection, table.authorityScore),
}));

export type ClusterCard    = typeof clusterCards.$inferSelect;
export type NewClusterCard = typeof clusterCards.$inferInsert;

/** GraphRAG community reports — one row per Leiden community (GraphRAG Stage 9b) */
export const communityReports = pgTable('community_reports', {
	communityId: integer('community_id').primaryKey().notNull(),
	clusterIds: integer('cluster_ids').array().notNull().default(sql`'{}'::int[]`),
	memberCount: integer('member_count').notNull().default(0),
	summary: text('summary').notNull().default(''),
	purpose: text('purpose').notNull().default(''),
	tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
	cohesionScore: real('cohesion_score').notNull().default(0),
	embedding: vector('embedding', { dimensions: 768 }),
	builtAt: timestamp('built_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
	cohesionIdx: index('community_reports_cohesion_idx').on(table.cohesionScore),
	builtAtIdx: index('community_reports_built_at_idx').on(table.builtAt),
}));

/**
 * Hypergraph edges — durable Postgres mirror of Redis hg:edge:* keys.
 *
 * NOTE: schema declared here mirrors the LIVE table (verified via
 * `\d hypergraph_edges` on 2026-05-08). Earlier Drizzle declaration was
 * 10 of 25 columns — Drizzle-based readers saw `unknown column "title"`
 * even though psql resolved fine. Full 25-column declaration below.
 *
 * Index list also synced (8 live indexes), including the FTS-friendly
 * topo_class / som_cluster / glyph_cluster covering indexes added
 * during the Lane A seeder pass.
 */
export const hypergraphEdges = pgTable('hypergraph_edges', {
	id:           uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	edgeHash:     varchar('edge_hash', { length: 64 }).notNull(),
	edgeId:       text('edge_id'),
	edgeType:     text('edge_type').notNull().default('generic'),
	memberIds:    text('member_ids').array().notNull().default(sql`'{}'::text[]`),
	title:        text('title'),
	summary:      text('summary'),
	gradeLabel:   varchar('grade_label', { length: 4 }).notNull().default('D'),
	gradeScore:   real('grade_score').notNull().default(0),
	confidence:   real('confidence').notNull().default(0.5),
	source:       text('source'),
	gpuCluster:   integer('gpu_cluster'),
	communityId:  integer('community_id'),
	topoClass:    text('topo_class'),
	somCluster:   integer('som_cluster'),
	glyphCluster: text('glyph_cluster'),
	somCell:      text('som_cell'),
	manifold4:    real('manifold4').array(),
	metadata:     jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
	createdAt:    timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
	updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
	label:        text('label'),
	queryHash:    text('query_hash'),
	runId:        uuid('run_id'),
	weight:       real('weight').notNull().default(0),
}, (table) => ({
	edgeHashUq:        unique('hypergraph_edges_edge_hash_uq').on(table.edgeHash),
	gradeIdx:          index('hypergraph_edges_grade_idx').on(table.gradeLabel),
	clusterIdx:        index('hypergraph_edges_cluster_idx').on(table.gpuCluster),
	edgeTypeIdx:       index('hypergraph_edges_edge_type_idx').on(table.edgeType),
	topoClassIdx:      index('hypergraph_edges_topo_class_idx').on(table.topoClass),
	somClusterIdx:     index('hypergraph_edges_som_cluster_idx').on(table.somCluster),
	glyphClusterIdx:   index('hypergraph_edges_glyph_cluster_idx').on(table.glyphCluster),
}));

/** Enrichment job tracking — one row per background enrichment run */
export const enrichmentJobs = pgTable('enrichment_jobs', {
	jobId: uuid('job_id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	repoId: text('repo_id'),

	jobType: varchar('job_type', { length: 64 }).notNull(),
	status: varchar('status', { length: 32 }).notNull().default('pending'),

	cursor: text('cursor'),
	totalProcessed: integer('total_processed').notNull().default(0),
	totalUpserted: integer('total_upserted').notNull().default(0),
	totalFailed: integer('total_failed').notNull().default(0),

	startedAt: timestamp('started_at', { withTimezone: true }),
	finishedAt: timestamp('finished_at', { withTimezone: true }),

	metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
	error: jsonb('error'),

	createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
	statusIdx: index('enrichment_jobs_status_idx').on(table.status),
	jobTypeIdx: index('enrichment_jobs_job_type_idx').on(table.jobType),
}));

/** Context Buffers — Pre-assembled, high-token context blocks for IDE retrieval.
 *  Saves LLM synthesis costs by caching 20-cluster architecture summaries.
 */
export const contextBuffers = pgTable('context_buffers', {
	bufferKey: text('buffer_key').primaryKey().notNull(), // e.g. 'architecture-overview', 'pipeline:evidence'
	repoId: text('repo_id').notNull().default('default'),
	content: text('content').notNull(),
	tokenCount: integer('token_count'),
	metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
	expiresAt: timestamp('expires_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});

export type CodebaseChunkIndex = typeof codebaseChunkIndex.$inferSelect;
export type NewCodebaseChunkIndex = typeof codebaseChunkIndex.$inferInsert;
export type ClusterSummary = typeof clusterSummaries.$inferSelect;
export type NewClusterSummary = typeof clusterSummaries.$inferInsert;
export type EnrichmentJob = typeof enrichmentJobs.$inferSelect;
export type NewEnrichmentJob = typeof enrichmentJobs.$inferInsert;
export type ContextBuffer = typeof contextBuffers.$inferSelect;
export type NewContextBuffer = typeof contextBuffers.$inferInsert;

// ── AST Graph Tables ─────────────────────────────────────────────────────────
// Created April 21, 2026 — structured sidecar for the workspace indexing pipeline.
// ts-morph-derived for TS/JS; heuristic fallback for all other languages.
// Feeds: 4D topology, cluster summaries, fix-recommender graph expansion, ACE context.

/**
 * One row per named symbol extracted from the AST.
 * For TS/JS: functions, classes, variables, type aliases, route handlers, etc.
 * For other languages: whatever the heuristic parser can identify.
 */
export const astNodes = pgTable('ast_nodes', {
  id:        uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  repoId:    text('repo_id').notNull().default('default'),
  filePath:  text('file_path').notNull(),
  symbol:    text('symbol'),
  kind:      text('kind').notNull(),          // function | class | type | route-handler | const | …
  startLine: integer('start_line'),
  endLine:   integer('end_line'),
  /** gpu_cluster / som_cluster / semantic_tags / ast_features — enriched by pipeline */
  metadata:  jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
  index('ast_nodes_file_path_idx').on(t.filePath),
  index('ast_nodes_kind_idx').on(t.kind),
  index('ast_nodes_repo_file_idx').on(t.repoId, t.filePath),
]);

/**
 * Import, call, and type-reference edges between AST nodes.
 * Edge types: import | call | re-export | type-ref | implements | extends
 */
export const astEdges = pgTable('ast_edges', {
  id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  repoId:       text('repo_id').notNull().default('default'),
  sourceNodeId: uuid('source_node_id').notNull(),
  targetNodeId: uuid('target_node_id').notNull(),
  edgeType:     text('edge_type').notNull(),  // import | call | type-ref | re-export | extends
  metadata:     jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
  index('ast_edges_source_idx').on(t.sourceNodeId),
  index('ast_edges_target_idx').on(t.targetNodeId),
  index('ast_edges_type_repo_idx').on(t.edgeType, t.repoId),
]);

/**
 * One row per file — aggregated feature counts plus language metadata.
 * Primary key is (repo_id, file_path) — upserted on every pipeline run.
 * Used by fix-recommender for graph expansion and cluster summary enrichment.
 */
export const astFileFeatures = pgTable('ast_file_features', {
  repoId:        text('repo_id').notNull().default('default'),
  filePath:      text('file_path').notNull(),
  language:      text('language'),        // typescript | python | go | rust | svelte | …
  extension:     text('extension'),       // .ts | .py | .go | …
  importCount:   integer('import_count').notNull().default(0),
  exportCount:   integer('export_count').notNull().default(0),
  functionCount: integer('function_count').notNull().default(0),
  classCount:    integer('class_count').notNull().default(0),
  callCount:     integer('call_count').notNull().default(0),
  semanticTags:  text('semantic_tags').array().notNull().default(sql`ARRAY[]::text[]`),
  domain:        text('domain'),           // api | server | client | route | component | migration
  /** 'ts-morph' | 'heuristic' — which extractor produced this row */
  parser:        text('parser').notNull().default('heuristic'),
  /** gpu_cluster, som_cluster, and any ast_features dict */
  metadata:      jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
  primaryKey({ columns: [t.repoId, t.filePath] }),
  index('ast_file_features_lang_idx').on(t.language),
  index('ast_file_features_domain_idx').on(t.domain),
]);

export type AstNode          = typeof astNodes.$inferSelect;
export type NewAstNode       = typeof astNodes.$inferInsert;
export type AstEdge          = typeof astEdges.$inferSelect;
export type NewAstEdge       = typeof astEdges.$inferInsert;
export type AstFileFeature   = typeof astFileFeatures.$inferSelect;
export type NewAstFileFeature = typeof astFileFeatures.$inferInsert;

/**
 * code_llm_index — durable Postgres mirror of the Redis path-level LLM-output cache.
 *
 * Source of truth is Redis (`code:llm_output:*`, 6h TTL). This table backs the cache
 * for survival across Redis flushes and provides a SQL surface for cluster+SOM
 * analytics that aren't ergonomic to do via Redis ZSET/SET ops.
 *
 * The trigram index on `path` enables substring lookups used by the admin route's
 * `?q=...` similarity search. Composite SOM index supports 4D topology aggregations
 * (manifold4 RL pipeline reuses this surface).
 *
 * Migration: drizzle/manual/code_llm_index.sql
 */
export const codeLlmIndex = pgTable('code_llm_index', {
  pathHash:       varchar('path_hash', { length: 16 }).primaryKey(),
  path:           text('path').notNull(),
  isDir:          boolean('is_dir').notNull().default(false),
  llmOutput:      text('llm_output').notNull(),
  source:         varchar('source', { length: 32 }).notNull().default('ace'),
  query:          text('query'),
  glyphClusterId: integer('glyph_cluster_id'),
  somBmuRow:      integer('som_bmu_row'),
  somBmuCol:      integer('som_bmu_col'),
  hitCount:       integer('hit_count').notNull().default(0),
  tokenCount:     integer('token_count'),
  /**
   * Structured 1-3 sentence summary + citations + confidence.
   * Stored as JSONB so simdjson AVX2 fast-parse can decode at 2-5× V8 speed
   * when ACE bulk-fetches cached RAG/KAG/DAG outputs across a cluster.
   * Schema: { summary, sentences[], citations?[], confidence?, groundingScore?,
   * tokensUsed?, model?, pipeline? } — see CodeLlmOutputMeta type.
   */
  outputMeta:     jsonb('output_meta').notNull().default(sql`'{}'::jsonb`),
  generatedAt:    timestamp('generated_at',  { withTimezone: true }).notNull().default(sql`now()`),
  lastHitAt:      timestamp('last_hit_at',   { withTimezone: true }).notNull().default(sql`now()`),
  refreshedAt:    timestamp('refreshed_at',  { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
  index('code_llm_index_cluster_idx').on(t.glyphClusterId),
  index('code_llm_index_last_hit_idx').on(t.lastHitAt),
  index('code_llm_index_hit_count_idx').on(t.hitCount),
  index('code_llm_index_source_idx').on(t.source),
  // GIN trgm + composite SOM + JSONB GIN + confidence/grounding expression indexes
  // added by drizzle/manual/code_llm_index*.sql (Drizzle can't express USING gin
  // gin_trgm_ops, partial WHERE indexes, or expression indexes natively)
]);

export type CodeLlmIndexRow    = typeof codeLlmIndex.$inferSelect;
export type NewCodeLlmIndexRow = typeof codeLlmIndex.$inferInsert;

// ── HyperRAG Feature Atlas ────────────────────────────────────────────────────
// §5 of docs/architecture/hyperrag-feature-atlas-runtime.md
// Migration: drizzle/migrations/20260510_feature_atlas.sql

export const featureImplementations = pgTable('feature_implementations', {
  id:          uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  featureKey:  text('feature_key').notNull().unique(),
  featureName: text('feature_name').notNull(),
  description: text('description'),
  laneIds:     text('lane_ids').array().default(sql`'{}'`),
  status:      text('status').notNull().default('active'),
  confidence:  real('confidence').notNull().default(1.0),
  createdAt:   timestamp('created_at', { withTimezone: true }).default(sql`now()`),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).default(sql`now()`),
}, (t) => [
  index('feat_impl_status_idx').on(t.status),
]);

export type FeatureImplementation    = typeof featureImplementations.$inferSelect;
export type NewFeatureImplementation = typeof featureImplementations.$inferInsert;

export const featureFileEdges = pgTable('feature_file_edges', {
  id:          uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  featureKey:  text('feature_key').notNull().references(() => featureImplementations.featureKey, { onDelete: 'cascade' }),
  filePath:    text('file_path').notNull(),
  entryExport: text('entry_export'),
  role:        text('role').notNull().default('primary'),
  lineStart:   integer('line_start'),
  lineEnd:     integer('line_end'),
  createdAt:   timestamp('created_at', { withTimezone: true }).default(sql`now()`),
}, (t) => [
  index('feat_file_path_idx').on(t.filePath),
  index('feat_key_role_idx').on(t.featureKey, t.role),
  unique('feat_file_unique').on(t.featureKey, t.filePath, t.entryExport),
]);

export type FeatureFileEdge    = typeof featureFileEdges.$inferSelect;
export type NewFeatureFileEdge = typeof featureFileEdges.$inferInsert;

// ── Panel Activity Log (L11 prefetch) ─────────────────────────────────────────
// §6 of docs/architecture/hyperrag-feature-atlas-runtime.md

export const panelActivityLog = pgTable('panel_activity_log', {
  id:        uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId:    integer('user_id').notNull(),
  sessionId: text('session_id').notNull(),
  route:     text('route').notNull(),
  panelKey:  text('panel_key').notNull(),
  filePath:  text('file_path'),
  toolUsed:  text('tool_used'),
  dwellMs:   integer('dwell_ms'),
  ts:        timestamp('ts', { withTimezone: true }).default(sql`now()`),
}, (t) => [
  index('pal_user_route_idx').on(t.userId, t.route, t.ts),
  index('pal_ts_idx').on(t.ts),
]);

export type PanelActivityLog    = typeof panelActivityLog.$inferSelect;
export type NewPanelActivityLog = typeof panelActivityLog.$inferInsert;

// === RG-ATLAS SEARCH PIPELINE (M2-2026-05-11) ===
//   rg lexical → Karpathy blend → multi-query Qdrant → MS-MARCO → LangExtract
//   → cosine-weighted final blend, persisted per-run for replay/audit.

export const rgSearchRuns = pgTable('rg_search_runs', {
  id:          uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  /** rg_<unix_ms>_<uuid8> — human-readable timestamp + UUID prefix */
  runKey:      varchar('run_key', { length: 64 }).notNull().unique(),
  query:       text('query').notNull(),
  /** Resolved RgSearchAtlasOptions used for the run */
  args:        jsonb('args').notNull().default(sql`'{}'::jsonb`),
  /** Stage timing + counts (rgMs, embedMs, marcoMs, etc.) */
  diagnostics: jsonb('diagnostics').notNull().default(sql`'{}'::jsonb`),
  /** k-means cluster count produced by stage 5 (null when clustering skipped) */
  clusterCount: integer('cluster_count'),
  userId:      integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userCreatedIdx: index('rg_runs_user_created_idx').on(t.userId, t.createdAt),
  runKeyIdx:      index('rg_runs_runkey_idx').on(t.runKey),
}));

export const rgSearchHits = pgTable('rg_search_hits', {
  id:          uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  runId:       uuid('run_id').notNull().references(() => rgSearchRuns.id, { onDelete: 'cascade' }),
  filePath:    text('file_path').notNull(),
  lineNumber:  integer('line_number'),
  snippet:     text('snippet'),
  /** Provenance tag: 'rg' | 'qdrant' | 'union' */
  source:      varchar('source', { length: 16 }).notNull(),
  /** Per-stage scores (rgMatch, karpathy, qdrantCosine, marco, langExtract, final).
   *  JSONB so weights/components can evolve without schema changes. */
  scores:      jsonb('scores').notNull().default(sql`'{}'::jsonb`),
  /** Final weighted score — the sort key; indexed for top-K queries */
  finalScore:  real('final_score').notNull().default(0),
  clusterId:   integer('cluster_id'),
  /** LangExtract grounded entities: [{ type, text, sourceOffset: [start, end] }] */
  entities:    jsonb('entities').notNull().default(sql`'[]'::jsonb`),
  rank:        integer('rank').notNull(),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  runRankIdx:    index('rg_hits_run_rank_idx').on(t.runId, t.rank),
  finalScoreIdx: index('rg_hits_final_score_idx').on(t.finalScore),
  clusterIdx:    index('rg_hits_cluster_idx').on(t.clusterId),
}));

export type RgSearchRun    = typeof rgSearchRuns.$inferSelect;
export type NewRgSearchRun = typeof rgSearchRuns.$inferInsert;
export type RgSearchHit    = typeof rgSearchHits.$inferSelect;
export type NewRgSearchHit = typeof rgSearchHits.$inferInsert;

// === LLM SYNTHESIS EVENTS ===
export const llmSynthesisEvents = pgTable('llm_synthesis_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  runId: text('run_id').notNull(),
  sessionId: text('session_id'),
  userId: integer('user_id'),
  authUserId: text('auth_user_id'),
  query: text('query').notNull(),
  profile: text('profile').notNull(),
  acePacket: jsonb('ace_packet').notNull(),
  toolCalls: jsonb('tool_calls').notNull().default(sql`'[]'::jsonb`),
  sourceRefs: jsonb('source_refs').notNull().default(sql`'[]'::jsonb`),
  cacheKeys: jsonb('cache_keys').notNull().default(sql`'{}'::jsonb`),
  routingHints: jsonb('routing_hints').notNull().default(sql`'{}'::jsonb`),
  trustTier: text('trust_tier'),
  model: text('model').notNull(),
  validation: jsonb('validation').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export type LlmSynthesisEvent = typeof llmSynthesisEvents.$inferSelect;
export type NewLlmSynthesisEvent = typeof llmSynthesisEvents.$inferInsert;

// GlyphRecord_DB aliases the canonical glyphRecords table (defined at line ~3748).
export type GlyphRecord_DB = typeof glyphRecords.$inferSelect;
export type NewGlyphRecord_DB = typeof glyphRecords.$inferInsert;



export * from './schema/nes-chrom-packets.js';
export * from './schema/atlas-feature-map.js';
export * from './schema/atlas-dict.js';
// Policy Reranker Metadata — PyTorch Stage 5 Neural Policy Network
export const policyRerankerMetadata = pgTable('policy_reranker_metadata', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  modelVersion: varchar('model_version', { length: 50 }).notNull().default('1.0'),
  trainedAt: timestamp('trained_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),

  // Model architecture & training parameters (JSONB for flexibility across PyTorch versions)
  metadata: jsonb('metadata').notNull().$type<{
    // Input shape & normalization
    inputShape: {
      scalarFeatures: number;
      somEmbeddingDim: number;
      totalInputDim: number;
    };
    // Normalization statistics (per-feature min/max for inference rescaling)
    featureNormalization: Record<string, {
      min: number;
      max: number;
      mean: number;
      std: number;
    }>;
    // Action space enum
    actionSpace: {
      actions: string[]; // ['repair_file', 'rerank', 'call_tool', 'rollback', 'run_tests', 'ask_gemma4', 'expand_graph']
      actionCount: number;
    };
    // SOM topology metadata
    somTopology: {
      gridSize: number; // 20 for 20×20
      cellCount: number; // 400
      latentDim: number; // 64
    };
    // Training configuration
    trainingConfig: {
      epochs: number;
      batchSize: number;
      learningRate: number;
      validationSplit: number; // 0.2
      earlyStopping: {
        patience: number;
        metric: string; // 'ndcg_at_10'
      };
    };
    // Validation metrics
    validationMetrics: {
      accuracy: number;
      loss: number;
      f1Score: number;
      ndcgAt10: number;
      inferenceLatencyMs: number;
    };
    // PyTorch serialization info
    torchscriptExportPath?: string; // For TensorRT export
    tensorrtEnginePath?: string; // For GPU inference
  }>(),

  // Git provenance
  gitCommitHash: varchar('git_commit_hash', { length: 40 }),
  gitBranch: varchar('git_branch', { length: 255 }),

  // Status & inference routing
  status: varchar('status', { length: 20 }).default('active').notNull(), // 'active', 'archived', 'testing'
  isDefault: boolean('is_default').default(true),

  // Inference performance telemetry
  inferenceStats: jsonb('inference_stats').notNull().$type<{
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    averageLatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    lastUsedAt: string; // ISO timestamp
  }>(),

  // Index for fast lookups by model version & status
}, (table) => ({
  // B-tree on status + isDefault for active-model lookups
  statusDefaultIdx: index('idx_policy_status_default').on(table.status, table.isDefault),
  // B-tree on trainedAt for temporal queries (recent models first)
  trainedAtIdx: index('idx_policy_trained_at').on(table.trainedAt.desc()),
}));

export type PolicyRerankerMetadata = typeof policyRerankerMetadata.$inferSelect;
export type NewPolicyRerankerMetadata = typeof policyRerankerMetadata.$inferInsert;

export const errorLogs = pgTable('error_logs', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  error_category: varchar('error_category', { length: 100 }).notNull(),
  severity: varchar('severity', { length: 20 }).notNull(), // CRITICAL, ERROR, WARNING, INFO
  message: text('message').notNull(),
  stack: text('stack'),
  context_key: varchar('context_key', { length: 255 }), // route, function, component
  route_path: varchar('route_path', { length: 255 }), // API or page path
  file_path: varchar('file_path', { length: 512 }), // source file
  line_number: integer('line_number'),
  packet_key: varchar('packet_key', { length: 255 }), // link to atlas_packets
  source_ref: varchar('source_ref', { length: 255 }), // link to source_ref
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  fixed_at: timestamp('fixed_at', { withTimezone: true }),
  resolved: boolean('resolved').default(false).notNull(),
  fix_strategy: varchar('fix_strategy', { length: 50 }), // pattern, ast, semantic, manual
  fix_confidence: numeric('fix_confidence', { precision: 5, scale: 2 }), // 0.0-1.0
  fix_notes: text('fix_notes'),
  audit_count: integer('audit_count').default(1).notNull(),
  last_audit_at: timestamp('last_audit_at', { withTimezone: true }),
}, (table) => ({
  idx_category: index('idx_error_logs_category').on(table.error_category),
  idx_severity: index('idx_error_logs_severity').on(table.severity),
  idx_created: index('idx_error_logs_created').on(table.created_at),
  idx_route: index('idx_error_logs_route').on(table.route_path),
  idx_packet_key: index('idx_error_logs_packet_key').on(table.packet_key),
  idx_resolved: index('idx_error_logs_resolved').on(table.resolved),
  idx_fix_strategy: index('idx_error_logs_fix_strategy').on(table.fix_strategy),
}));

export type ErrorLog = typeof errorLogs.$inferSelect;
export type NewErrorLog = typeof errorLogs.$inferInsert;

// === DEEP RESEARCH REPORTS ===
export const deepResearchReports = pgTable('deep_research_reports', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  query: text('query').notNull(),
  reportType: varchar('report_type', { length: 50 }).default('full').notNull(),
  modelUsed: varchar('model_used', { length: 100 }).default('gemma4-rotorquant:latest'),
  markdownContent: text('markdown_content'),
  citations: jsonb('citations'), // Array of {num, title, url, snippet}
  recommendations: jsonb('recommendations'), // Array of {id, title, description, action_type, confidence}
  metadata: jsonb('metadata').default('{}'), // {pipelineHint, caseId, durationMs, provider, tags, etc}
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('idx_deep_research_reports_user_id').on(table.userId),
  createdAtIdx: index('idx_deep_research_reports_created_at').on(table.createdAt.desc()),
  modelIdx: index('idx_deep_research_reports_model').on(table.modelUsed),
}));

export type DeepResearchReport = typeof deepResearchReports.$inferSelect;
export type NewDeepResearchReport = typeof deepResearchReports.$inferInsert;

// ═══════════════════════════════════════════════════════════════
// Chunk Hit Log — Feedback Loop A: Retrieval Analytics
// ═══════════════════════════════════════════════════════════════
// Tracks which chunks were selected by workers and ranked by the ACE pipeline.
// Powers demand_score feedback signal for improving retrieval rank weights.

export const chunkHitLog = pgTable('chunk_hit_log', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  traceId: uuid('trace_id').notNull(), // Links to research trace
  queryHash: varchar('query_hash', { length: 8 }).notNull(), // 8-char FNV-1a hash for fast joins
  packetKey: varchar('packet_key', { length: 255 }), // ace:packet:feature:NNN or null if not found
  sourceRef: varchar('source_ref', { length: 255 }), // src/lib/server/auth.ts or null
  featureId: varchar('feature_id', { length: 255 }), // auth.sessions or null
  lane: varchar('lane', { length: 50 }).notNull(), // 'api-routes', 'state-machines', etc — which worker emitted this
  rank: integer('rank').notNull(), // 0-19 position in worker's top-20 results
  score: real('score'), // Qdrant cosine, pg_trgm, or hybrid blend score
  usedInAnswer: boolean('used_in_answer').default(false).notNull(), // True if supervisor included this chunk in final answer
  demandScore: real('demand_score').default(0).notNull(), // 0.0-1.0, incremented by demand_feedback_score() after supervisor merges
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  traceIdIdx: index('idx_chunk_hit_log_trace_id').on(table.traceId),
  queryHashIdx: index('idx_chunk_hit_log_query_hash').on(table.queryHash),
  packetKeyIdx: index('idx_chunk_hit_log_packet_key').on(table.packetKey),
  laneIdx: index('idx_chunk_hit_log_lane').on(table.lane),
  demandIdx: index('idx_chunk_hit_log_demand_score').on(table.demandScore.desc()),
}));

export type ChunkHitLog = typeof chunkHitLog.$inferSelect;
export type NewChunkHitLog = typeof chunkHitLog.$inferInsert;

export * from './schema/atlas-packets.js';


