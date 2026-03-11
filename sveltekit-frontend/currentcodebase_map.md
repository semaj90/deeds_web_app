# Deeds Legal AI Platform — Current Codebase Map

## Last Updated: March 10, 2026

---

## 1. Health & Metrics

| Metric | Value |
|--------|-------|
| svelte-check errors | **0** |
| svelte-check warnings | **0** |
| vite build | **PASS** (exit 0) |
| Playwright routes | **20/20** |
| Kiro features at 100% | **16/17** (Feature #5 deferred) |
| API endpoint files | **254** |
| App page files | **80** |
| DB tables | **81** |
| DB enums | **19** |
| Svelte components | **544** |
| Unified stores | **6** |
| Docker services (active) | **13** |

---

## 2. Project Structure

```
deeds-web-app/
  sveltekit-frontend/         # Main SvelteKit 2 app (active development)
  go-microservice/            # Go backend services (gRPC :50051, QUIC :4434, SIMD :8095)
  simd-bridge/cpp/            # LibTorch/CUDA N-API addon (tensorrt_bridge.node)
  proto/                      # Protocol Buffer definitions (active + archived)
  docker/                     # Docker configurations
  scripts/                    # Testing and utility scripts
  next_steps/                 # Planning documentation
  deeds_labs/                 # Archived: legacy projects, corrupted machines, svelte4-archive
  models/                     # ML models directory
  onnx/                       # ONNX inference models
  ollama_models/              # Ollama model cache
  gemma3Q4_K_M/               # Quantized Gemma3 models
  granite-docling-258M/       # Document parsing models
  hmm-topic-service/          # HMM-based topic modeling
  python-workers/             # Python background services
  minio/                      # MinIO S3 storage data
  qdrant/                     # Qdrant vector DB data
  redis/                      # Redis configurations
  nginx/                      # Nginx configurations
  logs/                       # Application logs
  libtorch-win-shared-*/      # LibTorch/CUDA binaries (RTX 3060 Ti)
```

---

## 3. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | SvelteKit | 2.x |
| UI Framework | Svelte | 5 (runes) |
| Components | bits-ui | v2.16.2 |
| Styling | UnoCSS | v66.5 (svelte-scoped) |
| Forms | sveltekit-superforms | v2 + Zod |
| ORM | Drizzle | 0.44 |
| Database | PostgreSQL 16 | + pgvector |
| Vector DB | Qdrant | GPU-accelerated |
| Cache | Redis (ioredis) | Multi-tier (L0-L4) |
| Message Queue | RabbitMQ | 7 queues, 5 exchanges |
| Object Storage | MinIO | S3-compatible |
| LLM (server) | Ollama | gemma3-legal:latest (11.8B) |
| LLM (client) | ONNX Runtime | gemma3 270M (WebGPU/WASM) |
| Embeddings (server) | embeddinggemma | 768-dim |
| Embeddings (client) | ONNX Runtime | embeddinggemma 300M |
| Rich Text | Tiptap | @tiptap/core + StarterKit |
| State Machines | XState | v5 |
| Graph DB | Neo4j | 5.23.0 |
| gRPC | protobuf | Go + Node.js clients |
| GPU | CUDA/LibTorch | RTX 3060 Ti (8GB) |
| Client GPU | WebGPU | 3 WGSL shaders |

---

## 4. App Routes (80 pages)

All under `src/routes/(app)/`:

| Route Group | Pages | Description |
|-------------|-------|-------------|
| active-cases | 1 | Active case listing |
| admin | 6 | Admin panels (data, debug, notifications, routes, wasm-diagnostic) |
| analysis-center | 1 | Legal analysis hub |
| analytics | 1 | Analytics dashboard |
| cases | 12 | Case CRUD + sub-pages (evidence, notes, reports, statutes, theory, timeline, citations) |
| citations | 4 | Citation management + detail views |
| command-center | 1 | System command center |
| dashboard | 1 | Main dashboard |
| demos | 6 | Dev demos (bits-ui, dialog, rich-text, etc.) |
| evidence | 3 | Evidence upload + management |
| evidence-library | 3 | Evidence library + detail views |
| global-search | 1 | Global search with statute results |
| persons-of-interest | 4 | POI management + photos |
| recommendations | 1 | AI recommendations |
| reports | 5 | Report CRUD (list, new, view, edit) |
| system-configuration | 1 | System settings |
| terminal | 1 | AI terminal / chat |

**Additional routes** outside `(app)/`: auth (login/register/callback), dev-tools, root layout

---

## 5. API Endpoints (254 files, 60 groups)

All under `src/routes/api/`:

| Group | Endpoints | Description |
|-------|-----------|-------------|
| ace | 1 | ACE self-prompting |
| admin | 3 | Admin API |
| ai | 4 | AI inference (tensorrt, stream, vlm) |
| analytics | 2 | Analytics tracking |
| auth | 3 | Authentication (login, register, session) |
| cache | 3 | Cache management (invalidate, monitor, stats) |
| cases | 10 | Case CRUD + nested (citations, evidence, notes, statutes, timeline, theory) |
| chat | 2 | Chat API |
| citations | 5 | Citation CRUD + collections |
| docs | 2 | Document API |
| embed | 1 | Embedding API |
| engagement | 2 | User engagement tracking |
| error-brain | 3 | Error analysis + brain |
| evidence | 6 | Evidence CRUD + processing |
| gpu | 3 | GPU compute + WASM integration |
| graph | 2 | Knowledge graph |
| health | 1 | Health check |
| infrastructure | 1 | Infrastructure status |
| kb | 2 | Knowledge base |
| knowledge | 2 | Knowledge management |
| ml | 2 | ML pipelines |
| ollama | 2 | Ollama proxy |
| persons-of-interest | 4 | POI CRUD + photos |
| rag | 4 | RAG pipeline (search, validate, answer, generate) |
| **reports** | **7** | **Report CRUD, generate, publish, export, preview, save** |
| routes | 2 | Route health (SSE) |
| sse | 2 | Server-Sent Events |
| statutes | 2 | Statute search |
| stream | 1 | LLM streaming |
| summarize | 1 | Summarization |
| synthesis | 1 | Synthesis generation |
| tools | 2 | Tool management |
| topology | 1 | System topology |
| (+ 28 more) | ~170 | Various service endpoints |

### Reports API Detail

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/reports` | GET | List reports (filter by caseId, ids) |
| `/api/reports` | POST | Create report |
| `/api/reports` | PATCH | Bulk update reports |
| `/api/reports` | DELETE | Bulk delete reports |
| `/api/reports/save` | POST | Save report content |
| `/api/reports/generate` | POST | AI-generate report from case |
| `/api/reports/generate-from-template` | POST | Generate from template |
| `/api/reports/[id]/publish` | POST | Publish/unpublish report |
| `/api/reports/[id]/export` | GET | Export report (html/md/json/pdf) |
| `/api/reports/preview/[id]` | GET | HTML preview |

---

## 6. Database Schema (81 tables, 19 enums)

### Enums

| Enum | Values |
|------|--------|
| userRoleEnum | user, admin, attorney, paralegal, investigator |
| caseStatusEnum | open, closed, pending, active, archived |
| casePriorityEnum | low, medium, high, critical |
| evidenceTypeEnum | document, image, video, audio, forensic, digital, physical, testimonial |
| relationTypeEnum | supports, contradicts, related, derived_from, parent_of |
| threatLevelEnum | low, medium, high, critical |
| patchStatusEnum | pending, applied, failed, rolled_back |
| documentStatusEnum | draft, processing, indexed, error |
| documentTypeEnum | legal_brief, motion, exhibit, deposition, contract, statute, report |
| summaryTypeEnum | abstract, bullet_points, detailed, executive |
| activityStatusEnum | pending, in_progress, completed, failed |
| verificationStatusEnum | pending, verified, failed, expired |
| reportStatusEnum | draft, pending, completed, published |
| caseRiskLevelEnum | low, medium, high, critical |
| caseLinkTypeEnum | related, parent, child, duplicate |
| routeHealthStateEnum | healthy, degraded, error, unknown |
| errorKindEnum | runtime, build, type, lint |
| errorSeverityEnum | low, medium, high, critical |
| suggestionStateEnum | pending, accepted, rejected, applied |

### Table Groups

**Auth & Users (3)**: users, sessions, emailVerificationCodes, passwordResetTokens

**Cases (7)**: cases, caseNotes, caseNoteVersions, caseNoteEvidenceRefs, caseStatuteLinks, caseActivities, caseScores

**Evidence (5)**: evidence, evidenceRelationships, evidenceAuditLog, evidenceVersions, evidenceBoardConnections

**Documents (5)**: documents, legalDocuments, documentProcessing, documentChunks, documentSummaries

**Legal (5)**: statutes, statuteChunks, legalPrecedents, legalAnalysisSessions, legalGlossary, legalResearch

**Citations (4)**: citations, citationTags, citationCollections, collectionCitations

**Reports (5)**: reports, reportAuditLog, savedReports, caseReports, aiReports

**Embeddings (6)**: contentEmbeddings, userEmbeddings, chatEmbeddings, evidenceVectors, caseEmbeddings, embeddingCache

**RAG (2)**: ragSessions, ragMessages

**Persons of Interest (2)**: personsOfInterest, poiPhotos

**Workspaces (6)**: workspaces, workspaceSessions, workspaceEvidence, workspaceStatutes, workspaceNotes, workspaceCitations

**YoRHa (5)**: yorhaCases, yorhaEvidenceNodes, yorhaEvidenceConnections, yorhaChatSessions, yorhaChatMessages, yorhaSystemMetrics

**Error Tracking (7)**: routeHealth, errorEvents, errorClusters, errorSuggestions, routeErrorPatches, errorTimeline, errorSuggestionStates, errorFeedback

**Other (8)**: storageFiles, vectorMetadata, userAiQueries, autoTags, vectorOutbox, vectorJobs, attachmentVerifications, canvasStates, canvasAnnotations, canvasAutosaves, themes, hashVerifications, documentTopics, userInteractionHistory, auditLog

---

## 7. Infrastructure

### Docker Services (13 active)

| Service | Container | Ports | Purpose |
|---------|-----------|-------|---------|
| frontend | legal-ai-frontend | 5173-5179 | SvelteKit dev server |
| caddy | legal-ai-caddy | 80, 443 | Reverse proxy (HTTPS/QUIC) |
| postgres | postgres-pgvector | 5432 | PostgreSQL 16 + pgvector |
| redis | legal-ai-redis | 6379, 18001 | Cache + RedisInsight |
| rabbitmq | legal-ai-rabbitmq | 5672, 15672 | Message queue + management |
| qdrant | legal-ai-qdrant | 6333, 6334 | Vector DB (HTTP + gRPC) |
| minio | legal-ai-minio | 9000, 9001 | Object storage + console |
| neo4j | legal-ai-neo4j | 7474, 7687 | Graph DB |
| tensorrt-llm | legal-ai-tensorrt | 8096-8098 | TensorRT LLM inference |
| couchdb | phase87-couchdb | 5984 | Document DB |
| embedding-service | legal-ai-embedding | 8094 | Embedding service |
| rag-kag-middleware | phase87-rag-middleware | 8765 | RAG/KAG middleware |
| quic-server | legal-ai-quic | 4433-4434, 8095 | QUIC + SIMD service |

### Go Microservices (41 source files)

Key services:
- `enhanced-grpc-legal-server.go` — gRPC legal AI server (:50051)
- `quic-server.go` — QUIC transport (:4434)
- `minio-simd-service.go` — SIMD HTTP server (:8095)
- `embedding-service.go` — Embedding service
- `gpu-compute-service.go` — GPU compute
- `tensorrt-dual-engine-server.go` — TensorRT dual engine
- `neo4j-integration.go` — Neo4j graph integration
- `rabbitmq-integration.go` — RabbitMQ integration
- `json-ultra-simd-parser.go` — SIMD JSON acceleration

### Protocol Buffers

| Location | Count | Description |
|----------|-------|-------------|
| proto/ (root) | 30+ | Active service definitions |
| proto/active/ | 4 | Latest active protos (agent, embedding, retrieval, vectors) |
| proto/archived/ | 39 | Historical versions |
| go-microservice/proto/ | 18 | Go service protos (v1 APIs) |

### Qdrant Collections (768-dim)

| Collection | Purpose |
|------------|---------|
| evidence_items | Evidence chunks + metadata |
| legal_documents | Legal document embeddings |
| legal_cases | Case description embeddings |
| codebase_chunks_768 | Dual-vector code search |
| chat_messages | Chat context search |
| embedding_cache | Embedding lookup cache |
| poi_profiles | POI photo embeddings |
| topic_clusters | Topic modeling clusters |
| llm_cache | LLM response cache |

### RabbitMQ Queues (7)

`cache.invalidate`, `document.embed`, `evidence.process`, `vector.index`, `chat.context`, `analytics.track`, `codebase.index`

---

## 8. GPU & AI Pipeline

### Inference Chain

```
User Query
  |
  v
Client Router (src/lib/ai/client-router.ts)
  |- Simple query -> LOCAL ONNX (gemma270m via WebGPU/WASM)
  |   |- WebGPU (Dawn) -> WASM SIMD -> CPU fallback
  |   |- Model: static/gemma3_270m_onnx/ (418MB)
  |   |- Embeddings: static/embeddinggemma_300m_onnx/ (768-dim)
  |   '- Auto-escalate on failure -> SERVER
  |
  '- Legal/complex query -> SERVER
      |- Ollama: gemma3-legal:latest (11.8B Q4_K_M, 7.3GB VRAM)
      |- Embeddings: embeddinggemma:latest (307M BF16, 622MB)
      |- TensorRT (optional): port 8099
      '- SSE stream via /api/sse/chat
```

### Embedding Client Fallback (4-tier)

1. gRPC (:50051, 5s timeout) — Go embedding server
2. QUIC/NATS (:4222, 5s timeout) — QUIC bridge
3. HTTP/Ollama Batch (/api/embed, 60s) — Batch embeddings
4. HTTP/Ollama Sequential (/api/embeddings, 15s/text) — Single text

### GPU Hardware

| Component | Details |
|-----------|---------|
| GPU | NVIDIA RTX 3060 Ti (8192 MiB VRAM) |
| Driver | 580.88 |
| CUDA | LibTorch 2.9.0+cu130 |
| WebGPU | 3 WGSL compute shaders |
| N-API | libtorch_graph.cc -> tensorrt_bridge.node |

### Cache Hierarchy

```
L0: LokiJS (in-memory, 5-10min TTL, session-scoped)
L1: IndexedDB (persistent, 7-day TTL, survives refresh)
L2: Memory Cache (server, 5min TTL, in-process Map)
L3: Redis (server, configurable TTL, cross-request)
L4: Service Logic (DB query, Qdrant search, Ollama inference)
```

---

## 9. Key Source Files

### Client-Side

| File | Purpose |
|------|---------|
| src/lib/ai/client-router.ts | Routes local vs server inference |
| src/lib/ai/client-cache.ts | LokiJS + IndexedDB dual-tier cache |
| src/lib/ai/client-embed.ts | 768-dim ONNX embeddings (mean-pool + L2-norm) |
| src/lib/ai/onnx/session.ts | WebGPU -> WASM -> CPU session factory |
| src/lib/ai/model-ids.ts | Centralized model constants |
| src/lib/ai/emotion-context.ts | Emotion analysis context |
| src/lib/models/ChatSession.svelte.ts | Central routing hub (local <-> server) |
| src/lib/machines/retrieval-machine.ts | XState v5 2-stage retrieval |
| src/lib/components/ui/Button.svelte | Primary button component |
| src/lib/components/ui/Icon.svelte | UnoCSS icon wrapper (i-lucide-*) |
| src/lib/components/editor/TiptapWithAIAssistant.svelte | Rich text editor + AI |

### Stores (Unified)

| File | Purpose |
|------|---------|
| src/lib/stores/unified/report-store.svelte.ts | Reports state management |
| src/lib/stores/unified/evidence-store.svelte.ts | Evidence state management |
| src/lib/stores/unified/ai-assistant-store.svelte.ts | AI assistant state |
| src/lib/stores/unified/notification-store.svelte.ts | Notification state |
| src/lib/stores/unified/toast-store.svelte.ts | Toast notifications |

### Server-Side

| File | Purpose |
|------|---------|
| src/lib/server/db/client.ts | Drizzle PostgreSQL client |
| src/lib/server/db/schema-postgres.ts | Main schema (81 tables, 19 enums) |
| src/lib/server/db/drizzle-cache.ts | ioredis-backed Drizzle Cache plugin |
| src/lib/server/redis.ts | Primary ioredis singleton + pool |
| src/lib/server/cache.ts | Dual-tier memory + Redis cache |
| src/lib/server/cache/invalidation.ts | Cache invalidation logic |
| src/lib/server/cache/report-template-cache.ts | Redis-backed report template cache |
| src/lib/server/cache/pdf-export-cache.ts | Export result caching |
| src/lib/server/vector/qdrant-manager.ts | Qdrant client + hybrid search |
| src/lib/server/queue/rabbitmq-manager-fixed.ts | RabbitMQ 7-queue manager |
| src/lib/server/grpc/embedding-client.ts | 4-tier embedding fallback |
| src/lib/server/rag-pipeline.ts | End-to-end RAG for legal Q&A |
| src/lib/server/indexer/legal-chunker.ts | Structure-aware legal document chunker |
| src/lib/server/analysis/entity-extraction.ts | LLM + regex entity extraction |
| src/lib/server/analysis/forensics.ts | PII/legal pattern detection |
| src/lib/server/reports/audit.ts | Report audit logging |
| src/mcp/server.ts | MCP server (stdio, 9 tools) |

### Configuration

| File | Purpose |
|------|---------|
| svelte.config.js | SvelteKit + adapter-auto config |
| vite.config.ts | Vite + UnoCSS svelte-scoped |
| unocss.config.ts | UnoCSS theme + shortcuts |
| tsconfig.json | TypeScript config (services excluded) |
| drizzle.config.ts | Drizzle migration config |
| docker-compose.yml | 13 active services |

---

## 10. Reports Feature (Full CRUD)

### Data Flow

| Operation | UI Path | API Endpoint | Status |
|-----------|---------|-------------|--------|
| CREATE (blank) | /reports/new | POST /api/reports | Working |
| CREATE (template) | /reports/new | POST /api/reports/generate-from-template | Working |
| CREATE (AI gen) | /cases/[id]/reports | POST /api/reports/generate | Working |
| READ (list) | /reports | GET /api/reports | Working |
| READ (single) | /reports/[id] | GET /api/reports?ids={id} | Working |
| UPDATE (edit) | /reports/[id]/edit | PATCH /api/reports | Working |
| UPDATE (case page) | /cases/[id]/reports | POST /api/reports/save | Working |
| DELETE | /reports | DELETE /api/reports {ids:[]} | Working |
| PUBLISH | /reports/[id] | POST /api/reports/[id]/publish | Working |
| EXPORT | /reports/[id] | GET /api/reports/[id]/export | Working (html/md/json; pdf=501) |

### DB Schema

```
reports: id, caseId, createdBy, title, content, type, status, generatedAt, metadata, createdAt, updatedAt
reportAuditLog: id, reportId, userId, action, changes, ipAddress, userAgent, timestamp
savedReports: id, userId, reportId, savedAt
caseReports: id, caseId, reportId, linkedAt
aiReports: id, caseId, reportType, sections, metadata, createdAt, updatedAt
```

### Templates (9)

charging_memo, intake_summary, discovery_list, hearing_prep, analysis, summary, timeline, evidence_review, legal_memo

---

## 11. Critical Warnings

- **tsconfig**: `src/lib/services/**` is blanket-excluded (312 of 564 files are corrupted)
- **Phase 99**: Commit `0a2bd98929` corrupted 83 files -- DO NOT rerun
- **DB migrations**: Always use `drizzle-kit migrate`, review SQL for DROPs
- **SSR routes**: evidence, citations, evidence-library have `ssr = false`
- **ORT WASM**: 3 binary files (11-24MB each) excluded from git, must copy from node_modules after clone
- **Global $state SSR**: `.svelte.ts` singletons persist across SSR requests -- use `event.locals` for server state
