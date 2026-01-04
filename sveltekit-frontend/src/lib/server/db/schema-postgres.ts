// Updated PostgreSQL schema based on database introspection // This schema matches the actual database structure (drizzle/schema.ts)
import { sql } from 'drizzle-orm';
import {
    bigint,
    boolean,
    foreignKey,
    index,
    integer,
    jsonb,
    numeric,
    pgEnum,
    pgTable,
    real,
    serial,
    text,
    timestamp,
    unique,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm/relations';

// Note: vector type is handled via sql`` template in table definitions

// === ENUMS FOR LEGAL AI APPLICATION ===
export const userRoleEnum = pgEnum('user_role', [
 'prosecutor',
 'detective',
 'admin',
 'analyst',
 'paralegal',
]);
export const caseStatusEnum = pgEnum('case_status', [
 'open',
 'in_progress',
 'pending_review',
 'closed',
 'archived',
]);
export const casePriorityEnum = pgEnum('case_priority', [
 'low',
 'medium',
 'high',
 'critical',
 'urgent',
]);
export const evidenceTypeEnum = pgEnum('evidence_type', [
 'document',
 'photo',
 'video',
 'audio',
 'physical',
 'digital',
 'witness_statement',
 'forensic',
]);
export const evidenceRelationshipTypeEnum = pgEnum('evidence_relationship_type', [
 'supports',
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
 'inadmissible',
]);
export const evidenceRelationshipStrengthEnum = pgEnum('evidence_relationship_strength', [
 'low',
 'medium',
 'high',
]);
export const threatLevelEnum = pgEnum('threat_level', ['low', 'medium', 'high', 'critical']);
export const documentTypeEnum = pgEnum('document_type', [
 'case_law',
 'statute',
 'regulation',
 'brief',
 'contract',
 'evidence',
 'report',
 'precedent',
]);
export const confidentialityEnum = pgEnum('confidentiality_level', [
 'public',
 'standard',
 'confidential',
 'restricted',
 'classified',
]);
export const activityStatusEnum = pgEnum('activity_status', [
 'pending',
 'in_progress',
 'completed',
 'cancelled',
 'postponed',
]);
export const reportStatusEnum = pgEnum('report_status', [
 'draft',
 'review',
 'approved',
 'published',
 'archived',
]);
export const verificationStatusEnum = pgEnum('verification_status', [
 'pending',
 'verified',
 'rejected',
 'needs_review',
]);
export const documentStatusEnum = pgEnum('document_status', [
 'queued',
 'processing',
 'processed',
 'failed',
 'pending_ocr',
 'ocr_completed',
 'pending_embedding',
 'embedding_completed',
 'pending_summary',
 'summary_completed',
]);
export const summaryTypeEnum = pgEnum('summary_type', [
 'legal_analysis',
 'executive_summary',
 'key_facts',
]);
export const caseRiskLevelEnum = pgEnum('case_risk_level', [
 'low',
 'medium',
 'high',
 'critical',
 'urgent',
]);
export const patchStatusEnum = pgEnum('patch_status', ['suggested', 'applied', 'rejected']);

// === TABLES FOR LEGAL AI APPLICATION ===

export const users = pgTable('users', {
 id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(, email: varchar('email', { length: 255 }).unique().notNull(, passwordHash: varchar('password_hash', { length: 255 }).notNull(, name: varchar('name', { length: 255 }, firstName: varchar('first_name', { length: 255 }, lastName: varchar('last_name', { length: 255 }, role: userRoleEnum('role').notNull().default('prosecutor', isActive: boolean('is_active').default(true).notNull(, avatarUrl: text('avatar_url', createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(, updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const sessions = pgTable(
 'sessions',
 {
 id: text('id').primaryKey().notNull(, userId: uuid('user_id').notNull(, expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
 },
 (table) => ({
 foreignKeys: [
 foreignKey({
 columns: [table.userId],
 foreignColumns: [users.id],
 name: 'sessions_user_id_users_id_fk',
 }).onDelete('cascade'),
 ],
 })
);

export const emailVerificationCodes = pgTable(
 'email_verification_codes',
 {
 id: serial('id').primaryKey().notNull(), // Assuming serial ID
 userId: uuid('user_id').notNull(, email: varchar('email', { length: 255 }).notNull(, code: varchar('code', { length: 8 }).notNull(, expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
 },
 (table) => ({
 foreignKeys: [
 foreignKey({
 columns: [table.userId],
 foreignColumns: [users.id],
 name: `email_verification_codes_user_id_users_id_fk`,
 }).onDelete('cascade'),
 ],
 uniqueConstraints: [unique('email_verification_codes_user_id_unique').on(table.userId)],
 })
);

export const passwordResetTokens = pgTable(
 'password_reset_tokens',
 {
 tokenHash: varchar('token_hash', { length: 63 }).primaryKey().notNull(), // Assuming tokenHash is primary key
 userId: uuid('user_id').notNull(, expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
 },
 (table) => ({
 foreignKeys: [
 foreignKey({
 columns: [table.userId],
 foreignColumns: [users.id],
 name: `password_reset_tokens_user_id_users_id_fk`,
 }).onDelete('cascade'),
 ],
 })
);

// === CASE MANAGEMENT ===
export const cases = pgTable(
 'cases',
 {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, title: varchar('title', { length: 255 }).notNull(, description: text('description', caseNumber: varchar('case_number', { length: 100 }, priority: casePriorityEnum('priority').notNull(), // Using enum directly
 practiceArea: varchar('practice_area', { length: 100 }, jurisdiction: varchar('jurisdiction', { length: 100 }, court: varchar('court', { length: 200 }, clientName: varchar('client_name', { length: 200 }, opposingParty: varchar('opposing_party', { length: 200 }, assignedAttorney: uuid('assigned_attorney'), // Foreign key to users.id
 filingDate: timestamp('filing_date', { withTimezone: true }, dueDate: timestamp('due_date', { withTimezone: true }, closedDate: timestamp('closed_date', { withTimezone: true }, qdrantId: uuid('qdrant_id', qdrantCollection: varchar('qdrant_collection', { length: 100 }, metadata: jsonb('metadata', createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
 .notNull()
 .defaultNow(, updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
 .notNull()
 .defaultNow(, status: caseStatusEnum('status').notNull(), // Using enum directly
 },
 (table) => ({
 indexes: [
 index('idx_cases_created_at').on(table.createdAt),
 index('idx_cases_status_priority').on(table.status, table.priority),
 index('idx_cases_status_priority_created').on(table.status, table.priority, table.createdAt),
 ],
 foreignKeys: [
 // Added foreign key for assignedAttorney
 foreignKey({
 columns: [table.assignedAttorney],
 foreignColumns: [users.id],
 name: 'cases_assigned_attorney_users_id_fk',
 }).onDelete('set null'),
 ],
 })
);

// === CRIMINAL RECORDS ===
export const criminals = pgTable(
 'criminals',
 {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, firstName: varchar('first_name', { length: 100 }).notNull(, lastName: varchar('last_name', { length: 100 }).notNull(, middleName: varchar('middle_name', { length: 100 }, aliases: jsonb('aliases').default([]).notNull().$type<string[]>(, dateOfBirth: timestamp('date_of_birth', { mode: 'string' }, placeOfBirth: varchar('place_of_birth', { length: 200 }, address: text('address', phone: varchar('phone', { length: 20 }, email: varchar('email', { length: 255 }, ssn: varchar('ssn', { length: 11 }, driversLicense: varchar('drivers_license', { length: 50 }, height: integer('height', weight: integer('weight', eyeColor: varchar('eye_color', { length: 20 }, hairColor: varchar('hair_color', { length: 20 }, distinguishingMarks: text('distinguishing_marks', photoUrl: text('photo_url', fingerprints: jsonb('fingerprints').default({}).notNull(, threatLevel: threatLevelEnum('threat_level').default('low').notNull(, status: varchar('status', { length: 20 }).default('active').notNull(, notes: text('notes', aiSummary: text('ai_summary', aiTags: jsonb('ai_tags').default([]).notNull().$type<string[]>(, createdBy: uuid('created_by'), // Foreign key to users.id
 createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(, updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
 },
 (table) => ({
 indexes: [
 index('criminals_first_name_idx').on(table.firstName),
 index('criminals_last_name_idx').on(table.lastName),
 index('criminals_threat_level_idx').on(table.threatLevel),
 index('criminals_status_idx').on(table.status),
 index('criminals_created_by_idx').on(table.createdBy),
 index('criminals_ssn_idx').on(table.ssn),
 ],
 foreignKeys: [
 // Added foreign key for createdBy
 foreignKey({
 columns: [table.createdBy],
 foreignColumns: [users.id],
 name: 'criminals_created_by_users_id_fk',
 }).onDelete('set null'),
 ],
 })
);

// === EVIDENCE MANAGEMENT ===
export const evidence = pgTable(
 'evidence',
 {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, caseId: uuid('case_id'), // Foreign key to cases.id
 criminalId: uuid('criminal_id'), // Foreign key to criminals.id
 title: varchar('title', { length: 255 }).notNull(, description: text('description', evidenceType: evidenceTypeEnum('evidence_type').notNull(, fileType: varchar('file_type', { length: 50 }, subType: varchar('sub_type', { length: 50 }, fileUrl: text('file_url', fileName: varchar('file_name', { length: 255 }, canvasPosition: jsonb('canvas_position').default({}).notNull(, uploadedBy: uuid('uploaded_by'), // Foreign key to users.id
 uploadedAt: timestamp('uploaded_at', { mode: 'string' }).defaultNow().notNull(, updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
 },
 (table) => ({
 indexes: [
 index('evidence_case_id_idx').on(table.caseId),
 index('evidence_criminal_id_idx').on(table.criminalId),
 index('evidence_type_idx').on(table.evidenceType),
 index('evidence_uploaded_by_idx').on(table.uploadedBy),
 index('evidence_uploaded_at_idx').on(table.uploadedAt),
 ],
 foreignKeys: [
 foreignKey({
 columns: [table.caseId],
 foreignColumns: [cases.id],
 name: 'evidence_case_id_cases_id_fk',
 }).onDelete('cascade'),
 foreignKey({
 columns: [table.criminalId],
 foreignColumns: [criminals.id],
 name: 'evidence_criminal_id_criminals_id_fk',
 }).onDelete('set null'),
 foreignKey({
 columns: [table.uploadedBy],
 foreignColumns: [users.id],
 name: 'evidence_uploaded_by_users_id_fk',
 }).onDelete('set null'),
 ],
 })
);

// === EVIDENCE RELATIONSHIPS ===
export const evidenceRelationships = pgTable(
 'evidence_relationships',
 {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, caseId: uuid('case_id').notNull(, fromEvidenceId: uuid('from_evidence_id').notNull(, toEvidenceId: uuid('to_evidence_id').notNull(, relationshipType: evidenceRelationshipTypeEnum('relationship_type').notNull(, label: text('label', strength: evidenceRelationshipStrengthEnum('strength').default('medium').notNull(, createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
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
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, title: text('title').notNull(, content: text('content', s3Key: text('s3_key').notNull(), // Added
 s3Bucket: text('s3_bucket').notNull().default('legal-documents'), // Added
 originalName: text('original_name').notNull(), // Added
 mimeType: text('mime_type').notNull(), // Added
 fileSize: bigint('file_size', { mode: 'number' }).notNull().default(0), // Added
 caseId: uuid('case_id'), // Added, assuming foreign key to cases table
 userId: uuid('user_id'), // Added, assuming foreign key to users table
 status: documentStatusEnum('status').notNull().default('queued', createdAt: timestamp('created_at').defaultNow().notNull(, updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Define legalDocuments table (based on documents, with additional fields for Qdrant integration)
export const legalDocuments = pgTable(
 'legal_documents',
 {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, title: text('title').notNull(, content: text('content', s3Key: text('s3_key').notNull(, s3Bucket: text('s3_bucket').notNull().default('legal-documents', originalName: text('original_name').notNull(, mimeType: text('mime_type').notNull(, fileSize: bigint('file_size', { mode: 'number' }).notNull().default(0, caseId: uuid('case_id'), // Foreign key to cases table
 userId: uuid('user_id'), // Foreign key to users table
 evidenceId: uuid('evidence_id'), // Added: Foreign key to evidence table
 createdBy: uuid('created_by'), // Added: Foreign key to users table
 status: documentStatusEnum('status').notNull().default('queued', documentType: documentTypeEnum('document_type'), // Specific legal document type
 practiceArea: varchar('practice_area', { length: 100 }, metadata: jsonb('metadata'), // General metadata
 contentEmbedding: text('content_embedding'), // pgvector column for embeddings
 qdrantId: uuid('qdrant_id'), // ID in Qdrant
 qdrantCollection: varchar('qdrant_collection', { length: 100 }), // Qdrant collection name
 lastSyncedToQdrant: timestamp('last_synced_to_qdrant', { withTimezone: true, mode: 'string' }, deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }), // Soft delete
 createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
 .defaultNow()
 .notNull(, updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
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
 .default(sql`gen_random_uuid()`, key: text('key').notNull(, original_name: text('original_name', bucket: text('bucket').notNull(, userId: uuid('user_id'), // Foreign key to users table
 size: bigint('size', { mode: 'bigint' }).notNull(, mime: text('mime', uploadedAt: timestamp('uploaded_at').defaultNow().notNull(), // Changed to uploadedAt for consistency
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
 .notNull(, documentId: text('document_id').notNull(), // This might be a foreign key to documents.id or legalDocuments.id
 collectionName: varchar('collection_name', { length: 100 }).notNull(, metadata: jsonb('metadata').default({}).notNull(, contentHash: text('content_hash').notNull(, createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(, updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow(),
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
 calculatedBy: integer('calculated_by', caseId: uuid('case_id').notNull(, score: numeric('score', { precision: 5, scale: 2 }).notNull(, riskLevel: caseRiskLevelEnum('risk_level').notNull(, breakdown: jsonb('breakdown').default({}).notNull(, criteria: jsonb('criteria').default({}).notNull(, recommendations: jsonb('recommendations').default([]).notNull().$type<string[]>(, calculatedAt: timestamp('calculated_at', { mode: 'string' }).defaultNow().notNull(, updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
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
 .notNull(, textHash: text('text_hash').notNull(, model: varchar('model', { length: 100 }).notNull(, createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(, embedding: text('embedding').notNull(), // Vector stored as text, converted in service layer
 },
 (table) => [unique('embedding_cache_text_hash_unique').on(table.textHash)]
);

// === USER AI QUERIES ===
export const userAiQueriesTable = pgTable(
 'user_ai_queries',
 {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, userId: integer('user_id').notNull(, caseId: uuid('case_id', query: text('query').notNull(, response: text('response').notNull(, model: varchar('model', { length: 100 }).notNull(, queryType: varchar('query_type', { length: 50 }).notNull(, confidence: numeric('confidence', { precision: 3, scale: 2 }, processingTime: integer('processing_time'), // in ms
 contextUsed: jsonb('context_used').default([]).$type<string[]>(, createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
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
export const autoTagsTable = pgTable(
 'auto_tags',
 {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, entityId: uuid('entity_id').notNull(), // Polymorphic
 entityType: varchar('entity_type', { length: 50 }).notNull(), // e.g., 'evidence', 'document'
 tag: varchar('tag', { length: 100 }).notNull(, confidence: real('confidence').notNull(, source: varchar('source', { length: 100 }).notNull(), // e.g., 'ai_analysis', 'user'
 model: varchar('model', { length: 100 }, isConfirmed: boolean('is_confirmed').default(false).notNull(, confirmedBy: integer('confirmed_by'), // FK to users.id
 confirmedAt: timestamp('confirmed_at', { mode: 'string' }, createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
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
 .notNull(, ownerType: varchar('owner_type', { length: 256 }).notNull(, ownerId: varchar('owner_id', { length: 256 }).notNull(, event: varchar('event', { length: 256 }).notNull(, vector: text('vector'), // Using sql`vector(384)` for pgvector type
 payload: jsonb('payload').notNull(, createdAt: timestamp('created_at').defaultNow().notNull(, updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const vectorJobs = pgTable('vector_jobs', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, status: varchar('status', { enum: ['pending', 'processing', 'success', 'failed'] }).notNull(, progress: integer('progress').default(0).notNull(, result: jsonb('result', error: text('error', createdAt: timestamp('created_at').defaultNow().notNull(, updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// === ADDITIONAL TABLES ===
export const caseActivities = pgTable('case_activities', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, caseId: uuid('case_id', assignedTo: integer('assigned_to', createdBy: integer('created_by', activityType: varchar('activity_type', { length: 100 }, description: text('description', status: activityStatusEnum('status', dueDate: timestamp('due_date', createdAt: timestamp('created_at').defaultNow(, updatedAt: timestamp('updated_at').defaultNow(),
});

export const attachmentVerifications = pgTable('attachment_verifications', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, attachmentId: uuid('attachment_id'), // FK to evidence.id or legalDocuments.id
 verifiedBy: integer('verified_by'), // FK to users.id
 status: verificationStatusEnum('status', verificationDate: timestamp('verification_date', notes: text('notes', createdAt: timestamp('created_at').defaultNow(, updatedAt: timestamp('updatedAt').defaultNow(),
});

export const canvasStates = pgTable('canvas_states', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, caseId: uuid('case_id'), // FK to cases.id
 userId: integer('user_id'), // FK to users.id
 stateData: jsonb('state_data').notNull(, createdAt: timestamp('created_at').defaultNow(, updatedAt: timestamp('updated_at').defaultNow(),
});

export const canvasAnnotations = pgTable('canvas_annotations', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, canvasStateId: uuid('canvas_state_id'), // FK to canvasStates
 createdBy: integer('created_by'), // FK to users.id
 annotationData: jsonb('annotation_data').default({}).notNull(, createdAt: timestamp('created_at').defaultNow(, updatedAt: timestamp('updatedAt').defaultNow(),
});

export const canvasAutosaves = pgTable('canvas_autosaves', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, canvasStateId: uuid('canvas_state_id'), // FK to canvasStates
 createdAt: timestamp('created_at').defaultNow(),
});

export const aiReports = pgTable('ai_reports', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }), // FK to cases.id
 createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }), // FK to users.id
 reportType: varchar('report_type', { length: 100 }).notNull(, summary: text('summary', fullReport: text('full_report', generatedAt: timestamp('generated_at').defaultNow().notNull(, metadata: jsonb('metadata', createdAt: timestamp('created_at').defaultNow(, updatedAt: timestamp('updatedAt').defaultNow(),
});

export const citations = pgTable('citations', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, documentId: uuid('document_id'), // FK to legalDocuments.id
 caseId: uuid('case_id'), // FK to cases.id
 citationText: text('citation_text').notNull(, sourceUrl: text('source_url', pageNumber: integer('page_number', confidence: real('confidence', createdBy: integer('created_by'), // FK to users.id
 createdAt: timestamp('created_at').defaultNow(, updatedAt: timestamp('updated_at').defaultNow(),
});

export const reports = pgTable('reports', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, caseId: uuid('case_id'), // FK to cases.id
 createdBy: uuid('created_by'), // FK to users.id
 title: varchar('title', { length: 255 }).notNull(, content: text('content', status: reportStatusEnum('status').default('draft').notNull(, generatedAt: timestamp('generated_at').defaultNow().notNull(, metadata: jsonb('metadata', createdAt: timestamp('created_at').defaultNow(, updatedAt: timestamp('updated_at').defaultNow(),
});

export const savedReports = pgTable('saved_reports', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, userId: integer('user_id').notNull(), // FK to users.id
 reportId: uuid('report_id').notNull(), // FK to reports.id
 caseId: uuid('case_id'), // FK to cases.id
 savedAt: timestamp('saved_at').defaultNow().notNull(, notes: text('notes', createdAt: timestamp('created_at').defaultNow(, updatedAt: timestamp('updated_at').defaultNow(),
});

export const themes = pgTable('themes', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, userId: integer('user_id').notNull(), // FK to users.id
 name: varchar('name', { length: 100 }).notNull(, config: jsonb('config').notNull(, isDefault: boolean('is_default').default(false).notNull(, createdAt: timestamp('created_at').defaultNow(, updatedAt: timestamp('updated_at').defaultNow(),
});

export const personsOfInterest = pgTable('persons', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, caseId: uuid('case_id', createdBy: uuid('created_by', name: text('name').notNull(, aliases: jsonb('aliases').$type<string[]>().default([], threatLevel: varchar('threat_level', { enum: ['low', 'medium', 'high', 'critical'] })
 .default('low')
 .notNull(, status: varchar('status', { enum: ['surveillance', 'wanted', 'active', 'cleared'] })
 .default('surveillance')
 .notNull(, description: text('description').default('', lastSeen: varchar('last_seen', lastLocation: text('last_location', cases: jsonb('cases').$type<string[]>().default([]),
 // Multiple photos with forensic metadata
 photos: jsonb('photos')
 .$type<{
 id, string;
 url: string;
 filename: string;
 uploadedAt: string;
 metadata: {
 exif?: Record<string, any>;
 gps?: { lat: number; lng: number};
 timestamp?: string;
 deviceModel?: string;
 resolution?: { width: number; height: number};
 };
 ai: {
 faceEmbedding?: number[]; // Face recognition vector
 quality: number; // Photo quality score
 landmarks?: number[][]; // Facial landmarks
 };
 }[]
 >()
 .default([]),
 // Legacy single photo URL for backward compatibility
 photoUrl: text('photo_url', ai: jsonb('ai')
 .$type<{
 riskScore, number;
 patterns: string[];
 recommendations: string[];
 lastUpdated: string;
 }>()
 .default(null, createdAt: timestamp('created_at').defaultNow(, updatedAt: timestamp('updated_at').defaultNow(),
});

// POI Photos table for better organization
export const poiPhotos = pgTable(
 'poi_photos',
 {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, poiId: uuid('poi_id').notNull(, minioKey: text('minio_key').notNull(, thumbnailKey: text('thumbnail_key', url: text('url').notNull(, thumbnailUrl: text('thumbnail_url', originalName: text('original_name').notNull(, mimeType: text('mime_type').notNull(, size: bigint('size', { mode: 'number' }).notNull(, aiCaption: text('ai_caption', aiTags: jsonb('ai_tags').default([]).$type<string[]>(, exifData: jsonb('exif_data', forensicData: jsonb('forensic_data', faceEmbedding: text('face_embedding'), // Store vector as text for now
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

// === AI/VECTOR TABLES (Missing Definitions) ===

export const hashVerifications = pgTable('hash_verifications', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, evidenceId: uuid('evidence_id').notNull(, verifiedBy: integer('verified_by', hashValue: text('hash_value').notNull(, algorithm: varchar('algorithm', { length: 50 }).notNull(, status: verificationStatusEnum('status').default('pending').notNull(, verificationDate: timestamp('verification_date').defaultNow().notNull(, createdAt: timestamp('created_at').defaultNow().notNull(, updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const contentEmbeddings = pgTable('content_embeddings', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, documentId: uuid('document_id').notNull(, embedding: text('embedding').notNull(), // Store vector as text
 model: varchar('model', { length: 100 }).notNull(, createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userEmbeddings = pgTable('user_embeddings', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, userId: integer('user_id').notNull(, embedding: text('embedding').notNull(), // Store vector as text
 model: varchar('model', { length: 100 }).notNull(, createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const chatEmbeddings = pgTable('chat_embeddings', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, ragMessageId: uuid('rag_message_id').notNull(, embedding: text('embedding').notNull(), // Store vector as text
 model: varchar('model', { length: 100 }).notNull(, createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const evidenceVectors = pgTable('evidence_vectors', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, evidenceId: uuid('evidence_id').notNull(, vector: text('vector').notNull(), // Store vector as text
 model: varchar('model', { length: 100 }).notNull(, createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const caseEmbeddings = pgTable('case_embeddings', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, caseId: uuid('case_id').notNull(, embedding: text('embedding').notNull(), // Store vector as text
 model: varchar('model', { length: 100 }).notNull(, createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const ragSessions = pgTable('rag_sessions', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, userId: integer('user_id').notNull(, caseId: uuid('case_id', title: varchar('title', { length: 255 }, createdAt: timestamp('created_at').defaultNow().notNull(, updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const ragMessages = pgTable('rag_messages', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, sessionId: uuid('session_id').notNull(, role: varchar('role', { length: 50 }).notNull(), // e.g., 'user', 'assistant', content: text('content').notNull(, createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const statutes = pgTable('statutes', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, title: varchar('title', { length: 255 }).notNull(, content: text('content').notNull(, jurisdiction: varchar('jurisdiction', { length: 100 }, section: varchar('section', { length: 100 }), // e.g., §187(a)
 category: varchar('category', { length: 100 }), // criminal, civil, probate, etc.
 sourceUrl: text('source_url', effectiveDate: timestamp('effective_date', createdAt: timestamp('created_at').defaultNow().notNull(, updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Chunked statute sections for RAG search
export const statuteChunks = pgTable(
 'statute_chunks',
 {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, statuteId: uuid('statute_id')
 .notNull()
 .references(() => statutes.id, { onDelete: 'cascade' }, chunkIndex: integer('chunk_index').notNull(, content: text('content').notNull(, embedding: text('embedding'), // pgvector stored as text (768 dimensions)
 createdAt: timestamp('created_at', { withTimezone: true })
 .default(sql`now()`)
 .notNull(),
 },
 (table) => ({
 statuteIdIdx: index('statute_chunks_statute_id_idx').on(table.statuteId, chunkIndexIdx: index('statute_chunks_chunk_index_idx').on(table.chunkIndex),
 })
);

export const legalPrecedents = pgTable('legal_precedents', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, caseId: uuid('case_id', title: varchar('title', { length: 255 }).notNull(, summary: text('summary').notNull(, citation: varchar('citation', { length: 255 }, court: varchar('court', { length: 200 }, decisionDate: timestamp('decision_date', createdAt: timestamp('created_at').defaultNow().notNull(, updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const legalAnalysisSessions = pgTable('legal_analysis_sessions', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, userId: integer('user_id').notNull(, caseId: uuid('case_id', analysisType: varchar('analysis_type', { length: 100 }).notNull(, inputData: jsonb('input_data', outputSummary: text('output_summary', status: varchar('status', { length: 50 }).default('pending').notNull(, createdAt: timestamp('created_at').defaultNow().notNull(, updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const legalResearch = pgTable('legal_research', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, caseId: uuid('case_id', createdBy: integer('created_by').notNull(, query: text('query').notNull(, results: jsonb('results', status: varchar('status', { length: 50 }).default('completed').notNull(, createdAt: timestamp('created_at').defaultNow().notNull(, updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const documentProcessing = pgTable('document_processing', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, documentId: uuid('document_id').notNull(, status: documentStatusEnum('status').notNull().default('queued', processor: varchar('processor', { length: 100 }, metadata: jsonb('metadata', error: text('error', startedAt: timestamp('started_at', completedAt: timestamp('completed_at', createdAt: timestamp('created_at').defaultNow().notNull(, updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const documentChunks = pgTable('document_chunks', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, documentId: uuid('document_id').notNull(, chunkIndex: integer('chunk_index').notNull(, content: text('content').notNull(, embedding: text('embedding'), // Store vector as text
 metadata: jsonb('metadata', createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const documentSummaries = pgTable('document_summaries', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, documentId: uuid('document_id').notNull(, summaryType: summaryTypeEnum('summary_type').notNull(, summaryText: text('summary_text').notNull(, model: varchar('model', { length: 100 }, metadata: jsonb('metadata', createdAt: timestamp('created_at').defaultNow().notNull(),
});

// === RELATIONS ===
// (All relations are now defined only once, with syntax fixed and duplicates removed)

export const usersRelations = relations(users, ({ many }) => ({
 sessions: many(sessions, emailVerificationCodes: many(emailVerificationCodes, passwordResetTokens: many(passwordResetTokens, criminalsCreated: many(criminals, evidenceUploaded: many(evidence, legalDocumentsCreated: many(legalDocuments, { relationName: 'createdBy' }, legalDocumentsOwned: many(legalDocuments, { relationName: 'ownedDocuments' }, storageFiles: many(storageFiles), // Added storageFiles relation
 caseActivitiesAssigned: many(caseActivities, { relationName: `assignedTo` }, caseActivitiesCreated: many(caseActivities, { relationName: `createdBy` }, attachmentVerificationsPerformed: many(attachmentVerifications, canvasAnnotationsCreated: many(canvasAnnotations, canvasStatesCreated: many(canvasStates, aiReportsCreated: many(aiReports, citationsCreated: many(citations, reportsCreated: many(reports, savedReportsCreated: many(savedReports, themesCreated: many(themes, personsOfInterestCreated: many(personsOfInterest, hashVerificationsPerformed: many(hashVerifications, userEmbeddings: many(userEmbeddings, ragSessions: many(ragSessions, legalAnalysisSessions: many(legalAnalysisSessions, legalResearchCreated: many(legalResearch, { relationName: 'createdBy' }, caseScoresCalculated: many(caseScores, { relationName: 'calculatedBy' }, userAiQueries: many(userAiQueriesTable, autoTagsConfirmed: many(autoTagsTable, { relationName: 'confirmedBy' }),
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

export const casesRelations = relations(cases, ({ many, one }) => ({
 assignedAttorney: one(users, { fields: [cases.assignedAttorney], references: [users.id] }, evidence: many(evidence, activities: many(caseActivities, legalDocuments: many(legalDocuments, aiReports: many(aiReports, citations: many(citations, reports: many(reports, savedReports: many(savedReports, personsOfInterest: many(personsOfInterest, caseEmbeddings: many(caseEmbeddings, ragSessions: many(ragSessions, legalAnalysisSessions: many(legalAnalysisSessions, legalResearch: many(legalResearch, caseScores: many(caseScores, userAiQueries: many(userAiQueriesTable, canvasStates: many(canvasStates),
}));

export const criminalsRelations = relations(criminals, ({ many, one }) => ({
 createdBy: one(users, { fields: [criminals.createdBy], references: [users.id] }, evidence: many(evidence),
}));

export const evidenceRelations = relations(evidence, ({ one, many }) => ({
 uploadedBy: one(users, { fields: [evidence.uploadedBy], references: [users.id] }, case: one(cases, { fields: [evidence.caseId], references: [cases.id] }, criminal: one(criminals, { fields: [evidence.criminalId], references: [criminals.id] }, legalDocuments: many(legalDocuments, canvasAnnotations: many(canvasAnnotations, evidenceVectors: many(evidenceVectors, hashVerifications: many(hashVerifications),
}));

export const documentsRelations = relations(documents, ({ many, one }) => ({
 case: one(cases, { fields: [documents.caseId], references: [cases.id] }, user: one(users, { fields: [documents.userId], references: [users.id] }, documentProcessing: many(documentProcessing, documentChunks: many(documentChunks, documentSummaries: many(documentSummaries),
}));

export const legalDocumentsRelations = relations(legalDocuments, ({ one, many }) => ({
 case: one(cases, { fields: [legalDocuments.caseId], references: [cases.id] }, user: one(users, {
 fields: [legalDocuments.userId],
 references: [users.id],
 relationName: 'ownedDocuments',
 }, evidence: one(evidence, { fields: [legalDocuments.evidenceId], references: [evidence.id] }, createdBy: one(users, {
 fields: [legalDocuments.createdBy],
 references: [users.id],
 relationName: 'createdBy',
 }, citations: many(citations),
}));

export const storageFilesRelations = relations(storageFiles, ({ one }) => ({
 user: one(users, { fields: [storageFiles.userId], references: [users.id] }),
}));

export const caseActivitiesRelations = relations(caseActivities, ({ one }) => ({
 case: one(cases, { fields: [caseActivities.caseId], references: [cases.id] }, assignedTo: one(users, {
 fields: [caseActivities.assignedTo],
 references: [users.id],
 relationName: `assignedTo`,
 }, createdBy: one(users, {
 fields: [caseActivities.createdBy],
 references: [users.id],
 relationName: `createdBy`,
 }),
}));

export const attachmentVerificationsRelations = relations(attachmentVerifications, ({ one }) => ({
 verifiedBy: one(users, { fields: [attachmentVerifications.verifiedBy], references: [users.id] }, attachment: one(evidence, {
 fields: [attachmentVerifications.attachmentId],
 references: [evidence.id],
 }), // Assuming attachmentId refers to evidence
}));

export const canvasStatesRelations = relations(canvasStates, ({ one, many }) => ({
 case: one(cases, { fields: [canvasStates.caseId], references: [cases.id] }, user: one(users, { fields: [canvasStates.userId], references: [users.id] }, annotations: many(canvasAnnotations, autosaves: many(canvasAutosaves),
}));

export const canvasAnnotationsRelations = relations(canvasAnnotations, ({ one }) => ({
 canvasState: one(canvasStates, {
 fields: [canvasAnnotations.canvasStateId],
 references: [canvasStates.id],
 }, createdBy: one(users, { fields: [canvasAnnotations.createdBy], references: [users.id] }),
}));

export const canvasAutosavesRelations = relations(canvasAutosaves, ({ one }) => ({
 canvasState: one(canvasStates, {
 fields: [canvasAutosaves.canvasStateId],
 references: [canvasStates.id],
 }),
}));

export const aiReportsRelations = relations(aiReports, ({ one }) => ({
 case: one(cases, { fields: [aiReports.caseId], references: [cases.id] }, createdBy: one(users, { fields: [aiReports.createdBy], references: [users.id] }),
}));

export const citationsRelations = relations(citations, ({ one }) => ({
 document: one(legalDocuments, {
 fields: [citations.documentId],
 references: [legalDocuments.id],
 }, case: one(cases, { fields: [citations.caseId], references: [cases.id] }, createdBy: one(users, { fields: [citations.createdBy], references: [users.id] }),
}));

export const reportsRelations = relations(reports, ({ one, many }) => ({
 case: one(cases, { fields: [reports.caseId], references: [cases.id] }, createdBy: one(users, { fields: [reports.createdBy], references: [users.id] }, savedReports: many(savedReports),
}));

export const savedReportsRelations = relations(savedReports, ({ one }) => ({
 user: one(users, { fields: [savedReports.userId], references: [users.id] }, report: one(reports, { fields: [savedReports.reportId], references: [reports.id] }, case: one(cases, { fields: [savedReports.caseId], references: [cases.id] }),
}));

export const themesRelations = relations(themes, ({ one }) => ({
 user: one(users, { fields: [themes.userId], references: [users.id] }),
}));

export const personsOfInterestRelations = relations(personsOfInterest, ({ one, many }) => ({
 case: one(cases, { fields: [personsOfInterest.caseId], references: [cases.id] }, createdBy: one(users, { fields: [personsOfInterest.createdBy], references: [users.id] }, photos: many(poiPhotos),
}));

export const poiPhotosRelations = relations(poiPhotos, ({ one }) => ({
 poi: one(personsOfInterest, { fields: [poiPhotos.poiId], references: [personsOfInterest.id] }),
}));

export const hashVerificationsRelations = relations(hashVerifications, ({ one }) => ({
 evidence: one(evidence, { fields: [hashVerifications.evidenceId], references: [evidence.id] }, verifiedBy: one(users, { fields: [hashVerifications.verifiedBy], references: [users.id] }),
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
 .notNull(, caseId: uuid('case_id')
 .notNull()
 .references(() => cases.id, { onDelete: 'cascade' }, fromEvidenceId: uuid('from_evidence_id')
 .notNull()
 .references(() => evidence.id, { onDelete: 'cascade' }, toEvidenceId: uuid('to_evidence_id')
 .notNull()
 .references(() => evidence.id, { onDelete: 'cascade' }, connectionType: varchar('connection_type', { length: 50 }).default('related').notNull(), // 'related', 'contradicts', 'supports', 'references', label: varchar('label', { length: 255 }, notes: text('notes', strength: real('strength').default(1.0), // 0.0 to 1.0 confidence
 isVisible: boolean('is_visible').default(true, createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }, createdAt: timestamp('created_at', { withTimezone: true })
 .default(sql`now()`)
 .notNull(, updatedAt: timestamp('updated_at', { withTimezone: true })
 .default(sql`now()`)
 .notNull(),
 },
 (table) => ({
 caseIdIdx: index('evidence_board_connections_case_id_idx').on(table.caseId, fromEvidenceIdIdx: index('evidence_board_connections_from_evidence_id_idx').on(
 table.fromEvidenceId
 , toEvidenceIdIdx: index('evidence_board_connections_to_evidence_id_idx').on(table.toEvidenceId, connectionTypeIdx: index('evidence_board_connections_type_idx').on(table.connectionType),
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
 .notNull(, caseId: uuid('case_id')
 .notNull()
 .references(() => cases.id, { onDelete: 'cascade' }, title: varchar('title', { length: 255 }, content: text('content').notNull(, isAI: boolean('is_ai').default(false, isPinned: boolean('is_pinned').default(false, createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }, createdAt: timestamp('created_at', { withTimezone: true })
 .default(sql`now()`)
 .notNull(, updatedAt: timestamp('updated_at', { withTimezone: true })
 .default(sql`now()`)
 .notNull(),
 },
 (table) => ({
 caseIdIdx: index('case_notes_case_id_idx').on(table.caseId, isPinnedIdx: index('case_notes_is_pinned_idx').on(table.isPinned, createdAtIdx: index('case_notes_created_at_idx').on(table.createdAt),
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
 .notNull(, noteId: uuid('note_id')
 .notNull()
 .references(() => caseNotes.id, { onDelete: 'cascade' }, evidenceId: uuid('evidence_id')
 .notNull()
 .references(() => evidence.id, { onDelete: 'cascade' }, createdAt: timestamp('created_at', { withTimezone: true })
 .default(sql`now()`)
 .notNull(),
 },
 (table) => ({
 noteIdIdx: index('case_note_refs_note_id_idx').on(table.noteId, evidenceIdIdx: index('case_note_refs_evidence_id_idx').on(table.evidenceId, uniqueRef: unique('case_note_refs_unique').on(table.noteId, table.evidenceId),
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
 .notNull(, title: text('title').notNull(, description: text('description', caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }, createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }, createdAt: timestamp('created_at', { withTimezone: true })
 .default(sql`now()`)
 .notNull(, updatedAt: timestamp('updated_at', { withTimezone: true })
 .default(sql`now()`)
 .notNull(),
 },
 (table) => ({
 caseIdIdx: index('workspaces_case_id_idx').on(table.caseId, createdByIdx: index('workspaces_created_by_idx').on(table.createdBy),
 })
);

// Link chat sessions to workspaces (one workspace can have multiple chat sessions)
export const workspaceSessions = pgTable(
 'workspace_sessions',
 {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, workspaceId: uuid('workspace_id')
 .notNull()
 .references(() => workspaces.id, { onDelete: 'cascade' }, sessionId: uuid('session_id')
 .notNull()
 .references(() => ragSessions.id, { onDelete: 'cascade' }, createdAt: timestamp('created_at', { withTimezone: true })
 .default(sql`now()`)
 .notNull(),
 },
 (table) => ({
 workspaceIdIdx: index('workspace_sessions_workspace_id_idx').on(table.workspaceId, sessionIdIdx: index('workspace_sessions_session_id_idx').on(table.sessionId),
 })
);

// Evidence panel: link evidence items to workspaces
export const workspaceEvidence = pgTable(
 'workspace_evidence',
 {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, workspaceId: uuid('workspace_id')
 .notNull()
 .references(() => workspaces.id, { onDelete: 'cascade' }, evidenceId: uuid('evidence_id')
 .notNull()
 .references(() => evidence.id, { onDelete: 'cascade' }, relevanceScore: real('relevance_score').default(0, addedBy: varchar('added_by', { length: 50 }).default('user'), // 'system', 'user', createdAt: timestamp('created_at', { withTimezone: true })
 .default(sql`now()`)
 .notNull(),
 },
 (table) => ({
 workspaceIdIdx: index('workspace_evidence_workspace_id_idx').on(table.workspaceId, evidenceIdIdx: index('workspace_evidence_evidence_id_idx').on(table.evidenceId),
 })
);

// Statute panel: link statutes/laws to workspaces
export const workspaceStatutes = pgTable(
 'workspace_statutes',
 {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, workspaceId: uuid('workspace_id')
 .notNull()
 .references(() => workspaces.id, { onDelete: 'cascade' }, statuteId: uuid('statute_id').references(() => statutes.id, { onDelete: 'cascade' }, statuteText: text('statute_text'), // Fallback if statute not in DB
 relevanceScore: real('relevance_score').default(0, source: varchar('source', { length: 50 }).default('user'), // 'ai', 'user', 'citation', createdAt: timestamp('created_at', { withTimezone: true })
 .default(sql`now()`)
 .notNull(),
 },
 (table) => ({
 workspaceIdIdx: index('workspace_statutes_workspace_id_idx').on(table.workspaceId, statuteIdIdx: index('workspace_statutes_statute_id_idx').on(table.statuteId),
 })
);

// User notes and legal memos (searchable via vector embeddings)
export const workspaceNotes = pgTable(
 'workspace_notes',
 {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, workspaceId: uuid('workspace_id')
 .notNull()
 .references(() => workspaces.id, { onDelete: 'cascade' }, content: text('content').notNull(, isAI: boolean('is_ai').default(false, embedding: text('embedding'), // pgvector stored as text (768 dimensions)
 createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }, createdAt: timestamp('created_at', { withTimezone: true })
 .default(sql`now()`)
 .notNull(, updatedAt: timestamp('updated_at', { withTimezone: true })
 .default(sql`now()`)
 .notNull(),
 },
 (table) => ({
 workspaceIdIdx: index('workspace_notes_workspace_id_idx').on(table.workspaceId, isAIIdx: index('workspace_notes_is_ai_idx').on(table.isAI),
 })
);

// Citations and references (links messages to legal sources)
export const workspaceCitations = pgTable(
 'workspace_citations',
 {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .primaryKey()
 .notNull(, workspaceId: uuid('workspace_id')
 .notNull()
 .references(() => workspaces.id, { onDelete: 'cascade' }, messageId: uuid('message_id').references(() => ragMessages.id, { onDelete: 'cascade' }, citationText: text('citation_text').notNull(), // e.g., "Penal Code 187(a)", citationURL: text('citation_url', citationType: varchar('citation_type', { length: 50 }).default('statute'), // 'statute', 'case', 'regulation', 'precedent', createdAt: timestamp('created_at', { withTimezone: true })
 .default(sql`now()`)
 .notNull(),
 },
 (table) => ({
 workspaceIdIdx: index('workspace_citations_workspace_id_idx').on(table.workspaceId, messageIdIdx: index('workspace_citations_message_id_idx').on(table.messageId),
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
 user: one(users, { fields: [ragSessions.userId], references: [users.id] }, messages: many(ragMessages),
}));

export const ragMessagesRelations = relations(ragMessages, ({ one, many }) => ({
 session: one(ragSessions, { fields: [ragMessages.sessionId], references: [ragSessions.id] }, chatEmbeddings: many(chatEmbeddings),
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
 user: one(users, { fields: [legalAnalysisSessions.userId], references: [users.id] }, case: one(cases, { fields: [legalAnalysisSessions.caseId], references: [cases.id] }),
}));

export const legalResearchRelations = relations(legalResearch, ({ one }) => ({
 case: one(cases, { fields: [legalResearch.caseId], references: [cases.id] }, createdBy: one(users, { fields: [legalResearch.createdBy], references: [users.id] }),
}));

export const vectorMetadataRelations = relations(vectorMetadata, () => ({
 // documentId is text, not a direct Drizzle relation
}));

export const caseScoresRelations = relations(caseScores, ({ one }) => ({
 case: one(cases, { fields: [caseScores.caseId], references: [cases.id] }, calculatedBy: one(users, { fields: [caseScores.calculatedBy], references: [users.id] }),
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

export const userAiQueriesRelations = relations(userAiQueriesTable, ({ one }) => ({
 user: one(users, { fields: [userAiQueriesTable.userId], references: [users.id] }, case: one(cases, { fields: [userAiQueriesTable.caseId], references: [cases.id] }),
}));

export const autoTagsRelations = relations(autoTagsTable, ({ one }) => ({
 confirmedBy: one(users, { fields: [autoTagsTable.confirmedBy], references: [users.id] }),
}));

export const vectorOutboxRelations = relations(vectorOutbox, () => ({
 // No explicit relations
}));

export const vectorJobsRelations = relations(vectorJobs, () => ({
 // No explicit relations
}));

export const evidenceBoardConnectionsRelations = relations(evidenceBoardConnections, ({ one }) => ({
 case: one(cases, { fields: [evidenceBoardConnections.caseId], references: [cases.id] }, fromEvidence: one(evidence, {
 fields: [evidenceBoardConnections.fromEvidenceId],
 references: [evidence.id],
 relationName: 'from_evidence',
 }, toEvidence: one(evidence, {
 fields: [evidenceBoardConnections.toEvidenceId],
 references: [evidence.id],
 relationName: 'to_evidence',
 }, createdByUser: one(users, {
 fields: [evidenceBoardConnections.createdBy],
 references: [users.id],
 }),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
 case: one(cases, { fields: [workspaces.caseId], references: [cases.id] }, createdByUser: one(users, { fields: [workspaces.createdBy], references: [users.id] }, sessions: many(workspaceSessions, evidence: many(workspaceEvidence, statutes: many(workspaceStatutes, notes: many(workspaceNotes, citations: many(workspaceCitations),
}));

export const workspaceSessionsRelations = relations(workspaceSessions, ({ one }) => ({
 workspace: one(workspaces, {
 fields: [workspaceSessions.workspaceId],
 references: [workspaces.id],
 }, session: one(ragSessions, {
 fields: [workspaceSessions.sessionId],
 references: [ragSessions.id],
 }),
}));

export const workspaceEvidenceRelations = relations(workspaceEvidence, ({ one }) => ({
 workspace: one(workspaces, {
 fields: [workspaceEvidence.workspaceId],
 references: [workspaces.id],
 }, evidence: one(evidence, { fields: [workspaceEvidence.evidenceId], references: [evidence.id] }),
}));

export const workspaceStatutesRelations = relations(workspaceStatutes, ({ one }) => ({
 workspace: one(workspaces, {
 fields: [workspaceStatutes.workspaceId],
 references: [workspaces.id],
 }, statute: one(statutes, { fields: [workspaceStatutes.statuteId], references: [statutes.id] }),
}));

export const workspaceNotesRelations = relations(workspaceNotes, ({ one }) => ({
 workspace: one(workspaces, { fields: [workspaceNotes.workspaceId], references: [workspaces.id] }, createdByUser: one(users, { fields: [workspaceNotes.createdBy], references: [users.id] }),
}));

export const workspaceCitationsRelations = relations(workspaceCitations, ({ one }) => ({
 workspace: one(workspaces, {
 fields: [workspaceCitations.workspaceId],
 references: [workspaces.id],
 }, message: one(ragMessages, {
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
export const yorhaCases = pgTable(
 'yorha_cases',
 {
 id: uuid('id').primaryKey().defaultRandom(, case_number: varchar('case_number', { length: 100 }).notNull().unique(, title: varchar('title', { length: 500 }).notNull(, description: text('description', status: varchar('status', { length: 50 }).default('active').notNull(, priority: varchar('priority', { length: 20 }).default('medium').notNull(, case_type: varchar('case_type', { length: 100 }, jurisdiction: varchar('jurisdiction', { length: 200 }, filed_date: timestamp('filed_date', { withTimezone: true }, closed_date: timestamp('closed_date', { withTimezone: true }, created_by: uuid('created_by').notNull(, assigned_to: uuid('assigned_to', metadata: jsonb('metadata', created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(, updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => ({
 case_number_idx: index('yorha_cases_case_number_idx').on(table.case_number, created_by_idx: index('yorha_cases_created_by_idx').on(table.created_by, status_idx: index('yorha_cases_status_idx').on(table.status),
 })
);

/**
 * YoRHa Evidence Nodes table - stores evidence items on the evidence board
 */
export const yorhaEvidenceNodes = pgTable(
 'yorha_evidence_nodes',
 {
 id: uuid('id').primaryKey().defaultRandom(, case_id: uuid('case_id').notNull(, title: varchar('title', { length: 500 }).notNull(, description: text('description', evidence_type: varchar('evidence_type', { length: 100 }).notNull(, position_x: integer('position_x').default(0, position_y: integer('position_y').default(0, color: varchar('color', { length: 20 }).default('blue', icon: varchar('icon', { length: 100 }, source: varchar('source', { length: 500 }, date_collected: timestamp('date_collected', { withTimezone: true }, relevance_score: integer('relevance_score').default(0, file_path: varchar('file_path', { length: 1000 }, file_type: varchar('file_type', { length: 100 }, file_size: integer('file_size', ai_summary: text('ai_summary', ai_tags: jsonb('ai_tags', key_entities: jsonb('key_entities', status: varchar('status', { length: 50 }).default('active').notNull(, created_by: uuid('created_by').notNull(, created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(, updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => ({
 case_id_idx: index('yorha_evidence_nodes_case_id_idx').on(table.case_id, evidence_type_idx: index('yorha_evidence_nodes_type_idx').on(table.evidence_type, created_by_idx: index('yorha_evidence_nodes_created_by_idx').on(table.created_by),
 })
);

/**
 * YoRHa Evidence Connections table - stores relationships between evidence nodes
 */
export const yorhaEvidenceConnections = pgTable(
 'yorha_evidence_connections',
 {
 id: uuid('id').primaryKey().defaultRandom(, case_id: uuid('case_id').notNull(, source_node_id: uuid('source_node_id').notNull(, target_node_id: uuid('target_node_id').notNull(, connection_type: varchar('connection_type', { length: 100 }).notNull(, strength: integer('strength').default(50, description: text('description', ai_reasoning: text('ai_reasoning', confidence_score: integer('confidence_score').default(0, created_by: uuid('created_by').notNull(, created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(, updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => ({
 case_id_idx: index('yorha_evidence_connections_case_id_idx').on(table.case_id, source_node_idx: index('yorha_evidence_connections_source_idx').on(table.source_node_id, target_node_idx: index('yorha_evidence_connections_target_idx').on(table.target_node_id, connection_type_idx: index('yorha_evidence_connections_type_idx').on(table.connection_type),
 })
);

/**
 * YoRHa Chat Sessions table - stores conversation sessions
 */
export const yorhaChatSessions = pgTable(
 'yorha_chat_sessions',
 {
 id: uuid('id').primaryKey().defaultRandom(, case_id: uuid('case_id').notNull(, user_id: uuid('user_id').notNull(, title: varchar('title', { length: 500 }, context_type: varchar('context_type', { length: 100 }, context_id: uuid('context_id', status: varchar('status', { length: 50 }).default('active').notNull(, message_count: integer('message_count').default(0, created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(, updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(, last_message_at: timestamp('last_message_at', { withTimezone: true }),
 },
 (table) => ({
 case_id_idx: index('yorha_chat_sessions_case_id_idx').on(table.case_id, user_id_idx: index('yorha_chat_sessions_user_id_idx').on(table.user_id, status_idx: index('yorha_chat_sessions_status_idx').on(table.status),
 })
);

/**
 * YoRHa Chat Messages table - stores individual messages in chat sessions
 */
export const yorhaChatMessages = pgTable(
 'yorha_chat_messages',
 {
 id: uuid('id').primaryKey().defaultRandom(, session_id: uuid('session_id').notNull(, role: varchar('role', { length: 50 }).notNull(, content: text('content').notNull(, message_type: varchar('message_type', { length: 50 }).default('text', referenced_evidence: jsonb('referenced_evidence', model_used: varchar('model_used', { length: 100 }, tokens_used: integer('tokens_used', created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(, updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => ({
 session_id_idx: index('yorha_chat_messages_session_id_idx').on(table.session_id, role_idx: index('yorha_chat_messages_role_idx').on(table.role, created_at_idx: index('yorha_chat_messages_created_at_idx').on(table.created_at),
 })
);

/**
 * YoRHa System Metrics table - stores historical system metrics
 */
export const yorhaSystemMetrics = pgTable(
 'yorha_system_metrics',
 {
 id: serial('id').primaryKey(, cpu_usage: integer('cpu_usage', cpu_cores: integer('cpu_cores', memory_usage: integer('memory_usage', memory_total_gb: integer('memory_total_gb', memory_used_gb: integer('memory_used_gb', gpu_usage: integer('gpu_usage', gpu_memory_usage: integer('gpu_memory_usage', gpu_temperature: integer('gpu_temperature', disk_usage: integer('disk_usage', disk_total_gb: integer('disk_total_gb', disk_used_gb: integer('disk_used_gb', network_latency_ms: integer('network_latency_ms', network_bandwidth_mbps: integer('network_bandwidth_mbps', system_health: varchar('system_health', { length: 50 }).default('healthy', active_cases: integer('active_cases').default(0, active_sessions: integer('active_sessions').default(0, recorded_at: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
 },
 (table) => ({
 recorded_at_idx: index('yorha_system_metrics_recorded_at_idx').on(table.recorded_at),
 })
);

// === YORHA RELATIONS ===

export const yorhaCasesRelations = relations(yorhaCases, ({ many }) => ({
 evidence_nodes: many(yorhaEvidenceNodes, evidence_connections: many(yorhaEvidenceConnections, chat_sessions: many(yorhaChatSessions),
}));

export const yorhaEvidenceNodesRelations = relations(yorhaEvidenceNodes, ({ one, many }) => ({
 case: one(yorhaCases, {
 fields: [yorhaEvidenceNodes.case_id],
 references: [yorhaCases.id],
 }, outgoing_connections: many(yorhaEvidenceConnections, {
 relationName: 'source',
 }, incoming_connections: many(yorhaEvidenceConnections, {
 relationName: 'target',
 }),
}));

export const yorhaEvidenceConnectionsRelations = relations(yorhaEvidenceConnections, ({ one }) => ({
 case: one(yorhaCases, {
 fields: [yorhaEvidenceConnections.case_id],
 references: [yorhaCases.id],
 }, source_node: one(yorhaEvidenceNodes, {
 fields: [yorhaEvidenceConnections.source_node_id],
 references: [yorhaEvidenceNodes.id],
 relationName: 'source',
 }, target_node: one(yorhaEvidenceNodes, {
 fields: [yorhaEvidenceConnections.target_node_id],
 references: [yorhaEvidenceNodes.id],
 relationName: 'target',
 }),
}));

export const yorhaChatSessionsRelations = relations(yorhaChatSessions, ({ one, many }) => ({
 case: one(yorhaCases, {
 fields: [yorhaChatSessions.case_id],
 references: [yorhaCases.id],
 }, messages: many(yorhaChatMessages),
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

export const routeHealthStateEnum = pgEnum('route_health_state', ['healthy', 'flaky', 'broken']);

export const errorSeverityEnum = pgEnum('error_severity', ['info', 'warn', 'error', 'fatal']);

export const errorKindEnum = pgEnum('error_kind', [
 'typescript',
 'svelte',
 'lint',
 'build',
 'runtime',
 'api',
 'other',
]);

export const suggestionStateEnum = pgEnum('suggestion_state', [
 'pending',
 'applied',
 'dismissed',
 'snoozed',
]);

/**
 * route_health: Current health state of each route (HMM-style state tracking)
 */
export const routeHealth = pgTable(
 'route_health',
 {
 id: uuid('id').primaryKey().defaultRandom(, routePath: varchar('route_path', { length: 255 }).notNull().unique(, file: varchar('file', { length: 500 }, state: routeHealthStateEnum('state').notNull().default('healthy', recentErrorCount: integer('recent_error_count').notNull().default(0, totalErrorCount: integer('total_error_count').notNull().default(0, lastErrorAt: timestamp('last_error_at', lastErrorClusterId: uuid('last_error_cluster_id', lastErrorMessageShort: text('last_error_message_short', routeCluster: varchar('route_cluster', { length: 100 }, routeOwner: varchar('route_owner', { length: 100 }, updatedAt: timestamp('updated_at').notNull().defaultNow(, createdAt: timestamp('created_at').notNull().defaultNow(),
 },
 (table) => ({
 idxRoutePath: index('idx_route_health_path').on(table.routePath, idxState: index('idx_route_health_state').on(table.state, idxUpdatedAt: index('idx_route_health_updated').on(table.updatedAt, idxCluster: index('idx_route_health_cluster').on(table.routeCluster),
 })
);

/**
 * error_events: Individual error occurrences
 */
export const errorEvents = pgTable(
 'error_events',
 {
 id: uuid('id').primaryKey().defaultRandom(, routePath: varchar('route_path', { length: 255 }).notNull(, file: varchar('file', { length: 500 }, kind: errorKindEnum('kind').notNull().default('other', severity: errorSeverityEnum('severity').notNull().default('warn', tsCode: varchar('ts_code', { length: 50 }, message: text('message').notNull(, stack: text('stack', lineNumber: integer('line_number', columnNumber: integer('column_number', clusterId: uuid('cluster_id', collectedAt: timestamp('collected_at').notNull().defaultNow(, createdAt: timestamp('created_at').notNull().defaultNow(),
 },
 (table) => ({
 idxRoutePath: index('idx_error_events_route').on(table.routePath, idxKind: index('idx_error_events_kind').on(table.kind, idxClusterId: index('idx_error_events_cluster').on(table.clusterId, idxCollectedAt: index('idx_error_events_collected').on(table.collectedAt),
 })
);

/**
 * error_clusters: Grouped similar errors with embeddings
 */
export const errorClusters = pgTable(
 'error_clusters',
 {
 id: uuid('id').primaryKey().defaultRandom(, kind: errorKindEnum('kind').notNull(, severity: errorSeverityEnum('severity').notNull().default('warn', pattern: text('pattern').notNull(, errorCount: integer('error_count').notNull().default(1, routePaths: text('route_paths').array(, radius: numeric('radius', lastUpdated: timestamp('last_updated').notNull().defaultNow(, createdAt: timestamp('created_at').notNull().defaultNow(),
 },
 (table) => ({
 idxKind: index('idx_error_clusters_kind').on(table.kind, idxSeverity: index('idx_error_clusters_severity').on(table.severity),
 })
);

/**
 * error_suggestions: LLM-generated fix suggestions
 */
export const errorSuggestions = pgTable(
 'error_suggestions',
 {
 id: uuid('id').primaryKey().defaultRandom(, clusterId: uuid('cluster_id')
 .notNull()
 .references(() => errorClusters.id, title: varchar('title', { length: 255 }).notNull(, explanation: text('explanation').notNull(, patch: text('patch', confidence: numeric('confidence', hints: text('hints').array(, generatedAt: timestamp('generated_at').notNull().defaultNow(, appliedCount: integer('applied_count').notNull().default(0, successCount: integer('success_count').notNull().default(0, createdAt: timestamp('created_at').notNull().defaultNow(),
 },
 (table) => ({
 idxClusterId: index('idx_error_suggestions_cluster').on(table.clusterId),
 })
);

/**
 * route_error_patches: Track patches applied to routes
 */
export const routeErrorPatches = pgTable(
 'route_error_patches',
 {
 id: uuid('id').primaryKey().defaultRandom(, routePath: varchar('route_path', { length: 255 }).notNull(, routeFile: varchar('route_file', { length: 500 }, errorCode: varchar('error_code', { length: 64 }).notNull(, suggestionTitle: varchar('suggestion_title', { length: 255 }, patchText: text('patch_text').notNull(, patchExplanation: text('patch_explanation', confidence: numeric('confidence')
 .notNull()
 .default(sql`0.50`, hints: text('hints').array(, status: patchStatusEnum('status').notNull().default('suggested', source: varchar('source', { length: 64 }).notNull().default('phase78', metadata: jsonb('metadata').notNull().default({}, createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }, appliedAt: timestamp('applied_at', createdAt: timestamp('created_at').notNull().defaultNow(, updatedAt: timestamp('updated_at').notNull().defaultNow(),
 },
 (table) => ({
 idxRoutePath: index('idx_route_patches_route').on(table.routePath, idxStatus: index('idx_route_patches_status').on(table.status, idxErrorCode: index('idx_route_patches_error_code').on(table.errorCode),
 })
);

/**
 * error_timeline: Timeline of error events for audit trail
 */
export const errorTimeline = pgTable(
 'error_timeline',
 {
 id: uuid('id').primaryKey().defaultRandom(, routePath: varchar('route_path', { length: 255 }).notNull(, eventType: varchar('event_type', { length: 50 }).notNull(, description: text('description', metadata: jsonb('metadata', occurredAt: timestamp('occurred_at').notNull().defaultNow(, createdAt: timestamp('created_at').notNull().defaultNow(),
 },
 (table) => ({
 idxRoutePath: index('idx_error_timeline_route').on(table.routePath, idxEventType: index('idx_error_timeline_event').on(table.eventType),
 })
);

/**
 * error_suggestion_states: Track user feedback on AI suggestions (dismiss, snooze, apply)
 */
export const errorSuggestionStates = pgTable(
 'error_suggestion_states',
 {
 id: uuid('id').primaryKey().defaultRandom(, suggestionId: uuid('suggestion_id')
 .notNull()
 .references(() => errorSuggestions.id, { onDelete: 'cascade' }, routePath: varchar('route_path', { length: 255 }).notNull(, userId: uuid('user_id', state: suggestionStateEnum('state').notNull().default('pending', createdAt: timestamp('created_at').notNull().defaultNow(, updatedAt: timestamp('updated_at').notNull().defaultNow(),
 },
 (table) => ({
 idxSuggestionRoute: index('idx_error_suggestion_states_suggestion_route').on(
 table.suggestionId,
 table.routePath
 , uniqueSuggestionRouteUser: unique('uq_error_suggestion_states_suggestion_route_user').on(
 suggestionId: table.routePath,
 table.userId
 ),
 })
);

/**
 * error_feedback: User feedback on suggestions
 */
export const errorFeedback = pgTable(
 'error_feedback',
 {
 id: uuid('id').primaryKey().defaultRandom(, suggestionId: uuid('suggestion_id')
 .notNull()
 .references(() => errorSuggestions.id, routePath: varchar('route_path', { length: 255 }).notNull(, helpful: boolean('helpful', accurate: boolean('accurate', worksSoon: boolean('works_soon', feedback: text('feedback', createdAt: timestamp('created_at').notNull().defaultNow(),
 },
 (table) => ({
 idxSuggestionId: index('idx_error_feedback_suggestion').on(table.suggestionId, idxRoutePath: index('idx_error_feedback_route').on(table.routePath),
 })
);

// ============================================================================
// PHASE 78 RELATIONS
// ============================================================================

export const errorEventsRelations = relations(errorEvents, ({ one }) => ({
 cluster: one(errorClusters, {
 fields: [errorEvents.clusterId],
 references: [errorClusters.id],
 }),
}));

export const errorClustersRelations = relations(errorClusters, ({ many }) => ({
 error_events: many(errorEvents, suggestions: many(errorSuggestions),
}));

export const errorSuggestionsRelations = relations(errorSuggestions, ({ one, many }) => ({
 cluster: one(errorClusters, {
 fields: [errorSuggestions.clusterId],
 references: [errorClusters.id],
 }, feedback: many(errorFeedback),
}));

export const errorFeedbackRelations = relations(errorFeedback, ({ one }) => ({
 suggestion: one(errorSuggestions, {
 fields: [errorFeedback.suggestionId],
 references: [errorSuggestions.id],
 }),
}));

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
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(, caseId: uuid('case_id').notNull(, version: integer('version').notNull(, isCurrent: boolean('is_current').default(true).notNull(, summaryText: text('summary_text').notNull(, citations: jsonb('citations').default([]).notNull(, holding: text('holding', createdBy: varchar('created_by', { length: 255 }, createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(, updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

// === AUDIT LOG ===
export const auditLog = pgTable('audit_log', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(, userId: uuid('user_id').notNull(, action: varchar('action', { length: 100 }).notNull(, resourceType: varchar('resource_type', { length: 100 }).notNull(, resourceId: varchar('resource_id', { length: 255 }).notNull(, details: jsonb('details').default({}).notNull(, createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});
