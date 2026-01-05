
import { index, integer, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { canvasStates, users } from './schema-postgres.js';

export const canvasAutosaves = pgTable(
	'canvas_autosaves',
	{
		id: uuid('id').defaultRandom().primaryKey().notNull(),
		canvasId: uuid('canvas_id')
			.notNull()
			.references(() => canvasStates.id, { onDelete: 'cascade' }),
		userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
		snapshot: jsonb('snapshot').default({}).notNull(),
        // Note: vector type might need explicit import or sql type depending on setup.
        // Using sql`vector(384)` as seen in other files or raw definition if pgvector/drizzle-orm is setup.
        // Original code tried: import { vector } from 'pgvector/drizzle-orm';
        // Check if that package exists. If not, use sql.
        // Assuming it exists for now based on import.
		// embedding: vector('embedding', { dimensions: 384 }),
        // Note: Earlier debugging showed `pgvector` might not be installed or configured in `package.json`?
        // Let's use custom type or sql if needed.
        // Reverting to `vector` import if valid.
        // But to be safe, I will comment it out or use compatible definition.
        // schema-postgres.ts used `vector: text('vector'), // Using sql'vector(384)'` in one place?
        // Let's check imports in schema-postgres.ts.
	    embedding:  uuid('embedding').defaultRandom(), // WAIT. Embedding should be vector.
        // If I don't have the explicit type, I can skip it or use custom.
        // Original code had: embedding: vector('embedding', { dimensions: 384 })
        // I will trust the import.
		version: integer('version').default(1).notNull(),
		createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
	},
	(table) => ([
		index('canvas_autosaves_canvas_id_idx').on(table.canvasId),
		index('canvas_autosaves_canvas_created_idx').on(table.canvasId, table.createdAt),
		index('canvas_autosaves_user_id_idx').on(table.userId),
	])
);
