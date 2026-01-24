import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Error Feedback
 * User feedback on suggested fixes and error classifications
 * Helps tune the Error Brain LLM and clustering over time
 */
export const errorFeedbackTable = pgTable('error_feedback',
    {
        id: uuid('id').defaultRandom().primaryKey(),

        // Which error or cluster this feedback is about
        errorEventId: uuid('error_event_id'),
        clusterId: text('cluster_id'),
        patchId: uuid('patch_id'),

        // The feedback itself
        feedbackType: text('feedback_type').notNull(), // "helpful" | "misleading" | "incomplete" | "incorrect" | "fixed-it"
        feedbackText: text('feedback_text'), // User's notes
        rating: text('rating'), // Optional: 1-5 star rating

        // Who gave the feedback
        userId: text('user_id'), // Lucia user ID
        userRole: text('user_role'), // "developer" | "reviewer" | "ai-trainer"

        // Timestamp
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => {
        return {
            errorEventIdIdx: index('error_feedback_error_event_id_idx').on(table.errorEventId),
            clusterIdIdx: index('error_feedback_cluster_id_idx').on(table.clusterId),
            patchIdIdx: index('error_feedback_patch_id_idx').on(table.patchId),
            userIdIdx: index('error_feedback_user_id_idx').on(table.userId),
            feedbackTypeIdx: index('error_feedback_type_idx').on(table.feedbackType),
            createdAtIdx: index('error_feedback_created_at_idx').on(table.createdAt),
        };
    }
);

export type ErrorFeedback = typeof errorFeedbackTable.$inferSelect;
export type ErrorFeedbackInsert = typeof errorFeedbackTable.$inferInsert;
