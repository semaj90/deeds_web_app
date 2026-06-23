import { pgTable, bigserial, text, timestamp, jsonb, boolean, uniqueIndex, index, primaryKey } from 'drizzle-orm/pg-core';

export const agentMemoryRegistry = pgTable('agent_memory_registry', {
  id: bigserial('id').primaryKey(),

  // Task & Story
  taskId: text('task_id').notNull(),
  storyId: text('story_id').notNull(),

  // Agent Ownership
  agent: text('agent').notNull(),

  // Trace Chain
  traceId: text('trace_id'),
  runId: text('run_id'),

  // Packet Identity (frozen from Atlas)
  packetKey: text('packet_key'),
  sourceRef: text('source_ref'),
  featureId: text('feature_id'),

  // Retrieval Layer
  cacheNamespace: text('cache_namespace'),
  cacheSource: text('cache_source'),  // 'hyperrag_fusion', 'kag_retrieval', 'dag_traversal'
  retrievalStrategy: text('retrieval_strategy'),

  // Supersession
  supersedesTaskId: text('supersedes_task_id'),
  supersedesPacketKeys: text('supersedes_packet_keys').array(),
  supersedesReason: text('supersedes_reason'),

  // GPU Eligibility
  gpuEligible: boolean('gpu_eligible').default(false),

  // Status: CLAIMED | VERIFYING | PASS | SUPERSEDED | FAILED | MANUAL_REVIEW
  status: text('status').notNull().default('CLAIMED'),

  // Metadata
  metadata: jsonb('metadata').default({}),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueTaskAgent: uniqueIndex('agent_task_unique').on(table.taskId, table.agent),
  idxTaskId: index('idx_agent_memory_task_id').on(table.taskId),
  idxStoryId: index('idx_agent_memory_story_id').on(table.storyId),
  idxAgent: index('idx_agent_memory_agent').on(table.agent),
  idxPacketKey: index('idx_agent_memory_packet_key').on(table.packetKey),
  idxFeatureId: index('idx_agent_memory_feature_id').on(table.featureId),
  idxSourceRef: index('idx_agent_memory_source_ref').on(table.sourceRef),
  idxStatus: index('idx_agent_memory_status').on(table.status),
  idxCreatedAt: index('idx_agent_memory_created_at').on(table.createdAt),
}));

export type AgentMemoryRegistry = typeof agentMemoryRegistry.$inferSelect;
export type NewAgentMemoryRegistry = typeof agentMemoryRegistry.$inferInsert;

export const mcpTraceOwnership = pgTable('mcp_trace_ownership', {
  id: bigserial('id').primaryKey(),

  traceId: text('trace_id').notNull().unique(),
  taskId: text('task_id').notNull(),
  agent: text('agent').notNull(),

  // Trace Chain
  promptHash: text('prompt_hash'),
  toolCalls: text('tool_calls').array(),
  packetKeys: text('packet_keys').array(),
  proofHash: text('proof_hash'),
  releaseHash: text('release_hash'),

  // Status: OPEN | CLOSED | FAILED
  status: text('status').default('OPEN'),

  metadata: jsonb('metadata').default({}),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, (table) => ({
  idxTaskId: index('idx_mcp_trace_task_id').on(table.taskId),
  idxAgent: index('idx_mcp_trace_agent').on(table.agent),
  idxStatus: index('idx_mcp_trace_status').on(table.status),
}));

export type McpTraceOwnership = typeof mcpTraceOwnership.$inferSelect;
export type NewMcpTraceOwnership = typeof mcpTraceOwnership.$inferInsert;

export const gpuEligibilityGate = pgTable('gpu_eligibility_gate', {
  id: bigserial('id').primaryKey(),

  taskId: text('task_id').notNull(),
  packetKey: text('packet_key').notNull(),

  // Verification Checks
  identityStable: boolean('identity_stable'),
  vectorDimCorrect: boolean('vector_dim_correct'),
  batchBounded: boolean('batch_bounded'),
  cpuFallbackExists: boolean('cpu_fallback_exists'),
  claimValid: boolean('claim_valid'),
  proofValid: boolean('proof_valid'),

  // Overall Result
  eligible: boolean('eligible'),
  verdict: text('verdict'),  // PASS | FAIL | MANUAL_REVIEW

  metadata: jsonb('metadata').default({}),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  idxTaskId: index('idx_gpu_gate_task_id').on(table.taskId),
  idxPacketKey: index('idx_gpu_gate_packet_key').on(table.packetKey),
  idxEligible: index('idx_gpu_gate_eligible').on(table.eligible),
}));

export type GpuEligibilityGate = typeof gpuEligibilityGate.$inferSelect;
export type NewGpuEligibilityGate = typeof gpuEligibilityGate.$inferInsert;
