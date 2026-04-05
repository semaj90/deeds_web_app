/**
 * ACE Web Crawl Jobs Schema
 * Tracks web crawling jobs for the ACE pipeline
 */

import { boolean, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const webCrawlJobs = pgTable('web_crawl_jobs', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id'),
	urls: jsonb('urls').notNull(), // Array of URLs to crawl
	status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, processing, completed, failed
	ragMode: varchar('rag_mode', { length: 20 }).default('hybrid'), // rag, kag, dag, hybrid
	enableGPU: boolean('enable_gpu').default(true),
	processedUrls: integer('processed_urls').default(0),
	totalUrls: integer('total_urls'),
	results: jsonb('results'), // Crawl results
	error: text('error'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const userAnalytics = pgTable('user_analytics', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id').notNull(),
	eventType: varchar('event_type', { length: 100 }).notNull(), // web_crawl_initiated, ai_chat_started, etc.
	metadata: jsonb('metadata'), // Event-specific data
	timestamp: timestamp('timestamp').defaultNow().notNull()
});

export const aiChatSessions = pgTable('ai_chat_sessions', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id'),
	jobId: uuid('job_id'), // Link to web_crawl_jobs or other job types
	model: varchar('model', { length: 100 }).notNull().default('gemma4-legal:latest'),
	systemPrompt: text('system_prompt'),
	messages: jsonb('messages').default([]), // Chat history
	contextVectors: jsonb('context_vectors'), // Embedded context for RAG
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export type WebCrawlJob = typeof webCrawlJobs.$inferSelect;
export type NewWebCrawlJob = typeof webCrawlJobs.$inferInsert;

export type UserAnalytic = typeof userAnalytics.$inferSelect;
export type NewUserAnalytic = typeof userAnalytics.$inferInsert;

export type AIChatSession = typeof aiChatSessions.$inferSelect;
export type NewAIChatSession = typeof aiChatSessions.$inferInsert;
