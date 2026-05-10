import { relations } from 'drizzle-orm/relations';
import { cases, citations, sessions, users } from './schema-postgres.js';
import { aceRetrievalHits, aceRetrievalRuns, enrichmentJobs } from './schema.js';
import { codeRepos } from './schema/codebase-intelligence.js';

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

// ── Agentic Context & Retrieval Relations ─────────────────────────────────────
// Reviewed against P1 topological requirements. No circular dependencies 
// detected; relations are anchored in the metadata spine.

export const aceRetrievalRunsRelations = relations(aceRetrievalRuns, ({ many }) => ({
	hits: many(aceRetrievalHits),
}));

export const aceRetrievalHitsRelations = relations(aceRetrievalHits, ({ one }) => ({
	run: one(aceRetrievalRuns, { 
		fields: [aceRetrievalHits.runId], 
		references: [aceRetrievalRuns.id] 
	}),
}));

export const codeReposRelations = relations(codeRepos, ({ many }) => ({
	enrichmentJobs: many(enrichmentJobs),
}));

export const enrichmentJobsRelations = relations(enrichmentJobs, ({ one }) => ({
	repo: one(codeRepos, {
		fields: [enrichmentJobs.repoId],
		references: [codeRepos.repoId]
	}),
}));



