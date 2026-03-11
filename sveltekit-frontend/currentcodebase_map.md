# Deeds Legal AI Platform — Current Codebase Map

## Last Updated: March 10, 2026

---

## 1. Health & Metrics

| Metric | Value |
|--------|-------|
| svelte-check errors | **0** |
| svelte-check warnings | **0** |
| vite build | **PASS** (exit 0) |
| Playwright routes | **20/20 PASS** |
| Kiro features at 100% | **16/17** (Feature #5 deferred) |
| App pages | **80** |
| API endpoints | **254** |
| DB tables | **85** (83 schema + 2 legacy) |
| DB enums | **20** |
| Docker services (active) | **13** |

---

## 2. Project Structure

```
deeds-web-app/
├── sveltekit-frontend/          # Primary SvelteKit 2 application
│   ├── src/
│   │   ├── routes/(app)/        # 80 app pages (17 route groups)
│   │   ├── routes/api/          # 254 API endpoints (69 groups)
│   │   ├── lib/server/          # Server-side logic (79 subdirs)
│   │   ├── lib/components/      # UI components (183+ wired)
│   │   ├── lib/stores/unified/  # Svelte 5 rune stores (.svelte.ts)
│   │   ├── lib/ai/              # Client-side AI (ONNX, routing)
│   │   └── lib/server/db/       # Drizzle ORM schema + client
│   ├── static/                  # ONNX models, ORT WASM binaries
│   ├── drizzle/                 # Migrations (generated + manual)
│   └── scripts/tests/           # Playwright screenshot tests
├── go-microservice/             # Go gRPC services (:50051)
├── simd-bridge/cpp/             # LibTorch/CUDA N-API addon
├── proto/                       # Protocol Buffer definitions
├── python-services/             # Python embedding + RAG middleware
├── deeds_labs/                  # Archive (legacy, corrupted, experiments)
└── docker-compose.yml           # 13-service production stack
```

---

## 3. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | SvelteKit | 2.49.2 |
| **UI** | Svelte 5 (runes) | 5.53.3 |
| **Components** | bits-ui | 2.16.2 |
| **Styling** | UnoCSS (svelte-scoped) | 66.5.1 |
| **Forms** | sveltekit-superforms + Zod | 2.28.0 |
| **Database** | PostgreSQL 17 + pgvector 0.8.2 | — |
| **ORM** | Drizzle ORM | 0.44.7 |
| **Cache** | Redis Stack (ioredis) | 5.8.2 |
| **Vector DB** | Qdrant | — |
| **Graph DB** | Neo4j 5 Community | — |
| **Message Queue** | RabbitMQ | — |
| **Object Storage** | MinIO | — |
| **Client AI** | ONNX Runtime (WebGPU/WASM) | 1.23.2 |
| **Server AI** | Ollama (gemma3-legal + embeddinggemma) | — |
| **GPU** | LibTorch/CUDA (RTX 3060 Ti) | — |
| **State Machines** | XState v5 | 5.24.0 |
| **Rich Text** | Tiptap | @tiptap/core + StarterKit |
| **Build** | Vite | 6.4.1 |
| **TypeScript** | TypeScript | 5.9.3 |
| **Testing** | Playwright | 1.55.0 |
| **gRPC** | protobuf | Go + Node.js clients |
| **Client GPU** | WebGPU | 3 WGSL compute shaders |

---

## 4. App Routes (80 pages)

All under `src/routes/(app)/`:

| Route Group | Pages | Key Features |
|-------------|------:|-------------|
| **admin** | 19 | AST topology, component analysis, codebase viewer, dev-tools, phase78/89, knowledge-search, GPU graph, QLoRA training, error-brain, cache dashboard |
| **demos** | 20 | bits-ui, cache, icons, evidence-canvas, GPU-cache, ace-pipeline, memory-palace, vector-search, retro-recommendations, case-scoring, document-summarizer, knowledge-graph, rag-documents, webgpu-memory-palace, agentic-errors, nier-showcase, investigate |
| **cases** | 12 | List, [id]/overview, canvas, board, chat, persons, ai, notes, evidence/upload, reports, new |
| **command-center** | 6 | Codebase explorer, graph, errors, components/[id], clusters/[id] |
| **evidence** | 6 | List, upload, manage, analyze, hash, realtime |
| **reports** | 4 | List, new, [id] view, [id]/edit |
| **persons-of-interest** | 3 | List, [id] detail, create |
| **active-cases** | 1 | Active case listing |
| **analysis-center** | 1 | Analysis dashboard |
| **analytics** | 1 | Analytics dashboard |
| **citations** | 1 | Citation management |
| **dashboard** | 1 | Main dashboard |
| **evidence-library** | 1 | Evidence search/browse |
| **global-search** | 1 | Cross-entity search |
| **recommendations** | 1 | AI recommendations |
| **system-configuration** | 1 | System settings |
| **terminal** | 1 | AI chat terminal |

**Additional routes** outside `(app)/`: auth (login/register/callback), dev-tools, root layout

---

## 5. API Endpoints (254 total)

All under `src/routes/api/`:

| Group | Count | Group | Count |
|-------|------:|-------|------:|
| ai | 20 | phase89 | 20 |
| cases | 17 | health | 13 |
| citations | 9 | routes | 9 |
| evidence | 8 | codebase-index | 8 |
| cache | 8 | auth | 8 |
| persons-of-interest | 7 | reports | 7 |
| admin | 6 | error-brain | 6 |
| system | 6 | knowledge | 5 |
| recommendations | 4 | codebase | 4 |
| graph | 4 | rag | 4 |
| phase72 | 3 | analytics | 3 |
| gpu | 3 | tags | 3 |
| chat | 3 | documents | 2 |
| engagement | 2 | push | 2 |
| pipeline | 2 | sse | 2 |
| stream | 2 | nlp | 2 |
| phase82 | 2 | internal | 2 |
| web | 2 | *(single-endpoint groups)* | 18 |

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
| `/api/reports/[id]/export` | GET | Export report (html/md/json; pdf=501) |
| `/api/reports/preview/[id]` | GET | HTML preview |

---

## 6. Database Schema (85 tables, 20 enums)

Schema file: `src/lib/server/db/schema-postgres.ts`

### Enums (20)

| Enum | Values |
|------|--------|
| userRole | prosecutor, detective, admin, analyst, paralegal, investigator, viewer, user |
| caseStatus | open, in_progress, pending_review, closed, archived, active, pending, under_review |
| casePriority | low, medium, high, critical, urgent |
| evidenceType | document, photo, video, audio, physical, digital, witness_statement, forensic, documentary, testimonial, demonstrative, real, circumstantial, hearsay, expert, scientific |
| relationType | supports, contradicts, same_person, timeline, chain_of_custody, corroborates, +12 more |
| threatLevel | low, medium, high, critical |
| patchStatus | suggested, applied, rejected |
| documentStatus | queued, processing, completed, failed |
| documentType | pleading, motion, brief, contract, evidence, correspondence, court_order, transcript, affidavit, other |
| summaryType | brief, detailed, executive, technical |
| activityStatus | pending, in_progress, completed, cancelled |
| verificationStatus | pending, verified, failed, rejected |
| reportStatus | draft, pending, completed, published |
| caseRiskLevel | low, medium, high, critical |
| caseLinkType | CHARGED_UNDER, CITED_IN, RELATED_TO, OVERRULED_BY, AFFIRMED_BY |
| routeHealthState | healthy, degraded, unhealthy |
| errorKind | runtime, api, other |
| errorSeverity | info, warn, error, critical |
| suggestionState | pending, applied, dismissed, snoozed |

### Tables by Domain (83 in schema + 2 legacy)

**Auth (4):** users, sessions, emailVerificationCodes, passwordResetTokens

**Cases (7):** cases, caseActivities, caseScores, caseStatuteLinks, caseNotes, caseNoteVersions, caseNoteEvidenceRefs

**Evidence (7):** evidence, evidenceRelationships, evidenceBoardConnections, evidenceVectors, evidenceAuditLog, evidenceVersions, hashVerifications

**Documents (6):** documents, legalDocuments, documentProcessing, documentChunks, documentSummaries, documentTopics

**Legal (6):** statutes, statuteChunks, legalPrecedents, legalAnalysisSessions, legalGlossary, legalResearch

**Citations (4):** citations, citationTags, citationCollections, collectionCitations

**Reports (5):** reports, reportAuditLog, savedReports, caseReports, aiReports

**Embeddings (8):** contentEmbeddings, userEmbeddings, chatEmbeddings, evidenceVectors, caseEmbeddings, embeddingCache, vectorMetadata, vectorOutbox, vectorJobs

**RAG (2):** ragSessions, ragMessages

**Persons (3):** personsOfInterest, poiPhotos, criminals

**Canvas (3):** canvasStates, canvasAnnotations, canvasAutosaves

**Workspaces (6):** workspaces, workspaceSessions, workspaceEvidence, workspaceStatutes, workspaceNotes, workspaceCitations

**YoRHa (6):** yorhaCases, yorhaEvidenceNodes, yorhaEvidenceConnections, yorhaChatSessions, yorhaChatMessages, yorhaSystemMetrics

**Error Brain (8):** routeHealth, errorEvents, errorClusters, errorSuggestions, routeErrorPatches, errorTimeline, errorSuggestionStates, errorFeedback

**Other (8):** storageFiles, userAiQueries, autoTags, attachmentVerifications, themes, analysisJobs, auditLog, userInteractionHistory

---

## 7. Infrastructure

### Docker Services (13 active)

| Service | Port | Purpose |
|---------|------|---------|
| postgres | 5432 | PostgreSQL 17 + pgvector 0.8.2 |
| redis | 6379 | Redis Stack (cache + sessions) |
| qdrant | 6333/6334 | Vector DB (6 collections, 768-dim) |
| rabbitmq | 5672/15672 | Message queue (7 queues, 5 exchanges) |
| minio | 9000/9001 | Object storage (evidence uploads) |
| neo4j | 7474/7687 | Graph database (knowledge graph) |
| couchdb | 5984 | Document storage |
| tensorrt-llm | 8096-8098 | GPU inference (RTX 3060 Ti) |
| embedding-service | 8094 | EmbeddingGemma gRPC |
| quic-server | 4433-4434 | QUIC protocol + SIMD |
| rag-kag-middleware | 8765 | RAG/KAG orchestration |
| caddy | 80/443 | Reverse proxy (HTTP/3) |
| frontend | 5173 | SvelteKit dev/prod |

### Go Microservices (40+ source files)

| Service | Purpose |
|---------|---------|
| agentic-gemma3-main.go | LLM agent orchestrator |
| embedding-service.go | gRPC embedding (:50051) |
| enhanced-rag-service.go | RAG pipeline |
| enhanced-grpc-legal-server.go | Main gRPC legal server |
| gpu-inference-server.go | GPU inference |
| gpu-compute-service.go | CUDA compute |
| gemma3_cuda_service.go | Gemma3 CUDA integration |
| neo4j-simd-worker.go | Neo4j SIMD operations |

### Qdrant Collections (768-dim)

| Collection | Purpose |
|------------|---------|
| evidence_items | Evidence chunk embeddings |
| legal_documents | Legal document embeddings |
| legal_cases | Case description embeddings |
| codebase_chunks_768 | Dual-vector code search |
| chat_messages | Chat context search |
| embedding_cache | Embedding lookup cache |

### RabbitMQ Queues (7)

cache.invalidate, document.embed, evidence.process, vector.index, chat.context, analytics.track, codebase.index

---

## 8. GPU & AI Pipeline

### Inference Fallback Chain

```
User Query
  ├─ Simple → LOCAL ONNX (gemma270m via WebGPU/WASM)
  │   ├─ WebGPU (Dawn) → WASM SIMD → CPU fallback
  │   ├─ Models: static/gemma3_270m_onnx/ (418MB)
  │   ├─ Embeddings: static/embeddinggemma_300m_onnx/ (768-dim)
  │   └─ Auto-escalate on failure → SERVER
  └─ Legal/complex → SERVER Ollama (:11434)
      ├─ LLM: gemma3-legal:latest (11.8B Q4_K_M, 7.3GB)
      ├─ Embeddings: embeddinggemma:latest (307M, 768-dim)
      └─ SSE stream via /api/sse/chat
```

### GPU Stack (RTX 3060 Ti, 8GB VRAM)

| Component | Status | Details |
|-----------|--------|---------|
| LibTorch/CUDA N-API | ACTIVE | simd-bridge/cpp/libtorch_graph.cc |
| GPU similarity | ACTIVE | Batch cosine via torch::mm |
| GPU clustering | ACTIVE | k-means on CUDA |
| Ollama GPU | RUNNING | Port 11434, 4 models loaded |
| TensorRT-LLM | STOPPED | Optional, port 8099 |

### Cache Hierarchy (5 tiers)

```
L0: LokiJS (in-memory, 5-10min TTL)
L1: IndexedDB (persistent, 7-day TTL)
L2: Memory Cache (server, 5min TTL)
L3: Redis (server, configurable TTL)
L4: Service Logic (DB/Qdrant/Ollama)
```

### Evidence Pipeline (9 stages)

1. MinIO upload + SHA-256 hash + PostgreSQL record
2. Text extraction: pdf-parse → OCR fallback (Tesseract)
3. Structure-aware chunking (legal-chunker.ts)
4. Embedding: gRPC → embeddinggemma → nomic-embed-text fallback
5. Dual storage: pgvector + Qdrant
6. Entity extraction (EMAIL, PHONE, DATE, CITATION, STATUTE, MONEY)
7. Forensic pattern detection (SSN, CC, contact density)
8. Summarization via Ollama gemma3-legal
9. GPU background analysis (similarity, clustering, case embedding)

---

## 9. Key Source Files

### Client-Side

| File | Purpose |
|------|---------|
| src/lib/ai/client-router.ts | Routes local vs server inference |
| src/lib/ai/client-cache.ts | LokiJS + IndexedDB dual-tier cache |
| src/lib/ai/client-embed.ts | 768-dim ONNX embeddings |
| src/lib/ai/onnx/session.ts | WebGPU → WASM → CPU session factory |
| src/lib/models/ChatSession.svelte.ts | Central routing hub (local/server) |
| src/lib/machines/retrieval-machine.ts | XState v5 retrieval orchestration |
| src/lib/components/editor/TiptapWithAIAssistant.svelte | Rich text editor |
| src/lib/components/ui/Button.svelte | Primary button component |
| src/lib/components/ui/Icon.svelte | UnoCSS icon wrapper (i-lucide-*) |
| src/lib/stores/unified/report-store.svelte.ts | Report CRUD store |
| src/lib/stores/unified/case-store.svelte.ts | Case management store |
| src/lib/stores/unified/evidence-store.svelte.ts | Evidence management store |

### Server-Side

| File | Purpose |
|------|---------|
| src/lib/server/db/schema-postgres.ts | Drizzle schema (83 tables, 20 enums) |
| src/lib/server/db/client.ts | Drizzle DB client singleton |
| src/lib/server/redis.ts | ioredis singleton + factory |
| src/lib/server/cache.ts | Dual-tier memory + Redis cache |
| src/lib/server/vector/qdrant-manager.ts | Qdrant client + hybrid search |
| src/lib/server/queue/rabbitmq-manager-fixed.ts | RabbitMQ 7-queue manager |
| src/lib/server/grpc/embedding-client.ts | gRPC embedding with HTTP fallback |
| src/lib/server/rag-pipeline.ts | End-to-end RAG for legal Q&A |
| src/lib/server/indexer/legal-chunker.ts | Structure-aware legal chunker |
| src/lib/server/analysis/entity-extraction.ts | LLM + regex entity extraction |
| src/lib/server/analysis/forensics.ts | PII/legal pattern detection |
| src/lib/server/reports/audit.ts | Report audit logging |
| src/lib/server/cache/report-template-cache.ts | Redis-backed template caching |
| src/lib/server/evidence-audit.ts | Evidence audit + versioning |
| src/mcp/server.ts | FastMCP server (9 tools) |

### Configuration

| File | Purpose |
|------|---------|
| vite.config.ts | Build config (352 lines), proxies, plugins |
| svelte.config.js | Svelte 5 runes, node adapter, aliases |
| unocss.config.ts | UnoCSS theme, shortcuts, presets |
| drizzle.config.ts | PostgreSQL connection, schema path |
| tsconfig.json | TypeScript config (services excluded) |
| docker-compose.yml | 13-service production stack |

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

---

## 12. Next Steps

See `next_steps/DRIZZLE_SCHEMA_MATCHING.md` for full roadmap:

- **Phase 3A**: LibTorch GPU Acceleration (batch similarity, clustering, GNN, matrix factoring) -- ~24h
- **Phase 3B**: Neo4j Knowledge Graph (Docker, Cypher schema, sync pipeline, 7 API endpoints) -- ~16h
- **Phase 3C**: Unified RAG + KAG + DAG Pipeline (query classifier, multi-signal merger, citation linker) -- ~28h
- **Total estimated**: ~52 hours across 6 weeks
