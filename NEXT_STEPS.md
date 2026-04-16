# Next Steps — Deeds Legal AI Platform
## Generated: 2026-04-16 | Branch: main | Commit: 66d9009eb2
## Updated: 2026-04-16 (Sprint 7A + 7B + Pass B audit complete)

---

## Priority Legend
- **P0** — Blocks correctness / data loss risk
- **P1** — Major feature gap / security issue  
- **P2** — Quality / reliability improvement
- **P3** — Tech debt / nice-to-have

---

## P0 — Critical Wire Integrity Gaps

### P0-A: `/api/sse/chat` missing per-request rate limiting
**Status: VERIFIED CORRECT** ✅ (2026-04-16)  
`hooks.server.ts` calls `checkHooksRateLimit` for ALL `/api/` routes before `resolve(event)`.
`isStreamRoute` only disables timeout — rate check fires before it. SSE connections pass through
`handle()` and are subject to the `/api/sse/` RATE_TIER (40 req/60s). No fix needed.

---

### P0-B: `getNeo4jMultiHopNeighbors()` missing export
**Status: VERIFIED CORRECT** ✅ (2026-04-16)  
`graph-context.ts:315` — `export async function getNeo4jMultiHopNeighbors(caseId: string)`.
Call site in `sse/chat/+server.ts` uses `.catch(() => [])` — non-fatal. No fix needed.

---

### P0-C: Embedding cache has no TTL → unbounded Redis growth
**Status: VERIFIED CORRECT** ✅ (2026-04-16)  
`embedding-cache.ts` uses `const EMBEDDING_TTL = 3600` with `redis.setex(key, EMBEDDING_TTL, buffer)`.
TTL is set on every write. No fix needed.

---

## P1 — Security & Rate Limit Gaps

### P1-A: `/api/rag/search` has no per-route rate limit tier
**Status: VERIFIED CORRECT** ✅ (2026-04-16)  
`RATE_TIERS` covers `/api/rag/` at 30 req/60s. `rag/search/+server.ts` also calls
`checkRedisRateLimit` inline with the user's IP. Double-checked, no fix needed.

---

### P1-B: Qdrant chunk payload field names vs graph filter mismatch
**Status: VERIFIED CORRECT** ✅ (2026-04-16)  
`qdrant-manager.ts` upserts with `evidence_id` (snake_case).
`graph-context.ts:141` searches `['document_id', 'evidence_id', 'source_id', 'node_id']` — aligned.

---

### P1-C: `.gitignore` was shadowing `src/routes/api/ai/models/` and `src/lib/models/`
**Status: FIXED** ✅ (commit `66d9009eb2`)  
`models/` (bare) → `/models/` (root-scoped) + `sveltekit-frontend/models/` explicit.  
`src/routes/api/ai/models/+server.ts` now force-tracked; no future routes under `*/models/*`
will be silently dropped.

---

## P2 — Quality & Reliability

### P2-A: ACE policy confidence filtering not confirmed in RAG path
**Status: VERIFIED CORRECT** ✅ (2026-04-16)  
`buildACEPrompt()` in `context-assembler.ts:505-600` applies all budget limits from `determineACEPolicy()`:  
`.slice(0, limits.kbChunkCount)`, `.slice(0, limits.caseChunkCount)`, `.slice(0, limits.mergedChunkCount)`,
`.slice(0, limits.kagNeighborCount)`, and `truncate(content, limits.chunkChars)`.  
Chunks are genuinely filtered — not just annotated. No fix needed.

---

### P2-B: Authority chain expansion scoring not applied to final ranking
**Status: VERIFIED CORRECT** ✅ (2026-04-16)  
`sse/chat/+server.ts:1341-1343` — `if (authResult.expanded > 0) { contextDocs = authResult.docs; }`.  
`applyGraphAuthorityScoring()` (line 1398) reranks the merged set by boosted similarity score.  
Both stages apply scoring to the final document list fed to the LLM. No fix needed.

---

### P2-C: `getRouterStatus()` never wired to an HTTP endpoint
**Status: VERIFIED CORRECT** ✅ (2026-04-16)  
`infrastructure/status/+server.ts` imports and calls `getRouterStatus()` (line 12 + line 42 in `Promise.all`).
VRAM/temp/utilization data IS included in the aggregated status response. No fix needed.

---

### P2-F: `pytorch-graph.ts` — 5 GPU ops had 0 consumers (NEW — FIXED)
**Status: FIXED** ✅ (2026-04-16)  
`pytorch-graph.ts` exports `pageRankGPU`, `attentionScoreGPU`, `rewardScoreGPU`, `softmaxGPU`, `topKIndices`
but was unreferenced. Wired `topKIndices` into 3 sort sites:

- `graph-context.ts:applyGraphAuthorityScoring` — GPU top-k sort when `docs.length > 8`
- `authority-chain.ts` line ~182 — GPU top-k for per-hop chunk selection
- `authority-chain.ts` line ~327 — GPU top-k for final multi-hop re-sort

CPU fallback is built into `topKIndices` — safe when addon not loaded.

---

### P2-D: Codebase-index degraded-shape tests
**Status: DONE** ✅ (2026-04-16)  
`tests/routes/codebase-index-degraded-shape.test.ts` — 13 tests, all passing.  
Covers: GET /api/codebase-index (5), /api/codebase-index/stats (4), /api/codebase-index/clusters (4).  
Pattern: 401 unauth, success shape, degraded (!ok upstream), degraded (fetch throws), key-set parity.

---

### P2-E: Degraded-shape audit Pass B — 10 GET routes
**Status: COMPLETE** ✅ (2026-04-16)

| Route | Result | Notes |
|-------|--------|-------|
| `GET /api/analytics/summary` | ✅ OK | `getWeeklySummary()` has internal try/catch; returns safe defaults |
| `GET /api/analytics/token-usage` | ✅ OK | `getTokenUsageStats()` has internal try/catch; returns `{ success: false, data: null }` for unauth |
| `GET /api/ai/personas` | ✅ OK | `getPersonas()` is synchronous in-memory; cannot throw |
| `GET /api/acp/tools` | ✅ OK | `registry.list()` is synchronous in-memory; cannot throw |
| `GET /api/admin/inference-stats` | ✅ OK | catch returns same keys with empty defaults at HTTP 200 |
| `GET /api/admin/routes` | **FIXED** ✅ | catch was returning HTTP 500 → changed to 200 (same JSON shape kept) |
| `GET /api/codebase-index/stats` | ✅ OK | Covered by P2-D tests (13 tests) |
| `GET /api/statutes/[id]` | ✅ OK | catch returns `{ item: null }` matching success shape |
| `GET /api/evidence/[id]` | ✅ OK | catch returns full object with empty-default fields |
| `GET /api/cases/[id]` | ✅ OK | catch returns `{ success: false, data: null, _degraded: true }` at HTTP 200 |

**Fix applied:** `src/routes/api/admin/routes/+server.ts` — removed `status: 500` from catch block.

---

## P3 — Tech Debt

### P3-A: Mixed raw SQL + Drizzle ORM in evidence/upload
**Audit finding:** Database Access Patterns (Path 2)  
Evidence upload uses raw SQL INSERT while the rest of the codebase uses Drizzle ORM.
Inconsistency means schema changes require double maintenance.

**File:** `src/routes/api/evidence/upload/+server.ts:331-355`

---

### P3-B: VLM model config normalization
**Deferred from previous session**  
`OLLAMA_VLM_MODEL` and `OLLAMA_CHAT_MODEL` are conflated in some routes. Separate
env var + inference router tier for VLM (Gemma 4 E4B with mmproj) vs chat-only.

---

### P3-C: Inference router tier health checks hardcoded
**Audit finding:** Shallow Wiring #2  
Backend health is determined by timeout/connection error rather than a `/health` poll.
Stale backends can queue requests for seconds before failing over.

**File:** `src/lib/server/inference/inference-router.ts`  
**Suggestion:** Add a background health poll (5s interval) per tier; cache status in Redis.

---

## Cross-Reference Map

```
P0-A (SSE rate limit) ←→ rate-limiter.ts, hooks.server.ts ✅ VERIFIED OK
P0-B (Neo4j export)   ←→ graph-context.ts:315 ✅ VERIFIED OK
P0-C (embedding TTL)  ←→ embedding-cache.ts EMBEDDING_TTL=3600 ✅ VERIFIED OK

P1-A (RAG rate limit) ←→ rate-limiter.ts RATE_TIERS ✅ VERIFIED OK
P1-B (Qdrant fields)  ←→ qdrant-manager.ts evidence_id ✅ VERIFIED OK
P1-C (gitignore)      ←→ .gitignore ✅ FIXED

P2-A (ACE filtering)  ←→ context-assembler.ts:buildACEPrompt limits ✅ VERIFIED OK
P2-B (authority rank) ←→ sse/chat/+server.ts:1341-1398 ✅ VERIFIED OK
P2-C (router status)  ←→ infrastructure/status/+server.ts:12,42 ✅ VERIFIED OK
P2-F (pytorch-graph)  ←→ graph-context.ts + authority-chain.ts ✅ WIRED (topKIndices GPU sort)
P2-D (tests done)     ←→ tests/routes/codebase-index-degraded-shape.test.ts ✅ 13 PASS
P2-E (Pass B done)    ←→ admin/routes status:500→200 ✅ FIXED; 9/10 already OK

P3-A (raw SQL)        ←→ evidence/upload/+server.ts
P3-B (VLM config)     ←→ env.server.ts, inference-router.ts
P3-C (tier health)    ←→ inference-router.ts
```

---

## Remaining Work (Sprint 7C)

```
Sprint 7C
  ├─ P2-A  ACE policy audit — verify determineACEPolicy() actually filters chunks
  ├─ P2-B  Authority chain ranking — verify scores modify chunk order before LLM
  └─ P2-C  Wire getRouterStatus() to HTTP endpoint

Backlog
  ├─ P3-A  Drizzle ORM migration for evidence upload
  ├─ P3-B  VLM model config split
  └─ P3-C  Inference tier background health polling
```

---

*Audit performed: 2026-04-16 — 35 hops traced across 3 critical paths.*  
*Wire integrity: 100% for P0/P1 (all audit findings were false alarms).*  
*Pass B degraded-shape audit: 10/10 routes compliant (1 fix applied: admin/routes status:500→200).*
