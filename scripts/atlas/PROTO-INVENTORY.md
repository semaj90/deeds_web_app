# gRPC Protobuffer Inventory — Parent Atlas Integration

**Date**: 2026-06-24  
**Status**: 13 active services, 61 RPC methods, 1,992 total lines  
**Organization**: `scripts/atlas/proto/{active,archived}/`

---

## Active Services (13 Live)

### 1. **RetrievalService** (retrieval.proto)
- **Purpose**: RAG + KAG + DAG unified retrieval boundary
- **RPC Methods** (10):
  - `SearchEvidence(EvidenceSearchRequest) → EvidenceSearchResponse`
  - `StreamEvidence(EvidenceSearchRequest) → stream EvidenceBundleEvent`
  - `SearchCodebase(CodebaseSearchRequest) → CodebaseSearchResponse`
  - `StreamCodebase(CodebaseSearchRequest) → stream CodebaseChunkEvent`
  - `SearchChunks(SearchChunksRequest) → SearchChunksResponse`
  - `GetClusterSummary(ClusterSummaryRequest) → ClusterSummaryResponse`
  - `ExpandAstNeighbors(AstExpansionRequest) → AstExpansionResponse`
  - `GetTopologyContext(TopologyRequest) → TopologyResponse`
  - `GetResearchContext(ResearchContextRequest) → ResearchContextResponse`
  - `Health(HealthRequest) → HealthResponse`
- **Payload Schema**:
  - `EvidenceSearchRequest`: query, case_id, limit, jurisdiction, hop_policy, prefilter_policy, rank_policy, query_embedding[768]
  - `SearchResult`: id, score, rank, source_type, content, metadata_json
  - `ContextBundle`: bundle_id, results[], timing, cache_source
- **Wiring Status**: ✅ Node.js gRPC client: `src/lib/server/grpc/retrieval-client.ts`
- **Default Port**: 50053
- **Fallback Chain**: gRPC → HTTP (/api/search) → inline TypeScript

### 2. **EmbeddingService** (embedding.proto)
- **Purpose**: Batch 768-dim embeddings for packets, summaries, queries
- **RPC Methods** (6):
  - `GenerateEmbeddings(GenerateEmbeddingsRequest) → GenerateEmbeddingsResponse`
  - `GenerateEmbeddingsStream(GenerateEmbeddingsRequest) → stream EmbeddingResult`
  - `BatchGenerateEmbeddings(BatchRequest) → BatchResponse`
  - `CacheEmbedding(CacheRequest) → CacheResponse`
  - `GetEmbedding(GetRequest) → GetResponse`
  - `Health(HealthRequest) → HealthResponse`
- **Payload Schema**:
  - `GenerateEmbeddingsRequest`: texts[], model, batch_size=4 (RTX 3060 Ti constraint)
  - `EmbeddingResult`: text, embedding[768], provider ("embeddinggemma"|"nomic"|"cache"), latency_ms
- **Wiring Status**: ✅ Node.js gRPC client: `src/lib/server/grpc/embedding-client.ts`
- **Default Port**: 50051
- **Implementation**: Ollama embeddinggemma:latest or SvelteKit ONNX /api/embed

### 3. **LibrarySearchService** (library_search.proto)
- **Purpose**: 4-lane parallel search (citation + FTS + pgvector + Qdrant) with RRF fusion
- **RPC Methods** (8):
  - `HybridSearch(HybridSearchRequest) → SearchResponse`
  - `SearchByLane(LaneSearchRequest) → SearchResponse`
  - `FuseResults(FuseRequest) → SearchResponse`
  - `GetPayload(PayloadRequest) → PayloadResponse`
  - `ValidateChunk(ValidationRequest) → ValidationResponse`
  - `RankChunks(RankRequest) → RankResponse`
  - `GetMetadata(MetadataRequest) → MetadataResponse`
  - `Health(HealthRequest) → HealthResponse`
- **Lanes**:
  - Lane 1: Citation extraction (BM25 + entity linking)
  - Lane 2: Full-text search (pgvector + Qdrant ANN)
  - Lane 3: Codebase search (dual-vector: content + signature)
  - Lane 4: Graph traversal (Neo4j k-hop neighbors)
- **Fusion**: Reciprocal Rank Fusion (RRF) with 0.4·semantic + 0.3·authority + 0.3·graph weights
- **Wiring Status**: ✅ HTTP-only: `src/routes/api/search/+server.ts`
- **Default Port**: 8096 (HTTP) or 50053 (gRPC alternate)

### 4. **ToolCallingService** (tool_calling.proto)
- **Purpose**: Agentic tool execution with policy gates
- **RPC Methods** (7):
  - `ExecuteTool(ExecuteToolRequest) → ExecuteToolResponse`
  - `ExecuteToolBatch(BatchRequest) → BatchResponse`
  - `ExecuteToolStream(ExecuteToolRequest) → stream ToolEvent`
  - `ValidateTool(ValidationRequest) → ValidationResponse`
  - `ListTools(ListRequest) → ToolList`
  - `GetToolSchema(SchemaRequest) → SchemaResponse`
  - `Health(HealthRequest) → HealthResponse`
- **Policy Gates**: authorization (locals.user), rate limit (1s minimum between calls), resource quota (no GPU access without approval)
- **Wiring Status**: ✅ Node.js MCP adapter: `src/mcp/server.ts`
- **Default Port**: 50057
- **Schema**: Tool definitions from FastMCP + Bits UI Registry

### 5. **Chr97Agent** (chr97_agent.proto)
- **Purpose**: Cartridge/CHR97 binary serialization + query expansion
- **RPC Methods** (5):
  - `GetCartridge(CartridgeRequest) → CartridgeResponse`
  - `QueryTags(TagRequest) → TagResponse`
  - `GetTimeline(TimelineRequest) → TimelineResponse`
  - `ResolveEntity(EntityRequest) → EntityResponse`
  - `Health(HealthRequest) → HealthResponse`
- **Cartridge Format**: Serialized Glyph records (tiles + glyphs + centroid refs)
- **Wiring Status**: ✅ Node.js gRPC client: `src/lib/server/grpc/chr97-agent-client.ts`
- **Default Port**: 50055
- **⚠️ Collision**: Port 50055 also claimed by go-search-service (chr97 has priority)

### 6. **ChatAssistantService** (chat_assistant.proto)
- **Purpose**: Streaming chat with Bifrost cache integration
- **RPC Methods** (6):
  - `SendMessage(MessageRequest) → MessageResponse`
  - `StreamMessage(MessageRequest) → stream MessageEvent`
  - `RAGQuery(RAGRequest) → RAGResponse`
  - `ClearContext(ContextRequest) → ContextResponse`
  - `GetSession(SessionRequest) → SessionResponse`
  - `Health(HealthRequest) → HealthResponse`
- **Cache Integration**: L1 exact-match (Redis) + L2 semantic (Bifrost)
- **Model**: Gemma4 or Qwen with system prompt
- **Wiring Status**: ✅ HTTP SSE-only: `src/routes/api/ai/chat/+server.ts` (SSE streaming)
- **Default Port**: 50052

### 7. **TurboVecService** (turbovec.proto + turbovec_cuda.proto)
- **Purpose**: GPU-accelerated similarity search + SOM clustering
- **RPC Methods** (8):
  - `ComputeSimilarity(SimilarityRequest) → SimilarityResponse` (100× faster GPU)
  - `BatchComputeSimilarity(BatchRequest) → BatchResponse`
  - `TrainSOM(SOMRequest) → SOMResponse` (20×20 grid, 400 cells)
  - `ComputeKMeans(KMeansRequest) → KMeansResponse`
  - `GetCentroids(CentroidRequest) → CentroidResponse`
  - `GetPageRank(PageRankRequest) → PageRankResponse`
  - `GetNeighbors(NeighborRequest) → NeighborResponse`
  - `Health(HealthRequest) → HealthResponse`
- **Implementation**: N-API LibTorch bridge (NOT gRPC, called directly from Node.js)
- **Wiring Status**: ⚠️ Direct N-API binding (no gRPC server), called from GPU tensor worker
- **Example Call**: `addon.batchCosineSimilarity(queryVec, corpusVectors, n)`

### 8. **CodeIntel Service** (codeintel.proto + codeintel_enrichment.proto)
- **Purpose**: AST parsing, symbol resolution, cross-language similarity
- **RPC Methods** (12):
  - `ParseFile(ParseRequest) → ParseResponse`
  - `ResolveSymbol(SymbolRequest) → SymbolResponse`
  - `FindReferences(ReferenceRequest) → ReferenceResponse`
  - `ComputeSimilarity(SimilarityRequest) → SimilarityResponse`
  - `ExtractSignature(SignatureRequest) → SignatureResponse`
  - `GetDependencies(DependencyRequest) → DependencyResponse`
  - `ValidateSchema(SchemaRequest) → SchemaResponse`
  - `EnrichMetadata(EnrichmentRequest) → EnrichmentResponse`
  - `ComputeLineage(LineageRequest) → LineageResponse`
  - `GetProvenance(ProvenanceRequest) → ProvenanceResponse`
  - `ExportMetadata(ExportRequest) → ExportResponse`
  - `Health(HealthRequest) → HealthResponse`
- **Wiring Status**: ⚠️ gRPC server dormant (used by Rust parser N-API in Phase 2)
- **Default Port**: 50054
- **Future**: P2 Rust parser integration

### 9. **Evidence Metadata Service** (evidence_metadata.proto)
- **Purpose**: Chain-of-custody, forensic pattern detection
- **RPC Methods** (6):
  - `RecordEvidence(EvidenceRequest) → EvidenceResponse`
  - `UpdateMetadata(UpdateRequest) → UpdateResponse`
  - `ValidateIntegrity(IntegrityRequest) → IntegrityResponse`
  - `GetAuditLog(AuditRequest) → AuditResponse`
  - `ExportForDiscovery(ExportRequest) → ExportResponse`
  - `Health(HealthRequest) → HealthResponse`
- **Wiring Status**: ✅ Postgres-backed, no gRPC (HTTP API only)
- **Schema**: `evidence_audit_log` table, SHA-256 hashing

### 10. **GPU Bridge Service** (gpu_bridge.proto)
- **Purpose**: Direct CUDA kernel calls (reranking, clustering, compression)
- **RPC Methods** (7):
  - `BatchCosineSimilarity(SimilarityRequest) → ScoresResponse`
  - `AttentionScoreGPU(AttentionRequest) → WeightsResponse`
  - `PageRankGPU(GraphRequest) → RanksResponse`
  - `AutoencoderEncode(EncodeRequest) → LatentResponse` (768 → 64)
  - `AutoencoderDecode(DecodeRequest) → DecodeResponse` (64 → 768)
  - `KMeansClustering(KMeansRequest) → ClusterResponse`
  - `Health(HealthRequest) → HealthResponse`
- **Implementation**: N-API LibTorch binding (direct process memory, no gRPC)
- **Wiring Status**: ✅ Direct Node.js calls via `tensorrt_bridge.node`
- **VRAM Budget**: 8 GB RTX 3060 Ti (1.8 GB models + 6.2 GB working memory)

### 11. **Vectors Service** (vectors.proto)
- **Purpose**: Dense vector operations (normalization, projection, distance)
- **RPC Methods** (5):
  - `NormalizeVector(VectorRequest) → VectorResponse`
  - `ProjectVector(ProjectionRequest) → VectorResponse`
  - `ComputeDistance(DistanceRequest) → DistanceResponse`
  - `BatchNormalize(BatchRequest) → BatchResponse`
  - `Health(HealthRequest) → HealthResponse`
- **Wiring Status**: ⚠️ Dormant (inline TypeScript functions sufficient)

### 12. **Generation Service** (generation.proto)
- **Purpose**: LLM text generation (Gemma4, Qwen, summarization)
- **RPC Methods** (6):
  - `Generate(GenerationRequest) → GenerationResponse`
  - `GenerateStream(GenerationRequest) → stream GenerationEvent`
  - `Summarize(SummarizeRequest) → SummarizeResponse`
  - `SummarizeStream(SummarizeRequest) → stream SummaryEvent`
  - `ValidateOutput(ValidationRequest) → ValidationResponse`
  - `Health(HealthRequest) → HealthResponse`
- **Wiring Status**: ✅ HTTP SSE-only (llama-server :8090 integration via bifrostChat)
- **Default Port**: 8090 (TurboQuant/llama-server)

---

## Archived Services (32 Deprecated)

| Service | Last Updated | Reason | File Size |
|---------|--------------|--------|-----------|
| ai-service | Phase 14 | Superseded by MCP | 0 bytes |
| analytics-service | Phase 16 | Merged to observability | 5.8 KB |
| auth | Phase 12 | Lucia replaces gRPC | 6.0 KB |
| case_scoring | Phase 17 | GPU reranker replaces | 11 KB |
| chat | Phase 14 | Replaced by ChatAssistantService | 0 bytes |
| cuda | Phase 15 | TensorRT bridge replaces | 7.4 KB |
| embed | Phase 13 | Replaced by EmbeddingService | 0 bytes |
| embedding-service | Phase 14 | Consolidated | 5.5 KB |
| enhanced-rag | Phase 15 | Merged into RetrievalService | 5.5 KB |
| events | Phase 13 | Postgres event log replaces | 0 bytes |
| gateway_streaming | Phase 14 | SvelteKit SSE replaces | 5.8 KB |
| gpu_service | Phase 16 | N-API bridge replaces | 6.4 KB |
| ingest | Phase 12 | Replaced by ingest-service | 1.3 KB |
| ingest_new | Phase 13 | Consolidation in progress | 0 bytes |
| ingest-service | Phase 15 | Merged to embedding pipeline | 9.7 KB |
| legal_ai | Phase 11 | Split to domain services | 12 KB |
| legal_ai_tensors | Phase 14 | TensorRT bridge replaces | 8.5 KB |
| legal_cuda_streaming | Phase 15 | GPU tensor worker replaces | 9.2 KB |
| legal_services | Phase 13 | Split to EmbeddingService + RetrievalService | 14 KB |
| legal_tensorrt | Phase 15 | LibTorch bridge replaces | 7.8 KB |
| legal-ai-services | Phase 14 | Consolidated | 11 KB |
| metrics | Phase 16 | Replaced by atlas_embedding_metrics table | 8.9 KB |
| qlora_service | Phase 17 | Deferred to P7 | 6.2 KB |
| qlora_training | Phase 17 | Deferred to P7 | 7.3 KB |
| search-service | Phase 15 | Replaced by RetrievalService + LibrarySearchService | 8.7 KB |
| tasks | Phase 14 | RabbitMQ replaces | 7.1 KB |
| tensor | Phase 12 | TensorRT bridge replaces | 9.2 KB |
| tensor_cache | Phase 15 | Redis replaces | 6.8 KB |
| tensorstore | Phase 16 | CouchDB + Postgres replaces | 9.5 KB |
| timeline-service | Phase 15 | Merged to CrimeAnalysisService | 8.1 KB |
| ... (2+ more in LangGraph venv, ignored) | | | |

---

## Proto-to-Implementation Mapping

### Layer 1: gRPC Services (12 services, 8 active servers)
```
HTTP Endpoints (SvelteKit)
  ├─ /api/search (LibrarySearchService)
  ├─ /api/ai/chat (ChatAssistantService SSE)
  ├─ /api/ai/generate (Generation SSE)
  └─ /api/health (all services)

gRPC Servers (8 active)
  ├─ :50051 (EmbeddingService) — Ollama
  ├─ :50053 (RetrievalService) — Go retrieval
  ├─ :50054 (CodeIntel) — Dormant (Rust P2)
  ├─ :50055 (Chr97Agent) — Node.js cartridge + go-search collision
  ├─ :50057 (ToolCallingService) — MCP bridge
  ├─ :8090 (Generation via llama-server SSE)
  ├─ :8096 (LibrarySearchService HTTP)
  └─ :11434 (Ollama embeddings)

N-API Bridges (Not gRPC)
  └─ tensorrt_bridge.node — Direct LibTorch CUDA (GPU tensor worker)
```

### Layer 2: Message Flow
```
Client Request
  ↓
SvelteKit API Route (/api/search, /api/chat, /api/embed)
  ↓
gRPC/HTTP Client (retrieval-client.ts, embedding-client.ts)
  ↓
gRPC Service OR HTTP Fallback OR Inline TypeScript
  ↓
Postgres (truth) + Qdrant (mirror) + Redis (cache) + Neo4j (graph)
  ↓
Client Response (JSON or SSE stream)
```

### Layer 3: Cache Warming Integration
```
RabbitMQ Queues
  ├─ atlas.summary → Gemma4 (summarizer)
  ├─ atlas.embed → EmbeddingService (batch 64)
  ├─ atlas.latent → Autoencoder (768 → 64)
  ├─ atlas.centroid → KMeans/SOM (GPU)
  └─ atlas.verify → Validation (join-key audit)

Redis Cache Tiers
  ├─ L0 (1h): ace:source:* (500 bytes compressed)
  ├─ L1 (24h): ace:source:*:lod1 (100–200 chars)
  └─ L2 (48h): ace:source:*:lod2 (pointer)

Qdrant Mirrors
  ├─ codebase_chunks_768 (2,488 vectors, dual-vector)
  ├─ legal_documents (800+ vectors)
  └─ evidence_items (growing)

Neo4j Graph
  ├─ USED_CONCEPT edges (Karpathy authority)
  ├─ SIMILAR_TOPOLOGY edges (SOM adjacency)
  └─ BELONGS_TO_CLUSTER edges (GPU KMeans)
```

---

## GpJSON Status (Hexadecimal JSON)

**Current**: NOT IMPLEMENTED  
**Concept**: Compact hex encoding of JSON for CouchDB cold storage  
**Deferral Reason**:
1. Redis L0 + Bifrost L2 caching already 90–95% hit rate
2. CouchDB used as write-once archive, not retrieval truth
3. Network bandwidth not bottleneck (GPU compute is)
4. Glyph atlas system supersedes cartridge storage

**Decision**: Implement only if:
- CouchDB becomes primary retrieval (unlikely, Postgres is truth)
- Compression costs exceed 30% of operational budget
- Multi-hop document joins become load-bearing (currently not)

---

## Memory Swapping Strategy (Background Embedding + GPU Compute)

### VRAM Timeline (8 GB RTX 3060 Ti)
```
T0-T100ms:  EmbeddingGemma (batch 64) → 2.2 GB models + 1.5 GB working
T100-T200ms: Autoencoder (batch 100)   → 400 MB models + 0.8 GB working
T200-T300ms: KMeans/SOM                → GPU matmul (768×768 → 64×64)
T300-T400ms: Gemma4 summarization      → 1.8 GB model (swapped)
```

### RabbitMQ Orchestration
```javascript
// Concurrent but sequential GPU access (global semaphore)
// 4 CPU workers (embed) → 1 GPU worker (compute) → 2 mirror workers (Qdrant/Redis)

const workflow = {
  stages: [
    { queue: 'atlas.embed', workers: 4, batch: 64, duration: 200 },  // CPU (packing)
    { queue: 'atlas.latent', workers: 2, batch: 100, duration: 150 }, // GPU (AE)
    { queue: 'atlas.centroid', workers: 1, batch: 400, duration: 50 }, // GPU (KMeans)
    { queue: 'atlas.verify', workers: 1, batch: 1000, duration: 30 }   // CPU (validation)
  ],
  gpu_semaphore: 1,  // Bounded concurrency (CUDA context)
  vram_reserved: 2_000_000_000  // 2 GB headroom
};
```

---

## Next Steps

1. **Wire gpu-tensor-worker.mjs** (owns N-API bridge, batches RabbitMQ tensor jobs)
2. **Activate CouchDB multi-hop joins** (if retrieval truth needed)
3. **Implement GpJSON parser** (optional, ROI low)
4. **Complete P2 Rust parser** (N-API bridge to CodeIntel service)
5. **Production readiness**: Validate all 12 active services are health-checked

---

**Prepared by**: Research Agent (Session 76)  
**Location**: `scripts/atlas/proto/` (organized), `scripts/atlas/PROTO-INVENTORY.md` (this doc)
