/**
 * HyperRAG RPC Client
 * Multi-file dense retrieval via packet indexing
 * Bridges TurboVec ANN → Postgres canonical packets → ACE materialization
 */

import { z } from 'zod';
import type { AtlasPacket } from '$lib/server/db/schema/atlas-packets.js';

export const HyperRAGRequestSchema = z.object({
  query: z.string().min(1),
  traceId: z.string().uuid(),
  featureIds: z.array(z.string()).optional(),
  sourceRefs: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  useCache: z.boolean().default(true),
  rerankerWeight: z.number().min(0).max(1).default(0.3),
  domains: z.array(z.string()).optional(),
});

export type HyperRAGRequest = z.infer<typeof HyperRAGRequestSchema>;

export const HyperRAGCandidateSchema = z.object({
  packetKey: z.string(),
  featureId: z.string(),
  sourceRef: z.string(),
  summary: z.string().optional(),
  domain: z.string().optional(),
  score: z.number(),
  source: z.enum(['redis', 'postgres', 'turbovec', 'qdrant', 'neo4j']),
  confidence: z.number().min(0).max(1),
  metadata: z.record(z.unknown()).optional(),
});

export type HyperRAGCandidate = z.infer<typeof HyperRAGCandidateSchema>;

export const HyperRAGTimingsSchema = z.object({
  cache: z.number().optional(),
  postgres: z.number().optional(),
  turbovec: z.number().optional(),
  qdrant: z.number().optional(),
  rerank: z.number().optional(),
  total: z.number(),
});

export type HyperRAGTimings = z.infer<typeof HyperRAGTimingsSchema>;

export const HyperRAGResponseSchema = z.object({
  traceId: z.string().uuid(),
  query: z.string(),
  candidates: z.array(HyperRAGCandidateSchema),
  timings: HyperRAGTimingsSchema,
  cacheHit: z.boolean(),
  statistics: z.object({
    totalMatched: z.number(),
    postgresRows: z.number(),
    turboVecRows: z.number(),
    qdrantRows: z.number(),
    reranked: z.number(),
  }),
});

export type HyperRAGResponse = z.infer<typeof HyperRAGResponseSchema>;

/**
 * HyperRAG retrieval pipeline state
 * Tracks packets through map/reduce summarization and index materialization
 */
export interface HyperRAGPacketState {
  packetKey: string;
  featureId: string;
  sourceRef: string;
  domain?: string;
  summary: string;
  chunkCount: number;
  tokenEstimate: number;
  embeddingModel: string;
  clusterId?: number;
  parentPacketKey?: string;
  traceId: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * HyperRAG retrieval contract
 * Validates cache → Postgres → TurboVec fallback chain
 */
export interface HyperRAGRetrievalContract {
  // L1: Redis exact match on query hash
  cacheKey: (query: string, featureIds?: string[]) => string;
  cacheHit: (key: string) => Promise<HyperRAGCandidate[] | null>;
  cacheMiss: (key: string, candidates: HyperRAGCandidate[], ttl?: number) => Promise<void>;

  // L2: Postgres feature_id + source_ref lookup
  postgresLookup: (query: string, featureIds?: string[], limit?: number) => Promise<HyperRAGCandidate[]>;

  // L3: TurboVec multi-file ANN
  turboVecSearch: (embedding: number[], limit?: number, domains?: string[]) => Promise<HyperRAGCandidate[]>;

  // L4: Qdrant dense fallback
  qdrantSearch: (embedding: number[], limit?: number) => Promise<HyperRAGCandidate[]>;

  // L5: Neo4j topology neighbors
  neo4jNeighbors: (sourceRef: string, hopLimit?: number) => Promise<HyperRAGCandidate[]>;
}

/**
 * HyperRAG packet pipeline
 * Materializes features → summaries → embeddings → index
 */
export interface HyperRAGPacketPipeline {
  // Feature extraction phase
  extractFeatures: (sourcePath: string, text: string) => Promise<string[]>;

  // Feature normalization phase
  normalizeFeatureIds: (candidates: string[]) => Promise<string[]>;

  // Summarization phase
  summarizeChunks: (chunks: string[], featureIds: string[]) => Promise<Map<string, string>>;

  // Materialization phase
  materializePackets: (packets: HyperRAGPacketState[]) => Promise<void>;

  // Index phase
  indexPackets: (packets: HyperRAGPacketState[]) => Promise<void>;
}

/**
 * HyperRAG retrieval timings
 * Measures each lane for perf tuning (CPU vs GPU placement)
 */
export interface HyperRAGTimingReport {
  traceId: string;
  query: string;
  timings: HyperRAGTimings;
  cpuWork: string[];  // ['feature-extraction', 'normalization', 'chunking']
  gpuWork: string[];  // ['embedding', 'turbovec-ann', 'cosine-rerank']
  coldWork: string[]; // ['postgres-join', 'neo4j-traversal', 'duckdb-audit']
  recommendations: string[];
}

export async function validateHyperRAGRequest(req: unknown): Promise<HyperRAGRequest> {
  return HyperRAGRequestSchema.parseAsync(req);
}

export async function validateHyperRAGResponse(resp: unknown): Promise<HyperRAGResponse> {
  return HyperRAGResponseSchema.parseAsync(resp);
}
