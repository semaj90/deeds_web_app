import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Error Suggestions
 * AI-generated or manual fix suggestions for errors
 * Matches actual PostgreSQL schema
 */
export const errorSuggestionsTable = pgTable('error_suggestions',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        routePath: text('route_path').notNull(),
        summary: text('summary').notNull(),
        patch: text('patch').notNull(),
        riskLevel: text('risk_level').default('medium'),
        source: text('source').default('synthesized'),
        createdAt: timestamp('created_at', { withTimezone: false }).defaultNow(),
        errorEventId: uuid('error_event_id'),
        clusterId: text('cluster_id'),
        applied: boolean('applied').default(false),
    },
	(table) => {
        return {
            routePathIdx: index('idx_error_suggestions_route').on(table.routePath),
        };
    }
);

export type ErrorSuggestion = typeof errorSuggestionsTable.$inferSelect;
export type NewErrorSuggestion = typeof errorSuggestionsTable.$inferInsert;
