import { integer, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const errorBrainDiffs = pgTable('error_brain_diffs', {
 id: uuid('id').defaultRandom().primaryKey(),
 runId: text('run_id').notNull(),
 filePath: text('file_path').notNull(),
 diffText: text('diff_text').notNull(),
 beforeSha256: text('before_sha256').notNull(),
 afterSha256: text('after_sha256').notNull(),
 afterText: text('after_text').notNull(), // Added for deterministic apply
 contextLines: integer('context_lines').notNull().default(3),
 confidence: real('confidence').notNull(),
 reason: text('reason').notNull(),
 createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
});



