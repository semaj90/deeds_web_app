import { z } from 'zod';

// Promotion state for a memory
export const EngramPromotionStateSchema = z.enum(['active', 'superseded', 'archived', 'rejected']);
export type EngramPromotionState = z.infer<typeof EngramPromotionStateSchema>;

// Core memory record (Atlas Card-like compact representation)
export const EngramMemorySchema = z.object({
  id: z.string().optional(),
  sourceRef: z.string(), // required for promoted memory
  title: z.string().optional(),
  summary: z.string().optional(),
  cluster: z.number().optional(),
  somX: z.number().optional(),
  somY: z.number().optional(),
  authority: z.number().optional(), // 0..1
  reward: z.number().optional(), // 0..1
  vector768: z.array(z.number()).length(768).optional(),
  vector64: z.array(z.number()).length(64).optional(),
  graphPaths: z.array(z.string()).optional(),
  sourceTags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
  createdAt: z.string().optional(),
  graphVersion: z.string(), // required per spec
  promotionState: EngramPromotionStateSchema.optional(),
});
export type EngramMemory = z.infer<typeof EngramMemorySchema>;

// Session-level context that Engram manages for injection
export const EngramSessionContextSchema = z.object({
  sessionId: z.string(),
  userId: z.string().optional(),
  intent: z.string().optional(),
  recentEngramIds: z.array(z.string()).optional(),
  engramSummary: z.string().optional(),
  createdAt: z.string().optional(),
  graphVersion: z.string(),
});
export type EngramSessionContext = z.infer<typeof EngramSessionContextSchema>;

// Request to inject one or more memories into a session (KV or context)
export const EngramInjectionRequestSchema = z.object({
  requestId: z.string().optional(),
  sessionId: z.string(),
  userId: z.string().optional(),
  mode: z.enum(['dry', 'apply']).default('dry'),
  injectTo: z.enum(['kv', 'context']).default('kv'),
  maxTokens: z.number().optional(),
  memories: z.array(EngramMemorySchema).optional(), // inline memories
  memoryIds: z.array(z.string()).optional(), // or references
  graphVersion: z.string(),
});
export type EngramInjectionRequest = z.infer<typeof EngramInjectionRequestSchema>;

// Result of an injection attempt
export const EngramInjectionResultSchema = z.object({
  requestId: z.string().optional(),
  sessionId: z.string(),
  injectedCount: z.number(),
  injectedIds: z.array(z.string()).optional(),
  mode: z.enum(['dry', 'apply']),
  success: z.boolean(),
  reason: z.string().optional(),
  trace: z.array(z.any()).optional(),
});
export type EngramInjectionResult = z.infer<typeof EngramInjectionResultSchema>;

// Outcome trace for events, promotions, injections
export const EngramOutcomeTraceSchema = z.object({
  id: z.string().optional(),
  timestamp: z.string(),
  action: z.enum(['record_outcome', 'promote', 'inject', 'supersede', 'archive']).optional(),
  actor: z.string().optional(),
  details: z.record(z.any()).optional(),
});
export type EngramOutcomeTrace = z.infer<typeof EngramOutcomeTraceSchema>;

// Promotion state record persisted for auditing
export const EngramPromotionStateRecordSchema = z.object({
  memoryId: z.string(),
  promotedAt: z.string(),
  promotedBy: z.string().optional(),
  promotionState: EngramPromotionStateSchema,
  reason: z.string().optional(),
  sourceRefs: z.array(z.string()), // required for promoted memory
  graphVersion: z.string(),
  metadata: z.record(z.any()).optional(),
});
export type EngramPromotionStateRecord = z.infer<typeof EngramPromotionStateRecordSchema>;

// Convenience exports for validation usage
export const Schemas = {
  EngramMemorySchema,
  EngramSessionContextSchema,
  EngramInjectionRequestSchema,
  EngramInjectionResultSchema,
  EngramOutcomeTraceSchema,
  EngramPromotionStateRecordSchema,
};

// Example usage (runtime validation)
/*
import { Schemas } from './engram-types';
const req = Schemas.EngramInjectionRequestSchema.parse(payload);
*/

export default Schemas;
