import { date, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { cases } from './cases.js';

export const personsOfInterest = pgTable('persons_of_interest', {
    id: uuid('id').defaultRandom().primaryKey(),
    fullName: varchar('full_name', { length: 256 }).notNull(),
    role: varchar('role', { length: 64 }), // suspect | victim | witness | other
    riskLevel: varchar('risk_level', { length: 32 }), // low | medium | high
    dob: date('dob'),
    lastKnownLocation: text('last_known_location'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const casePersons = pgTable('case_persons', {
    id: uuid('id').defaultRandom().primaryKey(),
    caseId: uuid('case_id')
        .notNull()
        .references(() => cases.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
        .notNull()
        .references(() => personsOfInterest.id, { onDelete: 'cascade' }),
    relationshipType: varchar('relationship_type', { length: 64 }), // defendant, co-defendant, witness, etc.
    isPrimary: varchar('is_primary', { length: 5 }).default('false'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});


