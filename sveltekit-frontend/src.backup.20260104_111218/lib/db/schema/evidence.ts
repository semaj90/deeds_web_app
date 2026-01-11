import { pgTable, text, timestamp, integer, uuid, json, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const evidenceTypeEnum = pgEnum('evidence_type', [
 'video',
 'document',
 'photo',
 'note',
 'audio',
 'forensic',
]);
export const relationshipStrengthEnum = pgEnum('relationship_strength', [
 'strong',
 'medium',
 'weak',
]);
export const nodeTypeEnum = pgEnum('node_type', ['person', 'evidence', 'location', 'case']);
export const timelineEventTypeEnum = pgEnum('timeline_event_type', [
 'evidence',
 'person',
 'location',
 'action',
]);

// Evidence Items
export const evidence = pgTable('evidence', {
 id: uuid('id').primaryKey().defaultRandom(),
 caseId: uuid('case_id').notNull(),
 evidenceNumber: text('evidence_number').notNull(), // EV-001, EV-002, etc.
 title: text('title').notNull(),
 type: evidenceTypeEnum('type').notNull(),
 summary: text('summary').notNull(),
 description: text('description'),

 // Board position
 posX: integer('pos_x'),
 posY: integer('pos_y'),

 // Metadata
 collectedAt: timestamp('collected_at'),
 collectedBy: text('collected_by'),
 verifiedAt: timestamp('verified_at'),

 createdAt: timestamp('created_at').defaultNow().notNull(),
 updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Evidence Relationships (connections on the board)
export const evidenceRelationships = pgTable('evidence_relationships', {
 id: uuid('id').primaryKey().defaultRandom(),
 fromEvidenceId: uuid('from_evidence_id')
 .notNull()
 .references(() => evidence.id, { onDelete: 'cascade' }),
 toEvidenceId: uuid('to_evidence_id')
 .notNull()
 .references(() => evidence.id, { onDelete: 'cascade' }),
 label: text('label'),
 strength: relationshipStrengthEnum('strength').default('medium'),
 notes: text('notes'),

 createdAt: timestamp('created_at').defaultNow().notNull(),
 createdBy: text('created_by'),
});

// Timeline Events
export const timelineEvents = pgTable('timeline_events', {
 id: uuid('id').primaryKey().defaultRandom(),
 caseId: uuid('case_id').notNull()('timestamp').notNull(),
 title: text('title').notNull(),
 description: text('description').notNull(),
 type: timelineEventTypeEnum('type').notNull(),

 // JSON arrays of related IDs
 evidenceIds: json('evidence_ids').$type<string[]>().default([]),
 personIds: json('person_ids').$type<string[]>().default([]),
 locationIds: json('location_ids').$type<string[]>().default([]),

 createdAt: timestamp('created_at').defaultNow().notNull(),
 createdBy: text('created_by'),
});

// Graph Nodes (for relationship visualization)
export const graphNodes = pgTable('graph_nodes', {
 id: uuid('id').primaryKey().defaultRandom(),
 caseId: uuid('case_id').notNull(),
 nodeId: text('node_id').notNull(), // POI-001, EV-001, LOC-001, etc.
 label: text('label').notNull(),
 type: nodeTypeEnum('type').notNull(),

 // Position on graph
 posX: integer('pos_x').notNull(),
 posY: integer('pos_y').notNull(),

 // Reference to actual entity
 entityId: uuid('entity_id'), // ID of person, evidence, or location

 createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Graph Edges (relationships between nodes)
export const graphEdges = pgTable('graph_edges', {
 id: uuid('id').primaryKey().defaultRandom(),
 caseId: uuid('case_id').notNull(),
 fromNodeId: uuid('from_node_id')
 .notNull()
 .references(() => graphNodes.id, { onDelete: 'cascade' }),
 toNodeId: uuid('to_node_id')
 .notNull()
 .references(() => graphNodes.id, { onDelete: 'cascade' }),
 label: text('label'),
 strength: relationshipStrengthEnum('strength').default('medium'),

 createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const evidenceRelations = relations(evidence, ({ many }) => ({
 outgoingConnections: many(evidenceRelationships, { relationName: 'from' }),
 incomingConnections: many(evidenceRelationships, { relationName: 'to' }),
}));

export const evidenceRelationshipsRelations = relations(evidenceRelationships, ({ one }) => ({
 fromEvidence: one(evidence, {
 fields: [evidenceRelationships.fromEvidenceId],
 references: [evidence.id],
 relationName: 'from',
 }),
 toEvidence: one(evidence, {
 fields: [evidenceRelationships.toEvidenceId],
 references: [evidence.id],
 relationName: 'to',
 }),
}));

export const graphNodesRelations = relations(graphNodes, ({ many }) => ({
 outgoingEdges: many(graphEdges, { relationName: 'from' }),
 incomingEdges: many(graphEdges, { relationName: 'to' }),
}));

export const graphEdgesRelations = relations(graphEdges, ({ one }) => ({
 fromNode: one(graphNodes, {
 fields: [graphEdges.fromNodeId],
 references: [graphNodes.id],
 relationName: 'from',
 }),
 toNode: one(graphNodes, {
 fields: [graphEdges.toNodeId],
 references: [graphNodes.id],
 relationName: 'to',
 }),
}));

// Types for TypeScript
export type Evidence = typeof evidence.$inferSelect;
export type NewEvidence = typeof evidence.$inferInsert;
export type EvidenceRelationship = typeof evidenceRelationships.$inferSelect;
export type NewEvidenceRelationship = typeof evidenceRelationships.$inferInsert;
export type TimelineEvent = typeof timelineEvents.$inferSelect;
export type NewTimelineEvent = typeof timelineEvents.$inferInsert;
export type GraphNode = typeof graphNodes.$inferSelect;
export type NewGraphNode = typeof graphNodes.$inferInsert;
export type GraphEdge = typeof graphEdges.$inferSelect;
export type NewGraphEdge = typeof graphEdges.$inferInsert;
