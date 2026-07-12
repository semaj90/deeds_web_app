import { date, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { cases } from './legal-cases';
import { personsOfInterest } from '../schema-postgres';


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



