/**
 * Cache Configuration — Centralized TTLs, Key Patterns, and Zod Schemas
 *
 * Single source of truth for cache behavior across all patterns.
 */

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════
// TTL Constants (seconds)
// ═══════════════════════════════════════════════════════════════════════

export const CACHE_TTL = {
  // Embedding cache (7 days)
  EMBEDDING: 7 * 24 * 60 * 60,

  // Authority scores (24 hours)
  AUTHORITY: 24 * 60 * 60,

  // Case timeline (2 hours)
  CASE_TIMELINE: 2 * 60 * 60,

  // Entity extraction (7 days)
  ENTITY: 7 * 24 * 60 * 60,

  // Invalidation registry (1 hour)
  INVALIDATION: 60 * 60,

  // ACE context packet (1 hour)
  ACE_CONTEXT: 60 * 60,

  // KAG results (5 minutes)
  KAG: 5 * 60,

  // Search analytics (1 hour)
  ANALYTICS: 60 * 60,

  // Short-lived session data (30 minutes)
  SESSION: 30 * 60,
} as const;

// ═══════════════════════════════════════════════════════════════════════
// Key Pattern Templates
// ═══════════════════════════════════════════════════════════════════════

export const CACHE_KEYS = {
  // Embeddings: embed:v2:{model}:{hash}
  EMBEDDING: (model: string, hash: string) => `embed:v2:${model}:${hash}`,

  // Authority scores: authority:blend:{fileId}
  AUTHORITY_BLEND: (fileId: string) => `authority:blend:${fileId}`,

  // Case timeline: case:timeline:{caseId}
  CASE_TIMELINE: (caseId: string) => `case:timeline:${caseId}`,

  // Entity extraction: entities:{contentHash}
  ENTITIES: (contentHash: string) => `entities:${contentHash}`,

  // Invalidation registry: cache:registry:{event}
  INVALIDATION_REGISTRY: (event: string) => `cache:registry:${event}`,

  // ACE context: ace:ctx:{queryHash}
  ACE_CONTEXT: (queryHash: string) => `ace:ctx:${queryHash}`,

  // KAG results: kag:search:{queryId}
  KAG_SEARCH: (queryId: string) => `kag:search:${queryId}`,

  // Search analytics: search:analytics:{userId}
  SEARCH_ANALYTICS: (userId: string) => `search:analytics:${userId}`,

  // Session data: session:{sessionId}
  SESSION: (sessionId: string) => `session:${sessionId}`,
} as const;

// ═══════════════════════════════════════════════════════════════════════
// Zod Schemas for Validation
// ═══════════════════════════════════════════════════════════════════════

export const EmbeddingSchema = z.object({
  model: z.string(),
  hash: z.string(),
  embedding: z.array(z.number()),
  dimension: z.number(),
  createdAt: z.string().optional(),
});
export type EmbeddingData = z.infer<typeof EmbeddingSchema>;

export const AuthorityScoreSchema = z.object({
  fileId: z.string(),
  pr: z.number(), // PageRank
  attn: z.number(), // Attention
  authority: z.number(),
  composite: z.number(), // 0.4*PR + 0.3*attn + 0.3*authority
});
export type AuthorityScore = z.infer<typeof AuthorityScoreSchema>;

export const TimelineEventSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  caseId: z.string(),
  eventType: z.enum(['citation_saved', 'dwell_long', 'dwell_short', 'rl_adapt']),
  details: z.record(z.string(), z.any()).optional(),
});
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

export const EntitySchema = z.object({
  type: z.enum(['EMAIL', 'PHONE', 'DATE', 'CITATION', 'STATUTE', 'MONEY']),
  value: z.string(),
  confidence: z.number(),
  position: z.object({ start: z.number(), end: z.number() }).optional(),
});
export type Entity = z.infer<typeof EntitySchema>;

export const InvalidationEventSchema = z.object({
  event: z.string(),
  affectedKeys: z.array(z.string()),
  timestamp: z.string(),
  reason: z.string().optional(),
});
export type InvalidationEvent = z.infer<typeof InvalidationEventSchema>;

export const ACEContextSchema = z.object({
  queryHash: z.string(),
  chunks: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      score: z.number(),
    })
  ),
  metadata: z.record(z.string(), z.any()).optional(),
});
export type ACEContext = z.infer<typeof ACEContextSchema>;

// ═══════════════════════════════════════════════════════════════════════
// Cache Configuration Preset (for different use cases)
// ═══════════════════════════════════════════════════════════════════════

export const CACHE_PRESETS = {
  // Long-lived static data
  STATIC: { ttlSeconds: CACHE_TTL.EMBEDDING, persistent: true },

  // User-scoped data with moderate TTL
  USER: { ttlSeconds: CACHE_TTL.CASE_TIMELINE, persistent: false },

  // Hot data with short TTL
  HOT: { ttlSeconds: CACHE_TTL.KAG, persistent: false },

  // System metadata
  SYSTEM: { ttlSeconds: CACHE_TTL.AUTHORITY, persistent: true },
} as const;

// ═══════════════════════════════════════════════════════════════════════
// Cache Statistics (observability)
// ═══════════════════════════════════════════════════════════════════════

export interface CacheStats {
  hits: number;
  misses: number;
  errors: number;
  avgHitLatencyMs: number;
  avgMissLatencyMs: number;
  hitRate: number; // hits / (hits + misses)
}

export const createEmptyCacheStats = (): CacheStats => ({
  hits: 0,
  misses: 0,
  errors: 0,
  avgHitLatencyMs: 0,
  avgMissLatencyMs: 0,
  hitRate: 0,
});
