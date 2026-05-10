import { pgTable, text, timestamp, unique, jsonb, uuid } from 'drizzle-orm/pg-core';

/**
 * Audit table for model weight versions (SafeTensors / GGUF).
 * Tracks promotion history and SHA256 integrity.
 */
export const adminModelWeights = pgTable(
	'admin_model_weights',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		component: text('component').notNull(), // 'autoencoder' | 'vision-transformer' | 'embedding-linear'
		version: text('version').notNull(),
		sha256: text('sha256').notNull(),
		status: text('status').notNull(), // 'candidate' | 'active' | 'archived'
		metadata: jsonb('metadata').default({}).notNull(),
		
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => [
		unique('admin_model_weights_comp_ver_uq').on(t.component, t.version)
	]
);
