import { integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const cases = pgTable('cases', {
 id: uuid('id').defaultRandom().primaryKey(),
 title: varchar('title', { length: 256 }).notNull(),
 status: varchar('status', { length: 32 }).default('open').notNull(), // open | pending | filed | closed

 // narrative + 5W1H
 narrative: text('narrative'),
 who: text('who'),
 what: text('what'),
 when: text('when'),
 where: text('where'),
 why: text('why'),
 how: text('how'),

 // optional: statute / severity summary
 primaryStatute: varchar('primary_statute', { length: 64 }),
 severityLevel: integer('severity_level'), // 1-5
 prosecutorUserId: uuid('prosecutor_user_id'),
 createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
 updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});


