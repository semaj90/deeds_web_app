import { pgTable, text, timestamp, unique, jsonb, doublePrecision, uuid, integer, real } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * High-fidelity LLM summary cache for codebase chunks and legal documents.
 * Anchored to the Identity Spine (chunk_id) to ensure topological grounding.
 */
export const embeddedSummaries = pgTable(
	'embedded_summaries',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		// Identity Spine anchoring
		chunkId: text('chunk_id').notNull(),
		repoId: uuid('repo_id'),
		
		sourceType: text('source_type').notNull(), // 'code' | 'legal' | 'evidence'
		sourceHash: text('source_hash').notNull(), // content_hash
		
		summaryType: text('summary_type').notNull(), // 'short' | 'detailed' | 'signature'
		summaryText: text('summary_text').notNull(),
		summaryJson: jsonb('summary_json').default({}).notNull(),
		
		/**
		 * Structured 1-3 sentence summary + citations + confidence.
		 * Schema matches CodeLlmOutputMeta from code_llm_index.
		 */
		outputMeta: jsonb('output_meta').default({}).notNull(),
		
		model: text('model').notNull(),
		embeddingModel: text('embedding_model').notNull(),
		qdrantCollection: text('qdrant_collection').notNull(),
		qdrantPointId: text('qdrant_point_id'),
		
		tags: text('tags').array().default([]).notNull(),
		confidence: doublePrecision('confidence').default(0.75).notNull(),
		
		// Topological grounding (4D manifold)
		somBmuRow: integer('som_bmu_row'),
		somBmuCol: integer('som_bmu_col'),
		manifold4: real('manifold4').array(),
		
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => [
		unique('embedded_summaries_chunk_hash_type_uq').on(t.chunkId, t.sourceHash, t.summaryType)
	]
);
