# Codebase Analysis Report — 2026-03-16 (Full 4-Skill Audit)

Consolidated results from all 4 agentic skills:
- `/shallow-wiring-analysis` — 31 findings across 16 routes
- `/audit-components` — 145 components across 7 directories
- `/prune-codebase` — 182 findings across 7 cross-cutting checks
- `/wire-modules` — 16 findings (8 dead chains, 5 duplicates, 3 missing imports)

## Verification Status

```
svelte-check --threshold error: 0 errors, 0 warnings ✅
vite build: PASSES ✅
Drizzle schema matching: ALL 9 new API routes verified ✅
```

---

## P0 — Fix Immediately (4 issues)

| # | Category | File | Issue | Fix |
|---|----------|------|-------|-----|
| 1 | MISSING_API | `cases/[id]/+page.svelte:288` | `/api/cases/${id}/evidence` — no +server.ts. Evidence tab on case detail is broken | Create `api/cases/[id]/evidence/+server.ts` |
| 2 | MISSING_API | `persons-of-interest/+page.svelte:476` | Fetches `/api/persons/${id}` but route is `/api/persons-of-interest/${id}` | Change path to `/api/persons-of-interest/` |
| 3 | DEAD_CHAIN | `ai-assistant-store.svelte.ts` | 6 of 8 API routes missing — AI panel renders but 75% of actions 404 | Create routes or disable broken UI |
| 4 | DEAD_CHAIN | `mlp.ts` | 407 lines, 0 consumers, calls `/api/mlp/*` (never created) | Archive to deeds_labs/ |

---

## P1 — Fix Soon (33 issues)

### Missing API Routes (8)

| # | Source | Missing Route | Impact |
|---|--------|--------------|--------|
| 5 | `cases/[id]/+page.svelte:385` | `/api/evidence/[id]/suggest-summary` | Generate Summary fails |
| 6 | `cases/[id]/+page.svelte:403` | `/api/evidence/summary/[id]/approve` | Approve Summary fails |
| 7 | `cases/[id]/+page.svelte:424` | `/api/evidence/[id]/approve` | Evidence approval fails |
| 8 | `evidence/+page.svelte:281` | `/api/evidence/[id]/report` | Report generation fails |
| 9 | `evidence/+page.svelte:443` | Prop says `/api/evidence/analyze` | Should be `/api/evidence/analysis` |
| 10 | `cases/[id]/reports/+page.ts:7` | `/api/v1/reports` | Legacy v1 prefix, use `/api/reports` |
| 11 | `cases/[id]/overview/+page.ts:42-43` | `/api/v1/evidence/by-case/[id]`, `/api/v1/cases/[id]/persons` | Legacy v1 prefix |
| 12 | `auth-machine.ts` | `/api/auth/reset-password` | Password reset flow 404s |

### No-Op Handlers Needing Real Wiring (8)

| # | File | Handler | Impact |
|---|------|---------|--------|
| 13 | `cases/[id]/+page.svelte:945` | CanvasEditor `save` — console.log only | Canvas state lost on save |
| 14 | `evidence/+page.svelte:416` | UploadZone `onfilesadded` — console.log only | Drag-drop upload does nothing |
| 15 | `evidence/+page.svelte:737` | EvidenceFilters `onfilter` — console.log only | Filter UI does nothing |
| 16 | `system-configuration/+page.svelte:86` | `saveConfig()` — console.log only | Config lost on refresh |
| 17 | `evidence-library/+page.svelte:170` | EvidenceCard `onDelete` — console.log | Delete button no-op |
| 18 | `LegalDocumentEditor.svelte:282-289` | Preview/Share/Delete — console.log | 3 dead buttons |
| 19 | `CommandPalette.svelte:62,71` | "Create new case"/"Upload evidence" — console.log | 2 dead actions |
| 20 | `SummaryEditor.svelte:103,109` | `onupdated`/`ondeleted` — empty `() => {}` | Callbacks never fire |

### Dead Chains to Archive (4)

| # | File | Lines | Evidence |
|---|------|-------|---------|
| 21 | `src/lib/tauri.ts` | 184 | 0 imports, project is not a Tauri app |
| 22 | `src/lib/utils/data-export.ts` | 547 | 0 imports, calls `/api/cases/import` (missing) |
| 23 | `src/lib/stores/chat-store.svelte.ts` | — | 0 imports, 3/4 endpoints missing |
| 24 | `src/lib/server/workflows/document-processing.ts` | — | 0 route consumers, calls missing `/api/evidence/extract` |

### Dead Feature Clusters to Archive (2)

| # | Directory | Files | Evidence |
|---|-----------|-------|---------|
| 25 | `src/lib/server/contradictionEngine/` | 17 | 0 external imports |
| 26 | `src/lib/server/pgai/` | 4 | 0 external imports |

### Barrel Export Zombies (3 server-level)

| # | Barrel | Evidence |
|---|--------|---------|
| 27 | `server/contradictionEngine/index.ts` | 0 consumers |
| 28 | `server/contradictionEngine/timeline/index.ts` | 0 consumers |
| 29 | `server/pgai/index.ts` | 0 consumers |

### Duplicate Implementations to Archive (19 files)

| Category | Dead Files | Keep Instead |
|----------|-----------|-------------|
| Embedding (11 files) | embedding-service.ts, embeddings.ts, ai/embeddings.ts, embedding-cache.ts, embedding-cache-service.ts (×2), db/embeddings-client.ts, vector/embedding-gemma.ts, ai/embeddinggemma-service.ts, embedding-gateway.ts, evidence/services/embedding.ts | `embedding/embed.ts` (6 consumers), `grpc/embedding-client.ts` |
| Auth stores (3 files) | auth-store.svelte.ts, auth-session.svelte.ts, user.svelte.ts | `machines/auth-machine.ts` (active) |
| Auth utils (1 file) | server/authUtils.ts (JWT/bcrypt) | Lucia auth + `auth-helpers.ts` |

---

## P2 — Backlog (72 issues)

### Dead Dashboard Links (3)
- `/evidence-canvas-demo` → should be `/demos/evidence-canvas`
- `/nier-showcase` → should be `/demos/nier-showcase`
- `/system-status` → should be `/system-configuration`

### No-Op Handlers (13)
- 8 console.log-only callbacks in cases, evidence, citations, global-search, POI routes
- 5 typing prompt, contract analyzer, collaboration panel handlers

### Zombie Barrel Exports (29 UI-level)
- 29 `index.ts` files in `components/ui/` subdirectories with 0 downstream consumers
- Consumers import directly, bypassing barrels

### Dead Server Files (13)
- document-processor.ts, evidence-processing.ts, embedding-service.ts, embeddings.ts, knowledge-cache.ts, law-mapping.ts, lokiHybridStore.ts, redis-streams.ts, gemma3-vlm-embedder.ts, ollama-service.ts, vlm-document-analyzer.ts, timeouts.ts, rabbitmq-service.ts

### Dead Type Files (4)
- agent.ts, generics.ts, qlora-protobuf.ts, ollama.ts

### Syntax Repair Cluster (17 files)
- `src/lib/utils/syntax-repair/` — Phase 96 build tool, 0 runtime consumers

### Shadow Duplicate
- `src/lib/types.ts` (UI) vs `src/lib/data/types.ts` (Drizzle) — both define Case-like interfaces

### Orphan Component Cluster (41 files in ui/)
- 37 orphans in `components/ui/` (standalone duplicates of subdirectory components, dead wrappers, superseded components)
- 2 broken forms (Svelte 4 syntax, wrong adapter)
- 1 corrupted dashboard component
- 1 redundant case orchestrator

---

## P3 — No Action Needed (79 issues)

- 56 empty `$props()` defaults — correct Svelte 5 pattern
- 12 demo/showcase console.log handlers — intentional
- 4 unreachable imports in POI page (PersonCard, PersonList, FilterPanel, StatsPanel)
- 4 decorative nav buttons without handlers
- 3 intentionally no-op handlers (admin dev-tools view-only grid)

---

## Component Audit Summary

| Directory | Total | Fully Wired | Shallow | Orphan/Archive |
|-----------|-------|------------|---------|----------------|
| dashboard/ | 10 | 9 | 0 | 1 |
| legal-ai/ | 18 | **18** | 0 | 0 |
| poi/ | 11 | 10 | 1 | 0 |
| evidence/ | 23 | **23** | 0 | 0 |
| forms/ | 7 | 5 | 0 | 2 |
| case/ | 4 | 3 | 0 | 1 |
| ui/ | ~72 | ~35 | 0 | ~37 |
| **TOTAL** | **~145** | **~103 (71%)** | **1** | **~41 (28%)** |

**Perfect score directories**: legal-ai/ (18/18), evidence/ (23/23)

---

## Drizzle Schema Matching — All 9 New Routes Verified

| Route | Tables | Zod | Match |
|-------|--------|-----|-------|
| `api/search/cases` | cases + crimes | No (GET) | ✅ |
| `api/search/laws` | statutes | No (GET) | ✅ |
| `api/search/suggestions` | cases + statutes | No (GET) | ✅ |
| `api/search/filters` | cases + statutes + crimes | No (GET) | ✅ |
| `api/analytics/search` | RabbitMQ | **Yes** | ✅ |
| `api/evidence` | evidence | **Yes** | ✅ |
| `api/evidence/[id]` | evidence | **Yes** | ✅ |
| `api/persons-of-interest` | personsOfInterest | **Yes** | ✅ |
| `api/persons-of-interest/[id]` | personsOfInterest + poiPhotos | **Yes** | ✅ |

---

## Metrics Update

| Metric | Before | After |
|--------|--------|-------|
| svelte-check errors | 0 | 0 |
| Shallow-wiring findings | unknown | 31 |
| Components audited | — | 145 |
| Fully wired components | — | 103 (71%) |
| Orphan/archive candidates | — | 41 (28%) |
| Dead chains found | — | 8 |
| Duplicate impls found | — | 5 (19 dead files) |
| Missing API routes | — | 10 |
| No-op handlers | — | 84 (56 intentional) |
| Zombie barrel exports | — | 32 |
| Dead server files | — | 13 |
| Dead type files | — | 4 |
| Orphan clusters | — | 3 (38 files) |

---

## Recommended Fix Order

### Phase A — P0 Fixes (unblock broken features)
1. Create `api/cases/[id]/evidence/+server.ts`
2. Fix POI edit path: `/api/persons/` → `/api/persons-of-interest/`
3. Create AI assistant API stubs or disable broken UI actions
4. Archive `mlp.ts`

### Phase B — P1 Route Fixes
5. Create 4 evidence workflow routes (suggest-summary, approve ×2, report)
6. Fix 3 legacy `/api/v1/` path references
7. Fix `analyzeEndpoint` prop typo
8. Archive 4 dead chain files + 2 dead clusters (21 files)
9. Archive 19 duplicate embedding/auth files

### Phase C — P1 Handler Wiring
10. Wire 8 high-impact no-op handlers
11. Remove canvas fetch functions from `rag-source-validation.ts`

### Phase D — P2 Cleanup Sweep
12. Fix 3 dead dashboard links
13. Delete 29 zombie UI barrel files
14. Archive 13 dead server files + 4 dead type files + 17 syntax-repair files
15. Archive 41 orphan UI components
16. Remove 4 unreachable imports from POI page

### Phase E — Structural
17. Consolidate 7 singleton directories
18. Resolve `types.ts` shadow duplicate
19. Type review: Zod validation for remaining ~140 API routes