/**
 * JSONB Legal Metadata Schema Optimization
 *
 * Optimizes PostgreSQL JSONB operations for legal document metadata,
 * case information, evidence records, and semantic analysis results.
 */

import { sql } from 'drizzle-orm';
import { text, jsonb, integer, timestamp, boolean, real } from 'drizzle-orm/pg-core';
import { pgTable, uuid } from 'drizzle-orm/pg-core';
import { z } from 'zod';

// ============================================================================
// LEGAL METADATA SCHEMA DEFINITIONS (Zod)
// ============================================================================

// Base legal document metadata structure
export const LegalMetadataSchema = z.object({
	// Document Classification
	documentType: z.enum([
		'contract', 'brief', 'motion', 'pleading', 'evidence', 'citation', 'precedent', 'statute'
	]).optional(),
	jurisdiction: z.string().optional(),
	practiceArea: z.enum([
		'corporate', 'litigation', 'criminal', 'intellectual_property',
		'real_estate', 'family', 'tax', 'employment'
	]).optional(),

	// Legal Context
	courtLevel: z.enum(['federal', 'state', 'local', 'administrative']).optional(),
	caseType: z.enum(['civil', 'criminal', 'administrative', 'appellate']).optional(),
	urgency: z.enum(['routine', 'priority', 'urgent', 'emergency']).default('routine'),

	// Document Security
	confidentialityLevel: z.enum(['public', 'confidential', 'privileged', 'classified']).default('public'),
	retentionPeriod: z.number().int().positive().optional(),

	// Legal Parties
	parties: z.array(z.object({
	name: z.string(),
		role: z.enum(['plaintiff', 'defendant', 'witness', 'counsel', 'judge', 'expert', 'third_party']),
		entityType: z.enum(['individual', 'corporation', 'government', 'organization']).optional()
	})).optional(),

	// Citations and References
	citations: z.array(z.object({
	type: z.enum(['case_law', 'statute', 'regulation', 'treaty', 'secondary_source']),
		citation: z.string(),
		relevance: z.number().min(0).max(1).optional(),
		pinpoint: z.string().optional()
	})).optional(),

	// Semantic Analysis
	semantics: z.object({
	keyTerms: z.array(z.string()).optional(),
		legalConcepts: z.array(z.string()).optional(),
		precedentStrength: z.number().min(0).max(1).optional(),
		argumentStructure: z.array(z.object({
	type: z.enum(['premise', 'conclusion', 'evidence', 'counterargument']),
			text: z.string(),
			confidence: z.number().min(0).max(1)
		})).optional()
	}).optional(),

	// AI Processing
	aiMetadata: z.object({
	modelVersion: z.string().optional(),
		processingTimestamp: z.string().datetime().optional(),
		confidence: z.number().min(0).max(1).optional(),
		reviewStatus: z.enum(['pending', 'reviewed', 'approved', 'rejected']).default('pending'),
		humanVerified: z.boolean().default(false)
	}).optional(),

	// Custom Fields
	customFields: z.record(z.string(), z.any()).optional()
});

// Case-specific metadata
export const CaseMetadataSchema = z.object({
	caseNumber: z.string(),
	filingDate: z.string().datetime().optional(),
	status: z.enum(['active', 'pending', 'closed', 'on_hold', 'appealed']),
	timeline: z.array(z.object({
	date: z.string().datetime(),
		event: z.string(),
		significance: z.enum(['low', 'medium', 'high', 'critical']).default('medium')
	})).optional(),
	strategy: z.object({
	approach: z.string().optional(),
		objectives: z.array(z.string()).optional(),
		risks: z.array(z.object({
	description: z.string(),
			probability: z.number().min(0).max(1),
			impact: z.enum(['low', 'medium', 'high', 'critical'])
		})).optional()
	}).optional()
});

// Evidence metadata with chain of custody
export const EvidenceMetadataSchema = z.object({
	evidenceType: z.enum([
		'document', 'physical', 'digital', 'testimony', 'expert_opinion', 'demonstrative'
	]),
	authenticity: z.object({
	verified: z.boolean().default(false),
		method: z.string().optional(),
		verifier: z.string().optional(),
		verificationDate: z.string().datetime().optional()
	}).optional(),
	chainOfCustody: z.array(z.object({
	timestamp: z.string().datetime(),
		custodian: z.string(),
		action: z.enum(['collected', 'transferred', 'analyzed', 'stored', 'retrieved']),
		location: z.string().optional(),
		condition: z.string().optional()
	})).optional(),
	relevance: z.object({
	score: z.number().min(0).max(1),
		reasoning: z.string().optional(),
		relatedEvidence: z.array(z.string()).optional()
	}).optional(),
	admissibility: z.object({
	status: z.enum(['admissible', 'inadmissible', 'conditional', 'pending']),
		basis: z.string().optional(),
		objections: z.array(z.string()).optional()
	}).optional()
});

// ============================================================================
// DRIZZLE TABLE DEFINITIONS
// ============================================================================

export const legalDocumentsJsonb = pgTable('legal_documents_jsonb', {
	id: uuid('id').defaultRandom().primaryKey(),
	title: text('title').notNull(),
	content: text('content').notNull(),
	metadata: jsonb('metadata').notNull(),
	documentType: text('document_type'),
	jurisdiction: text('jurisdiction'),
	practiceArea: text('practice_area'),
	confidentialityLevel: text('confidentiality_level'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const casesJsonb = pgTable('cases_jsonb', {
	id: uuid('id').defaultRandom().primaryKey(),
	title: text('title').notNull(),
	description: text('description'),
	metadata: jsonb('metadata').notNull(),
	caseNumber: text('case_number'),
	status: text('status'),
	filingDate: timestamp('filing_date'),
	totalDocuments: integer('total_documents').default(0),
	totalEvidence: integer('total_evidence').default(0),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const evidenceJsonb = pgTable('evidence_jsonb', {
	id: uuid('id').defaultRandom().primaryKey(),
	caseId: uuid('case_id'),
	title: text('title').notNull(),
	description: text('description'),
	metadata: jsonb('metadata').notNull(),
	filePath: text('file_path'),
	fileSize: integer('file_size'),
	mimeType: text('mime_type'),
	evidenceType: text('evidence_type'),
	authenticated: boolean('authenticated'),
	relevanceScore: real('relevance_score'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const documentRelationshipsJsonb = pgTable('document_relationships_jsonb', {
	id: uuid('id').defaultRandom().primaryKey(),
	sourceId: uuid('source_id').notNull(),
	targetId: uuid('target_id').notNull(),
	relationshipMetadata: jsonb('relationship_metadata').notNull(),
	relationshipType: text('relationship_type'),
	strength: real('strength'),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export const JSONB_METADATA_LABEL_FIELDS = [
  'documentType',
  'practiceArea',
  'caseNumber',
  'evidenceType',
  'admissibility',
  'chainOfCustody',
  'aiMetadata',
] as const;

export type JsonbMetadataLabelField = (typeof JSONB_METADATA_LABEL_FIELDS)[number];

export function buildJsonbMetadataLabels(input: {
  documentTypes?: string[];
  practiceAreas?: string[];
  caseNumbers?: string[];
  evidenceTypes?: string[];
  hasAdmissibility?: boolean;
  hasChainOfCustody?: boolean;
  hasAiMetadata?: boolean;
}): string[] {
  const labels = new Set<string>();

  for (const value of input.documentTypes ?? []) labels.add(`documentType:${value}`);
  for (const value of input.practiceAreas ?? []) labels.add(`practiceArea:${value}`);
  for (const value of input.caseNumbers ?? []) labels.add(`caseNumber:${value}`);
  for (const value of input.evidenceTypes ?? []) labels.add(`evidenceType:${value}`);

  if (input.hasAdmissibility) labels.add('admissibility');
  if (input.hasChainOfCustody) labels.add('chainOfCustody');
  if (input.hasAiMetadata) labels.add('aiMetadata');

  return [...labels].sort((left, right) => left.localeCompare(right));
}

// ============================================================================
// JSONB QUERY HELPERS
// ============================================================================

export class LegalJsonbOperations {
	/**
	 * Find documents by practice area with semantic filtering
	 */
	static findDocumentsByPracticeAreaQuery(practiceArea: string, minRelevance = 0.7): string {
		return `
			SELECT id, title, metadata, content_embedding
			FROM legal_documents_jsonb
			WHERE metadata->>'practiceArea' = '${practiceArea}'
			AND (metadata->'semantics'->>'precedentStrength')::real >= ${minRelevance}
			ORDER BY (metadata->'aiMetadata'->>'confidence')::real DESC
		`;
	}

	/**
	 * Find documents by party name
	 */
	static findDocumentsByPartyQuery(partyName: string, role?: string): string {
		const roleFilter = role ? `AND party->>'role' = '${role}'` : '';
		return `
			SELECT DISTINCT d.id, d.title, d.metadata
			FROM legal_documents_jsonb d,
			     jsonb_array_elements(d.metadata->'parties') AS party
			WHERE party->>'name' ILIKE '%${partyName}%'
			${roleFilter}
			ORDER BY d.updated_at DESC
		`;
	}

	/**
	 * Find similar cases by metadata
	 */
	static findSimilarCasesQuery(caseId: string, threshold = 0.5): string {
		return `
			WITH target_case AS (
				SELECT metadata FROM cases_jsonb WHERE id = '${caseId}'
			)
			SELECT
				c.id, c.title, c.metadata,
				CASE
					WHEN c.metadata->>'practiceArea' = (SELECT metadata->>'practiceArea' FROM target_case) THEN 0.3
					ELSE 0.0
				END +
				CASE
					WHEN c.metadata->>'jurisdiction' = (SELECT metadata->>'jurisdiction' FROM target_case) THEN 0.2
					ELSE 0.0
				END +
				CASE
					WHEN c.metadata->>'caseType' = (SELECT metadata->>'caseType' FROM target_case) THEN 0.2
					ELSE 0.0
				END AS similarity_score
			FROM cases_jsonb c
			WHERE c.id != '${caseId}'
			HAVING similarity_score >= ${threshold}
			ORDER BY similarity_score DESC
			LIMIT 20
		`;
	}

	/**
	 * Verify evidence chain of custody
	 */
	static verifyEvidenceChainQuery(evidenceId: string): string {
		return `
			SELECT
				id, title,
				metadata->'chainOfCustody' as chain,
				metadata->'authenticity' as authenticity,
				jsonb_array_length(metadata->'chainOfCustody') as custody_count,
				(metadata->'chainOfCustody'->-1->>'custodian') as current_custodian
			FROM evidence_jsonb
			WHERE id = '${evidenceId}'
		`;
	}
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type LegalMetadata = z.infer<typeof LegalMetadataSchema>;
export type CaseMetadata = z.infer<typeof CaseMetadataSchema>;
export type EvidenceMetadata = z.infer<typeof EvidenceMetadataSchema>;

export type LegalDocument = typeof legalDocumentsJsonb.$inferSelect;
export type NewLegalDocument = typeof legalDocumentsJsonb.$inferInsert;
export type CaseRecord = typeof casesJsonb.$inferSelect;
export type NewCaseRecord = typeof casesJsonb.$inferInsert;
export type Evidence = typeof evidenceJsonb.$inferSelect;
export type NewEvidence = typeof evidenceJsonb.$inferInsert;
export type DocumentRelationship = typeof documentRelationshipsJsonb.$inferSelect;
export type NewDocumentRelationship = typeof documentRelationshipsJsonb.$inferInsert;

