/**
 * Drizzle declarations for the case investigation layer (WHO / WHAT / WHY / HOW).
 *
 * Mirrors the manual sidecar migrations (see drizzle/sidecar-migrations.json):
 *   - drizzle/manual/20261115_case_investigation_facets_v1_DRAFT.sql
 *   - drizzle/manual/20261116_investigation_relations_review_v2_DRAFT.sql
 * drizzle-kit does not manage these tables; do not run `drizzle-kit push` against this database.
 */
import { sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	real,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { caseNotes, cases, evidence, personsOfInterest } from '../schema-postgres.js';

export const caseInvestigationFacets = pgTable(
	'case_investigation_facets',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		caseId: uuid('case_id')
			.notNull()
			.references(() => cases.id, { onDelete: 'cascade' }),
		facetKind: text('facet_kind').notNull(),
		claimText: text('claim_text').notNull(),
		status: text('status').notNull().default('HYPOTHESIS'),
		confidence: real('confidence'),
		personId: uuid('person_id').references(() => personsOfInterest.id, { onDelete: 'set null' }),
		revision: integer('revision').notNull().default(1),
		createdBy: integer('created_by'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('case_investigation_facets_case_kind_idx').on(t.caseId, t.facetKind),
		index('case_investigation_facets_case_status_kind_idx').on(t.caseId, t.status, t.facetKind),
		index('case_investigation_facets_person_idx').on(t.personId).where(sql`${t.personId} IS NOT NULL`),
		check('case_investigation_facets_kind_ck', sql`${t.facetKind} IN ('WHO', 'WHAT', 'WHY', 'HOW')`),
		check('case_investigation_facets_status_ck', sql`${t.status} IN ('HYPOTHESIS', 'SUPPORTED', 'REFUTED')`),
		check('case_investigation_facets_confidence_ck', sql`${t.confidence} IS NULL OR (${t.confidence} >= 0 AND ${t.confidence} <= 1)`),
		check('case_investigation_facets_revision_ck', sql`${t.revision} >= 1`),
		check('case_investigation_facets_claim_nonblank_ck', sql`length(btrim(${t.claimText})) > 0`)
	]
);

export const investigationFacetEvidence = pgTable(
	'investigation_facet_evidence',
	{
		facetId: uuid('facet_id')
			.notNull()
			.references(() => caseInvestigationFacets.id, { onDelete: 'cascade' }),
		evidenceId: uuid('evidence_id')
			.notNull()
			.references(() => evidence.id, { onDelete: 'restrict' }),
		analysisCacheId: uuid('analysis_cache_id'),
		relevance: real('relevance').notNull().default(1),
		note: text('note'),
		linkedBy: integer('linked_by'),
		linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		primaryKey({ columns: [t.facetId, t.evidenceId] }),
		index('investigation_facet_evidence_evidence_idx').on(t.evidenceId),
		index('investigation_facet_evidence_evidence_facet_idx').on(t.evidenceId, t.facetId),
		check('investigation_facet_evidence_relevance_ck', sql`${t.relevance} >= 0 AND ${t.relevance} <= 1`)
	]
);

/** Junction: a facet can cite case notes. case_notes remains the summary table. */
export const investigationFacetNotes = pgTable(
	'investigation_facet_notes',
	{
		facetId: uuid('facet_id')
			.notNull()
			.references(() => caseInvestigationFacets.id, { onDelete: 'cascade' }),
		caseNoteId: uuid('case_note_id')
			.notNull()
			.references(() => caseNotes.id, { onDelete: 'cascade' }),
		linkedBy: integer('linked_by'),
		linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		primaryKey({ columns: [t.facetId, t.caseNoteId] }),
		index('investigation_facet_notes_note_facet_idx').on(t.caseNoteId, t.facetId)
	]
);

export const caseAiSummaryExports = pgTable(
	'case_ai_summary_exports',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		caseId: uuid('case_id')
			.notNull()
			.references(() => cases.id, { onDelete: 'restrict' }),
		revision: integer('revision').notNull(),
		commandId: uuid('command_id').notNull(),
		inputManifestSha256: text('input_manifest_sha256').notNull(),
		facetSnapshotSha256: text('facet_snapshot_sha256').notNull(),
		summarySha256: text('summary_sha256').notNull(),
		modelId: text('model_id').notNull(),
		summaryMarkdown: text('summary_markdown').notNull(),
		citations: jsonb('citations').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
		createdBy: integer('created_by').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('case_ai_summary_exports_revision_uq').on(t.caseId, t.revision),
		uniqueIndex('case_ai_summary_exports_command_uq').on(t.commandId),
		index('case_ai_summary_exports_head_idx').on(t.caseId, t.revision),
		index('case_ai_summary_exports_case_created_idx').on(t.caseId, t.createdAt)
	]
);

/** Append-only lineage: the facet and evidence each immutable export was built from. */
export const caseAiSummaryExportSources = pgTable(
	'case_ai_summary_export_sources',
	{
		exportId: uuid('export_id')
			.notNull()
			.references(() => caseAiSummaryExports.id, { onDelete: 'restrict' }),
		facetId: uuid('facet_id')
			.notNull()
			.references(() => caseInvestigationFacets.id, { onDelete: 'restrict' }),
		evidenceId: uuid('evidence_id')
			.notNull()
			.references(() => evidence.id, { onDelete: 'restrict' }),
		relevance: real('relevance').notNull()
	},
	(t) => [
		primaryKey({ columns: [t.exportId, t.facetId, t.evidenceId] }),
		index('case_ai_summary_export_sources_evidence_idx').on(t.evidenceId, t.exportId),
		check('case_ai_summary_export_sources_relevance_ck', sql`${t.relevance} >= 0 AND ${t.relevance} <= 1`)
	]
);

/** Append-only review ledger. An export's status is its latest review, or DRAFT when none exists. */
export const caseAiSummaryExportReviews = pgTable(
	'case_ai_summary_export_reviews',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		exportId: uuid('export_id')
			.notNull()
			.references(() => caseAiSummaryExports.id, { onDelete: 'restrict' }),
		decision: text('decision').notNull(),
		reviewedBy: integer('reviewed_by').notNull(),
		note: text('note'),
		reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('case_ai_summary_export_reviews_export_idx').on(t.exportId, t.reviewedAt),
		check('case_ai_summary_export_reviews_decision_ck', sql`${t.decision} IN ('APPROVED', 'REJECTED')`),
		check('case_ai_summary_export_reviews_note_ck', sql`${t.note} IS NULL OR length(${t.note}) <= 1000`)
	]
);
