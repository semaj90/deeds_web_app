# All-Routes Directory Consolidation

## Date: March 18, 2026
## Status: ROUTE DIRECTORY COMPLETE — production-readiness audit still partial

---

## Overview

Comprehensive audit and enhancement of the `/admin/all-routes` page to display the **entire web app** — every API endpoint, page, demo, and archived route — as a dev review directory with proper categorization and mapping.

### April 3, 2026 Scope Clarification

This document proves that the route directory and cross-reference tooling were built out. It does **not** prove all of the following for every route:

- SSR correctness
- hydration correctness
- successful render under live data dependencies
- stable degraded JSON shapes on GET failures
- Zod coverage on every write surface
- schema/runtime parity between Drizzle, database, and UI payloads

Use this file as the route inventory and explorer reference, not as the canonical production-readiness verdict.

---

## Actual Route Inventory (Verified March 18, 2026)

| File Type | Count | Notes |
|-----------|-------|-------|
| `+server.ts` (API endpoints) | **321** | Under `/api/` (315) + scattered (6) |
| `+page.svelte` (Pages) | **128** | 97 in `(app)`, 13 in `(dev)`, 18 standalone/admin |
| `+page.server.ts` (Server actions) | **66** | Load functions + form actions |
| `+page.ts` (Client loaders) | **35** | Client-side data loading |
| `+layout.svelte` | **6** | Root + group layouts |
| `+layout.ts` / `+layout.server.ts` | **5** | Layout data loading |
| **TOTAL active route files** | **561** | |
| Archived (deeds_labs/) | **1,758** | Historical routes |

### Previous vs Actual Counts
| Metric | Old (Plan) | Actual | Delta |
|--------|-----------|--------|-------|
| API endpoints | 202 | **321** | +119 |
| Pages | 107 | **128** | +21 |
| Total active | ~309 | **515** | +206 |
| Categories | ~30 | **80+** | +50 |

---

## API Categories (80+ sub-categories under `/api/`)

### Major (10+ endpoints)
| Category | Count | Description |
|----------|-------|-------------|
| cases | 24 | Case CRUD, AI, board, canvas, chat, notes, persons, reports |
| phase89 | 22 | Phase 89 auto-fix pipeline endpoints |
| ai | 20 | AI services — chat, prediction, scoring, feedback, embeddings |
| evidence | 18 | Evidence upload (8-stage), analysis, search, realtime SSE |
| library | 15 | Legal library — documents, nodes, chunks, search, glossary |
| health | 14 | System health — capabilities, Qdrant, Redis, Ollama status |
| error-brain | 10 | Error aggregation, historical runs, suggestions |
| persons-of-interest | 10 | POI CRUD, AI enhancement, photos, relationships |
| citations | 10 | Citation management, collections, law lookup |

### Medium (4-9 endpoints)
| Category | Count |
|----------|-------|
| routes | 9 |
| reports | 8 |
| codebase-index | 8 |
| auth | 8 |
| cache | 8 |
| search | 6 |
| system | 6 |
| admin | 6 |
| graph | 5 |
| knowledge | 5 |
| cartridge | 4 |
| codebase | 4 |
| analytics | 4 |
| recommendations | 4 |
| rag | 4 |

### Small (1-3 endpoints)
gpu, tags, phase72, chat, nlp, ace, pipeline, push, sse, statutes, stream, topology, web, phase82, internal, yorha, documents, acp, detective, engagement, glossary, docs, dashboard, security, consolidation, case-theory, analyze-tag, summarize, synthesis, analyze-file, agents, tools, agent, user, v1, vision, document, worker, rabbitmq, qlora, kb, infrastructure, indexing, metrics, ml, gpu-wasm-integration, ollama, ingest-constitution, onboarding, persons, generate-cluster-summaries, feedback, errors, ping, precedents, embed, orchestrator, investigate

---

## Page Routes (128 total)

### (app) Group — 97 pages
| Section | Pages | Key Routes |
|---------|-------|------------|
| **Admin Tools** | 20 | all-routes, ai-dashboard, error-brain, phase78, phase89, codebase-index, component-analysis, gpu-evidence-graph, knowledge-search, qlora-training, ast-topology, cache, codebase-viewer, dev-tools |
| **Cases** | 13 | cases list, [id] detail, ai, board, canvas, chat, evidence/upload, notes, overview, persons, reports, new |
| **Demos** | 26 | ace-pipeline, agentic-errors, bits-ui, cache, case-scoring, document-summarizer, evidence-canvas, gpu-cache, icons, investigate, keyboard-shortcuts, knowledge-graph, memory-palace, nes-elements, nes-routes, nier-showcase, particles, phantom-code-lab, rag-documents, retro-recommendations, smart-positioning, spotlight, vector-search, webgpu-memory-palace |
| **Citations** | 4 | list, [...label], law, law/[citation] |
| **Command Center** | 6 | main, codebase, clusters/[id], components/[id], errors, graph |
| **Evidence** | 6 | list, library, analyze, hash, manage, realtime, upload |
| **Library** | 6 | list, [documentId], node/[nodeId], reader, corpus, glossary |
| **Legal Corpus** | 2 | list, [id] |
| **Persons of Interest** | 3 | list, [id], create |
| **Reports** | 4 | list, [id], [id]/edit, new |
| **Other** | 7 | dashboard, active-cases, analysis-center, analytics, global-search, recommendations, system-configuration, terminal |

### (dev) Group — 13 pages
cache-demo, dashboard-phase14, demo/bits-ui, demo/streaming, demo/svelte5-components, odin, phase89/error-map, test, test-source-validation, test-user-store, tts-demo, verify-drizzle, voice-chat-demo

### Standalone — 18 pages
admin/codebase-graph, admin/error-analysis, admin/explorer, admin/topology, acp, chat, chat/[id], couchdb-analytics, health, indexing, knowledge, legal-corpus-premium, login, rag-search, register, studio, webgpu-similarity, root (/)

---

## Completed Work

### 1. Metadata Extractor Fixed (`api-metadata-extractor.ts`)

**Before:** Only scanned `+server.ts` and `+page.server.ts` — missed 128 pages entirely. All API routes categorized as "Api" (one giant bucket).

**After (3 fixes applied):**
- **Added `+page.svelte` scanning** — all 128 pages now discovered with type `'page'`
- **Fixed category extraction** — skips `api/` prefix, uses sub-category (e.g., `api/cases/...` → "Case Management" not "Api")
- **Added 50+ missing category mappings** — nlp, pipeline, push, yorha, detective, engagement, security, synthesis, orchestrator, investigate, etc.
- **Fixed pages count in stats** — was hardcoded `0`, now dynamically counted

**Verified output:**
```
apiEndpoints: 321  (was ~202)
pageServers:  66   (was uncounted)
pages:        128  (was 0)
totalRoutes:  515  (active) + 1,758 (archived) = 2,273
categories:   80+  (was ~30)
```

### 2. Phase 1 — Already Implemented (Verified)
All Phase 1 components from the enhancement plan already exist:
- `RouteAPIExplorer.svelte` (454 lines) — search, method filter, collapsible categories, Test button
- `RouteTreeView.svelte` (345 lines) — hierarchical tree, expand/collapse
- `APITesterModal.svelte` (422 lines) — Postman-style API tester
- `ArchivedRoutesPanel.svelte` — archived routes from deeds_labs
- Stats bar, capability bar, error brain integration, error clusters, route graph — all wired
- SSE real-time health monitoring via `/api/routes/events`

---

## Remaining Work

### Production-Readiness Follow-Up (April 2026)
- [ ] Re-run route counts against the live tree and update older docs that still report different totals
- [ ] Layer SSR/render verification status onto the route inventory instead of treating presence as proof
- [ ] Add validation/auth/degraded-shape status columns for high-risk API groups
- [ ] Mark route groups as inventory-only vs runtime-verified vs production-hardened

### Phase 2: Directory Consolidation UI
- [x] Add dedicated "Demos" section/tab to the all-routes page (26 demos need showcase) — DONE (Demos panel with grid cards)
- [x] Group standalone routes (acp, chat, health, etc.) into a "System" or "Standalone" section — DONE (subcategorized by function with Icon headers)
- [x] Add page route cards alongside API endpoint cards — DONE (type filter: API/PAGES/SERVER in RouteAPIExplorer)
- [x] Show route file type badges (page, server, layout, API) in the tree view — DONE (PG/API/SRV/ARC badges)
- [x] Wire demo index page (`/demos`) as a feature showcase gallery — DONE (29 demos + 10 showcases, grid/graph views, D3 force-directed, 5 category filters, DiamondModal preview)

### Phase 3: Route-to-File Mapping
- [x] Add file path column to API explorer — DONE (filePath + absolutePath per endpoint)
- [x] Show associated files per route (e.g., `/cases` → `+page.svelte` + `+page.server.ts` + `+page.ts`) — DONE (sibling chips in RouteAPIExplorer + Associated tab in DevReviewPanel)
- [x] Add "Open in Editor" links using `vscode://` protocol — DONE (vscode://file/ [EDIT] links)
- [x] Cross-reference: which API endpoints are consumed by which pages — DONE (api-metadata-extractor getAPICrossReferences() + DevReviewPanel XREF tab)

### Phase 4: Dev Review Dashboard
- [x] Auth coverage report — DONE (DevReviewPanel AUTH tab: per-group coverage bars)
- [x] SSE endpoint inventory — DONE (DevReviewPanel SSE tab: list with auth status + vscode links)
- [x] Method distribution — DONE (DevReviewPanel METHODS tab: bar chart + group breakdown)
- [x] Orphan detection: API endpoints with no consuming page — DONE (DevReviewPanel ORPHANS tab)
- [x] Dead route detection: pages that import non-existent API endpoints — DONE (api-metadata-extractor getDeadRouteRefs() + DevReviewPanel DEAD tab)
- [x] Category health heatmap — DONE (DevReviewPanel HEATMAP tab: grid colored by auth coverage)

---

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/server/api-metadata-extractor.ts` | Route scanner — discovers all route files, extracts metadata |
| `src/routes/(app)/admin/all-routes/+page.svelte` | Main all-routes UI (1393 lines) |
| `src/routes/(app)/admin/all-routes/+page.ts` | Client loader — fetches `/api/routes/metadata` |
| `src/routes/(app)/admin/all-routes/+page.server.ts` | Server loader — AST graph + DB enrichment |
| `src/routes/api/routes/metadata/+server.ts` | API endpoint serving route metadata |
| `src/lib/components/RouteAPIExplorer.svelte` | API explorer component (454 lines) |
| `src/lib/components/RouteTreeView.svelte` | Hierarchical tree view (345 lines) |
| `src/lib/components/APITesterModal.svelte` | Postman-style API tester (422 lines) |
| `src/lib/components/DevReviewPanel.svelte` | Dev review dashboard (auth, SSE, methods, associated files) |
| `scripts/test-extractor.mjs` | Quick test script for verifying extractor output |

---

## Architecture Notes

### Data Flow
```
+page.server.ts (SSR)              +page.ts (Client)
  │                                   │
  ├─ Read phase72 AST graph           ├─ Fetch /api/routes/metadata
  ├─ DB enrichment (error stats)      │   └─ api-metadata-extractor.ts
  └─ Return RouteNode[] +             │       ├─ Scan +server.ts (321)
     RouteErrorCluster[]              │       ├─ Scan +page.server.ts (66)
                                      │       ├─ Scan +page.svelte (128)
                    ↓                 │       └─ Scan deeds_labs/ (1758)
              +page.svelte            │
              │                       ↓
              ├─ Stats Bar (counts + method breakdown)
              ├─ RouteAPIExplorer (categories, search, filter)
              ├─ RouteTreeView (hierarchical tree)
              ├─ APITesterModal (test endpoints)
              ├─ ArchivedRoutesPanel (deeds_labs routes)
              ├─ Error clusters + Error Brain integration
              └─ SSE health monitoring (/api/routes/events)
```

### Category Mapping Strategy
The extractor strips route group prefixes like `(app)` and the `api/` prefix to categorize routes by their functional domain. A `categoryMap` provides friendly names for ~80 known path segments. Unknown segments get auto-capitalized as fallback.
