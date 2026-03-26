# Production Readiness Action Plan

**Date**: March 25, 2026
**Status**: IN PROGRESS — P0/P1/P2 quick wins DONE, deeper items remain
**Goal**: Harden the app for real users — security, validation, error handling

---

## Current Baseline (Post-Audit)

| Metric | Value |
|--------|-------|
| svelte-check | **0 errors**, 4 warnings (PDFViewer cosmetic) |
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