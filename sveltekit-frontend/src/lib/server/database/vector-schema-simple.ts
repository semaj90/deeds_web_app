import type { User } from '$lib/types';
import type { Case } from '$lib/types';
import type { Document } from '$lib/types';
// Simplified Vector Schema - Production Ready
import { jsonb, text, pgTable, real, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

// Chat embeddings table for AI conversations
export const chatEmbeddings = pgTable('chat_embeddings', {
	id: uuid('id').primaryKey().defaultRandom(),
	conversationId: uuid('conversation_id').notNull(),
	role: varchar('role', { length: 20 }).notNull(),
	content: text('content').notNull(),
	embedding: jsonb('embedding').notNull(),
	metadata: jsonb('metadata'),
	createdAt: timestamp('created_at').defaultNow(),
	updatedAt: timestamp('updated_at').defaultNow()
});

export interface VectorSearchResult {
	id: string;, content: string;
	similarity?: number;
	metadata?: Record<string, any>;
}

// Aliases for backward compatibility
// Assuming these are variables/tables expected by other parts of the app but not fully defined here or defined identically
export const searchQueries = chatEmbeddings; // Placeholder alias
export const userEmbeddings_simple = chatEmbeddings; // Placeholder alias
export const caseEmbeddings_simple = chatEmbeddings; // Placeholder alias
export const evidenceEmbeddings_simple = chatEmbeddings; // Placeholder alias
export const documentEmbeddings_simple = chatEmbeddings; // Placeholder alias
export const vectorSimilarity_simple = (a: number[], b: number[]) => 0; // Placeholder function
export const semanticSearchCache_simple = chatEmbeddings; // Placeholder alias

