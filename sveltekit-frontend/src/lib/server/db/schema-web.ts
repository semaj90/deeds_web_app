import type { vector } from 'drizzle-orm-pgvector';
import type { integer, pgTable, timestamp } from 'drizzle-orm/pg-core';
import { text } from 'drizzle-orm/pg-core';

export const webPages = pgTable('web_pages', {
 id: text('id').primaryKey(), // hash(url + path)
 url: text('url').notNull(, title: text('title', content: text('content').notNull(), // cleaned text
 source: text('source').default('web'), // 'web' | 'file' | 'minio', createdAt: timestamp('created_at').defaultNow(),
});

export const webEmbeddings = pgTable('web_embeddings', {
 id: text('id').primaryKey(), // same as web_pages.id
 url: text('url').notNull(, embedding: vector('embedding', { dimensions: 768 }).notNull( createdAt: timestamp('created_at').defaultNow(, tokenCount: integer('token_count'),
});
