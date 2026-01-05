import {
 pgTable,
 uuid,
 varchar,
 text,
 timestamp,
 integer,
 jsonb,
 serial,
} from 'drizzle-orm/pg-core';
// Local reference to users table to avoid circular dependencies
const users = pgTable('users', {
 id: uuid('id').primaryKey(),
});

export const yorhaCases = pgTable('yorha_cases', {
 id: uuid('id').primaryKey().defaultRandom(),
 caseNumber: varchar('case_number', { length: 100 }).notNull().unique(),
 title: varchar('title', { length: 500 }).notNull(),
 description: text('description'),
 status: varchar('status', { length: 50 }).notNull().default('active'),
 priority: varchar('priority', { length: 20 }).notNull().default('medium'),
 caseType: varchar('case_type', { length: 100 }),
 jurisdiction: varchar('jurisdiction', { length: 200 }),
 filedDate: timestamp('filed_date', { withTimezone: true }),
 closedDate: timestamp('closed_date', { withTimezone: true }),
 createdBy: uuid('created_by')
 .notNull()
 .references(() => users.id),
 assignedTo: uuid('assigned_to').references(() => users.id),
 metadata: jsonb('metadata'),
 createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
 updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const yorhaEvidenceNodes = pgTable('yorha_evidence_nodes', {
 id: uuid('id').primaryKey().defaultRandom(),
 caseId: uuid('case_id')
 .notNull()
 .references(() => yorhaCases.id, { onDelete: 'cascade' }),
 title: varchar('title', { length: 500 }).notNull(),
 description: text('description'),
 evidenceType: varchar('evidence_type', { length: 100 }).notNull(),
 positionX: integer('position_x').default(0),
 positionY: integer('position_y').default(0),
 color: varchar('color', { length: 20 }).default('blue'),
 icon: varchar('icon', { length: 100 }),
 source: varchar('source', { length: 500 }),
 dateCollected: timestamp('date_collected', { withTimezone: true }),
 relevanceScore: integer('relevance_score').default(0),
 filePath: varchar('file_path', { length: 1000 }),
 fileType: varchar('file_type', { length: 100 }),
 fileSize: integer('file_size'),
 aiSummary: text('ai_summary'),
 aiTags: jsonb('ai_tags'),
 keyEntities: jsonb('key_entities'),
 status: varchar('status', { length: 50 }).notNull().default('active'),
 createdBy: uuid('created_by')
 .notNull()
 .references(() => users.id),
 createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
 updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const yorhaEvidenceConnections = pgTable('yorha_evidence_connections', {
 id: uuid('id').primaryKey().defaultRandom(),
 caseId: uuid('case_id')
 .notNull()
 .references(() => yorhaCases.id, { onDelete: 'cascade' }),
 sourceNodeId: uuid('source_node_id')
 .notNull()
 .references(() => yorhaEvidenceNodes.id, { onDelete: 'cascade' }),
 targetNodeId: uuid('target_node_id')
 .notNull()
 .references(() => yorhaEvidenceNodes.id, { onDelete: 'cascade' }),
 connectionType: varchar('connection_type', { length: 100 }).notNull(),
 strength: integer('strength').default(50),
 description: text('description'),
 aiReasoning: text('ai_reasoning'),
 confidenceScore: integer('confidence_score').default(0),
 createdBy: uuid('created_by')
 .notNull()
 .references(() => users.id),
 createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
 updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const yorhaChatSessions = pgTable('yorha_chat_sessions', {
 id: uuid('id').primaryKey().defaultRandom(),
 caseId: uuid('case_id')
 .notNull()
 .references(() => yorhaCases.id, { onDelete: 'cascade' }),
 userId: uuid('user_id').notNull(), // Can't reference users if user_id is from external auth, but assuming local
 title: varchar('title', { length: 500 }),
 contextType: varchar('context_type', { length: 100 }),
 contextId: uuid('context_id'),
 status: varchar('status', { length: 50 }).notNull().default('active'),
 messageCount: integer('message_count').default(0),
 createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
 updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
 lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
});

export const yorhaChatMessages = pgTable('yorha_chat_messages', {
 id: uuid('id').primaryKey().defaultRandom(),
 sessionId: uuid('session_id')
 .notNull()
 .references(() => yorhaChatSessions.id, { onDelete: 'cascade' }),
 role: varchar('role', { length: 50 }).notNull(),
 content: text('content').notNull(),
 messageType: varchar('message_type', { length: 50 }).default('text'),
 referencedEvidence: jsonb('referenced_evidence'),
 modelUsed: varchar('model_used', { length: 100 }),
 tokensUsed: integer('tokens_used'),
 createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
 updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const yorhaSystemMetrics = pgTable('yorha_system_metrics', {
 id: serial('id').primaryKey(),
 cpuUsage: integer('cpu_usage'),
 cpuCores: integer('cpu_cores'),
 memoryUsage: integer('memory_usage'),
 memoryTotalGb: integer('memory_total_gb'),
 memoryUsedGb: integer('memory_used_gb'),
 gpuUsage: integer('gpu_usage'),
 gpuMemoryUsage: integer('gpu_memory_usage'),
 gpuTemperature: integer('gpu_temperature'),
 diskUsage: integer('disk_usage'),
 diskTotalGb: integer('disk_total_gb'),
 diskUsedGb: integer('disk_used_gb'),
 networkLatencyMs: integer('network_latency_ms'),
 networkBandwidthMbps: integer('network_bandwidth_mbps'),
 systemHealth: varchar('system_health', { length: 50 }).default('healthy'),
 activeCases: integer('active_cases').default(0),
 activeSessions: integer('active_sessions').default(0),
 recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
});
