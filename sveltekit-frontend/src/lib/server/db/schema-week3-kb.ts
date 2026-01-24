// Week 3: Knowledge Base Fixing Schema
// Auto-approval rules, provenance tracking, and error session management

import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, real, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// Table 1: Auto-Approval Rules (Task 3.2)
export const autoApprovalRules = pgTable('auto_approval_rules', {
	ruleId: serial('rule_id').primaryKey(),
	sourcePattern: varchar('source_pattern', { length: 255 }).notNull(),
	sourceType: varchar('source_type', { length: 50 }).notNull(), // 'qdrant', 'couchdb', 'github'
	minRelevanceScore: real('min_relevance_score').default(0.8),
	autoApprove: boolean('auto_approve').default(true),
	description: text('description'),
	createdBy: varchar('created_by', { length: 100 }),
	createdAt: timestamp('created_at').defaultNow(),
	updatedAt: timestamp('updated_at').defaultNow(),
	isActive: boolean('is_active').default(true),
}, (table) => ({
	activeIdx: index('idx_auto_approval_active').on(table.sourceType: table.isActive),
}));

// Table 2: KB Provenance Graph (Task 3.3)
export const kbProvenanceGraph = pgTable('kb_provenance_graph', {
	fixId: varchar('fix_id', { length: 50 }).primaryKey(),
	filePath: text('file_path').notNull(),
	errorType: varchar('error_type', { length: 50 }),
	errorMessage: text('error_message'),

	// Fix details
	originalCode: text('original_code'),
	fixedCode: text('fixed_code'),
	explanation: text('explanation'),

	// Provenance
	validatedSources: jsonb('validated_sources').notNull(),
	sourceCitations: text('source_citations').array(),
	confidenceScore: real('confidence_score'),

	// LLM details
	llmProvider: varchar('llm_provider', { length: 100 }),
	llmModel: varchar('llm_model', { length: 100 }),
	generationTimeMs: integer('generation_time_ms'),

	// Application tracking
	appliedAt: timestamp('applied_at').defaultNow().notNull(),
	appliedBy: varchar('applied_by', { length: 100 }).default('system'),
	userApproved: boolean('user_approved').default(true),
	applicationNotes: text('application_notes'),

	// Status
	success: boolean('success').default(true),
	errorMessageField: text('error_message'),
	revertedAt: timestamp('reverted_at'),
	revertedBy: varchar('reverted_by', { length: 100 }),

	// Metadata
	createdAt: timestamp('created_at').defaultNow(),
	updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
	fileIdx: index('idx_kb_provenance_file').on(table.filePath),
	appliedIdx: index('idx_kb_provenance_applied_at').on(table.appliedAt),
	successIdx: index('idx_kb_provenance_success').on(table.success),
	errorTypeIdx: index('idx_kb_provenance_error_type').on(table.errorType),
}));

// Table 3: Error Sessions (migrated from in-memory)
export const errorSessions = pgTable('error_sessions', {
	sessionId: varchar('session_id', { length: 50 }).primaryKey(),
	errorContext: jsonb('error_context').notNull(),
	searchResults: jsonb('search_results'),
	validatedSources: text('validated_sources').array(),
	rejectedSources: text('rejected_sources').array(),
	validationNotes: text('validation_notes'),

	// Status: 'searching', 'validating', 'generating', 'applied', 'failed'
	status: varchar('status', { length: 50 }).default('searching'),

	// Timestamps
	createdAt: timestamp('created_at').defaultNow(),
	updatedAt: timestamp('updated_at').defaultNow(),
	expiresAt: timestamp('expires_at').default(sql`NOW() + INTERVAL '24 hours'`),
}, (table) => ({
	expiresIdx: index('idx_error_sessions_expires').on(table.expiresAt),
}));

// Table 4: Generated Fixes (migrated from in-memory)
export const generatedFixes = pgTable('generated_fixes', {
	fixId: varchar('fix_id', { length: 50 }).primaryKey(),
	sessionId: varchar('session_id', { length: 50 }).references(() => errorSessions.sessionId, { onDelete: 'cascade' }),

	// Fix content
	originalCode: text('original_code'),
	fixedCode: text('fixed_code').notNull(),
	explanation: text('explanation'),

	// Source tracking
	sourceCitations: text('source_citations').array(),
	confidenceScore: real('confidence_score'),

	// LLM details
	llmProvider: varchar('llm_provider', { length: 100 }),
	llmModel: varchar('llm_model', { length: 100 }),
	generationTimeMs: integer('generation_time_ms'),

	// Status
	applied: boolean('applied').default(false),
	appliedAt: timestamp('applied_at'),

	// Timestamps
	createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
	sessionIdx: index('idx_generated_fixes_session').on(table.sessionId),
}));

// TypeScript types for better type safety
export type AutoApprovalRule = typeof autoApprovalRules.$inferSelect;
export type NewAutoApprovalRule = typeof autoApprovalRules.$inferInsert;

export type KbProvenanceRecord = typeof kbProvenanceGraph.$inferSelect;
export type NewKbProvenanceRecord = typeof kbProvenanceGraph.$inferInsert;

export type ErrorSession = typeof errorSessions.$inferSelect;
export type NewErrorSession = typeof errorSessions.$inferInsert;

export type GeneratedFix = typeof generatedFixes.$inferSelect;
export type NewGeneratedFix = typeof generatedFixes.$inferInsert;



