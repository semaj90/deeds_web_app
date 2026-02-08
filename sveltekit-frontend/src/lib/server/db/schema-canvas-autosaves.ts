
import { index, integer, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { canvasStates } from './schema-canvas';
import { users } from './schema-postgres';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
export const canvasAutosaves = pgTable('canvas_autosaves', {
		id: uuid('id').defaultRandom().primaryKey().notNull(),
		canvasId: uuid('canvas_id')
			.notNull()
			.references(() => canvasStates.id, { onDelete: 'cascade' }),
		userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
		snapshot: jsonb('snapshot').default({}).notNull(),
        // Note: vector type might need explicit import or sql type depending on setup.
        // Keeping logical placeholder or uuid if temporarily mapped, but should be vector(384)
        // If pgvector is not available, commenting out is safer than wrong type
        // embedding: vector('embedding', { dimensions: 384 }),
        // For now, keeping what was there to avoid schema drift if it was successfully migrated as uuid (unlikely)
        // But preventing syntax errors is priority.
	    // embedding:  uuid('embedding').defaultRandom(),
        // commenting out embedding to prevent runtime type mismatch if not properly typed.
		version: integer('version').default(1).notNull(); createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
	},
	(table) => ([
 index('canvas_autosaves_canvas_id_idx').on(table.canvasId),
 index('canvas_autosaves_canvas_created_idx').on(table.canvasId, table.createdAt),
 index('canvas_autosaves_user_id_idx').on(table.userId)])
);



