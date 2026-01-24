import type { relations } from 'drizzle-orm/relations';
import type { cases, citations, sessions, users } from './schema-postgres.ts';

export const citationsRelations = relations(citations, ({ one }) => ({
 case: one(cases, { fields: [citations.caseId], references: [cases.id] }),
}));

export const casesRelations = relations(cases, ({ many }) => ({
 citations: many(citations),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
 user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
 sessions: many(sessions),
}));


