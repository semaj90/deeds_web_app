/**
 * Engram Protocol Types — Canonical schema for memory orchestration
 * Defines retrieval traces, rewards, promotions, and policy versioning
 */

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════
// Enums
// ═══════════════════════════════════════════════════════════════════════

export const PromotionStateSchema = z.enum(['active', 'superseded', 'archived', 'rejected']);
export type PromotionState = z.infer<typeof PromotionStateSchema>;

export const RetrievalKindSchema = z.enum(['chunk', 'summary', 'card']);
export type RetrievalKind = z.infer<typeof RetrievalKindSchema>;

export const RewardActionSchema = z.enum(['promote', 'demote', 'feedback_up', 'feedback_down', 'click']);
export type RewardAction = z.infer<typeof RewardActionSchema>;

export const ENGRAM_SCHEMA_VERSION = 1;

// ═══════════════════════════════════════════════════════════════════════
// Retrieval Trace Schema
// ═══════════════════════════════════════════════════════════════════════

export const RetrievalResultSchema = z.object({
  id: z.string().uuid(),
  score: z.number().min(0).max(1),
  sourceRef: z.string(),
  kind: RetrievalKindSchema,
  provenance: z.object({
    collection: z.string(),
    qdrantId: z.string().optional(),
    qdrantScore: z.number().optional(),
    neo4jNode: z.string().optional(),
    neo4jEdge: z.string().optional(),
  }).strict(),
});
export type RetrievalResult = z.infer<typeof RetrievalResultSchema>;

export const RetrievalTraceSchema = z.object({
  traceId: z.string().uuid(),
  createdAt: z.date(),
  query: z.string().max(4000),
  queryHash: z.string().length(64),
  policy: z.string(),
  policyVersion: z.number().int().min(1),
  maxResults: z.number().int().min(1).max(100),
  retrieved: z.array(RetrievalResultSchema),
  aggregateConfidence: z.number().min(0).max(1),
  durationMs: z.number().int(),
  userId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  version: z.number().int().min(1),
});
export type RetrievalTrace = z.infer<typeof RetrievalTraceSchema>;

// ═══════════════════════════════════════════════════════════════════════
// Reward / Telemetry Schema
// ═══════════════════════════════════════════════════════════════════════

export const RewardEventSchema = z.object({
  eventId: z.string().uuid(),
  traceId: z.string().uuid().optional(),
  actor: z.string(),
  action: RewardActionSchema,
  delta: z.number(),
  reason: z.string().max(500),
  createdAt: z.date(),
  sourceRefs: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type RewardEvent = z.infer<typeof RewardEventSchema>;

// ═══════════════════════════════════════════════════════════════════════
// Request/Response Schemas
// ═══════════════════════════════════════════════════════════════════════

export const RecallRequestSchema = z.object({
  query: z.string().max(4000),
  maxResults: z.number().int().min(1).max(100).default(10),
  policy: z.string().default('ace_v1'),
  userId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
});
export type RecallRequest = z.infer<typeof RecallRequestSchema>;

export const RecallResponseSchema = z.object({
  traceId: z.string().uuid(),
  results: z.array(RetrievalResultSchema),
  policyUsed: z.string(),
  policyVersion: z.number().int(),
  aggregateConfidence: z.number().min(0).max(1),
  durationMs: z.number().int(),
});
export type RecallResponse = z.infer<typeof RecallResponseSchema>;

export const PromoteRequestSchema = z.object({
  itemId: z.string().uuid(),
  promotion: PromotionStateSchema,
  reason: z.string().max(500),
  actor: z.string(),
  sourceRefs: z.array(z.string()).optional(),
});
export type PromoteRequest = z.infer<typeof PromoteRequestSchema>;

export const PromoteResponseSchema = z.object({
  ok: z.boolean(),
  updated: z.object({
    itemId: z.string().uuid(),
    promotion: PromotionStateSchema,
    updatedAt: z.date(),
  }).optional(),
  error: z.string().optional(),
});
export type PromoteResponse = z.infer<typeof PromoteResponseSchema>;

export const LogRequestSchema = z.object({
  traceId: z.string().uuid(),
  tool: z.string(),
  args: z.record(z.string(), z.unknown()).optional(),
  result: z.enum(['ok', 'fail', 'timeout']),
  durationMs: z.number().int(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type LogRequest = z.infer<typeof LogRequestSchema>;

export const LogResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
});
export type LogResponse = z.infer<typeof LogResponseSchema>;

// ═══════════════════════════════════════════════════════════════════════
// MCP JSON-RPC Envelopes
// ═══════════════════════════════════════════════════════════════════════

export const MCPRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.enum(['engram.recall', 'engram.promote', 'engram.log']),
  params: z.union([RecallRequestSchema, PromoteRequestSchema, LogRequestSchema]),
  id: z.union([z.string(), z.number()]),
});
export type MCPRequest = z.infer<typeof MCPRequestSchema>;

export const MCPResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  result: z.union([RecallResponseSchema, PromoteResponseSchema, LogResponseSchema]).optional(),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  id: z.union([z.string(), z.number()]),
});
export type MCPResponse = z.infer<typeof MCPResponseSchema>;

// ═══════════════════════════════════════════════════════════════════════
// Memory Artifact Schema
// ═══════════════════════════════════════════════════════════════════════

export const MemoryArtifactSchema = z.object({
  id: z.string().uuid(),
  kind: RetrievalKindSchema,
  promotion: PromotionStateSchema,
  title: z.string().max(200),
  content: z.string().max(8000),
  grpoScore: z.number().min(0).max(1),
  sourceRefs: z.array(z.string()),
  tags: z.array(z.string()).optional(),
  hitCount: z.number().int().min(0).default(0),
  lastHitAt: z.date().optional(),
  supersededBy: z.string().uuid().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  expiresAt: z.date().optional(),
});
export type MemoryArtifact = z.infer<typeof MemoryArtifactSchema>;

// ═══════════════════════════════════════════════════════════════════════
// Policy Config (versioned retrieval strategy)
// ═══════════════════════════════════════════════════════════════════════

export const PolicyConfigSchema = z.object({
  name: z.string(),
  version: z.number().int().min(1),
  description: z.string().optional(),
  qdrantWeight: z.number().min(0).max(1).default(0.6),
  neo4jWeight: z.number().min(0).max(1).default(0.4),
  minConfidence: z.number().min(0).max(1).default(0.3),
  rerankMethod: z.string().default('karpathy_blend'),
  maxResults: z.number().int().min(1).max(100).default(10),
  createdAt: z.date(),
  active: z.boolean().default(true),
});
export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;
