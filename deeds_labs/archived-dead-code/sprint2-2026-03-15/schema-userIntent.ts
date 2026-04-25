import { pgTable, real, serial, timestamp, text } from 'drizzle-orm/pg-core';

export const userIntentLogs = pgTable("user_intent_logs", {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    intent: text("intent"),
    confidence: real("confidence").default(0),
    clusterId: text("cluster_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
});
