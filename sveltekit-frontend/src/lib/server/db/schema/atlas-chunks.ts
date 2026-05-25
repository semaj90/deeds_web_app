import { pgTable, uuid, text, jsonb, timestamp, vector } from 'drizzle-orm/pg-core';

export const atlasChunks = pgTable('atlas_chunks', {
  id: uuid('id').primaryKey(),
  chunkId: text('chunk_id').notNull(),
  path: text('path').notNull(),
  summary: text('summary'),
  content: text('content'),
  featureFamily: text('feature_family'),
  sourceRefs: jsonb('source_refs').$type<string[]>(),
  clusterTags: jsonb('cluster_tags').$type<string[]>(),
  envVars: jsonb('env_vars').$type<string[]>(),
  embedding: vector('embedding', { dimensions: 768 }),
  createdAt: timestamp('created_at').defaultNow()
});