# COUCHDB / NEO4J / GPU READINESS AUDIT — March 31, 2026
## Legal AI Platform (Deeds Web App)
**Status**: SUPERSEDED — CouchDB/Neo4j/GPU all verified in later sessions. Archive candidate.

---

## Executive Summary

The platform is broadly usable today. Core application traffic is healthy on PostgreSQL, Redis, Qdrant, Ollama, RabbitMQ, MinIO, and LangExtract. CouchDB and Neo4j are now running and healthy, but they remain optional or partial-path infrastructure rather than launch-blocking dependencies. The GPU acceleration program is partially wired: the server-side inference router exists, health/capability surfaces exist, and fallback behavior is correct, but TRT-LLM is not yet live in the active deployment path. PyTorch VLM should be treated as the next deliberate inference tier, not as an already-shipping production dependency.

Current runtime snapshot:

| Tier | State | Notes |
|------|-------|-------|
| Core | Healthy | Ollama, Qdrant, Redis, Postgres all reachable |
| Data | Healthy | MinIO, RabbitMQ, LangExtract reachable |
| Inference | Degraded by design | TRT-LLM/Triton/gRPC unavailable, fallback to Ollama works |
| Optional/Future | Mixed | CouchDB healthy, Neo4j healthy, NATS down |

Current container snapshot:

| Container | Status |
|----------|--------|
| legal-ai-couchdb | Up, healthy |
| legal-ai-neo4j | Up, healthy |
| postgres-pgvector | Up, healthy |
| phase66-redis | Up, healthy |
| phase66-rabbitmq | Up, healthy |
| phase66-minio | Up, healthy |
| phase66-qdrant | Up, unhealthy in Docker healthcheck, but HTTP reachable |
| phase66-langextract | Up, unhealthy in Docker healthcheck, but HTTP reachable |

---

## Classification Rule

Use these four buckets consistently:

| Bucket | Meaning |
|--------|---------|
| Core | Live, required, and the live request path depends on it |
| Data | Live, supports storage, extraction, indexing, queues, and cache layers |
| Inference | Live or intended active model-serving path |
| Future | Referenced or planned infrastructure not currently required by the live app path, not actively routed in production, or running only behind fallback or optional logic |

By that definition, CouchDB and Neo4j are optional-path services. They are not launch blockers, but they are not dead either.

---

## 1. CouchDB Audit

### Current State

- Running and healthy on `:5984`
- Referenced in active server code
- Not part of the minimum live request path
- Used as a knowledge and synthesis side store rather than the primary system of record

### Verified Wiring

- `sveltekit-frontend/src/routes/api/tags/[tagId]/+server.ts`
- `sveltekit-frontend/src/routes/api/cases/[id]/similar/+server.ts`
- `sveltekit-frontend/src/routes/api/kb/validate/+server.ts`
- `sveltekit-frontend/src/routes/api/error-brain/search/+server.ts`
- `sveltekit-frontend/src/lib/server/ace/tag-sync.ts`
- `sveltekit-frontend/src/lib/services/couchdb-client.ts`

### What It Is Good For

- ACE tag storage
- Synthesis document storage
- Sidecar document cache for error-brain and knowledge workflows
- Loose-schema document persistence where PostgreSQL JSONB would be more awkward

### Readiness Assessment

| Category | Assessment |
|----------|------------|
| Runtime availability | Good |
| Active usage | Real but optional |
| Launch criticality | Low |
| Operational maturity | Moderate |

### Recommendation

Keep CouchDB, but keep it classified as optional data infrastructure until a first-class workflow explicitly depends on it. It is useful for ACE and synthesis, but it should not become the primary source of truth over PostgreSQL + Drizzle.

---

## 2. Neo4j Audit

### Current State

- Running and healthy on `:7474` and `:7687`
- Clearly wired in active code
- Still not required for core request success
- Best treated as optional graph analysis and graph-enrichment infrastructure

### Verified Wiring

- `sveltekit-frontend/src/routes/api/graph/relationships/+server.ts`
- `sveltekit-frontend/src/routes/api/graph/connections/+server.ts`
- `sveltekit-frontend/src/routes/api/graph/sync/+server.ts`
- `sveltekit-frontend/src/routes/api/cases/[id]/authorities/+server.ts`
- `sveltekit-frontend/src/routes/api/health/neo4j/+server.ts`
- `sveltekit-frontend/src/lib/server/graph/pg-neo4j-sync.ts`
- `sveltekit-frontend/src/lib/server/graph/graph-centrality.ts`
- `sveltekit-frontend/src/lib/server/neo4j-driver.ts`
- `sveltekit-frontend/src/lib/server/ace/context-assembler.ts`

### What It Is Good For

- Relationship traversal
- Case-to-authority graph sync
- Entity connectivity and centrality analysis
- Future graph analytics and recommendation features

### Readiness Assessment

| Category | Assessment |
|----------|------------|
| Runtime availability | Good |
| Active usage | Real, but not primary |
| Launch criticality | Low |
| Product value | High for graph-heavy analysis |

### Recommendation

Keep Neo4j. Do not classify it as dead. Classify it as optional graph infrastructure that is partially live and valuable for future graph analysis, user analytics, and dependency reasoning. PostgreSQL graph-adjacent tables remain the safer baseline. Neo4j should be the acceleration and traversal tier.

---

## 3. Langfuse Audit

### Current State

- Integrated broadly across LLM and embedding paths
- Disabled by default via environment flags
- Safe to ship because no-op mode has near-zero cost

### Verified Wiring

- `sveltekit-frontend/src/lib/server/observability/langfuse.ts`
- `sveltekit-frontend/src/hooks.server.ts`
- `sveltekit-frontend/src/routes/api/rag/search/+server.ts`
- `sveltekit-frontend/src/routes/api/rag/answer/+server.ts`
- `sveltekit-frontend/src/routes/api/sse/chat/+server.ts`
- `sveltekit-frontend/src/routes/api/evidence/upload/+server.ts`
- `sveltekit-frontend/src/routes/api/evidence/search/+server.ts`
- `sveltekit-frontend/src/routes/api/ai/chat/+server.ts`
- `sveltekit-frontend/src/lib/server/inference/inference-router.ts`

### Recommendation

Enable Langfuse in production once credentials and retention policy are confirmed. This is the correct observability layer for tracing RAG, chat, embeddings, future PyTorch VLM calls, and eventual TRT-LLM requests through the same Node.js service surface.

---

## 4. AutoGen / Agentic Orchestration Audit

### Current State

- No active AutoGen or CrewAI production orchestration path was verified in the live app surface
- Archived and experimental references exist in backups and Python environments
- Current production-adjacent orchestration is MCP tool dispatch, RabbitMQ, and route-local orchestration

### Recommendation

Treat AutoGen-style orchestration as a future enhancement, not a production dependency. If revived later, it should sit above the existing service contracts rather than bypassing them.

---

## 5. RAG / KAG / DAG Audit

### Current State

This is one of the strongest parts of the platform.

### RAG

- Active API routes exist for retrieval and answer generation
- Hybrid search is wired across PostgreSQL, Qdrant, and Ollama-backed generation

Key paths:

- `sveltekit-frontend/src/routes/api/rag/search/+server.ts`
- `sveltekit-frontend/src/routes/api/rag/answer/+server.ts`
- `sveltekit-frontend/src/routes/api/rag/validate/+server.ts`

### KAG

- Knowledge augmentation exists via multi-store caching, side stores, and structured validation
- CouchDB and graph-aware paths support this layer, but do not replace the core DB + vector design

Key paths:

- `sveltekit-frontend/src/lib/server/vector/multi-store.ts`
- `sveltekit-frontend/src/lib/server/cache-keys.ts`

### DAG

- DAG concepts are real in error analysis and dependency ordering
- The AST subgraph and dependency graph logic is active in the error-brain path

Key path:

- `sveltekit-frontend/src/routes/api/error-brain/diagnose/+server.ts`

### Recommendation

The RAG/KAG/DAG stack is enhancement-ready. This is the correct substrate for adding user analytics, graph analytics, and future multimodal reasoning.

---

## 6. User Analytics and Graph Analysis

### Current State

- Analytics endpoints exist
- API audit logging exists
- RabbitMQ provides async event handling
- Neo4j can support graph-style user interaction and knowledge relationships

Key paths:

- `sveltekit-frontend/src/routes/api/analytics/search/+server.ts`
- `sveltekit-frontend/src/routes/api/analytics/summary/+server.ts`
- `sveltekit-frontend/src/hooks.server.ts`
- `sveltekit-frontend/src/lib/server/graph/user-interaction-sync.ts`

### Recommendation

User analytics should remain PostgreSQL-first for truth, Redis for hot counters, and Neo4j as the optional path for graph-shaped analytics such as entity-to-user-to-case traversal, relationship density, and influence or centrality analysis.

---

## 7. PyTorch / TRT-LLM / WSL2 Readiness Audit

### Current State

- The server-side inference router already exists
- Health and capabilities endpoints exist
- Ollama is the reliable current backend
- TRT-LLM is still not live in the active runtime path
- PyTorch VLM is the correct next multimodal inference tier, but it is not yet the verified serving path

Key paths:

- `sveltekit-frontend/src/lib/server/inference/inference-router.ts`
- `sveltekit-frontend/src/routes/api/ai/tensorrt/+server.ts`
- `sveltekit-frontend/src/routes/api/health/+server.ts`
- `sveltekit-frontend/src/routes/api/health/capabilities/+server.ts`
- `docker/Dockerfile.cuda`
- `docker/docker-compose.gpu.yml`
- `Dockerfile.trtllm`

### Production Assessment

| Layer | State |
|------|-------|
| Node.js + Vite app path | Ready |
| Ollama server inference | Ready |
| TRT-LLM service contract | Present |
| TRT-LLM runtime | Not yet live |
| PyTorch VLM contract | Planned / partial |
| WSL2 CUDA deployment | Plausible, not yet proven end-to-end |

### Recommendation

Use this serving order:

1. Ollama remains the current reliable default.
2. TRT-LLM in WSL2 Docker becomes the high-throughput chat backend once health, latency, and fallback behavior are verified under load.
3. PyTorch becomes the dedicated VLM and graph-analysis acceleration tier, exposed behind a narrow Node.js service contract.

The Node.js application should stay as the orchestration plane. Do not couple Vite or browser code directly to TRT-LLM or PyTorch internals. Keep them behind HTTP or gRPC service boundaries.

---

## 8. Concurrency, Parallelism, and Caching

### Current State

This layer is already strong.

- RabbitMQ multi-queue topology is active
- Redis is active
- Multi-tier cache hierarchy exists
- Queue-backed workflows already support future enhancement work

Key paths:

- `sveltekit-frontend/src/lib/server/queue/rabbitmq-manager-fixed.ts`
- `sveltekit-frontend/src/lib/server/queue/queue-worker.ts`
- `sveltekit-frontend/src/lib/server/cache-metrics.ts`
- `sveltekit-frontend/src/lib/server/cache.ts`
- `sveltekit-frontend/src/lib/ai/client-cache.ts`

### Recommendation

This is ready to support:

- concurrent TRT-LLM request routing
- PyTorch VLM job scheduling
- graph recomputation jobs
- Langfuse trace batching
- AST graph build and refresh jobs

The key remaining work is not basic concurrency infrastructure. It is service-specific admission control, GPU lease policy, and benchmarking.

---

## 9. Native C++ / CUDA / AST Graph Audit

### Current State

The repo clearly wants a stronger native tooling layer, but that layer is not yet a production dependency.

Relevant signals:

- `CLAUDE.md` references `simd-bridge/cpp/` as a LibTorch/CUDA N-API addon area
- `.vscode/settings.json` contains explicit CUDA and LibTorch configuration
- `sveltekit-frontend/src/native/libtorch_inference.cc` exists as native proof-of-concept code
- `error-brain` already uses AST subgraph logic on the TypeScript side

### Classification

This should be tracked as **Tooling / Architecture Visibility**, not runtime infrastructure.

### Needed Future Audit Surface

1. TS route graph
2. TS service graph
3. TS to N-API call map
4. N-API export graph
5. C++ call graph
6. CUDA-required paths vs CPU fallback paths
7. LibTorch and TensorRT boundary map
8. Exception-swallow and fallback-boundary audit

### Recommendation

The C++ AST graph analysis is needed, but it is a developer-capability and architecture-visibility investment, not a launch blocker. It will become especially valuable before promoting TRT-LLM and PyTorch VLM into the primary production acceleration path.

---

## Production Verdict

### Today

The platform is ready for continued production-style enhancement work.

- Core case-analysis platform: ready
- Uploads, retrieval, orchestration, caching, and queues: ready
- CouchDB: useful, optional, live
- Neo4j: useful, optional, live
- Langfuse: integrated, should be enabled deliberately
- TRT-LLM: not production-ready yet because the exact runtime path is not live
- PyTorch VLM: strategic next tier, not yet proven end-to-end
- Native AST graph analysis: needed for future hardening and visibility, not current runtime traffic

### Conservative Wording

Approved for internal production and enhancement work, with GPU acceleration still described as fallback-backed and environment-sensitive.

---

## Recommended Next Implementation Order

1. Prove WSL2 TRT-LLM end-to-end behind the existing Node.js inference router.
2. Define a dedicated PyTorch VLM service contract for document image and graph-analysis tasks.
3. Enable Langfuse in production and trace the inference router, RAG, SSE chat, and VLM jobs uniformly.
4. Keep CouchDB for ACE and synthesis side-storage; keep PostgreSQL as the primary source of truth.
5. Keep Neo4j for graph analysis and recommendation paths; do not force it into the core request path yet.
6. Add the native audit toolchain: TS graph, cross-language graph, C++ call graph, CUDA boundary map.
7. Benchmark concurrency, GPU lease behavior, Redis cache hit rate, and queue backlog under real load.

---

## Bottom Line

The repo already has the right architecture shape for the next phase:

- SvelteKit 2 + Node.js stays the orchestration plane
- Drizzle + PostgreSQL stays the system of record
- Redis + RabbitMQ stay the concurrency and cache backbone
- Qdrant stays the vector engine
- CouchDB and Neo4j stay optional but valuable side systems
- Ollama stays the dependable default model backend
- TRT-LLM in WSL2 Docker and PyTorch VLM become the controlled acceleration layers
- Native C++ / CUDA AST graph work becomes the visibility and optimization program that supports those acceleration layers

That is a sound production enhancement direction.