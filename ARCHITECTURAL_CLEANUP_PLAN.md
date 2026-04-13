# Architectural Cleanup Plan

**Goal**: Clean separation of concerns with well-defined contracts between layers

**Date**: April 12, 2026
**Status**: Planning Phase

---

## 1. Contract Definitions (Type Safety Layer)

### 1.1 RabbitMQ Queue Contracts

**Location**: `src/lib/contracts/queues.ts`

```typescript
// Queue message contracts
export interface AudioProcessJob {
  evidenceId: string;
  filePath: string;
  fileName: string;
  caseId: string | null;
  userId: string;
  timestamp: number;
}

export interface DocumentEmbedJob {
  documentId: string;
  filePath: string;
  fileName: string;
  sessionId: string;
  caseId: string | null;
  userId: string;
  timestamp: number;
}

export interface VectorIndexJob {
  entityId: string;
  entityType: 'evidence' | 'document' | 'case' | 'statute';
  text: string;
  metadata: Record<string, unknown>;
}

export interface SynthesisJob {
  requestId: string;
  query: string;
  context: string[];
  caseId?: string;
  userId: string;
}

// Queue names as const
export const QUEUE_NAMES = {
  AUDIO_PROCESS: 'audio.process',
  DOCUMENT_EMBED: 'chat.document.embed',
  VECTOR_INDEX: 'vector.index',
  SYNTHESIS: 'synthesis.generate',
  EVIDENCE_PROCESS: 'evidence.process',
  CHAT_CONTEXT: 'chat.context',
  ANALYTICS_TRACK: 'analytics.track',
  CACHE_INVALIDATE: 'cache.invalidate',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];
```

### 1.2 gRPC Proto Contracts

**Location**: `proto/services.proto`

```protobuf
syntax = "proto3";

package deeds.ai;

// Embedding Service
service EmbeddingService {
  rpc Embed(EmbedRequest) returns (EmbedResponse);
  rpc BatchEmbed(BatchEmbedRequest) returns (BatchEmbedResponse);
  rpc Health(HealthRequest) returns (HealthResponse);
}

message EmbedRequest {
  string text = 1;
  string model = 2; // "embeddinggemma" or "nomic-embed-text"
}

message EmbedResponse {
  repeated float vector = 1;
  int32 dimensions = 2;
  string model = 3;
}

message BatchEmbedRequest {
  repeated string texts = 1;
  string model = 2;
}

message BatchEmbedResponse {
  repeated EmbedResponse embeddings = 1;
}

// Inference Service (Go microservice)
service InferenceService {
  rpc Generate(GenerateRequest) returns (GenerateResponse);
  rpc StreamGenerate(GenerateRequest) returns (stream GenerateChunk);
}

message GenerateRequest {
  string prompt = 1;
  string model = 2;
  float temperature = 3;
  int32 max_tokens = 4;
  map<string, string> metadata = 5;
}

message GenerateResponse {
  string text = 1;
  int32 tokens = 2;
  int64 latency_ms = 3;
}

message GenerateChunk {
  string text = 1;
  bool done = 2;
}
```

**TypeScript bindings**: `src/lib/contracts/grpc.ts` (generated via `pbjs` + `pbts`)

### 1.3 JSONB Snapshot Schemas

**Location**: `src/lib/contracts/snapshots.ts`

```typescript
import { z } from 'zod';

// LLM Metadata Snapshot (stored in evidence.ai_analysis)
export const LLMMetadataSchema = z.object({
  model: z.string(),
  temperature: z.number(),
  maxTokens: z.number(),
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
  totalTokens: z.number().optional(),
  latencyMs: z.number(),
  timestamp: z.string().datetime(),
  traceId: z.string().uuid().optional(), // Langfuse trace
});

export type LLMMetadata = z.infer<typeof LLMMetadataSchema>;

// Embedding Metadata Snapshot (stored in evidence_vectors.metadata)
export const EmbeddingMetadataSchema = z.object({
  model: z.enum(['embeddinggemma', 'nomic-embed-text']),
  dimensions: z.literal(768),
  method: z.enum(['grpc', 'http', 'cached']),
  chunkIndex: z.number().int().min(0).optional(),
  totalChunks: z.number().int().min(1).optional(),
  sourceText: z.string().max(1000), // First 1000 chars for reference
  createdAt: z.string().datetime(),
  cacheHit: z.boolean().default(false),
});

export type EmbeddingMetadata = z.infer<typeof EmbeddingMetadataSchema>;

// Summary Metadata (stored in case.summary_metadata)
export const SummaryMetadataSchema = z.object({
  generatedAt: z.string().datetime(),
  llm: LLMMetadataSchema,
  evidenceCount: z.number().int().min(0),
  statuteCount: z.number().int().min(0),
  wordCount: z.number().int().min(0),
  quality: z.object({
    coherence: z.number().min(0).max(1),
    completeness: z.number().min(0).max(1),
    accuracy: z.number().min(0).max(1),
  }).optional(),
});

export type SummaryMetadata = z.infer<typeof SummaryMetadataSchema>;
```

---

## 2. KAG/DAG/RAG Pipeline Architecture

### 2.1 Karpathy LLM Wiki Integration

**Location**: `src/lib/ai/karpathy-llm/`

```typescript
// karpathy-llm/tokenizer.ts - BPE tokenizer
export class KarpathyTokenizer {
  private vocab: Map<string, number>;
  private merges: Array<[string, string]>;

  encode(text: string): number[] { /* BPE encoding */ }
  decode(tokens: number[]): string { /* BPE decoding */ }
}

// karpathy-llm/inference.ts - TypeScript LLM runner
export class LocalLLM {
  private weights: Float32Array;
  private config: ModelConfig;

  async generate(prompt: string, maxTokens: number): Promise<string> {
    // Transformer inference in TypeScript
    // For client-side fallback when Ollama unavailable
  }
}
```

**Use case**: Client-side LLM fallback (270M param Gemma model via ONNX/WASM)

### 2.2 ACE Chunks Cosine Retrieval

**Location**: `src/lib/server/retrieval/ace-cosine.ts`

```typescript
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

/**
 * Indexed cosine similarity search via pgvector
 * HNSW index on ace_chunks(embedding vector(768))
 */
export async function retrieveACEChunks(
  queryEmbedding: number[],
  caseId: string,
  limit = 10
) {
  const results = await db.execute(sql`
    SELECT
      id, content, metadata,
      1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) AS similarity
    FROM ace_chunks
    WHERE case_id = ${caseId}
    ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
    LIMIT ${limit}
  `);

  return results.rows;
}
```

### 2.3 DAG Analysis (Neo4j + CouchDB)

**Location**: `src/lib/server/graph/`

**Neo4j**: Graph structure (nodes + edges)
**CouchDB**: Topological order cache (1hr TTL)

```typescript
// graph/dag-executor.ts
export async function executeDAG(caseId: string) {
  // 1. Get cached order from CouchDB
  const cached = await getCachedTopologicalOrder(caseId);
  if (cached) return cached;

  // 2. Query Neo4j for graph
  const graph = await neo4j.query(`
    MATCH (n:EvidenceNode {case_id: $caseId})-[r:DEPENDS_ON]->(m)
    RETURN n, r, m
  `, { caseId });

  // 3. Compute topological order
  const order = topologicalSort(graph);

  // 4. Cache in CouchDB
  await cacheTopologicalOrder(caseId, order);

  return order;
}
```

---

## 3. GPU Acceleration Layer

### 3.1 LibTorch CUDA Primitives (N-API)

**Location**: `simd-bridge/cpp/libtorch_primitives.cc`

**Isolated primitive functions**:
```cpp
// ONLY these 5 primitives exposed via N-API
Napi::Value CosineSimilarityBatch(const Napi::CallbackInfo& info);
Napi::Value L2NormalizeBatch(const Napi::CallbackInfo& info);
Napi::Value MatrixMultiply(const Napi::CallbackInfo& info);
Napi::Value TopKIndices(const Napi::CallbackInfo& info);
Napi::Value ClusterKMeans(const Napi::CallbackInfo& info);
```

**TypeScript wrapper**: `src/lib/server/gpu/libtorch-primitives.ts`

```typescript
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const addon = require('../../../simd-bridge/cpp/build/Release/tensorrt_bridge.node');

export function batchCosineSimilarity(
  query: Float32Array,
  candidates: Float32Array[],
  useCuda = true
): Float32Array {
  if (!addon.isCudaAvailable() || !useCuda) {
    return fallbackCosine(query, candidates);
  }
  return addon.cosineSimilarityBatch(query, candidates);
}

// ... other primitives
```

### 3.2 WebGPU Client Bridge

**Location**: `src/lib/gpu/webgpu-bridge.ts`

**Purpose**: ONLY client-side acceleration (NO server usage)

```typescript
// Client-only compute shaders for search reranking
export class WebGPUBridge {
  private device: GPUDevice | null = null;
  private pipeline: GPUComputePipeline | null = null;

  async initialize() {
    if (typeof navigator === 'undefined') {
      throw new Error('WebGPU is client-side only');
    }

    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) throw new Error('WebGPU not available');

    this.device = await adapter.requestDevice();
    this.pipeline = await this.createCosinePipeline();
  }

  /**
   * Client-side reranking via GPU compute shader
   * Runs in browser - NOT on Node.js server
   */
  async rerankResults(
    queryEmbedding: Float32Array,
    candidateEmbeddings: Float32Array[],
    scores: Float32Array
  ): Promise<number[]> {
    // WGSL compute shader for cosine similarity
    // Returns reordered indices
  }
}
```

---

## 4. Qdrant + pgvector Mirroring Strategy

### 4.1 Dual Storage Pattern

**Write path**:
```typescript
// Always write to BOTH stores
async function storeEmbedding(
  id: string,
  embedding: number[],
  metadata: EmbeddingMetadata
) {
  await Promise.all([
    // PostgreSQL (source of truth for ACID transactions)
    db.insert(evidenceVectors).values({
      id,
      evidenceId: metadata.evidenceId,
      embedding,
      metadata: metadata as any, // JSONB
    }),

    // Qdrant (optimized for vector search)
    qdrant.upsert('evidence_vectors', {
      points: [{
        id,
        vector: embedding,
        payload: {
          evidenceId: metadata.evidenceId,
          ...metadata,
        }
      }]
    })
  ]);
}
```

**Read path**:
- **Search**: Qdrant (HNSW + quantization)
- **Exact lookups**: PostgreSQL (indexed by UUID)
- **Sync check**: Cron job compares counts

### 4.2 Tag Mirroring

**PostgreSQL**: `evidence_tags` table (relational, filterable)
**Qdrant**: Payload tags (filterable in vector search)

```typescript
async function updateTags(evidenceId: string, tags: string[]) {
  // Update PostgreSQL
  await db.delete(evidenceTags).where(eq(evidenceTags.evidenceId, evidenceId));
  await db.insert(evidenceTags).values(tags.map(tag => ({ evidenceId, tag })));

  // Mirror to Qdrant payload
  await qdrant.setPayload('evidence_vectors', {
    points: [evidenceId],
    payload: { tags }
  });
}
```

---

## 5. Go Microservice RAG Inference

### 5.1 Service Architecture

**Port**: 50051 (gRPC), 8095 (HTTP fallback)
**Location**: `go-microservice/cmd/rag-inference/`

```go
// main.go
func main() {
    lis, _ := net.Listen("tcp", ":50051")

    grpcServer := grpc.NewServer()
    pb.RegisterInferenceServiceServer(grpcServer, &server{
        ollama: NewOllamaClient(os.Getenv("OLLAMA_URL")),
        langfuse: NewLangfuseClient(os.Getenv("LANGFUSE_SECRET_KEY")),
        bifrost: NewBifrostCache(os.Getenv("BIFROST_URL")),
        redis: NewRedisClient(os.Getenv("REDIS_URL")),
    })

    grpcServer.Serve(lis)
}

// inference.go
func (s *server) Generate(ctx context.Context, req *pb.GenerateRequest) (*pb.GenerateResponse, error) {
    traceID := s.langfuse.StartTrace(req.Metadata["requestId"])
    defer s.langfuse.EndTrace(traceID)

    // L1: Redis exact match
    if cached := s.redis.Get(cacheKey(req)); cached != nil {
        s.langfuse.LogCacheHit(traceID, "redis")
        return cached, nil
    }

    // L2: Bifrost semantic match
    if cached := s.bifrost.SearchSimilar(req.Prompt, 0.8); cached != nil {
        s.langfuse.LogCacheHit(traceID, "bifrost")
        return cached, nil
    }

    // L3: Ollama GPU inference
    response := s.ollama.Generate(req.Prompt, req.Model)
    s.langfuse.LogGeneration(traceID, req, response)

    // Cache result
    s.redis.Set(cacheKey(req), response, 3600)
    s.bifrost.Store(req.Prompt, response)

    return response, nil
}
```

### 5.2 Langfuse Integration

**All inference calls traced**:
- Request ID → Trace ID mapping
- Token counts, latency, model
- Cache hit/miss logging
- Error tracking

---

## 6. Implementation Phases

### Phase 1: Contract Definitions (Week 1)
- [ ] Create `src/lib/contracts/` directory
- [ ] Define all TypeScript interfaces
- [ ] Update Proto definitions
- [ ] Generate gRPC TypeScript bindings
- [ ] Add Zod schemas for JSONB

### Phase 2: Queue Refactor (Week 1-2)
- [x] Consolidate queue names to `QUEUE_NAMES` const — **DONE** (8 queues centralized)
- [x] Type all RabbitMQ message payloads — **DONE** (7 queues typed)
- [x] Update all consumers to use contracts — **DONE** (all 8 queues have consumers)
- [ ] Add queue message validation (Zod) — **PARTIAL** (API validation 74.1%, queue validation deferred)

### Phase 3: GPU Isolation (Week 2)
- [x] Extract 5 LibTorch primitives — **DONE** (libtorch-bridge.ts: cosine similarity, clustering)
- [x] Create clean N-API wrapper — **DONE** (tensorrt_bridge.node: simdjson + LibTorch)
- [x] Build WebGPU client bridge — **DONE** (WebGPU Orphan Revival: SOM cache, texture streaming, N64 LOD)
- [x] Remove GPU code from server SSR paths — **DONE** (SSR safety: onMount guards, ssr=false routes)

### Phase 4: Storage Mirroring (Week 2-3)
- [ ] Implement dual-write pattern
- [ ] Add sync verification cron
- [ ] Test tag mirroring
- [ ] Document when to use PG vs Qdrant

### Phase 5: Go Service Enhancement (Week 3)
- [ ] Add Langfuse tracing
- [ ] Implement semantic caching
- [ ] Add health checks
- [ ] Load test at 12K QPM

### Phase 6: Documentation (Week 3-4)
- [ ] Architecture diagrams
- [ ] API documentation
- [ ] Runbook for ops
- [ ] Migration guide

---

## 7. Success Metrics

- ✅ 100% queue messages type-safe
- ✅ 100% gRPC calls traced in Langfuse
- ✅ Zero GPU code in SSR paths
- ✅ <1% PG ↔ Qdrant sync drift
- ✅ 95%+ cache hit rate (L1 + L2)
- ✅ Zero contract violations in production

---

## Next Steps

1. Review this plan
2. Approve Phase 1 scope
3. Create feature branch: `feat/architectural-cleanup`
4. Start with contract definitions

**Estimated Total Time**: 3-4 weeks
**Risk Level**: Medium (refactor of core systems)
**Rollback Strategy**: Feature flags + canary deployment
