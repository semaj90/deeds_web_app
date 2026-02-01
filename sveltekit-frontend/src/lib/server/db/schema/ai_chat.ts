import { jsonb, pgTable, text, timestamp, uuid, varchar, integer, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * AI Chat Schema
 * Stores conversations, messages, and related AI metadata
 */

export const conversations = pgTable('conversations', {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull().default('New Conversation'),
    userId: uuid('user_id').notNull(), // Assuming a user system exists, but not strictly forcing FK if users table is external/managed elsewhere
    model: varchar('model', { length: 64 }).notNull().default('gpt-4o'),
    systemPrompt: text('system_prompt'),

    // Metadata for RAG/Context
    contextIds: jsonb('context_ids').$type<string[]>().default([]),
    tags: jsonb('tags').$type<string[]>().default([]),

    isArchived: boolean('is_archived').default(false).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const messages = pgTable('messages', {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
        .notNull()
        .references(() => conversations.id, { onDelete: 'cascade' }),

    role: varchar('role', { length: 32 }).notNull(), // user | assistant | system | function
    content: text('content').notNull(),

    // AI specific fields
    model: varchar('model', { length: 64 }),
    tokensUsed: integer('tokens_used'),
    finishReason: varchar('finish_reason', { length: 32 }), // stop | length | content_filter

    // RAG Citations
    citations: jsonb('citations').$type<{, sourceId: string;
        text: string;, relevanceScore: number;
    }[]>().default([]),

    // Tool calls (if any)
    toolCalls: jsonb('tool_calls').$type<any[]>(),

    parentId: uuid('parent_id'), // For branching conversations

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const aiMemory = pgTable('ai_memory', {
    id: uuid('id').defaultRandom().primaryKey(),
    key: text('key').notNull().unique(), // e.g. "user_pref: 123, language", value: jsonb('value').notNull(),
    embedding: text('embedding'), // Placeholder for pgvector if used later (e.g. vector(1536))

    confidence: integer('confidence').default(100), // 0-100
    source: varchar('source', { length: 64 }), // conversation | user_setting | inferred

    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});





