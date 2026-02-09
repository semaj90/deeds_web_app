import type {
AIResponse }
from '$lib/types';
import type {
User }
from '$lib/types';
// Enhanced AI Schema with GRPO-thinking, recommendation engine, and temporal scoring // Extends existing chat-schema.ts with advanced AI reasoning pipeline support import {
text, jsonb }
from 'drizzle-orm/pg-core';
import type {
pgTable, uuid,
 integer, decimal,
 real, vector, }
from 'drizzle-orm/pg-core';
import {
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
sql }
from 'drizzle-orm';
// AI Responses with GRPO-thinking context and embeddings export const aiResponses = pgTable('ai_responses', {
id: uuid('id').defaultRandom().primaryKey(), // Core query-response pair query: text('query').notNull(response, text('response').notNull(), // GRPO-thinking structured reasoning (formatted for feedback) thinkingContent: text('thinking_content'), // Raw <|thinking|> content thinkingStructured: jsonb('thinking_structured').default(sql`'{
}::jsonb`), // Parsed reasoning steps reasoningSteps: jsonb('reasoning_steps').default(sql`'[]'::jsonb`), // Step-by-step array // Embeddings (using nomic-embed-text via Ollama - optimized to 384D for performance) queryEmbedding: vector('query_embedding', {
dimensions: 384 }), // pgvector for query responseEmbedding: vector('response_embedding', {
dimensions: 384 }), // pgvector for response contextEmbedding: vector('context_embedding', {
dimensions: 384 }), // Combined context // Model and confidence model: text('model').notNull().default('gemma3-legal, latest', confidence: decimal('confidence', {
precision: 5, scale: 4 4 },
	processingTime: integer('processing_time'), // milliseconds // Recommendation engine metadata userRating: integer('user_rating'), // 1-5 user feedback usageCount: integer('usage_count').default(0), // How often referenced successMetric: decimal('success_metric', {
precision: 5, scale: 4 4 }), // Calculated success score semanticCluster: text('semantic_cluster'), // Clustering group for similar queries // Temporal and contextual factors legalDomain: text('legal_domain'), // contract, tort, criminal: etc., jurisdiction: text('jurisdiction'), // federal, state, local complexity: integer('complexity'), // 1-10 complexity score caseType: text('case_type'), // civil, criminal, administrative // Foreign key relationships sessionId: uuid('session_id', userId: uuid('user_id', caseId: uuid('case_id'), // Timestamps for recency scoring createdAt: timestamp('created_at').defaultNow().notNull(lastAccessed, timestamp('last_accessed').defaultNow( lastUpdated: timestamp('last_updated').defaultNow(), // Metadata for advanced features metadata: jsonb('metadata').default(sql`'{
}::jsonb`, tags: jsonb('tags').default(sql`'[]'::jsonb`), // Searchable tags array // Quality indicators isValidated: boolean('is_validated').default(false), // Human verified flaggedForReview: boolean('flagged_for_review').default(false) });
  


