import {
    boolean,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    uuid,
    varchar
} from 'drizzle-orm/pg-core';
import { cases } from './schema.js';

export const charges = pgTable('charges', {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
        .notNull()
        .references(() => cases.id),
    statuteCode: varchar('statute_code', { length: 100 }).notNull(),
    statuteTitle: text('statute_title'),
    penaltyLevel: varchar('penalty_level', { length: 20 }), // infraction, misdemeanor, wobbler, felony
    victimClass: varchar('victim_class', { length: 20 }), // child, elder, spouse, disabled, general
    suggestedBundles: jsonb('suggested_bundles'), // [{ statuteCode, title, reason, confidence }]
    isAttached: boolean('is_attached').default(false),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow()
});

export const caseTimeline = pgTable('case_timeline', {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
        .notNull()
        .references(() => cases.id),
    userId: integer('user_id').notNull(),
    actionType: varchar('action_type', { length: 50 }).notNull(), // "charge_added", "charge_suggested", "bundle_viewed"
    payload: jsonb('payload'), // { chargeId, statuteCode, bundlesSuggested, etc. }
    createdAt: timestamp('created_at').defaultNow()
});

export type Charge = typeof charges.$inferSelect;
export type ChargeInsert = typeof charges.$inferInsert;
export type CaseTimelineEvent = typeof caseTimeline.$inferSelect;
export type CaseTimelineInsert = typeof caseTimeline.$inferInsert;

