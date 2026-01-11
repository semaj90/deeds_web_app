/**
 * YoRHa Detective Interface Schema
 * Drizzle ORM schema for YoRHa command center, evidence board, and chat system
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  serial,
  index,
  foreignKey,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Cases table - stores detective cases
 */
export const cases = pgTable(
  'yorha_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    case_number: varchar('case_number', { length: 100 }).notNull().unique(),
    title: varchar('title', { length: 500 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 50 }).default('active').notNull(), // active, closed, archived
    priority: varchar('priority', { length: 20 }).default('medium').notNull(), // low, medium, high, critical
    case_type: varchar('case_type', { length: 100 }),
    jurisdiction: varchar('jurisdiction', { length: 200 }),

    // Dates
    filed_date: timestamp('filed_date', { withTimezone: true }),
    closed_date: timestamp('closed_date', { withTimezone: true }),

    // Ownership and assignment
    created_by: uuid('created_by').notNull(),
    assigned_to: uuid('assigned_to'),

    // Metadata
    metadata: jsonb('metadata'), // Store additional case data

    // Audit fields
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    case_number_idx: index('yorha_cases_case_number_idx').on(table.case_number),
    created_by_idx: index('yorha_cases_created_by_idx').on(table.created_by),
    status_idx: index('yorha_cases_status_idx').on(table.status),
  })
);

/**
 * Evidence nodes table - stores evidence items on the evidence board
 */
export const evidence_nodes = pgTable(
  'yorha_evidence_nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    case_id: uuid('case_id').notNull(),
    title: varchar('title', { length: 500 }).notNull(),
    description: text('description'),
    evidence_type: varchar('evidence_type', { length: 100 }).notNull(), // document, photo, video, audio, testimony, etc.

    // Position on canvas (for evidence board visualization)
    position_x: integer('position_x').default(0),
    position_y: integer('position_y').default(0),

    // Visual properties
    color: varchar('color', { length: 20 }).default('blue'), // blue, red, green, yellow, etc.
    icon: varchar('icon', { length: 100 }), // icon name for display

    // Evidence metadata
    source: varchar('source', { length: 500 }), // where the evidence came from
    date_collected: timestamp('date_collected', { withTimezone: true }),
    relevance_score: integer('relevance_score').default(0), // 0-100

    // File storage
    file_path: varchar('file_path', { length: 1000 }),
    file_type: varchar('file_type', { length: 100 }),
    file_size: integer('file_size'),

    // AI analysis
    ai_summary: text('ai_summary'),
    ai_tags: jsonb('ai_tags'), // Array of tags
    key_entities: jsonb('key_entities'), // Named entities

    // Status
    status: varchar('status', { length: 50 }).default('active').notNull(), // active, archived, flagged

    // Audit fields
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    case_id_idx: index('yorha_evidence_nodes_case_id_idx').on(table.case_id),
    evidence_type_idx: index('yorha_evidence_nodes_type_idx').on(table.evidence_type),
    created_by_idx: index('yorha_evidence_nodes_created_by_idx').on(table.created_by),
  })
);

/**
 * Evidence connections table - stores relationships between evidence nodes
 */
export const evidence_connections = pgTable(
  'yorha_evidence_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    case_id: uuid('case_id').notNull(),
    source_node_id: uuid('source_node_id').notNull(),
    target_node_id: uuid('target_node_id').notNull(),

    // Connection metadata
    connection_type: varchar('connection_type', { length: 100 }).notNull(), // related_to, contradicts, supports, etc.
    strength: integer('strength').default(50), // 0-100, connection strength
    description: text('description'),

    // AI analysis
    ai_reasoning: text('ai_reasoning'), // Why these are connected
    confidence_score: integer('confidence_score').default(0), // 0-100

    // Audit fields
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    case_id_idx: index('yorha_evidence_connections_case_id_idx').on(table.case_id),
    source_node_idx: index('yorha_evidence_connections_source_idx').on(table.source_node_id),
    target_node_idx: index('yorha_evidence_connections_target_idx').on(table.target_node_id),
    connection_type_idx: index('yorha_evidence_connections_type_idx').on(table.connection_type),
  })
);

/**
 * Chat sessions table - stores conversation sessions
 */
export const chat_sessions = pgTable(
  'yorha_chat_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    case_id: uuid('case_id').notNull(),
    user_id: uuid('user_id').notNull(),

    // Session metadata
    title: varchar('title', { length: 500 }),
    context_type: varchar('context_type', { length: 100 }), // evidence, case, general
    context_id: uuid('context_id'), // ID of the evidence or case being discussed

    // Session state
    status: varchar('status', { length: 50 }).default('active').notNull(), // active, archived, closed

    // Message count for quick stats
    message_count: integer('message_count').default(0),

    // Audit fields
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    last_message_at: timestamp('last_message_at', { withTimezone: true }),
  },
  (table) => ({
    case_id_idx: index('yorha_chat_sessions_case_id_idx').on(table.case_id),
    user_id_idx: index('yorha_chat_sessions_user_id_idx').on(table.user_id),
    status_idx: index('yorha_chat_sessions_status_idx').on(table.status),
  })
);

/**
 * Chat messages table - stores individual messages in chat sessions
 */
export const chat_messages = pgTable(
  'yorha_chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    session_id: uuid('session_id').notNull(),

    // Message content
    role: varchar('role', { length: 50 }).notNull(), // user, assistant, system
    content: text('content').notNull(),

    // Message metadata
    message_type: varchar('message_type', { length: 50 }).default('text'), // text, code, error, etc.

    // Evidence references
    referenced_evidence: jsonb('referenced_evidence'), // Array of evidence node IDs referenced

    // AI metadata
    model_used: varchar('model_used', { length: 100 }), // Which model generated this
    tokens_used: integer('tokens_used'),

    // Audit fields
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    session_id_idx: index('yorha_chat_messages_session_id_idx').on(table.session_id),
    role_idx: index('yorha_chat_messages_role_idx').on(table.role),
    created_at_idx: index('yorha_chat_messages_created_at_idx').on(table.created_at),
  })
);

/**
 * System metrics table - stores historical system metrics
 */
export const system_metrics = pgTable(
  'yorha_system_metrics',
  {
    id: serial('id').primaryKey(),

    // CPU metrics
    cpu_usage: integer('cpu_usage'), // 0-100
    cpu_cores: integer('cpu_cores'),

    // Memory metrics
    memory_usage: integer('memory_usage'), // 0-100
    memory_total_gb: integer('memory_total_gb'),
    memory_used_gb: integer('memory_used_gb'),

    // GPU metrics
    gpu_usage: integer('gpu_usage'), // 0-100
    gpu_memory_usage: integer('gpu_memory_usage'), // 0-100
    gpu_temperature: integer('gpu_temperature'), // Celsius

    // Disk metrics
    disk_usage: integer('disk_usage'), // 0-100
    disk_total_gb: integer('disk_total_gb'),
    disk_used_gb: integer('disk_used_gb'),

    // Network metrics
    network_latency_ms: integer('network_latency_ms'),
    network_bandwidth_mbps: integer('network_bandwidth_mbps'),

    // System health
    system_health: varchar('system_health', { length: 50 }).default('healthy'), // healthy, warning, critical
    active_cases: integer('active_cases').default(0),
    active_sessions: integer('active_sessions').default(0),

    // Timestamp
    recorded_at: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    recorded_at_idx: index('yorha_system_metrics_recorded_at_idx').on(table.recorded_at),
  })
);

/**
 * Relations for Drizzle ORM
 */
export const casesRelations = relations(cases, ({ many }) => ({
  evidence_nodes: many(evidence_nodes),
  evidence_connections: many(evidence_connections),
  chat_sessions: many(chat_sessions),
}));

export const evidence_nodesRelations = relations(evidence_nodes, ({ one, many }) => ({
  case: one(cases, {
    fields: [evidence_nodes.case_id],
    references: [cases.id],
  }),
  outgoing_connections: many(evidence_connections, {
    relationName: 'source',
  }),
  incoming_connections: many(evidence_connections, {
    relationName: 'target',
  }),
}));

export const evidence_connectionsRelations = relations(evidence_connections, ({ one }) => ({
  case: one(cases, {
    fields: [evidence_connections.case_id],
    references: [cases.id],
  }),
  source_node: one(evidence_nodes, {
    fields: [evidence_connections.source_node_id],
    references: [evidence_nodes.id],
    relationName: 'source',
  }),
  target_node: one(evidence_nodes, {
    fields: [evidence_connections.target_node_id],
    references: [evidence_nodes.id],
    relationName: 'target',
  }),
}));

export const chat_sessionsRelations = relations(chat_sessions, ({ one, many }) => ({
  case: one(cases, {
    fields: [chat_sessions.case_id],
    references: [cases.id],
  }),
  messages: many(chat_messages),
}));

export const chat_messagesRelations = relations(chat_messages, ({ one }) => ({
  session: one(chat_sessions, {
    fields: [chat_messages.session_id],
    references: [chat_sessions.id],
  }),
}));

/**
 * Type exports for use in application
 */
export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;

export type EvidenceNode = typeof evidence_nodes.$inferSelect;
export type NewEvidenceNode = typeof evidence_nodes.$inferInsert;

export type EvidenceConnection = typeof evidence_connections.$inferSelect;
export type NewEvidenceConnection = typeof evidence_connections.$inferInsert;

export type ChatSession = typeof chat_sessions.$inferSelect;
export type NewChatSession = typeof chat_sessions.$inferInsert;

export type ChatMessage = typeof chat_messages.$inferSelect;
export type NewChatMessage = typeof chat_messages.$inferInsert;

export type SystemMetrics = typeof system_metrics.$inferSelect;
export type NewSystemMetrics = typeof system_metrics.$inferInsert;
