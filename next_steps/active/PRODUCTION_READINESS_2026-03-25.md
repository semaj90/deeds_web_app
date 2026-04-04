# Production Readiness Action Plan

**Date**: March 25, 2026
**Status**: IN PROGRESS — P0/P1/P2 quick wins DONE, deeper items remain
**Goal**: Harden the app for real users — security, validation, error handling

---

## April 3, 2026 Audit Correction

This file should be read as a targeted hardening report, not as proof that the entire app is production-complete.

- The March 25 pass focused mainly on critical write-route hardening, auth coverage, CSRF, error sanitization, and input validation.
- The route-directory inventory work was completed separately, but inventory coverage is not the same thing as SSR/rendering validation or schema-contract validation.
- Recent live work did verify specific SSR/runtime issues: case detail title preload, report detail/edit SSR preload, contextual chat cold-start mitigation, and a broad screenshot smoke pass with no route failures in that run.
- What is still not honestly complete end-to-end: full API contract audit, full SSR/render audit for every route, full Drizzle schema-to-runtime contract audit, and full Zod coverage reconciliation across the entire API surface.

### What Is Verified Now

- Targeted write-route hardening and auth work from this document
- Case and report SSR title/data preload fixes
- Fresh-process contextual chat reliability after warmup and timeout fixes
- Native CUDA runtime live on the active machine
- Broad route smoke coverage in the latest validation pass
- April 4 core-domain ownership hardening across case, evidence, notes, timeline, similar-case, citations, report list reads, and the remaining case-scoped chat/export/analysis helper routes

### What Remains Open

- Reconcile conflicting route counts across older inventory docs
- Re-audit API routes by behavior class: GET degraded-shape, write validation, ownership/auth, streaming/SSE
- Reconcile Zod coverage claims with the current route tree instead of relying on older snapshots
- Reconcile Drizzle schema docs with current database reality and route payload shapes
- Normalize or explicitly document mixed GET error contracts outside the hardened core domain set, especially stream/file/export endpoints that intentionally do not return the same JSON envelope as standard CRUD routes

## April 4, 2026 Live API Ownership Audit

This pass moved beyond documentation review into active route hardening after live inspection found real ownership gaps in read paths.

### Fixed In This Pass

- `/api/reports?caseId=...` now scopes report lists by `reports.createdBy`
- `/api/evidence` list now scopes reads by `evidence.userId`
- `/api/evidence/[id]` GET now scopes by `evidence.id + evidence.userId`
- `/api/cases/[id]` GET now scopes by `cases.id + cases.userId`
- `/api/cases/[id]/notes` GET and POST now verify owned case first
- `/api/cases/[id]/notes/[noteId]` GET, PATCH, DELETE now verify owned case first
- `/api/cases/[id]/notes/[noteId]/versions` GET now verifies owned case first
- `/api/cases/[id]/notes/search` GET now verifies owned case first
- `/api/cases/[id]/overview` now scopes the parent case by owner and scopes overview evidence rows by `evidence.userId`
- `/api/cases/[id]/evidence` GET and DELETE now verify owned case first
- `/api/cases/[id]/citations` GET and POST now verify owned case first
- `/api/cases/[id]/timeline` GET now verifies owned case first before aggregating events
- `/api/cases/[id]/similar` GET now requires auth and scopes the source case by owner
- `/api/cases/[id]/persons` GET, POST, DELETE now verify owned case first
- `/api/cases/[id]/authorities` GET, POST, DELETE now verify owned case first
- `/api/cases/[id]/connections` GET, POST, PATCH, DELETE now verify owned case first
- `/api/cases/[id]/canvas` GET and POST now require auth and verify owned case first
- `/api/cases/[id]/key-points` POST now verifies owned case first and scopes evidence reads by `evidence.userId`
- `/api/cases/[id]/reasoning-chain` POST now verifies owned case first
- `/api/cases/[id]/chat` GET and POST now verify owned case first; metadata lookup is also scoped by `chatId + userId + caseId`
- `/api/cases/[id]/export/pdf` POST now scopes the exported case packet by owner and scopes exported evidence rows by `evidence.userId`
- `/api/cases/[id]/laws` GET and POST now verify owned case first
- `/api/cases/[id]/analyze/stream` POST now verifies owned case first before loading case context
- `/api/cases/[id]/notes/[noteId]/evidence` GET, POST, DELETE now verify owned case first; evidence linking now also requires evidence to belong to the same owned case
- `/api/evidence/[id]/download`, `/report`, `/suggest-summary`, `/key-points`, `/versions`, `/audit`, `/gpu-analysis`, `/approve`, and `/chain-of-custody` now scope by `evidence.userId`
- `/api/evidence/[id]` PATCH now also verifies any reassigned `caseId` belongs to the same authenticated user
- `/api/reports/save` now scopes updates by `reports.createdBy`
- `/api/reports/generate` now verifies the source case is owned and scopes generated context reads across evidence, POIs, and saved citations to the same user
- `/api/persons-of-interest` list and create now scope to the authenticated user, and creation now stores `createdBy`
- `/api/persons-of-interest/search` now scopes search results to the authenticated user
- `/api/persons-of-interest/relationships` now verifies both POIs are owned before creating a relationship
- `/api/persons-of-interest/[id]`, `/summary`, `/risk`, `/timeline`, `/associates`, `/similar`, `/photos`, `/gpu-analyze`, and `/face-match` now verify POI ownership first
- `/api/persons` list and create now scope to the authenticated user, and creation now verifies the target case is owned
- `/api/citations/[citationId]/tags` now requires auth and verifies citation ownership before listing, adding, or deleting tags
- `/api/citations/export/json` and `/api/citations/export/pdf` now validate UUID inputs and scope exported citations to the authenticated user
- `/api/citations/saved` no longer falls back to anonymous ownership and now verifies referenced `caseId` values belong to the authenticated user
- `/api/chat/stream` query mode now requires auth before loading case context, validates `caseId`, scopes context loading to owned cases, and session polling is restricted to the session owner's messages
- `/api/stream/[chatId]` now verifies the chat session belongs to the authenticated user before opening the Redis-backed SSE subscription
- `/api/conversations/[id]` now verifies ownership before update/delete, and delete no longer removes another user's messages by raw conversation ID
- `/api/documents/[id]` GET and PUT now scope reads and updates by `documents.userId`
- `/api/document/[docId]` now scopes evidence-backed document reads by `evidence.userId`
- `/api/library/documents/[documentId]/pdf` now enforces owner-or-shared access by rejecting privately uploaded library documents owned by another user
- `/api/library/document/[id]`, `/api/library/documents/[documentId]/toc`, and `/api/library/documents/[documentId]/chunks` now enforce the same owner-or-shared rule for private library documents
- `/api/library/documents/[documentId]/chunks` also now binds `nodeId` lookups to the requested `documentId`, preventing cross-document chunk reads through a raw node ID
- Case route validation enums were aligned so `priority: 'critical'` is accepted where the UI already uses it

### Contract Findings From This Pass

- Core UI consumers for reports, notes, evidence detail, and contextual chat already depend on route-specific response shapes; this pass preserved those shapes instead of doing a risky cross-repo normalization.
- A full read-only sweep of `src/routes/api/cases/[id]/**` was completed during this pass; the previously missing ownership checks in case chat, PDF export, laws, analysis stream, and note-evidence references were closed.
- Follow-up sweeps then closed the next non-case ownership clusters across evidence item helpers and person-of-interest CRUD/helper routes.
- A further helper sweep closed the highest-risk citation tag/export/saved routes and the generic chat streaming case-context path.
- The next helper sweep closed raw-ID access gaps in generic chat subscriptions, conversation updates/deletes, user documents, evidence-backed document fetches, and private library PDF streaming.
- The biggest remaining contract issue is not the core CRUD routes above, but the wider API surface still mixing three patterns: stable JSON envelopes, degraded-shape JSON envelopes, and raw `Response`/file/stream handlers.
- That mixed behavior is acceptable only if it is treated as intentional and documented per route class. It is not yet safe to claim whole-app GET contract uniformity.

### Latest Validation Note

- Editor diagnostics are clean for the latest citation/chat/stream/document route batches.
- After correcting the POI and citation schema-field mismatches surfaced during validation, a fresh broader `Svelte Check` pass now returns `0 errors, 0 warnings`.

---

## Current Baseline (Post-Audit)

| Metric | Value |
|--------|-------|
| svelte-check | **0 errors**, 0 warnings |
| vite build | **PASSES** (exit 0) |
| Playwright | 23/23 PASS |
| API routes | 376 total |
| Zod validation | **~96% of write routes** (all top 20 critical routes validated) |
| Remaining unvalidated | 14 routes (8 LOW = no body, 5 MEDIUM = param-only, 1 HIGH = fixed) |
| Auth coverage | Global hook (deny-by-default) + ~73 routes with explicit ownership |
| Rate limiting | In-memory, write + AI tiers, 14 rules |
| CORS | Configured (restrictive in prod) |
| SQL injection | Protected (Drizzle ORM parameterized) |
| CSRF | **checkOrigin: true** (enabled this session) |

**Important:** the Zod figures above refer to the targeted write-route audit from March 25. They are not a fresh April 3 whole-repo recount.

---

## Completed This Session (March 25, 2026)

### P0-1: Zod Validation Audit ✅
**Finding**: All top 20 critical write routes already had Zod schemas.
Routes verified: `apply-fix`, `apply-patch`, `phase89/fix`, `phase78/apply-patch`, `rabbitmq/publish`, `tools/execute`, `gpu/compute`, `ollama/generate`, `ollama/pull`, `graph/sync`, `knowledge`, `web/crawl`, `cache/invalidate`, `cases`, `citations`, `chat`, `reports`, `persons-of-interest`, `feedback`, `push/send`.

### P0-2: File-Write Route Hardening ✅
**Finding**: All 4 file-write routes already had path validation + Zod schemas.

### P0-3: Production Secret Guard ✅ (NEW)
**File**: `hooks.server.ts` (line 84)
Startup crash if `JWT_SECRET` or `SERVICE_AUTH_TOKEN` is dev default in production mode.

### P0-4: RAG Process File Validation ✅ (NEW)
**File**: `api/rag/process/+server.ts`
Added: max 20 files, 50MB/file limit, file type allowlist (PDF, TXT, HTML, MD, DOCX).

### P1-1: Centralized Error Sanitization ✅ (NEW)
**File**: `src/lib/server/utils/sanitize-error.ts`
`sanitizeError()` + `errorResponse()` — dev: verbose, prod: generic. Ready for routes to import.

### P2-1: `.env.example` Updated ✅ (NEW)
**File**: `sveltekit-frontend/.env.example`
Full template with all 50+ env vars, CHANGE_ME markers for secrets, organized by category.

### P2-2: CSRF `checkOrigin` ✅ (NEW)
**File**: `svelte.config.js`
SvelteKit now rejects cross-origin form submissions and API mutations.

### Bonus: Corrupted File Fix ✅
**File**: `src/lib/machines/userTypingStateMachine.ts`
Fixed `oimport` → `import` (Phase 99 corruption artifact).

### P1-3: GET Request Rate Limits ✅ (NEW)
**File**: `hooks.server.ts`
Added GET tier: 200 req/min per IP for `/api/` routes.

### P1-4: Error Message Leak Sanitization ✅ (NEW)
**Scope**: ~80 instances across ~55 files batch-fixed.
All `err instanceof Error ? err.message : 'fallback'` patterns in client-facing JSON/SSE responses replaced with static generic strings. Server-side `console.error`/`console.warn` logging preserved.
**Categories fixed**: reports (3), knowledge (6), phase89 (9), cases (4), cartridge (4), auth (1), chat/SSE (8), AI streams (3), graph (3), admin (3), health (7), NLP/misc (9).
**Verification**: `grep -r 'instanceof Error ? err.message'` → 0 client-facing leaks remaining. Only 5 server-side `console.warn` lines remain (safe).

---

## Remaining Work

### Production Audit Follow-Up (NEW)

1. Refresh route inventory against the live route tree and update stale counts in summary docs.
2. Run a categorized API audit:
	- GET routes: verify degraded responses keep stable top-level keys.
	- Write routes: verify Zod or equivalent validation at the edge.
	- Auth-sensitive routes: verify explicit ownership checks where global auth is insufficient.
	- SSE/streaming routes: verify non-fatal degradation and bounded error leakage.
3. Reconcile Drizzle schema docs with real DB/runtime contracts, especially tables and payloads that have drifted over multiple migration passes.
4. Publish a single canonical April 2026 production-readiness snapshot instead of relying on multiple older overlapping reports.

### P0-5: Defense-in-Depth Auth ✅ (NEW — top 5 critical routes)
**Routes fixed**:
- `/api/evidence/[id]` — Added auth to GET/PATCH/DELETE + ownership check (`evidence.userId`) on PATCH/DELETE
- `/api/persons-of-interest/[id]` — Added auth to GET/PATCH/DELETE
- `/api/cases/[id]/notes/[noteId]` — Added auth to GET/PATCH/DELETE
- `/api/cases/[id]/evidence` — Added auth to GET
- `/api/whisper/transcribe` — Added auth + file type/size validation (25MB, audio-only)
**Already secure**: `/api/cases/[id]` PATCH/DELETE, `/api/reports/*`, `/api/citations/collections/*`

### P1-2: Redis-Backed Rate Limiting (DEFERRED)
**Status**: NOT STARTED — current in-memory rate limiter works for single-instance
**When needed**: Before horizontal scaling (multiple SvelteKit instances)
**Effort**: Medium (migrate Map → Redis INCR + EXPIRE + sliding window)

### P2-3: Audit Logging Expansion (DEFERRED)
**Status**: Evidence audit logging exists
**Scope**: Add to all DELETE operations
**Effort**: Medium

### P2-4: Whisper Transcribe File Validation
**Status**: NOT STARTED
**File**: `api/whisper/transcribe/+server.ts`
**Scope**: Add file type/size validation for audio uploads
**Effort**: Small

---

## 14 Remaining Unvalidated Write Routes

| Route | Priority | Reason Safe |
|-------|----------|-------------|
| `auth/logout` | LOW | No body (session-based) |
| `cache/llm/clean` | LOW | No body (admin-only via hook) |
| `engagement/heartbeat` | LOW | No body (user presence ping) |
| `engagement/scan` | LOW | No body (admin scanner trigger) |
| `evidence/[id]/gpu-analysis` | LOW | No body (param-only, fires GPU task) |
| `evidence/analyze` | LOW | Proxy to downstream validated endpoint |
| `poi/[id]/associates/[id]` | LOW | No body (DELETE by URL params) |
| `statutes/[id]/summary` | LOW | No body (param-only, Ollama call) |
| `cases/[id]/export/pdf` | MEDIUM | No body (read-only DB + HTML export) |
| `evidence/[id]/suggest-summary` | MEDIUM | No body (param-only, AI summary) |
| `phase89/analysis` | MEDIUM | Stub (returns static JSON, no input) |
| `reports/[id]/publish` | MEDIUM | No body + has ownership check |
| `v1/legal/compare-pdf` | MEDIUM | Needs inspection |
| `whisper/transcribe` | MEDIUM | FormData audio — needs file validation |

---

## Active Feature Roadmap

| Priority | Feature | State | Next Step |
|----------|---------|-------|-----------|
| 1 | 3D Prosecutor Simulation | 80/80 cases generated, 5-phase plan | Canon schema + taxonomy |
| 2 | Setup Wizard / Onboarding | In progress (8-step modal) | Wire to root layout |
| 3 | POI Face Recognition | Schema ready (512D embeddings) | GPU pipeline + matching API |
| 4 | Multimodal GPU Services | Stubs (1,346 lines) | YOLO/Whisper/CLIP wrappers |
| 5 | Self-Hosted Agents | AutoGen/CrewAI foundation | Python agents → Go services |
| 6 | TensorRT Acceleration | Multiple roadmaps | Engine build + Triton VLM |

---

## Completion Tracking

- [x] P0-1: Zod schemas on critical write routes (already done)
- [x] P0-2: File-write route hardening (already done)
- [x] P0-3: Production secret guard (hooks.server.ts)
- [x] P0-4: RAG process file validation
- [x] P0-5: Defense-in-depth auth (5 critical routes: evidence, POI, notes, case-evidence, whisper)
- [x] P1-1: Centralized error sanitization helper
- [ ] P1-2: Redis-backed rate limiting — DEFERRED (single-instance OK)
- [x] P1-3: GET rate limits (hooks.server.ts)
- [x] P1-4: Error message leak sanitization (~80 instances, ~55 files)
- [x] P2-1: .env.example updated
- [x] P2-2: CSRF checkOrigin enabled
- [ ] P2-3: Audit logging expansion — DEFERRED
- [x] P2-4: Whisper transcribe file validation (25MB, audio type/ext allowlist)
- [x] Bonus: userTypingStateMachine.ts corruption fix