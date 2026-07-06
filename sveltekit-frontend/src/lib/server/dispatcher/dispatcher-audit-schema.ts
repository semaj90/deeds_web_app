/**
 * Dispatcher Audit Log — Drizzle Schema Definition
 * Persists all dispatcher decisions for traceability + debugging
 */

import { pgTable, bigserial, varchar, real, integer, jsonb, text, timestamp, index } from 'drizzle-orm/pg-core';

export const dispatcherAuditLog = pgTable(
  'dispatcher_audit_log',
  {
    id: bigserial('id').primaryKey(),

    // Identity
    packet_key: varchar('packet_key', { length: 255 }).notNull(),
    source_ref: varchar('source_ref', { length: 500 }),
    feature_id: varchar('feature_id', { length: 255 }),

    // Dispatch Decision
    dispatch_decision: varchar('dispatch_decision', { length: 50 }).notNull(),
    dispatch_confidence: real('dispatch_confidence'),
    identity_lane: varchar('identity_lane', { length: 50 }),
    parity_status: varchar('parity_status', { length: 50 }),

    // Mirror Sync Results
    mirror_syncs: jsonb('mirror_syncs').$type<{
      qdrant?: { synced: number; failed: number; duration_ms: number };
      neo4j?: { nodes_created: number; nodes_updated: number; edges_created: number; duration_ms: number };
      redis?: { invalidated: number; key_count: number; duration_ms: number };
    }>(),

    // Events
    events_emitted: integer('events_emitted').default(0),

    // Execution Details
    synthesis_path: text('synthesis_path').array(),
    tool_calls: jsonb('tool_calls').$type<
      Array<{ name: string; args: unknown; result: unknown; duration_ms: number }>
    >(),
    errors: text('errors').array(),
    latency_ms: integer('latency_ms'),

    // Status
    status: varchar('status', { length: 20 }).default('success').notNull(),
    result: jsonb('result'),

    // Timestamps
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Indexes
    idx_packet_key: index('idx_dispatcher_audit_packet_key').on(table.packet_key),
    idx_decision: index('idx_dispatcher_audit_decision').on(table.dispatch_decision),
    idx_created_at: index('idx_dispatcher_audit_created_at').on(table.created_at),
    idx_status: index('idx_dispatcher_audit_status').on(table.status),
    idx_created_status: index('idx_dispatcher_audit_created_status').on(table.created_at, table.status),
    idx_mirror_syncs: index('idx_dispatcher_audit_mirror_syncs').using('gin', table.mirror_syncs),
  })
);

export type DispatcherAuditLog = typeof dispatcherAuditLog.$inferSelect;
export type DispatcherAuditLogInsert = typeof dispatcherAuditLog.$inferInsert;
