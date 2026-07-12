import { sql } from 'drizzle-orm';
import {
  pgTable, text, integer, real, timestamp, pgEnum, index, jsonb, bigserial,
} from 'drizzle-orm/pg-core';

// Phase 10: Packet Ontology Registry
// ====================================
// Add unified ontology for packets and tools, with telemetry infrastructure

/**
 * Packet type enum: classifies what a packet represents
 * Used for schema-aware routing and unified search
 */
export const packetTypeEnum = pgEnum('packet_type', [
  'code',      // source code file or chunk
  'test',      // test file or chunk
  'doc',       // documentation
  'prompt',    // AI prompt or template
  'tool',      // tool registry entry
  'schema',    // data schema (Zod, JSON, OpenAPI)
  'api',       // API endpoint or RPC definition
  'spec',      // specification or design document
]);

/**
 * Tool execution telemetry log
 * Records every tool invocation for operational visibility and feedback loop
 * Partitioned by timestamp for efficient queries and retention policies
 */
export const toolExecutionLog = pgTable('tool_execution_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey().notNull(),  // Event sequence number
  toolId: text('tool_id').notNull(),  // Reference to tool_registry.tool_id
  query: text('query'),  // First 500 chars of query text for debugging
  success: integer('success').notNull(),  // 1 = success, 0 = failure (int for aggregation)
  latencyMs: integer('latency_ms'),  // Execution time in milliseconds
  errorType: text('error_type'),  // Classification: timeout, schema_mismatch, api_failure, rate_limit, unknown
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  // Future: request_id, trace_id, user_id for correlation
}, (table) => ({
  toolIdIdx: index('idx_tool_exec_log_tool_id').on(table.toolId),
  timestampIdx: index('idx_tool_exec_log_timestamp').on(sql`${table.timestamp} DESC`),
  toolIdTimestampIdx: index('idx_tool_exec_log_tool_timestamp').on(table.toolId, sql`${table.timestamp} DESC`),
  successIdx: index('idx_tool_exec_log_success').on(table.success),
}));

export type ToolExecutionLog = typeof toolExecutionLog.$inferSelect;
export type NewToolExecutionLog = typeof toolExecutionLog.$inferInsert;

/**
 * Tool execution statistics (materialized view companion)
 * Computed hourly from tool_execution_log for operational queries
 * Provides O(1) lookup for success rates, latency, timeout/schema_mismatch counts
 */
export const toolExecutionStatsView = pgTable('tool_execution_stats_7d', {
  toolId: text('tool_id').primaryKey().notNull(),
  successCount: integer('success_count').notNull().default(0),
  failureCount: integer('failure_count').notNull().default(0),
  avgLatencyMs: real('avg_latency_ms').default(0),
  timeoutCount: integer('timeout_count').notNull().default(0),
  schemaMismatchCount: integer('schema_mismatch_count').notNull().default(0),
  rollingSuccessRate: real('rolling_success_rate').default(0),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).defaultNow(),
  // Derived from tool_execution_log for past 7 days
});

export type ToolExecutionStats = typeof toolExecutionStatsView.$inferSelect;

/**
 * Extends atlas_packets with ontology and telemetry fields (Phase 10)
 * These fields are added via Drizzle migration, not a new table
 *
 * When used in schema updates:
 * - packetType: packet_type enum (phase-10-packet-type)
 * - packetOntology: jsonb with { capabilities: string[], constraints: object, examples: object, tags: string[] }
 * - parentPacketKey: text (nullable, FK to packet_key)
 * - relatedPackets: text array (semantic neighbors)
 * - telemetry: jsonb with execution history
 */

/**
 * Extends tool_registry with ontology and telemetry fields (Phase 10)
 * These fields are added via Drizzle migration, not a new table
 *
 * When used in schema updates:
 * - toolCapabilities: jsonb with capability list
 * - toolConstraints: jsonb with operational limits
 * - toolExamples: jsonb with input/output examples
 * - toolTags: text array (fast, deterministic, deprecated, etc.)
 * - failureModes: jsonb with error counts by type
 * - Plus telemetry columns: timeout_count, schema_mismatch_count, false_positive_rate
 */
