import { boolean, integer, jsonb, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const gpuInferenceSessions = pgTable('gpu_inference_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionName: text('session_name').notNull(),
  userId: text('user_id'),
  engineUsed: text('engine_used').notNull(), // ollama, webgpu, vllm, fastembed, etc.
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  metadata: jsonb('metadata'), // Session settings, preferences
  isActive: boolean('is_active').default(true)
});

export const gpuInferenceMessages = pgTable('gpu_inference_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => gpuInferenceSessions.id),
  role: text('role').notNull(), // user, assistant, system
  content: text('content').notNull(),
  embedding: real('embedding').array(), // Vector embedding of the message
  engineUsed: text('engine_used'), // Which AI engine was used for this response
  responseTime: integer('response_time'), // Response time in milliseconds
  tokensGenerated: integer('tokens_generated'),
  cacheHit: boolean('cache_hit').default(false),
  metadata: jsonb('metadata'), // Engine-specific metadata, performance stats
  createdAt: timestamp('created_at').defaultNow()
});

export const gpuPerformanceMetrics = pgTable('gpu_performance_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => gpuInferenceSessions.id),
  engineType: text('engine_type').notNull(), // webgpu, vllm, ollama, etc.
  requestCount: integer('request_count'),
  avgResponseTime: real('avg_response_time'),
  cacheHitRate: real('cache_hit_rate'),
  tokensPerSecond: real('tokens_per_second'),
  gpuUtilization: real('gpu_utilization'),
  memoryUsage: real('memory_usage'),
  errorCount: integer('error_count'),
  metadata: jsonb('metadata'), // Detailed performance data
  measuredAt: timestamp('measured_at').defaultNow()
});

export const aiEngineStatus = pgTable('ai_engine_status', {
  id: uuid('id').primaryKey().defaultRandom(),
  engineName: text('engine_name').notNull().unique(), // ollama, webgpu, vllm, etc.
  isOnline: boolean('is_online').default(false),
  lastHealthCheck: timestamp('last_health_check').defaultNow(),
  responseTime: integer('response_time'), // Health check response time
  version: text('version'),
  capabilities: jsonb('capabilities'), // What features this engine supports
  configuration: jsonb('configuration'), // Engine-specific config
  errorStatus: text('error_status'),
  metadata: jsonb('metadata')
});



