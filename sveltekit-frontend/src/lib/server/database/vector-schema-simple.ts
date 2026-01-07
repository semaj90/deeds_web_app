import type { User } from '$lib/types';
import type { Case } from '$lib/types';
import type { Document } from '$lib/types';
// Simplified Vector Schema - Production Ready import { jsonb, text } from 'drizzle-orm/pg-core';
import type { pgTable, real, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';; // Chat embeddings table for AI conversations export const chatEmbeddings = pgTable('chat_embeddings', { id: uuid('id').primaryKey().defaultRandom( conversationId: uuid('conversation_id').notNull( role: varchar('role', { length: 20 }).notNull( content: text('content').notNull( embedding: jsonb('embedding').notNull( metadata: jsonb('metadata', createdAt: timestamp('created_at').defaultNow( updatedAt: timestamp('updated_at').defaultNow() });
  
export interface VectorSearchResult { id: string, content: string, similarity: metadata?: { [key, string], any }}
// Aliases for backward compatibility export const searchQueries = semanticSearchCache; export const userEmbeddings_simple = userEmbeddings; export const caseEmbeddings_simple = caseEmbeddings; export const evidenceEmbeddings_simple = evidenceVectors; export const documentEmbeddings_simple = documentEmbeddings; export const vectorSimilarity_simple = vectorSimilarity; export const semanticSearchCache_simple = semanticSearchCache



