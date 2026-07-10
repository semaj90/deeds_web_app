import { z } from 'zod';

// ============================================================================
// Cache Key Contract — Stable Input → Stable Key
// ============================================================================

export const CacheKeyInputSchema = z.object({
  model: z.string().min(1),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string()
  })),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  maxTokens: z.number().int().positive().optional().default(1024),
  topP: z.number().min(0).max(1).optional().default(0.95)
});

export type CacheKeyInput = z.infer<typeof CacheKeyInputSchema>;

// Deterministic cache key: SHA-256(sorted JSON)
export function generateStableCacheKey(input: CacheKeyInput): string {
  const crypto = require('crypto');
  const normalized = {
    model: input.model,
    messages: input.messages.map(m => ({ role: m.role, content: m.content })),
    temperature: input.temperature ?? 0.7,
    maxTokens: input.maxTokens ?? 1024,
    topP: input.topP ?? 0.95
  };
  const json = JSON.stringify(normalized, Object.keys(normalized).sort());
  return crypto.createHash('sha256').update(json).digest('hex');
}

// ============================================================================
// Health Check Contract — No Auth, No Side Effects
// ============================================================================

export const HealthCheckResponseSchema = z.object({
  ready: z.boolean(),
  backend: z.literal('valkey'),
  timestamp: z.number().int()
});

export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;

// ============================================================================
// SOM Lookup Contract — Exact Cell + Neighbors
// ============================================================================

export interface SomCell {
  row: number;
  col: number;
}

export interface SomNeighborSet {
  exact: SomCell;
  neighbors: SomCell[]; // 8-neighbor radius
  isExact: (cell: SomCell) => boolean;
}

// ============================================================================
// LOD Manifest Contract — 4 Levels of Detail
// ============================================================================

export const PacketLodManifestSchema = z.object({
  // Identity
  packetKey: z.string(),
  sourceRef: z.string(),
  featureId: z.string().optional(),
  treeNodeId: z.string().optional(),

  // Level of Detail (0=minimum, 3=full)
  lod: z.enum(['0', '1', '2', '3']),
  cacheClass: z.enum(['hot', 'warm', 'cold']),

  // Content Metadata
  contentHash: z.string(),
  byteLength: z.number().int().nonnegative(),
  tokenCount: z.number().int().nonnegative().optional(),

  // SOM Topology
  somRow: z.number().int().optional(),
  somCol: z.number().int().optional(),
  neighborCells: z.array(z.tuple([z.number(), z.number()])).optional(),
  communityId: z.number().int().optional(),

  // Lifecycle
  generatedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  promotionState: z.enum(['winner', 'near-winner', 'loser', 'cold-archive']).optional()
});

export type PacketLodManifest = z.infer<typeof PacketLodManifestSchema>;

export const LOD_LEVELS = {
  0: {
    name: 'Identity',
    fields: ['packetKey', 'title', 'sourceRef'],
    use: 'search result list'
  },
  1: {
    name: 'Summary',
    fields: ['summary', 'keywords', 'domain', 'contentHash'],
    use: 'hover preview'
  },
  2: {
    name: 'Context',
    fields: ['acePacket', 'graphNeighbors', 'provenance'],
    use: 'selected result'
  },
  3: {
    name: 'Full',
    fields: ['completeContent', 'document', 'evidence'],
    use: 'deep inspection'
  }
};

// ============================================================================
// Promotion Decision Contract — Winner/Loser Tracking
// ============================================================================

export const RetrievalPromotionDecisionSchema = z.object({
  traceId: z.string().uuid(),
  packetKey: z.string(),
  rank: z.number().int().nonnegative(),
  finalScore: z.number().min(0).max(1),
  selected: z.boolean(),

  destination: z.enum([
    'browser-l1',      // Hot cache: L1 memory + SW
    'valkey-hot',      // Hot Redis: TTL 3600s
    'valkey-warm',     // Warm Redis: TTL 86400s
    'analytics-only',  // Telemetry only, no cache
    'cold-archive'     // CouchDB/S3 for later replay
  ]),

  reasonCodes: z.array(z.string()),
  timestamp: z.string().datetime(),
  validationGatePassed: z.boolean()
});

export type RetrievalPromotionDecision = z.infer<typeof RetrievalPromotionDecisionSchema>;

// ============================================================================
// Validation Gates — Hard Fail Conditions
// ============================================================================

export interface ValidationGate {
  name: string;
  check: (packet: any) => boolean;
  reason: string;
}

export const HARD_FAIL_GATES: ValidationGate[] = [
  {
    name: 'packet_key_required',
    check: (p) => !!p.packet_key && p.packet_key.length > 0,
    reason: 'missing packet_key'
  },
  {
    name: 'source_ref_required',
    check: (p) => !!p.source_ref && p.source_ref.length > 0,
    reason: 'missing source_ref'
  },
  {
    name: 'feature_id_required',
    check: (p) => !!p.feature_id && p.feature_id.length > 0,
    reason: 'missing feature_id'
  },
  {
    name: 'content_hash_required',
    check: (p) => !!p.content_hash && p.content_hash.length === 64,
    reason: 'missing or malformed content_hash'
  }
];

export function validatePacketIdentity(packet: any): { passed: boolean; failed: string[] } {
  const failed: string[] = [];
  for (const gate of HARD_FAIL_GATES) {
    if (!gate.check(packet)) {
      failed.push(gate.reason);
    }
  }
  return { passed: failed.length === 0, failed };
}
