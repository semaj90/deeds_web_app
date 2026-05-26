import { pgTable, text, timestamp, real, jsonb, primaryKey } from 'drizzle-orm/pg-core';

export const entities = pgTable('entities', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  centralityScore: real('centrality_score').default(0.0),
  metadata: jsonb('metadata').default('{}'),
  lastActiveAt: timestamp('last_active_at').defaultNow(),
});

export const entityEdges = pgTable('entity_edges', {
  sourceId: text('source_id').notNull().references(() => entities.id),
  targetId: text('target_id').notNull().references(() => entities.id),
  relationType: text('relation_type').notNull(),
  weight: real('weight').default(1.0),
  metadata: jsonb('metadata').default('{}'),
}, (t) => ({
  pk: primaryKey({ columns: [t.sourceId, t.targetId, t.relationType] })
}));
