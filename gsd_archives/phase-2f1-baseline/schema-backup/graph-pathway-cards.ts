
import { pgTable, text, timestamp, unique, jsonb, real, uuid, integer, doublePrecision } from 'drizzle-orm/pg-core';

/**
 * Pathway Cards: First-class memory objects caching synthesized graph paths,
 * structural evidence, and semantic narratives. 
 * Prevents re-deriving expensive multi-hop explanations in agentic loops.
 */
export const graphPathwayCards = pgTable(
	'graph_pathway_cards',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		
		// Uniquely identifies the query or start/end relationship
		pathKey: text('path_key').notNull().unique(), 
		
		// Structural metadata
		startNode: text('start_node'),
		endNode: text('end_node'),
		pathSequence: jsonb('path_sequence').notNull(), // Ordered list of stableKeys/chunks
		pathEdges: jsonb('path_edges').default([]),     // Edge types (IMPORTS, CALLS, etc)
		communityIds: integer('community_ids').array().default([]), // GraphRAG-style community anchoring
		
		// Semantic content
		summary: text('summary').notNull(),            // Derived narrative / LLM synthesis
		citationSpans: jsonb('citation_spans').default([]), // Explicit provenance anchoring
		sourceHashes: text('source_hashes').array().default([]), // For idempotency/staleness check
		
		// Importance metrics
		pagerankScore: doublePrecision('pagerank_score').default(0.0),
		riskScore: doublePrecision('risk_score').default(0.0),
		
		// Topological grounding
		embedding: real('embedding').array(),         // 768d vector for dense retrieval
		manifold4: real('manifold4').array(),         // 4D SOM manifold coordinates
		somBmuRow: integer('som_bmu_row'),
		somBmuCol: integer('som_bmu_col'),
		
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
	}
);
