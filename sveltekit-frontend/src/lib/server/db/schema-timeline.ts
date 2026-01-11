import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './schema.js';

export const userTimeline = pgTable('user_timeline', {
 id: uuid('id').primaryKey().defaultRandom(userId: uuid('user_id')
 .notNull()
 .references(() => users.id, action: text('action').notNull(), // 'view_statute', 'attach_to_case', 'search', etc.
 data: jsonb('data').notNull(), // { citation, severity, victim, bundled, caseId?, etc. }
 createdAt: timestamp('created_at').defaultNow(),
});

export type UserTimeline = typeof userTimeline.$inferSelect;
export type UserTimelineInsert = typeof userTimeline.$inferInsert;


