import { pgTable, text, jsonb, timestamp, integer, uuid, index, vector } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Document embeddings for semantic search
export const documentEmbeddings = pgTable('document_embeddings', {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: text('document_id').notNull(),
    documentType: text('document_type').notNull(), // 'case', 'evidence', 'note', 'report'
    chunkIndex: integer('chunk_index').notNull().default(0),
    chunkText: text('chunk_text').notNull(),
    embedding: vector('embedding', { dimensions: 384 }),
    metadata: jsonb('metadata').default({}),
    modelUsed: text('model_used').default('nomic-embed-text'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow()
},
	(table) => ({
    embeddingIdx: index('idx_embedding_ivfflat').on(table.embedding),
    documentIdx: index('idx_document_lookup').on(table.documentId, table.documentType),
    createdAtIdx: index('idx_created_at').on(table.createdAt)
}));

// Search queries and their embeddings for caching
export const searchQueries = pgTable('search_queries', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    queryText: text('query_text').notNull(),
    queryEmbedding: vector('query_embedding', { dimensions: 384 }),
    searchType: text('search_type').notNull().default('semantic'),
    resultsCount: integer('results_count').default(0),
    results: jsonb('results').default({
	items: [], totalFound: 0, searchTime: 0 }),
    createdAt: timestamp('created_at').defaultNow()
},
	(table) => ({
    userIdx: index('idx_search_user').on(table.userId),
    queryEmbeddingIdx: index('idx_query_embedding').on(table.queryEmbedding),
    createdAtIdx: index('idx_search_created').on(table.createdAt)
}));

// AI model configurations
export const aiModels = pgTable('ai_models', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    provider: text('provider').notNull(), // 'ollama', 'openai', 'anthropic'
    modelType: text('model_type').notNull(), // 'embedding', 'chat', 'completion'
    embeddingDimensions: integer('embedding_dimensions'),
    contextLength: integer('context_length'),
    config: jsonb('config').default({}),
    isActive: integer('is_active').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow()
},
	(table) => ({
    nameIdx: index('idx_model_name').on(table.name),
    providerTypeIdx: index('idx_provider_type').on(table.provider, table.modelType)
}));

export const documentEmbeddingsRelations = relations(documentEmbeddings, () => ({}));
export const searchQueriesRelations = relations(searchQueries, () => ({}));

// Export types
export type DocumentEmbedding = typeof documentEmbeddings.$inferSelect;
export type NewDocumentEmbedding = typeof documentEmbeddings.$inferInsert;
export type SearchQuery = typeof searchQueries.$inferSelect;
export type NewSearchQuery = typeof searchQueries.$inferInsert;
export type AIModel = typeof aiModels.$inferSelect;
export type NewAIModel = typeof aiModels.$inferInsert;
