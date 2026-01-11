import { index, integer, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { vector } from 'pgvector/drizzle-orm';

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
 embedding: vector('embedding', { dimensions: 384 }),
 version: integer('version').default(1).notNull(),
 createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
 },
 (table) => ({
 canvasIdx: index('canvas_autosaves_canvas_id_idx').on(table.canvasId),
 canvasCreatedIdx: index('canvas_autosaves_canvas_created_idx').on(
 table.canvasId,
 table.createdAt
 ),
 userIdx: index('canvas_autosaves_user_id_idx').on(table.userId),
 })
);
