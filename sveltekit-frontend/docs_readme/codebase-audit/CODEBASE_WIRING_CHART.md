# Deeds Web App — Codebase Wiring Chart

**Last Updated:** February 24, 2026 (Session 93r15)

---

## Codebase Metrics

| Category | Count |
|----------|-------|
| App pages (+page.svelte) | 89 |
| Page load functions (+page.ts) | 19 |
| Server load functions (+page.server.ts) | 49 |
| Layouts (+layout.svelte) | 5 |
| Layout load (+layout.ts/server.ts) | 5 |
| API endpoints (+server.ts) | 140 |
| Error pages (+error.svelte) | 1 |
| Route groups | 2: (app), (dev) |
| .svelte files | 909 |
| .ts files | 1,567 |
| .svelte.ts files | 44 |
| **Total src files** | **~2,520** |

---

## SSR Status

| Route | SSR | Reason |
|-------|-----|--------|
| /evidence | OFF | bits-ui Dialog TDZ (LegalAnalysisDialog) |
| /evidence-library | OFF | bits-ui Dialog TDZ (EvidenceModal) |
| /ai-dashboard | OFF | 28 browser-only AI/inference components |
| /evidence-canvas-demo | OFF | Canvas/WebGL |
| /nier-showcase | OFF | Browser animations |
| /gpu-evidence-graph | OFF | WebGPU |
| /rag-search | OFF | Client-only RAG (could re-enable) |
| All other routes | ON | SSR-safe |

---

## Routes → Components → APIs

### Primary App Routes

```
Dashboard
  ├─ Components: SystemStatusPanel, WorkspacePanel, RecentActivity, ActiveCasesWidget
  ├─ GET /api/dashboard/stats → { activeCases, pendingEvidence, personsOfInterest, totalCitations }
  ├─ GET /api/routes/events (SSE) → route health
  └─ GET /api/health/capabilities → server status

Cases
  ├─ Components: CaseSelector, NewCaseModal, StatusBadge, PriorityBadge
  ├─ GET /api/cases → case list (load function)
  ├─ POST /api/cases → create case
  └─ GET/PUT /api/cases/[id] → detail/update

Evidence
  ├─ Components: SmartDocumentForm, DocumentDetails, EvidenceAssistant, VisionImageAnalyzer
  ├─ POST /api/evidence/upload → 8-stage pipeline
  ├─ POST /api/evidence/search → RAG+KAG+DAG
  └─ GET /api/evidence/realtime?jobId=xxx (SSE) → progress

AI-Dashboard
  ├─ Components: AskAI, ClientSideAIChat, IntelligentModelOrchestrator, Gemma270MWebAssembly
  ├─ POST /api/sse/chat → streaming inference
  ├─ POST /api/rag/search → vector search
  ├─ POST /api/rag/validate → source validation
  └─ POST /api/rag/answer → synthesis with citations

Global-Search
  ├─ Components: RAGSearchComponent, SearchPanel, VectorIntelligenceDemo
  ├─ GET /api/evidence/search (debounced)
  ├─ POST /api/codebase-index/search → Fuse.js + Qdrant
  ├─ GET /api/glossary/search → KB toggle
  └─ GPU RERANKING (optional): WebGPU batch cosine similarity

Persons-of-Interest
  ├─ Components: PersonCRUD, AssociatesFinder, RelationshipGraph
  ├─ GET/POST /api/persons → list/create
  └─ GET /api/persons-of-interest/[id]/associates → shared caseIds

Citations
  ├─ GET /api/statutes/search
  ├─ GET /api/precedents/search
  └─ GET /api/glossary/search

Command-Center
  ├─ GET /api/phase89/stats → error counts
  ├─ GET /api/phase89/clusters → error clustering (Qdrant)
  └─ POST /api/phase89/agentic-fix → CrewAI recommendation

Memory-Palace
  ├─ Components: CHR97Reader, DataViewer, NES bank utilization
  └─ No API calls — client-side binary parsing only
```

---

## Data Flow Layers

```
┌──────────────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                           │
│                                                               │
│  Routes (+page.svelte) → Components → Stores (.svelte.ts)    │
│                                                               │
│  Client AI Pipeline:                                          │
│  ChatSession → client-router → onnx/session → client-embed   │
│       ↕              ↕              ↕             ↕           │
│  (routing)    (health check)   (WebGPU/WASM)  (768-dim)      │
│                                                               │
│  Cache: LokiJS (5min) → IndexedDB (7-day)                   │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTP / SSE
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                  API LAYER (SvelteKit +server.ts)             │
│                                                               │
│  140 endpoints: evidence, rag, chat, cases, persons, health  │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                SERVER SERVICES (src/lib/server/)              │
│                                                               │
│  Evidence: minio → ocr → chunker → embedder → qdrant        │
│  RAG:      embed → qdrant + pgvector → rerank → graph-hop   │
│  Chat:     ollama streaming → SSE → client                   │
│  Cache:    memory (5min) → Redis (configurable TTL)          │
└──────┬──────────┬──────────┬──────────┬──────────┬───────────┘
       │          │          │          │          │
       ▼          ▼          ▼          ▼          ▼
  PostgreSQL   Qdrant     Redis     MinIO      Ollama
  (pgvector)   (768d)    (cache)   (files)    (GPU LLM)
  70+ tables   6 coll.   pub/sub   evidence/  gemma3-legal
               ANN       DLQ       uploads/   embeddinggemma
```

---

## Client AI Inference Pipeline

```
User Message
  │
  ├─ fetchCapabilities() [30s cache] → /api/health/capabilities
  │
  ├─ shouldEscalateToServer(msg, context, capabilities)
  │   ├─ LEGAL_KEYWORDS → server
  │   ├─ RAG_TRIGGER_KEYWORDS → server
  │   ├─ msg.length > 500 → server
  │   ├─ Ollama DOWN → force local
  │   └─ Simple query → local
  │
  ├─ [LOCAL] ONNX (gemma3_270m via WebGPU/WASM/CPU)
  │   ├─ Check IndexedDB cache → hit? return
  │   ├─ Load ONNX session (WebGPU → SIMD → CPU)
  │   ├─ Tokenize (max 512) → inference → greedy decode (max 128)
  │   └─ Cache in IndexedDB (7-day TTL)
  │
  └─ [SERVER] Ollama + RAG
      ├─ POST /api/sse/chat
      ├─ Embed query → Qdrant ANN → rerank → graph-hop → context
      ├─ Ollama gemma3-legal (11.8B Q4_K_M) → SSE stream
      └─ Client SSE reader → incremental UI update
```

---

## Evidence Upload Pipeline (8 stages)

```
File → SHA-256 hash
  → MinIO upload (evidence/{caseId}/{timestamp}.{ext})
  → PostgreSQL record (evidence table)
  → Text extraction (pdf-parse → Tesseract fallback)
  → Legal chunking (ARTICLE/SECTION/§, max 1024 tokens, 128 overlap)
  → Embedding (gRPC → Ollama embeddinggemma, 768-dim)
  → Dual vector storage (pgvector + Qdrant evidence_items)
  → Analysis (entity extraction + forensics + summarization)
  → Job complete → SSE notification → UI refresh
```

---

## Cache Hierarchy

```
L0: LokiJS (client, 5-10min TTL, session-scoped)
L1: IndexedDB (client, 7-day TTL, persistent)
L2: Memory Cache (server, 5min TTL, in-process Map)
L3: Redis (server, configurable TTL, cross-request)
L4: Service Logic (DB/Qdrant/Ollama) → write back L0-L3
```

---

## Infrastructure Services

| Service | Port | Role | Status |
|---------|------|------|--------|
| Ollama (native) | 11434 | LLM + embeddings (GPU) | ACTIVE |
| PostgreSQL | 5434 | Main DB + pgvector | UP |
| Redis | 6379 | Cache + pub/sub | UP |
| Qdrant | 6333 | Vector DB (768-dim) | UP |
| MinIO | 9000 | Evidence file storage | UP |
| RabbitMQ | 5672 | Job queue (7 queues) | UP |
| FastMCP | 3003 | RAG+KAG+DAG tools | DOWN |
| TensorRT-LLM | 8099 | Optional accelerator | STOPPED |

---

## Key Source Files

### Client
| File | Purpose |
|------|---------|
| `lib/ai/client-router.ts` | Health-aware local↔server routing |
| `lib/ai/client-embed.ts` | 768-dim ONNX embeddings |
| `lib/ai/client-cache.ts` | LokiJS + IndexedDB dual cache |
| `lib/ai/onnx/session.ts` | WebGPU → WASM → CPU factory |
| `lib/models/ChatSession.svelte.ts` | Central chat routing hub |
| `lib/machines/retrieval-machine.ts` | XState v5 2-stage search |

### Server
| File | Purpose |
|------|---------|
| `lib/server/redis.ts` | ioredis singleton |
| `lib/server/db/schema-postgres.ts` | 70+ tables, 14 enums |
| `lib/server/vector/qdrant-manager.ts` | Qdrant hybrid search |
| `lib/server/grpc/embedding-client.ts` | gRPC → Ollama fallback |
| `lib/server/indexer/legal-chunker.ts` | Structure-aware chunks |
| `lib/server/analysis/entity-extraction.ts` | LLM + regex NER |
| `lib/server/analysis/forensics.ts` | PII/legal patterns |
| `lib/server/minio-client.ts` | S3-compatible storage |
| `lib/server/queue/rabbitmq-manager-fixed.ts` | 7-queue manager |

### State Machines (XState v5)
| Machine | Purpose |
|---------|---------|
| aiAssistantMachine | Chat orchestration |
| retrieval-machine | RAG 2-stage search |
| document-upload-machine | Evidence upload FSM |
| case-creation-machine | Case CRUD validation |
| rabbitmq-xstate-integration | MQ connection lifecycle |
