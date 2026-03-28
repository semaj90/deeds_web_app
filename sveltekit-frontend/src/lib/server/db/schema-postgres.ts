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

// Re-export chatMessages from schema-chat for broader availability
export { chatMessages, type ChatMessage, type NewChatMessage } from './schema-chat';

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
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('hashed_password', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }), // Legacy field - use firstName/lastName instead
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  role: userRoleEnum('role').notNull().default('prosecutor'),
  isActive: boolean('is_active').default(true).notNull(),
  avatarUrl: text('avatar_url'),
  hasCompletedOnboarding: boolean('has_completed_onboarding').default(false).notNull(),
  onboardingStep: integer('onboarding_step').default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});
export const sessions = pgTable('sessions',
 {
 id: text('id').primaryKey().notNull(),
 userId: uuid('user_id').notNull(),
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
 userId: uuid('user_id').notNull(),
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
 userId: uuid('user_id').notNull(),
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
 userId: uuid('user_id'), // owner of the case
 assignedAttorney: uuid('assigned_attorney'),
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
 createdBy: uuid('created_by'), // Foreign key to users.id
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
 userId: uuid('user_id'), // Foreign key to users.id - owner of the evidence
 title: varchar('title', { length: 255 }).notNull(),
 description: text('description'),
 // OLD COLUMNS (preserve existing data)
 filePath: varchar('file_path', { length: 500 }),
 fileType: varchar('file_type', { length: 100 }),
 fileSize: integer('file_size'),
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
 uploadedBy: uuid('uploaded_by'), // Foreign key to users.id
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

// === EVIDENCE RELATIONSHIPS ===
export const evidenceRelationships = pgTable('evidence_relationships',
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
 index('evidence_relationships_to_idx').on(table.toEvidenceId)],
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
 }).onDelete('cascade')],
 })
);

// Define documents table
export const documents = pgTable('documents', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(),
 caseId: uuid('case_id'),
 title: varchar('title', { length: 255 }).notNull(),
 // OLD COLUMNS (preserve existing data)
 description: text('description'),
 filePath: varchar('file_path', { length: 500 }),
 fileType: varchar('file_type', { length: 100 }),
 fileSize: integer('file_size'),
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
 userId: uuid('user_id'),
});

// Define legalDocuments table (based on documents, with additional fields for Qdrant integration)
export const legalDocuments = pgTable('legal_documents',
 {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(),
 title: text('title').notNull(),
 content: text('content'),
 s3Key: text('s3_key').notNull(),
 s3Bucket: text('s3_bucket').notNull().default('legal-documents'),
 originalName: text('original_name').notNull(),
 mimeType: text('mime_type').notNull(),
 fileSize: bigint('file_size', { mode: 'number' }).notNull().default(0),
 caseId: uuid('case_id'), // Foreign key to cases table
 userId: uuid('user_id'), // Foreign key to users table
 evidenceId: uuid('evidence_id'), // Added: Foreign key to evidence table
 createdBy: uuid('created_by'), // Added: Foreign key to users table
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
 index('idx_legal_documents_content_embedding_hnsw').on(table.contentEmbedding)],
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
 }).onDelete('set null')],
 })
);

// Define storageFiles table
export const storageFiles = pgTable('storage_files',
 {
 id: uuid('id')
 .primaryKey()
 .notNull()
 .default(sql`gen_random_uuid()`),
 key: text('key').notNull(),
 original_name: text('original_name'),
 bucket: text('bucket').notNull(),
 userId: uuid('user_id'), // Foreign key to users table
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
 }).onDelete('set null')],
 })
);

// === VECTOR METADATA ===
export const vectorMetadata = pgTable('vector_metadata',
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
export const caseScores = pgTable('case_scores',
 {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(),
 // Foreign key to users.id; who performed the calculation (nullable to allow on delete set null)
 calculatedBy: uuid('calculated_by'),
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
 }).onDelete('set null')]
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
    userId: uuid('user_id').notNull(),
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
    confirmedBy: uuid('confirmed_by'), // FK to users.id
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
  vector: vector('vector', { dimensions: 768 }),
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
  assignedTo: uuid('assigned_to'),
  createdBy: uuid('created_by'),
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
  verifiedBy: uuid('verified_by'), // FK to users.id
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
  userId: uuid('user_id'), // FK to users.id
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
  createdBy: uuid('created_by'), // FK to users.id
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
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }), // FK to users.id
  reportType: varchar('report_type', { length: 100 }).notNull(),
  summary: text('summary'),
  fullReport: text('full_report'),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});

export const citations = pgTable('citations', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  documentId: uuid('document_id'), // FK to legalDocuments.id
  caseId: uuid('case_id'), // FK to cases.id
  // DB-SYNC: actual column is 'quoted_text', NOT 'citation_text'
  citationType: varchar('citation_type', { length: 100 }).notNull(),
  relevanceScore: real('relevance_score'),
  pageNumber: integer('page_number'),
  pinpointCitation: varchar('pinpoint_citation', { length: 500 }),
  quotedText: text('quoted_text'),
  contextBefore: text('context_before'),
  contextAfter: text('context_after'),
  annotation: text('annotation'),
  legalPrinciple: text('legal_principle'),
  citationFormat: varchar('citation_format', { length: 50 }).default('bluebook'),
  formattedCitation: text('formatted_citation'),
  shepardsTreatment: varchar('shepards_treatment', { length: 100 }),
  isKeyAuthority: boolean('is_key_authority').default(false),
  createdBy: uuid('created_by'), // FK to users.id
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  // DB-SYNC: additional columns present in native PG
  title: varchar('title', { length: 500 }),
  sourceType: varchar('source_type', { length: 100 }),
  sourceName: varchar('source_name', { length: 500 }),
  sourceUrl: text('source_url'),
  notes: text('notes'),
  tags: jsonb('tags').default([]),
  embedding: vector('embedding', { dimensions: 768 }),
  metadata: jsonb('metadata').default({}),
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
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
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
    userId: uuid('user_id')
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
  createdBy: uuid('created_by'), // FK to users.id
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
    userId: uuid('user_id')
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
    changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'set null' }),
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
  userId: uuid('user_id').notNull(), // FK to users.id
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
  userId: uuid('user_id').notNull(), // FK to users.id
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
  createdBy: text('created_by'),
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
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`now()`),
  },
  (table) => [
    index('idx_timeline_events_poi_id').on(table.poiId),
    index('idx_timeline_events_case_id').on(table.caseId),
    index('idx_timeline_events_event_date').on(table.eventDate),
  ]
);

// === AI/VECTOR TABLES (Missing Definitions) ===

export const hashVerifications = pgTable('hash_verifications', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  evidenceId: uuid('evidence_id').notNull(),
  verifiedBy: uuid('verified_by'),
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
  embedding: vector('embedding', { dimensions: 768 }).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userEmbeddings = pgTable('user_embeddings', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  userId: uuid('user_id').notNull(),
  embedding: vector('embedding', { dimensions: 768 }).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const chatEmbeddings = pgTable('chat_embeddings', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  ragMessageId: uuid('rag_message_id').notNull(),
  embedding: vector('embedding', { dimensions: 768 }).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
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

export const caseEmbeddings = pgTable('case_embeddings', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  caseId: uuid('case_id').notNull(),
  embedding: vector('embedding', { dimensions: 768 }).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const ragSessions = pgTable('rag_sessions', {
  id: uuid('id')
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  userId: uuid('user_id').notNull(),
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
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
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
  userId: uuid('user_id').notNull(),
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
  createdBy: uuid('created_by').notNull(),
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
  documentId: uuid('document_id').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  // embedding column removed — evidence chunks are stored in evidence_vectors (pgvector)
  // and evidence_items (Qdrant). document_chunks.embedding had no active writer.
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

export const personsOfInterestRelations = relations(personsOfInterest, ({ many }) => ({
	photos: many(poiPhotos),
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
export const evidenceBoardConnections = pgTable('evidence_board_connections',
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
 createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
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
export const caseNotes = pgTable('case_notes',
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
 createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
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
export const caseNoteVersions = pgTable('case_note_versions',
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
 editedBy: uuid('edited_by').references(() => users.id, { onDelete: 'set null' }),
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
export const caseNoteEvidenceRefs = pgTable('case_note_evidence_refs',
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
export const workspaces = pgTable('workspaces',
 {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(),
 title: text('title').notNull(),
 description: text('description'),
 caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }),
 createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
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
export const workspaceSessions = pgTable('workspace_sessions',
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
export const workspaceEvidence = pgTable('workspace_evidence',
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
export const workspaceStatutes = pgTable('workspace_statutes',
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
export const workspaceNotes = pgTable('workspace_notes',
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
 createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
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
export const workspaceCitations = pgTable('workspace_citations',
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

export const chatEmbeddingsRelations = relations(chatEmbeddings, ({ one }) => ({
 ragMessage: one(ragMessages, {
 fields: [chatEmbeddings.ragMessageId],
 references: [ragMessages.id],
 }),
}));

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

export const ragMessagesRelations = relations(ragMessages, ({ one, many }) => ({
 session: one(ragSessions, { fields: [ragMessages.sessionId], references: [ragSessions.id] }),
 chatEmbeddings: many(chatEmbeddings),
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
 created_by: uuid('created_by').notNull(),
 assigned_to: uuid('assigned_to'),
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
 created_by: uuid('created_by').notNull(),
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
 created_by: uuid('created_by').notNull(),
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
 user_id: uuid('user_id').notNull(),
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
 createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
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
 userId: uuid('user_id'),
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
	userId: uuid('user_id').notNull(),
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
		userId: uuid('user_id').notNull(),
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
	userId: uuid('user_id')
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
	userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
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
	'document', 'title', 'article', 'chapter', 'part', 'section',
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
	effectiveDate: timestamp('effective_date', { mode: 'date' }),
	updatedAtSource: timestamp('updated_at_source', { withTimezone: true }),
	isOfficial: boolean('is_official').default(false),
	processingStatus: processingStatusEnum('processing_status').notNull().default('queued'),
	uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
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
	sourceDate: timestamp('source_date', { mode: 'date' }),
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
	userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
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
	userId: uuid('user_id'),
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

