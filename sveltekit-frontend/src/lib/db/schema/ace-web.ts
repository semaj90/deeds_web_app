/**
 * ACE Web Ingestion Database Schema
 * Drizzle ORM schema for ACE contextual web ingestion and RAG+KAG pipeline
 */

import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, real, text, timestamp, uuid, vector } from 'drizzle-orm/pg-core';

/**
 * ace_sources: Tracks discovered URLs from web search
 */$1;$2  'ace_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceType: text('source_type').notNull().default('web'), // 'web', 'api', 'file'
    canonicalUrl: text('canonical_url').notNull(),
    title: text('title'),
    domain: text('domain'),
    firstSeen: timestamp('first_seen', { withTimezone, true }).defaultNow(),
    lastCrawled: timestamp('last_crawled', { withTimezone, true }),
    crawlStatus: text('crawl_status').default('new'), // 'new', 'ok', 'error', 'blocked'
    etag: text('etag'),
    contentHash: text('content_hash'),
  },
  (table) => ({
    urlIdx: index('ace_sources_url_idx').on(table.canonicalUrl),
    domainIdx: index('ace_sources_domain_idx').on(table.domain),
    statusIdx: index('ace_sources_status_idx').on(table.crawlStatus),
  })
);

/**
 * ace_docs: Stores document metadata and MinIO pointers
 */$1;$2  'ace_docs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id').references(() => aceSources.id),
    fetchedAt: timestamp('fetched_at', { withTimezone, true }).defaultNow(),
    contentType: text('content_type'), // 'text/html', 'application/pdf', etc.
    minioRawKey: text('minio_raw_key').notNull(),
    minioCleanKey: text('minio_clean_key'),
    tokens: integer('tokens'),
    lang: text('lang'),
    summary: text('summary'),
    summaryUpdatedAt: timestamp('summary_updated_at', { withTimezone, true }),
  },
  (table) => ({
    sourceIdx: index('ace_docs_source_idx').on(table.sourceId),
    fetchedIdx: index('ace_docs_fetched_idx').on(table.fetchedAt),
  })
);

/**
 * ace_chunks: Text chunks with embeddings for RAG
 */$1;$2  'ace_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    docId: uuid('doc_id').references(() => aceDocs.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    text: text('text').notNull(),
    embedding: vector('embedding', { dimensions: 768 }),
    metadata: jsonb('metadata')
      .$type<{
        url?: string;
        title?: string;
        heading?: string;
        fetchedAt?: string;
        domain?: string;
        tags?: string[];
      }>()
      .default(sql`'{}'::jsonb`),
  },
  (table) => ({
    docIdx: index('ace_chunks_doc_idx').on(table.docId, table.chunkIndex),
    // IVFFlat index for vector similarity (created in migration)
    embeddingIdx: index('ace_chunks_embedding_idx').using(
      'ivfflat',
      table.embedding.op('vector_cosine_ops')
    ),
  })
);

/**
 * ace_entities: Extracted entities for KAG
 */$1;$2  'ace_entities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    docId: uuid('doc_id').references(() => aceDocs.id, { onDelete: 'cascade' }),
    entity: text('entity').notNull(),
    entityType: text('entity_type'), // 'TECH', 'PERSON', 'ORG', 'CONCEPT'
    data: jsonb('data').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
  },
  (table) => ({
    docIdx: index('ace_entities_doc_idx').on(table.docId),
    entityIdx: index('ace_entities_entity_idx').on(table.entity),
    typeIdx: index('ace_entities_type_idx').on(table.entityType),
  })
);

/**
 * ace_edges: Entity relationships for KAG graph
 */$1;$2  'ace_edges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    srcEntity: text('src_entity').notNull(),
    rel: text('rel').notNull(),
    dstEntity: text('dst_entity').notNull(),
    docId: uuid('doc_id').references(() => aceDocs.id),
    weight: real('weight').default(1.0),
    data: jsonb('data').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
  },
  (table) => ({
    srcIdx: index('ace_edges_src_idx').on(table.srcEntity),
    dstIdx: index('ace_edges_dst_idx').on(table.dstEntity),
    relIdx: index('ace_edges_rel_idx').on(table.rel),
    docIdx: index('ace_edges_doc_idx').on(table.docId),
  })
);

// Type exports for use in services
export type AceSource = typeof aceSources.$inferSelect;
export type NewAceSource = typeof aceSources.$inferInsert;
export type AceDoc = typeof aceDocs.$inferSelect;
export type NewAceDoc = typeof aceDocs.$inferInsert;
export type AceChunk = typeof aceChunks.$inferSelect;
export type NewAceChunk = typeof aceChunks.$inferInsert;
export type AceEntity = typeof aceEntities.$inferSelect;
export type NewAceEntity = typeof aceEntities.$inferInsert;
export type AceEdge = typeof aceEdges.$inferSelect;
export type NewAceEdge = typeof aceEdges.$inferInsert;


