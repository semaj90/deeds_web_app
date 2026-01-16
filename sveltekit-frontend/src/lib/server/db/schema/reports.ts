import { jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { cases } from './cases.js';

export const reports = pgTable('reports', {
    id: uuid('id').defaultRandom().primaryKey(),
    caseId: uuid('case_id')
        .notNull()
        .references(() => cases.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 256 }).notNull(),
    type: varchar('type', { length: 64 }).notNull(), // charging_memo | intake_summary | discovery_list | hearing_prep

    // TipTap content (you can use either or both)
    contentHtml: text('content_html'), // HTML string (TipTap can parse this)
    contentJson: jsonb('content_json'), // TipTap JSON if you decide to store it

    rawModelOutput: text('raw_model_output'),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone, true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone, true }).defaultNow().notNull(),
});


