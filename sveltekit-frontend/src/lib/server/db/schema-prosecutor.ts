/**
 * Prosecutor MVP Schema - Separate from existing legal_ai_db schema
 * These tables are specifically for the prosecutor vertical
 */

import { date, integer, jsonb, pgTable, text, timestamp, uuid, varchar, boolean } from 'drizzle-orm/pg-core';

// Prosecutor Cases (separate from existing cases table)
export const prosecutorCases = pgTable('prosecutor_cases', {
	id: uuid('id').defaultRandom().primaryKey(),
	title: varchar('title', { length: 256 }).notNull(),
	status: varchar('status', { length: 32 }).default('open').notNull(), // open | pending | filed | closed

	// 5W1H fields
	narrative: text('narrative'),
	who: text('who'),
	what: text('what'),
	when: text('when'),
	where: text('where'),
	why: text('why'),
	how: text('how'),

	// optional
	primaryStatute: varchar('primary_statute', { length: 64 }),
	severityLevel: integer('severity_level'), // 1-5
	prosecutorUserId: uuid('prosecutor_user_id'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const prosecutorPersons = pgTable('prosecutor_persons', {
	id: uuid('id').defaultRandom().primaryKey(),
	fullName: varchar('full_name', { length: 256 }).notNull(),
	role: varchar('role', { length: 64 }), // suspect | victim | witness | other
	riskLevel: varchar('risk_level', { length: 32 }), // low | medium | high
	dob: date('dob'),
	lastKnownLocation: text('last_known_location'),
	notes: text('notes'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const prosecutorCasePersons = pgTable('prosecutor_case_persons', {
	id: uuid('id').defaultRandom().primaryKey(),
	caseId: uuid('case_id')
		.notNull()
		.references(() => prosecutorCases.id, { onDelete: 'cascade' }),
	personId: uuid('person_id')
		.notNull()
		.references(() => prosecutorPersons.id, { onDelete: 'cascade' }),
	relationshipType: varchar('relationship_type', { length: 64 }),
	isPrimary: boolean('is_primary').default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const prosecutorEvidence = pgTable('prosecutor_evidence', {
	id: uuid('id').defaultRandom().primaryKey(),
	caseId: uuid('case_id')
		.notNull()
		.references(() => prosecutorCases.id, { onDelete: 'cascade' }),
	kind: varchar('kind', { length: 32 }).notNull(), // document | video | image | audio | other
	title: varchar('title', { length: 256 }).notNull(),
	description: text('description'),
	fileKey: text('file_key').notNull(), // MinIO / S3 key
	mimeType: varchar('mime_type', { length: 128 }),
	sizeBytes: varchar('size_bytes', { length: 32 }),
	hash: varchar('hash', { length: 128 }),
	hashAlgorithm: varchar('hash_algorithm', { length: 32 }),
	tags: jsonb('tags').$type<string[]>().default([]),
	aiSummary: text('ai_summary'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const prosecutorReports = pgTable('prosecutor_reports', {
	id: uuid('id').defaultRandom().primaryKey(),
	caseId: uuid('case_id')
		.notNull()
		.references(() => prosecutorCases.id, { onDelete: 'cascade' }),
	title: varchar('title', { length: 256 }).notNull(),
	type: varchar('type', { length: 64 }).notNull(), // charging_memo | intake_summary | discovery_list | hearing_prep

	contentHtml: text('content_html'),
	contentJson: jsonb('content_json'),
	rawModelOutput: text('raw_model_output'),
	createdByUserId: uuid('created_by_user_id'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

