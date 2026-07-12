import { pgTable, text, timestamp, real, index } from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core';

export const semanticCache = pgTable('semantic_cache', {
  id: text('id').primaryKey(),
  promptHash: text('prompt_hash').notNull().unique(),
  promptText: text('prompt_text').notNull(),
  responseText: text('response_text').notNull(),
  embedding: vector('embedding', { dimensions: 768 }),
  model: text('model').notNull(),
  similarityThreshold: real('similarity_threshold').default(0.90),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  // HNSW index for fast vector search using vector_cosine_ops
  embeddingHnsw: index('semantic_cache_embed_hnsw')
    .using('hnsw', table.embedding.op('vector_cosine_ops'))
}));
