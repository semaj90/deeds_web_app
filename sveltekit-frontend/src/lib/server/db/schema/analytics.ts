/**
 * Analytics schema — matches raw SQL in event-logger.ts
 */
import { pgTable, uuid, varchar, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const userAnalyticsEvents = pgTable('user_analytics_events', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id'),
	sessionId: varchar('session_id', { length: 100 }),
	eventType: varchar('event_type', { length: 100 }).notNull(),
	payload: jsonb('payload'),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export type UserAnalyticsEvent = typeof userAnalyticsEvents.$inferSelect;
export type NewUserAnalyticsEvent = typeof userAnalyticsEvents.$inferInsert;
