/**
 * modelWeights — sidecar schema
 *
 * Auto-extracted from drizzle-kit introspect (2026-05-30 drift remediation).
 * Live DB table: `model_weights`
 *
 * NOTE: this file mirrors the LIVE DB shape. If you change the schema here,
 * make a matching SQL migration in drizzle/manual/ to keep the DB in sync.
 */

import { char, jsonb, pgTable, text, timestamp, uuid, unique, varchar } from 'drizzle-orm/pg-core' ;

export const modelWeights = pgTable("model_weights", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	modelName: varchar("model_name", { length: 255 }).notNull(),
	version: varchar({ length: 50 }).notNull(),
	status: varchar({ length: 50 }).default('candidate').notNull(),
	checksumSha256: char("checksum_sha256", { length: 64 }).notNull(),
	filePath: text("file_path").notNull(),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("model_weights_model_name_version_key").on(table.modelName, table.version),
]);

export type ModelWeights = typeof modelWeights.$inferSelect;
export type NewModelWeights = typeof modelWeights.$inferInsert;
