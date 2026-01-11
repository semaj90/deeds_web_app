/**
 * Phase 80: Chat Messages Schema
 * Database schema for persistent chat storage in legal_ai_db
 */

import {
    index,
    pgEnum,
    pgTable,
    text,
    timestamp,
    varchar,
	uuid
} from 'drizzle-orm/pg-core';
import { users } from './schema-postgres';

// Enum for chat message roles
export const chatMessageRoleEnum = pgEnum('chat_message_role', ['user', 'assistant', 'system']);

/**
 * Chat Messages Table
 * Stores all chat messages for both anonymous (migrated) and authenticated users
 */
export const chatMessages = pgTable('chat_messages', {
	id: varchar('id', { length: 255 }).primaryKey(), // msg_1735123456789_abc123
	chatId: varchar('chat_id', { length: 255 }).notNull(), // Groups messages by conversation
	userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }), // Nullable for anonymous (pre-migration)
	role: chatMessageRoleEnum('role').notNull(), // 'user' | 'assistant' | 'system'
	content: text('content').notNull(), // Message text
	timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(), // When sent
	migratedFrom: varchar('migrated_from', { length: 255 }), // Anonymous session ID (if migrated)
	metadata: text('metadata'), // JSON string for additional data (model, tokens, etc.)
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
	chatIdIdx: index('idx_chat_messages_chat_id').on(table.chatId),
	userIdIdx: index('idx_chat_messages_user_id').on(table.userId),
	timestampIdx: index('idx_chat_messages_timestamp').on(table.timestamp),
	migratedFromIdx: index('idx_chat_messages_migrated_from').on(table.migratedFrom)
}));

// Type exports for TypeScript
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

/**
 * Chat Metadata Table (Optional - for future enhancements)
 * Stores chat-level metadata like titles, participants, case associations
 */
export const chatMetadata = pgTable('chat_metadata', {
	chatId: varchar('chat_id', { length: 255 }).primaryKey(),
	userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
	title: varchar('title', { length: 500 }), // Auto-generated or user-provided
	caseId: uuid('case_id'), // Optional case association
	messageCount: varchar('message_count', { length: 50 }).default('0'),
	lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
	isArchived: varchar('is_archived', { length: 10 }).default('false'),
	tags: text('tags'), // JSON array of tags
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
	userIdIdx: index('idx_chat_metadata_user_id').on(table.userId),
	caseIdIdx: index('idx_chat_metadata_case_id').on(table.caseId),
	lastMessageIdx: index('idx_chat_metadata_last_message').on(table.lastMessageAt)
}));

export type ChatMetadata = typeof chatMetadata.$inferSelect;
export type NewChatMetadata = typeof chatMetadata.$inferInsert;


