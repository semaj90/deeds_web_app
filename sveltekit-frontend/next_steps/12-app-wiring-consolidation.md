# 12 — App Directory Wiring Diagrams & Consolidation Plan

## Status: PLANNING
## Last Updated: March 12, 2026

---

## App Route Architecture (18 Top-Level Groups)

```
src/routes/
  +layout.svelte          ← Root: YorhaSidebar, analytics, stores, toasts, WebGPU init
  (app)/
    +layout.svelte        ← App: ErrorBoundary, dev banner, 5 global overlays
    ├── dashboard/        ← Homepage: stats, KB search, recent cases, AI assistant
    ├── cases/            ← Case CRUD: list, filters, new case modal, board sub-route
    │   └── [id]/board/   ← Evidence board: canvas, timeline, connections
    ├── evidence/         ← Evidence hub: upload, analysis, custody, search (1288 lines!)
    ├── evidence-library/ ← Evidence browsing/search
    ├── terminal/         ← AI chat: voice, TTS, STT, ChatSession model
    ├── citations/        ← Legal citations browser
    ├── persons-of-interest/ ← POI list/detail, threat scoring
    ├── analysis-center/  ← Multi-modal analysis: ACE, detective board, contracts
    ├── command-center/   ← Central command dashboard
    ├── active-cases/     ← Active case scoring
    ├── analytics/        ← Case analytics
    ├── global-search/    ← Semantic search: statutes, evidence, KB
    ├── recommendations/  ← AI recommendations
    ├── reports/          ← Report generation
    ├── system-configuration/ ← System config UI
    ├── demos/            ← Component demos (cache, bits-ui, GPU, icons, ACE)
    └── admin/            ← Admin parent (16 sub-routes)
        ├── all-routes/   ← Route inspector dashboard
        ├── ai-dashboard/ ← AI model dashboard
        ├── cache/        ← Cache management
        ├── codebase-index/ ← Codebase indexer UI
        ├── dev-tools/    ← Developer tools
        ├── error-brain/  ← Error analysis
        ├── knowledge-search/ ← KB search admin
        └── ...           ← 8 more admin sub-routes
```

---

## Layout Hierarchy

```
+layout.svelte (Root)
  ├── YorhaSidebar (210px → 60px collapsed)
  ├── analytics.init() + trackPageView()
  ├── initializeStores() / cleanupStores()
  ├── svelte-sonner Toaster (dynamic import)
  ├── WebGPU/CPU fallback init
  └── Notification bridge (store → toasts)

  (app)/+layout.svelte
    ├── DEV_BYPASS_AUTH banner
    ├── ErrorBoundary wrapper
    ├── Skip-to-main (WCAG 2.4.1)
    └── 5 Global Overlays (all dynamic imports):
        ├── CaseDocumentWriter (Ctrl+Shift+D)
        ├── CodebaseSearch
        ├── LegalCorpusSearch
        ├── OfflineIndicator
        ├── AccessibilityPanel
        └── AIChatWidget
```

---

## API Dependency Map

| Route | Server Load | API Calls | Form Actions |
|-------|-------------|-----------|--------------|
| **dashboard** | No | `/api/cases`, `/api/dashboard/stats`, `/api/glossary/search`, `/api/statutes/search`, `/api/precedents/search` | — |
| **cases** | Yes | `/api/cases` | `?/create`, `?/updateStatus` |
| **evidence** | Yes | `/api/evidence/search`, `/api/evidence/{id}/report`, `/api/evidence/analyze` | `?/upload`, `?/delete` |
| **terminal** | Yes | `/api/sse/chat` (SSE stream) | — |
| **citations** | No | `/api/citations/*` | — |
| **persons-of-interest** | Yes | `/api/persons-of-interest/{id}/similar` | — |
| **analysis-center** | Yes | `/api/ace/ingest` | — |
| **command-center** | Yes | Internal aggregation | — |
| **global-search** | No | `/api/evidence/search`, `/api/statutes/search` | — |
| **admin/all-routes** | No | `/api/internal/error-brain/status`, `/api/internal/error-brain/runs` | — |

---

## Store Dependencies

| Store | File | Used By | Notes |
|-------|------|---------|-------|
| **auth-store** | `auth-store.svelte.ts` | Root layout (all routes) | User auth state |
| **notifications** | `notifications.svelte.ts` | Root layout (all routes) | Toast notifications |
| **analytics** | `analytics.svelte.ts` | Root layout (all routes) | Page view tracking, batch flush |
| **appState** | `appState.svelte.ts` | Root layout | Global error state |
| **preferences** | `preferences.svelte.ts` | terminal, dashboard | User prefs (voice, persona) |
| **knowledge-search** | `knowledge-search.svelte.ts` | dashboard, citations | KB search state |
| **search** | `search.svelte.ts` | global-search, evidence | Search state |
| **gpu-summary** | `gpu-summary-store.svelte.ts` | admin/gpu-evidence-graph | GPU analysis |
| **user** | `user.svelte.ts` | Root layout | **REDUNDANT** with auth-store |
| **chat-store** | `chat-store.svelte.ts` | terminal | **REDUNDANT** with ChatSession model |

---

## Component Consolidation Priorities

### CRITICAL: Upload Components (12 → 3)

**Current (12 components):**
- SmartDocumentForm, EnhancedDocumentUploader, EnhancedFileUpload
- FileUploadSection, EvidenceUpload, UploadZone
- AIFileUpload, DocumentUploadMachineIntegration, EvidenceUploadModal
- UploadProgressCard, UploadProgress, BasicUpload

**Target (3 components):**
1. `BasicUpload.svelte` — drag/drop + file input + progress bar
2. `AdvancedUpload.svelte` — OCR + metadata + validation + preview
3. `XStateUpload.svelte` — document-upload-machine integration

**Impact:** Evidence page drops from 1288 → ~600 lines

### HIGH: Search Bars (3 → 1)

**Current:** StatuteSearchBar (global-search), KB search (dashboard inline), Evidence search (evidence inline)

**Target:** `SearchBar.svelte` with `type` prop (`statute` | `evidence` | `kb`) and result renderer snippet

### HIGH: Data Tables (5 → 1)

**Current:** Custom table/grid code in cases, evidence, POI, routes, analytics

**Target:** `DataTable.svelte` with column config, grid/list toggle, sort, pagination

### MEDIUM: Filter Bars (3 → 1)

**Current:** EvidenceFilters, FilterPanel (POI), inline filters (cases)

**Target:** `FilterBar.svelte` with schema-driven fields (Zod schema → filter UI)

### MEDIUM: Stats Panels (3 → 1)

**Current:** SystemStatusPanel, StatsPanel (POI), Dashboard stats grid

**Target:** `StatsGrid.svelte` with metric config (label, value, color, icon)

---

## Evidence Page Refactor

**Problem:** `/evidence` = 1288 lines, 43+ component imports — unmaintainable

**Solution:** Break into sub-routes:

```
(app)/evidence/
  +page.svelte          ← Main list/grid (lightweight, ~400 lines)
  +page.server.ts       ← Load evidence list + case data
  upload/
    +page.svelte        ← All upload components (BasicUpload, AdvancedUpload, XState)
  [id]/
    +page.svelte        ← Evidence detail (custody flow, connections, integrity)
    +page.server.ts     ← Load single evidence + audit log
  analyze/
    +page.svelte        ← Analysis tools (VLM, summarizer, legal processor)
```

---

## Component Directory Reorganization

**Current:** 39 directories — too fragmented

**Proposed:**
```
src/lib/components/
  ui/           ← Primitives: Button, Card, Dialog, Icon, Skeleton, ScrollArea
  layout/       ← PageHeader, DataBrowserLayout, YorhaSidebar, ErrorBoundary
  shared/       ← SearchBar, DataTable, FilterBar, StatsGrid, Upload components
  domain/
    cases/      ← CaseCard, CaseForm, CaseScoringDashboard
    evidence/   ← EvidenceCard, EvidenceGrid, CustodyFlow, Connections
    poi/        ← POICard, POIEditor, POIDetailView
    legal/      ← ContractAnalyzer, WorkspacePanel, Citations
    ai/         ← ChatWidget, TypewriterResponse, AIRecommendation, ChatSession
  canvas/       ← HybridBoard, DetectiveBoard
  yorha/        ← YoRHa-themed: DataViz, Grid, NES renderer
```

---

## Consolidation Metrics

| Metric | Current | Target | Savings |
|--------|---------|--------|---------|
| Upload components | 12 | 3 | -75% |
| Search components | 3 | 1 | -67% |
| Table components | 5 | 1 | -80% |
| Filter components | 3 | 1 | -67% |
| Stats components | 3 | 1 | -67% |
| Evidence page lines | 1288 | ~400 (main) | -69% |
| Component directories | 39 | ~10 | -74% |
| Total components | 544 | ~450 est. | -17% |

---

## Execution Phases

| Phase | Task | Impact | Risk |
|-------|------|--------|------|
| **1** | Consolidate upload components (12 → 3) | High | Medium |
| **2** | Extract shared DataTable + SearchBar + FilterBar | High | Low |
| **3** | Refactor /evidence into sub-routes | High | Medium |
| **4** | Merge redundant stores (auth+user, chat-store) | Low | Low |
| **5** | Reorganize component directories (39 → 10) | Medium | High (many imports) |
| **6** | Create `$lib/api/` typed fetch wrappers | Medium | Low |

---

## Service URL Wiring (env.server.ts)

All service URLs now go through centralized getters:

| Getter | Port | Service |
|--------|------|---------|
| `getDatabaseUrl()` | 5432 | PostgreSQL |
| `getRedisUrl()` | 6379 | Redis |
| `getQdrantUrl()` | 6333 | Qdrant vector DB |
| `getOllamaUrl()` | 11434 | Ollama LLM |
| `getRabbitMQUrl()` | 5672 | RabbitMQ AMQP |
| `getRabbitMQManagementUrl()` | 15672 | RabbitMQ Management API |
| `getCouchDbUrl()` | 5984 | CouchDB |
| `getMinioConfig()` | 9000 | MinIO S3 |
| `getNeo4jConfig()` | 7687 | Neo4j graph DB |
| `getCodebaseIndexUrl()` | 8090 | FastAPI codebase indexer |
| `getTrtLlmUrl()` | 8099 | TRT-LLM inference |
| `getTritonUrl()` | 8000 | Triton inference server |
| `getOrchestratorUrl()` | 8102 | Workflow orchestrator |
| `getCudaServiceUrl()` | 8765 | CUDA compute service |
| `getGoMicroserviceUrl()` | 8080 | Go gRPC microservice |
| `getRagServiceUrl()` | 8103 | RAG service |

All support Docker host override via `isDocker` flag.
