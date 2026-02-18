# 📋 Canonical Routes Reference

## Quick Lookup Table

| Tab | Route | Label | Kind | Badges | Priority |
|-----|-------|-------|------|--------|----------|
| **cases** | `/cases` | Case List | page | | 1 |
| **cases** | `/cases/new` | Create Case | page | 🤖 ai | 2 |
| **cases** | `/cases/[id]/overview` | Case Overview | page | 🤖 ai, 🛡️ shield | 3 |
| **cases** | `/cases/[id]/evidence` | Case Evidence | page | 🤖 ai | 4 |
| **cases** | `/cases/[id]/board` | Detective Board | page | 🤖 ai | 5 |
| **cases** | `/cases/[id]/chat` | Chat Stream | page | 🤖 ai | 6 |
| **cases** | `/cases/[id]/ai` | AI Assistant | page | 🤖 ai, 🛡️ shield | 7 |
| **cases** | `/cases/[id]/persons` | Case Persons | page | 🤖 ai | 8 |
| **cases** | `/cases/[id]/reports` | Reports Editor | page | 🤖 ai, 🛡️ shield | 9 |
| **evidence** | `/evidence` | Evidence Library | page | 🤖 ai | 1 |
| **evidence** | `/evidence-board` | Evidence Board | page | 🤖 ai | 2 |
| **evidence** | `/evidence-workspace` | Evidence Workspace | page | 🤖 ai | 3 |
| **evidence** | `/gpu-evidence-graph` | GPU Evidence Graph | page | 🤖 ai, ✨ experimental | 4 |
| **persons** | `/persons` | People Registry | page | 🤖 ai | 1 |
| **system** | `/dashboard` | Dashboard | page | 🛡️ shield | 1 |
| **system** | `/all-routes` | Command Center | page | | 2 |
| **system** | `/api/phase72/routes` | Phase 72 Routes | server | | 3 |
| **system** | `/api/errors/summary` | Error Summary | server | | 4 |
| **system** | `/api/consolidation/status` | Consolidation Status | server | | 5 |
| **system** | `/command/routes` | Command Routes | server | | 6 |
| **system** | `/api/cases/[id]` | Case API | page_server | ⚠️ experimental | 7 |
| **system** | `/api/cases/[id]/evidence` | Evidence API | page_server | ⚠️ experimental | 8 |
| **system** | `/api/cases/[id]/persons` | Persons API | page_server | ⚠️ experimental | 9 |
| **system** | `/api/legal/chat` | Chat API | page_server | ⚠️ experimental | 10 |
| **system** | `/api/reports/generate` | Generate API | page_server | ⚠️ experimental | 11 |
| **system** | `/api/reports/save` | Save API | page_server | ⚠️ experimental | 12 |

---

## By Tab

### 📋 Cases (9 Routes)

#### 1. `/cases` – Case List
- **Type:** page
- **Badges:** -
- **Description:** Search and list all cases with filters
- **Purpose:** Entry point for case management
- **Data:** All cases from DB, total count, recent activity
- **Users:** Prosecutors, paralegals

#### 2. `/cases/new` – Create Case
- **Type:** page
- **Badges:** 🤖 ai
- **Description:** 7-step wizard to create new case
- **Purpose:** Structured case onboarding
- **Steps:** Basic info → Charges → Persons → Evidence → Team → Settings → Review
- **AI Integration:** Charge suggestion, related cases

#### 3. `/cases/[id]/overview` – Case Overview
- **Type:** page
- **Badges:** 🤖 ai, 🛡️ shield
- **Description:** 5W1H case summary with key metrics
- **Purpose:** At-a-glance case dashboard
- **Shows:** Who (defendants/victims), What (charges), When (timeline), Where (locations), Why (motive), How (evidence summary)
- **Phase 72 Badges:** Error clusters, missing AI imports

#### 4. `/cases/[id]/evidence` – Case Evidence
- **Type:** page
- **Badges:** 🤖 ai
- **Description:** Evidence list for this case with filters/search
- **Purpose:** Organize and manage case evidence
- **Shows:** Exhibits, documents, images, forensics
- **AI:** Relevance scoring, clustering

#### 5. `/cases/[id]/board` – Detective Board
- **Type:** page
- **Badges:** 🤖 ai
- **Description:** Canvas interface for evidence relationships
- **Purpose:** Visual case theory building
- **Features:** Drag evidence, draw connections, add notes
- **Tech:** TailwindCSS, canvas library

#### 6. `/cases/[id]/chat` – Chat Stream
- **Type:** page
- **Badges:** 🤖 ai
- **Description:** Human messaging and notes
- **Purpose:** Team collaboration
- **Shows:** Message history, file sharing, @mentions
- **Real-time:** WebSocket/Server-Sent Events

#### 7. `/cases/[id]/ai` – AI Legal Assistant
- **Type:** page
- **Badges:** 🤖 ai, 🛡️ shield
- **Description:** AI-powered legal analysis
- **Purpose:** Generate charges, identify weaknesses, predict PC
- **Features:** Charge assistant, PC predictor, weakness finder
- **Phase 90:** XState for validation workflow

#### 8. `/cases/[id]/persons` – Case Persons
- **Type:** page
- **Badges:** 🤖 ai
- **Description:** Defendants, victims, witnesses for this case
- **Purpose:** Manage people linked to case
- **Shows:** Demographics, relationships, aliases
- **Cross-linking:** Appears across multiple cases

#### 9. `/cases/[id]/reports` – Reports Editor
- **Type:** page
- **Badges:** 🤖 ai, 🛡️ shield
- **Description:** TipTap-based rich text editor for legal documents
- **Purpose:** Generate and save case reports (accusations, memos, etc.)
- **Features:** AI-assisted writing, HTML export, templates
- **Phase 90:** Validation for legal language

---

### 🔍 Evidence (4 Routes)

#### 1. `/evidence` – Evidence Library
- **Type:** page
- **Badges:** 🤖 ai
- **Description:** Global evidence search across all cases
- **Purpose:** Discover relevant evidence from case history
- **Filters:** Type (image, document, forensic), date, relevance, cases
- **AI:** Cross-case semantic search

#### 2. `/evidence-board` – Evidence Board
- **Type:** page
- **Badges:** 🤖 ai
- **Description:** Global canvas for evidence relationship mapping
- **Purpose:** Analyze evidence patterns across cases
- **Shows:** All evidence nodes, connections, clusters
- **Use Case:** Find serial patterns, modus operandi

#### 3. `/evidence-workspace` – Evidence Workspace
- **Type:** page
- **Badges:** 🤖 ai
- **Description:** Advanced evidence analysis tools
- **Purpose:** In-depth forensic analysis
- **Tools:** Image enhancer, document analyzer, timeline builder
- **Tech:** GPU-accelerated image processing (experimental)

#### 4. `/gpu-evidence-graph` – GPU Evidence Graph
- **Type:** page
- **Badges:** 🤖 ai, ✨ experimental
- **Description:** CUDA-accelerated evidence clustering
- **Purpose:** Fast semantic analysis of large evidence sets
- **Tech:** TensorRT, CUDA kernels, GPU memory management
- **Status:** Experimental, use with caution

---

### 👥 Persons (1 Route)

#### 1. `/persons` – People Registry (aka `/persons-of-interest`)
- **Type:** page
- **Badges:** 🤖 ai
- **Description:** Global registry of all people (defendants, victims, witnesses)
- **Purpose:** Cross-case person management and search
- **Features:** Photo ID, demographics, relationships, cross-case links
- **Data:** PostgreSQL via Drizzle ORM (`persons` table in `schema-postgres.ts`). Columns include `aliases` (JSONB), `threatLevel`, `photos` (JSONB with `faceEmbedding` and `landmarks` fields), `ai` (JSONB: `riskScore`, `patterns`, `recommendations`).
- **API:** `GET/POST /api/persons` (flat endpoint with `?caseId=` filter). Uses separate `persons_of_interest` table in legacy `schema.ts` — schema fragmentation issue.
- **AI Status:** Schema has fields for AI profiles and face embeddings but **nothing is wired** — no Ollama, no Qdrant, no pgvector, no embedding calls. AI JSONB fields are never populated by any route.
- **Create:** Superforms v2 + Zod validation at `/persons-of-interest/create` — real DB insert, works.
- **Detail:** `/persons-of-interest/[id]` — displays POI data, has Associates tab (calls non-existent API, always errors), "Similar POIs" tab is placeholder.
- **Components:** 8 POI components exist in `src/lib/components/poi/` (face match dialog, photo grid, editor, stats) — only `POIForm.svelte` is imported by an active route. Others are orphaned.
- **Microservices:** `langextract-go` is a CLI tool for legal doc extraction (unrelated to persons). `go-chat-service` (port 9000) and `go-enhanced-rag-service` (port 8080) exist but are **not wired** to persons routes. No Python service serves POI data.

---

### ⚙️ System (12 Routes)

#### Diagnostics (6 Routes)

##### 1. `/dashboard` – Dashboard
- **Type:** page
- **Badges:** 🛡️ shield
- **Description:** System dashboard with active cases and alerts
- **Purpose:** Command center status overview
- **Shows:** Active cases, recent activity, Phase 72 status, error summary
- **Alerts:** Critical errors, tasks due, team activity

##### 2. `/all-routes` – Command Center
- **Type:** page
- **Badges:** -
- **Description:** This route! Interactive route explorer
- **Purpose:** Navigate and understand the application
- **Features:** 4 tabs, search, filter, modal details

##### 3. `/api/phase72/routes` – Phase 72 Routes
- **Type:** server
- **Badges:** -
- **Description:** Exposes route-ast-graph.json for inspection
- **Purpose:** Access Phase 72 data programmatically
- **Returns:** { nodes: [...], edges: [...], metadata: {...} }

##### 4. `/api/errors/summary` – Error Summary
- **Type:** server
- **Badges:** -
- **Description:** Error clustering and summary statistics
- **Purpose:** Dashboard and diagnostic views
- **Returns:** Error clusters, hot spots, trends

##### 5. `/api/consolidation/status` – Consolidation Status
- **Type:** server
- **Badges:** -
- **Description:** Track [caseId] → [id] migration progress
- **Purpose:** Monitor schema consolidation
- **Returns:** % complete, errors, timeline

##### 6. `/command/routes` – Command Routes
- **Type:** server
- **Badges:** -
- **Description:** Raw route dump for debugging
- **Purpose:** Developer view of all routes
- **Returns:** Flattened array of all routes

#### API Routes (6 Routes)

All API routes marked with ⚠️ **experimental** badge.

##### 1. `/api/cases/[id]` – Case CRUD
- **Type:** page_server
- **Methods:** GET, POST, PATCH, DELETE
- **Purpose:** Case data operations
- **Returns:** Case object with metadata

##### 2. `/api/cases/[id]/evidence` – Evidence Management
- **Type:** page_server
- **Methods:** GET, POST, PATCH, DELETE
- **Purpose:** Manage evidence for case
- **Returns:** Evidence list or modified evidence

##### 3. `/api/cases/[id]/persons` – Persons Management
- **Type:** page_server
- **Methods:** GET, POST, PATCH, DELETE
- **Purpose:** Manage people for case
- **Returns:** Persons list or modified person

##### 4. `/api/legal/chat` – Chat API
- **Type:** page_server
- **Methods:** POST
- **Purpose:** Send message, receive AI response
- **Returns:** Message object with response

##### 5. `/api/reports/generate` – Generate Report
- **Type:** page_server
- **Methods:** POST
- **Purpose:** Generate legal report with AI
- **Returns:** Generated HTML/text

##### 6. `/api/reports/save` – Save Report
- **Type:** page_server
- **Methods:** POST
- **Purpose:** Save report to database
- **Returns:** Saved report metadata

---

## Badge Definitions

| Badge | Icon | Color | Meaning | Enrichment Source |
|-------|------|-------|---------|-------------------|
| **ai** | 🤖 | Yellow (#ffffcc) | Route imports from $lib/ai/* or uses AI services | Phase 72 AST graph |
| **shield** | 🛡️ | Green (#ccffcc) | Has XState machine and @ts-nocheck validation | Phase 90 shield report |
| **error** | ⚠️ | Red (#ffcccc) | Has compilation or runtime errors | Error brain clusters |
| **experimental** | ✨ | Orange (#ffeecc) | Experimental feature, may be unstable | Canonical manifest |
| **online** | ✅ | Green (#ccffcc) | Route is online and responding (health check) | Runtime health check |

---

## Organization Principles

### Canonical ≠ Complete
- **Canonical:** The 30 routes that matter (user-facing, mission-critical)
- **Complete:** 1,495 routes from Phase 72 AST graph (internal, utilities, etc.)

The Command Center shows **canonical** routes prominently. Phase 72 enrichment adds metadata (badges, descriptions, AI detection) to canonical routes.

### Tab Strategy
- **Cases:** All case lifecycle routes (`/cases*`)
- **Evidence:** Evidence-focused routes (`/evidence*`, `/gpu-*`)
- **Persons:** People registry
- **System:** Diagnostics, APIs, status endpoints

This grouping helps users **find what they need** without cognitive overload.

### Priority Ordering
Within each tab, routes are ordered by **priority**:
- **1-3:** Most frequent user actions
- **4-6:** Common workflows
- **7-9:** Advanced features
- **10+:** Diagnostics, APIs

---

## Implementation Checklist

- [x] Define 30 canonical routes
- [x] Create command-center-manifest.ts
- [x] Implement enrichRoutesWithPhase72()
- [x] Design NES UI with 4 tabs
- [x] Create /all-routes component
- [ ] Fix CSS compilation error
- [ ] Test tab switching
- [ ] Test search/filter
- [ ] Test modal interaction
- [ ] Integrate Phase 72 enrichment (badges)
- [ ] Integrate Phase 90 shield data
- [ ] Integrate error summary data
- [ ] Add health checks for "online" badge
- [ ] Performance test (< 50ms table render)

---

## Usage Examples

### Find a specific case page
1. Click **📋 Cases** tab
2. Search "overview"
3. Click `/cases/[id]/overview`

### Check system status
1. Click **⚙️ System** tab
2. Click `/dashboard` → View active cases and alerts

### Debug compilation errors
1. Click **⚙️ System** tab
2. Find route with ⚠️ **error** badge
3. Click modal to see error details
4. Fix and Phase 72 will auto-detect

### Explore API endpoints
1. Click **⚙️ System** tab
2. Scroll to bottom → See 6 API routes
3. Read descriptions to understand each endpoint

---

---

## Production Readiness Audit (February 2026)

### Page Routes

| Route | Exists | Server Load | Key Features | Prod Status |
|-------|--------|-------------|-------------|-------------|
| `/cases` | Y | Real DB + filters | List, bulk actions, create | **WORKING** |
| `/cases/new` | Y | Minimal (recent cases) | 6W1H form, file upload UI | **PARTIAL** — no AI charge suggestion, files not linked pre-creation |
| `/cases/[id]/overview` | Y | Case + evidence rows | 5W1H display, evidence count | **PARTIAL** — WHY/HOW always null, persons always empty, AI/Reports tabs placeholder |
| `/cases/[id]/evidence` | N | N/A | Does not exist as own route | **MISSING** — upload sub-route exists and is fully wired (5-tier pipeline) |
| `/cases/[id]/board` | Y | Canvas state from DB | Real drag-and-drop canvas, save/restore | **WORKING** — no evidence pre-population |
| `/cases/[id]/chat` | Y | Auth only | Real SSE streaming via Ollama | **WORKING** — no case context injected |
| `/cases/[id]/ai` | Y | Auth only | Quick actions UI | **BROKEN** — calls dead `/api/legal/chat` (404), no XState |
| `/cases/[id]/persons` | Y | Auth only | Person card display UI | **BROKEN** — API endpoint `/api/cases/[id]/persons` missing (404), add modal missing |
| `/cases/[id]/reports` | Y | Auth only | TipTap editor, generate/save | **PARTIAL** — reports list never loads from DB, generate produces template not AI |
| `/evidence` | Y | Real DB + form actions | Evidence list, MinIO upload, delete/update | **WORKING** |
| `/evidence-board` | N | N/A | Does not exist | **MISSING** |
| `/evidence-workspace` | N | N/A | Does not exist | **MISSING** |
| `/gpu-evidence-graph` | Y | None (client only) | WebGPU detection, empty canvas | **STUB** — no data, no CUDA |
| `/persons-of-interest` | Y | Real DB query | List, create, detail view | **PARTIAL** — no AI, associates tab broken, similar POIs placeholder |
| `/dashboard` | Y | None (client fetch) | Case list, stats display | **PARTIAL** — `/api/dashboard/stats` missing, stats always 0 |
| `/all-routes` | Y | Real AST graph + DB enrichment | NES Command Center, SSE health | **WORKING** |

### API Routes

| Route | Exists | Logic | Prod Status |
|-------|--------|-------|-------------|
| `/api/cases/[id]` | Y | GET/PATCH/DELETE with auth + ownership | **WORKING** |
| `/api/cases/[id]/evidence` | N | N/A | **MISSING** — use `/evidence?caseId=X` or `/api/evidence/upload` |
| `/api/cases/[id]/persons` | N | N/A | **MISSING** — use `/api/persons?caseId=X` |
| `/api/legal/chat` | N | N/A | **MISSING** — use `/api/chat/stream` or `/api/sse/chat` instead |
| `/api/reports/generate` | Y | DB reads + template generation | **PARTIAL** — no AI, template-based output |
| `/api/reports/save` | Y | Full DB update | **WORKING** |
| `/api/evidence/upload` | Y | 5-tier pipeline (MinIO → OCR → chunk → embed → store) | **WORKING** |
| `/api/evidence/search` | Y | pgvector cosine search + graph-hop expansion | **WORKING** |
| `/api/persons` | Y | GET (filter) + POST (create) | **WORKING** |
| `/api/phase72/routes` | N | N/A | **MISSING** — only `capture-error` + `suggest-fix` exist |
| `/api/errors/summary` | N | N/A | **MISSING** — data read from static JSON file |
| `/api/consolidation/status` | N | N/A | **MISSING** |
| `/command/routes` | N | N/A | **MISSING** |

### Microservices

| Service | Port | HTTP Server | Used by SvelteKit |
|---------|------|-------------|-------------------|
| `langextract-go/` | — | No (CLI tool) | No |
| `go-chat-service/` | 9000 | Yes (Gin) | No (not wired) |
| `go-enhanced-rag-service/` | 8080 | Yes (Gin + CUDA) | Indirect (client exists, CUDA fragile) |
| `rag_kag_gateway/` (Python) | 8099 | Yes (FastAPI) | No |
| `ai-server/` (Python) | — | Yes (FastAPI) | No |

**Bottom line:** All RAG, embedding, and evidence processing is handled by SvelteKit's server-side TypeScript routes. Go/Python microservices are orphaned experiments or CUDA acceleration stubs not actively called by the production app.

### Readiness Summary

- **Fully working:** 8 routes (cases list, board, chat, evidence, all-routes, cases API CRUD, reports save, evidence upload/search)
- **Partial:** 6 routes (cases/new, overview, reports, persons, dashboard, reports/generate)
- **Broken:** 2 routes (cases/[id]/ai, cases/[id]/persons)
- **Missing:** 8 claimed routes that do not exist on disk
- **Stub:** 1 route (gpu-evidence-graph)

**Last Updated:** February 2026
**Status:** ~65% production ready (8/25 canonical routes fully working)
**Routes:** 25 canonical routes audited (8 of 30 claimed routes do not exist)
