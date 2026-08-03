import { z } from 'zod';

/**
 * Phase 18 XGBoost Reranker — Canonical Payload Envelope Schema
 *
 * Defines the canonical envelope contract for:
 * - MCP JSON 2.0 tool calls/responses
 * - tRPC procedure arguments/returns
 * - Mastra agent orchestration
 * - Service Worker offline storage
 * - Postgres persistence (task_semantic_packets)
 *
 * Single source of truth for all Phase 18 payloads across transport layers.
 */

// ══════════════════════════════════════════════════════════════
// ENVELOPE METADATA (Common to all transports)
// ══════════════════════════════════════════════════════════════

export const envelopeMetadataSchema = z.object({
  /** Unique identifier for this envelope (UUIDv4) */
  envelopeId: z.string().uuid(),

  /** Phase identifier (always '18' for reranker) */
  phase: z.literal(18),

  /** Timestamp when envelope created (ISO 8601) */
  createdAt: z.string().datetime(),

  /** Source of envelope (mcp | trpc | mastra | worker) */
  source: z.enum(['mcp', 'trpc', 'mastra', 'worker']),

  /** Protocol version (for backwards compatibility) */
  version: z.literal('1.0'),

  /** Correlation ID for tracing across services */
  correlationId: z.string().uuid().optional(),

  /** Request ID from parent (MCP/tRPC) */
  requestId: z.string().optional(),

  /** Operational mode */
  mode: z.enum(['training', 'inference', 'evaluation']).default('inference'),
});

export type EnvelopeMetadata = z.infer<typeof envelopeMetadataSchema>;

// ══════════════════════════════════════════════════════════════
// FEATURE VECTOR (canonical format, matches training schema)
// ══════════════════════════════════════════════════════════════

export const featureVectorSchema = z.object({
  /** 13-dimensional feature vector for XGBoost input */
  values: z.array(z.number().min(0).max(1)).length(13),

  /** Feature names for debugging/introspection */
  names: z.array(z.string()).length(13).optional(),

  /** Normalization applied */
  normalization: z.object({
    qdrantScore: z.object({ min: z.number(), max: z.number() }),
    clusterScore: z.object({ min: z.number(), max: z.number() }),
    topologicalScore: z.object({ min: z.number(), max: z.number() }),
    fusionScore: z.object({ min: z.number(), max: z.number() }),
    authorityScore: z.object({ min: z.number(), max: z.number() }),
    memberCount: z.object({ min: z.number(), max: z.number() }).optional(),
    summaryLength: z.object({ min: z.number(), max: z.number() }).optional(),
    sourceRefDepth: z.object({ min: z.number(), max: z.number() }).optional(),
  }).optional(),
});

export type FeatureVector = z.infer<typeof featureVectorSchema>;

// ══════════════════════════════════════════════════════════════
// PREDICTION RESULT (canonical format)
// ══════════════════════════════════════════════════════════════

export const predictionResultSchema = z.object({
  /** Unique packet identifier (from Phase 17) */
  packetKey: z.string(),

  /** Reranking score [0, 1] from XGBoost model */
  rerankScore: z.number().min(0).max(1),

  /** Model confidence [0, 1] */
  confidence: z.number().min(0).max(1),

  /** Optional explanation of score */
  reason: z.string().optional(),

  /** Which model version produced this score */
  modelVersion: z.string().optional(),

  /** Latency in milliseconds */
  latencyMs: z.number().min(0).optional(),
});

export type PredictionResult = z.infer<typeof predictionResultSchema>;

// ══════════════════════════════════════════════════════════════
// REQUEST ENVELOPE (input to Phase 18)
// ══════════════════════════════════════════════════════════════

export const phase18RequestEnvelopeSchema = z.object({
  /** Envelope metadata (common to all transports) */
  metadata: envelopeMetadataSchema,

  /** Batch of packets to rerank */
  packets: z.array(
    z.object({
      packetKey: z.string(),
      sourceRef: z.string(),
      featureId: z.string(),
      features: featureVectorSchema,
    })
  ),

  /** Optional request context */
  context: z.object({
    userId: z.string().optional(),
    sessionId: z.string().optional(),
    queryHash: z.string().optional(),
    batchId: z.string().optional(),
  }).optional(),

  /** Optional model override (defaults to canonical) */
  modelPath: z.string().optional(),

  /** Optional parameters */
  params: z.object({
    topK: z.number().int().min(1).default(10),
    returnReasons: z.boolean().default(false),
    returnLatency: z.boolean().default(false),
  }).optional(),
});

export type Phase18RequestEnvelope = z.infer<typeof phase18RequestEnvelopeSchema>;

// ══════════════════════════════════════════════════════════════
// RESPONSE ENVELOPE (output from Phase 18)
// ══════════════════════════════════════════════════════════════

export const phase18ResponseEnvelopeSchema = z.object({
  /** Envelope metadata (common to all transports) */
  metadata: envelopeMetadataSchema,

  /** Request ID this responds to */
  requestId: z.string(),

  /** Success indicator */
  success: z.boolean(),

  /** Prediction results (one per input packet) */
  results: z.array(predictionResultSchema),

  /** Summary statistics */
  summary: z.object({
    totalPackets: z.number().int().min(0),
    successCount: z.number().int().min(0),
    errorCount: z.number().int().min(0),
    avgScore: z.number().min(0).max(1).optional(),
    avgConfidence: z.number().min(0).max(1).optional(),
    totalLatencyMs: z.number().min(0).optional(),
  }).optional(),

  /** Error message if success === false */
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }).optional(),

  /** Cache metadata for offline/service worker use */
  cache: z.object({
    cacheKey: z.string().optional(),
    ttlSeconds: z.number().int().min(0).default(3600),
    canCache: z.boolean().default(true),
  }).optional(),
});

export type Phase18ResponseEnvelope = z.infer<typeof phase18ResponseEnvelopeSchema>;

// ══════════════════════════════════════════════════════════════
// BATCH ENVELOPE (for Mastra agent orchestration)
// ══════════════════════════════════════════════════════════════

export const phase18BatchEnvelopeSchema = z.object({
  /** Envelope metadata */
  metadata: envelopeMetadataSchema,

  /** Batch identifier */
  batchId: z.string().uuid(),

  /** Total packets in batch */
  totalPackets: z.number().int().min(1),

  /** Current chunk index (0-based) */
  chunkIndex: z.number().int().min(0),

  /** Total chunks in batch */
  totalChunks: z.number().int().min(1),

  /** Packets in this chunk */
  packets: z.array(
    z.object({
      packetKey: z.string(),
      sourceRef: z.string(),
      featureId: z.string(),
      features: featureVectorSchema,
    })
  ),

  /** Mastra agent context */
  agent: z.object({
    agentId: z.string().optional(),
    workflowId: z.string().optional(),
    stepId: z.string().optional(),
  }).optional(),

  /** Retry metadata for resilience */
  retry: z.object({
    attempt: z.number().int().min(1).default(1),
    maxAttempts: z.number().int().min(1).default(3),
    backoffMs: z.number().int().min(0).default(1000),
  }).optional(),
});

export type Phase18BatchEnvelope = z.infer<typeof phase18BatchEnvelopeSchema>;

// ══════════════════════════════════════════════════════════════
// OFFLINE STORAGE ENVELOPE (Service Worker persistence)
// ══════════════════════════════════════════════════════════════

export const offlineStorageEnvelopeSchema = z.object({
  /** Storage metadata */
  storageId: z.string().uuid(),

  /** Type of payload stored */
  payloadType: z.enum(['request', 'response', 'batch']),

  /** Compressed/serialized payload (JSON) */
  payload: z.record(z.string(), z.unknown()),

  /** Storage timestamp */
  storedAt: z.string().datetime(),

  /** Expiration time */
  expiresAt: z.string().datetime(),

  /** Storage layer (indexeddb | localstorage | cache) */
  storageLayer: z.enum(['indexeddb', 'localstorage', 'cache']),

  /** Sync status for offline-first */
  syncStatus: z.enum(['pending', 'syncing', 'synced', 'failed']).default('pending'),

  /** Retry attempts for sync */
  syncAttempts: z.number().int().min(0).default(0),
});

export type OfflineStorageEnvelope = z.infer<typeof offlineStorageEnvelopeSchema>;

// ══════════════════════════════════════════════════════════════
// MCP TOOL SCHEMA (for MCP 2.0 JSON transport)
// ══════════════════════════════════════════════════════════════

export const mcpToolInputSchema = z.object({
  packetKeys: z.array(z.string()).min(1).describe('Packet identifiers to rerank'),
  features: z.array(featureVectorSchema).describe('Feature vectors for each packet'),
  topK: z.number().int().min(1).default(10).describe('Return top K results'),
  returnReasons: z.boolean().default(false).describe('Include explanation for scores'),
});

export type MCPToolInput = z.infer<typeof mcpToolInputSchema>;

// ══════════════════════════════════════════════════════════════
// tRPC PROCEDURE SCHEMA (for tRPC transport)
// ══════════════════════════════════════════════════════════════

export const trpcProcedureInputSchema = phase18RequestEnvelopeSchema.extend({
  /** tRPC-specific context */
  trpcContext: z.object({
    userId: z.string().optional(),
    sessionId: z.string().optional(),
    isAuthenticated: z.boolean().optional(),
  }).optional(),
});

export type TRPCProcedureInput = z.infer<typeof trpcProcedureInputSchema>;

// ══════════════════════════════════════════════════════════════
// MASTRA AGENT MESSAGE ENVELOPE
// ══════════════════════════════════════════════════════════════

export const mastraAgentMessageSchema = z.object({
  /** Message ID */
  id: z.string().uuid(),

  /** Agent workflow ID */
  workflowId: z.string(),

  /** Step ID in workflow */
  stepId: z.string(),

  /** Message type */
  type: z.enum(['request', 'response', 'status', 'error']),

  /** Payload (flexible for agent framework) */
  payload: z.union([
    phase18RequestEnvelopeSchema,
    phase18ResponseEnvelopeSchema,
    phase18BatchEnvelopeSchema,
  ]),

  /** Agent-specific metadata */
  metadata: z.object({
    toolName: z.string().default('phase18_reranker'),
    toolVersion: z.string().default('1.0'),
    executionTime: z.number().optional(),
    retries: z.number().int().min(0).optional(),
  }).optional(),
});

export type MastraAgentMessage = z.infer<typeof mastraAgentMessageSchema>;

// ══════════════════════════════════════════════════════════════
// DATABASE PERSISTENCE SCHEMA (Postgres task_semantic_packets)
// ══════════════════════════════════════════════════════════════

export const databaseEnvelopeSchema = z.object({
  /** Primary key (auto-generated) */
  id: z.string().uuid().optional(),

  /** Foreign key to Phase 17 output */
  packetKey: z.string(),

  /** Source reference (file path, etc.) */
  sourceRef: z.string(),

  /** Feature ID (domain classifier) */
  featureId: z.string(),

  /** Feature label (human-readable) */
  featureLabel: z.string(),

  /** Alias ID (phase 10-19 reconciliation) */
  aliasId: z.string(),

  /** Score lanes from Phase 17 */
  qdrantScore: z.number().min(0).max(1),
  clusterScore: z.number().min(0).max(1),
  topologicalScore: z.number().min(0).max(1),
  fusionScore: z.number().min(0).max(1),

  /** Phase 18 prediction result */
  rerankScore: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),

  /** Feature metadata (JSONB) */
  metadata: z.record(z.string(), z.unknown()).optional(),

  /** Validation status */
  validationStatus: z.enum(['valid', 'pending', 'invalid']).optional(),

  /** Error message if validation failed */
  errorMessage: z.string().optional(),

  /** Audit timestamps */
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type DatabaseEnvelope = z.infer<typeof databaseEnvelopeSchema>;

// ══════════════════════════════════════════════════════════════
// UNION TYPES (for type-safe routing)
// ══════════════════════════════════════════════════════════════

export const envelopeUnionSchema = z.union([
  phase18RequestEnvelopeSchema.extend({ type: z.literal('request') }),
  phase18ResponseEnvelopeSchema.extend({ type: z.literal('response') }),
  phase18BatchEnvelopeSchema.extend({ type: z.literal('batch') }),
  offlineStorageEnvelopeSchema.extend({ type: z.literal('offline') }),
  mastraAgentMessageSchema.extend({ type: z.literal('agent') }),
]);

export type Envelope = z.infer<typeof envelopeUnionSchema>;

// ══════════════════════════════════════════════════════════════
// EXPORT CANONICAL SCHEMA (single source of truth)
// ══════════════════════════════════════════════════════════════

export const phase18CanonicalSchema = {
  metadata: envelopeMetadataSchema,
  request: phase18RequestEnvelopeSchema,
  response: phase18ResponseEnvelopeSchema,
  batch: phase18BatchEnvelopeSchema,
  offline: offlineStorageEnvelopeSchema,
  mcp: mcpToolInputSchema,
  trpc: trpcProcedureInputSchema,
  mastra: mastraAgentMessageSchema,
  database: databaseEnvelopeSchema,
  union: envelopeUnionSchema,
};

export const validatePhase18Request = (data: unknown) => {
  return phase18RequestEnvelopeSchema.safeParse(data);
};

export const validatePhase18Response = (data: unknown) => {
  return phase18ResponseEnvelopeSchema.safeParse(data);
};

export const validateEnvelope = (data: unknown) => {
  return envelopeUnionSchema.safeParse(data);
};
