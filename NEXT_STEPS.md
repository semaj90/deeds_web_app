# Next Steps — Deeds Legal AI Platform
## Generated: 2026-04-16 | Branch: main | Commit: 66d9009eb2

---

## Priority Legend
- **P0** — Blocks correctness / data loss risk
- **P1** — Major feature gap / security issue  
- **P2** — Quality / reliability improvement
- **P3** — Tech debt / nice-to-have

---

## P0 — Critical Wire Integrity Gaps

### P0-A: `/api/sse/chat` missing per-request rate limiting
**Audit finding:** Dead Link #1 (Path 1, Step 3)  
The chat SSE handler relies on the hooks-level tier (`RATE_TIERS` → `checkHooksRateLimit`) but
`hooks.server.ts` only fires the tier check for HTTP (non-SSE) paths. SSE upgrade connections
may bypass the 30 req/min cap.

**Files:**
- `src/routes/api/sse/chat/+server.ts` — add `chatRateLimiter.checkAsync(request)` early
- `src/lib/server/middleware/rate-limiter.ts` — verify `RATE_TIERS` includes `/api/sse/`
- `src/hooks.server.ts` — confirm SSE connections pass through handle()

**Test to write:** `tests/routes/sse-chat-rate-limit.test.ts`
- 429 when limit exceeded
- `X-RateLimit-Remaining` header decrements per call

---

### P0-B: `getNeo4jMultiHopNeighbors()` missing export
**Audit finding:** Dead Link #4 (Path 3, Step 8)  
`src/routes/api/sse/chat/+server.ts` calls `getNeo4jMultiHopNeighbors(caseId, evidenceIds)` but
this function was not found exported from `src/lib/server/retrieval/graph-context.ts`.
If this silently throws, multi-hop KAG expansion fails for every chat message that has a caseId.

**Files:**
- `src/lib/server/retrieval/graph-context.ts` — verify or add export
- `src/routes/api/sse/chat/+server.ts` — verify call site import

**Verification:**
```bash
grep -n "getNeo4jMultiHopNeighbors" src/lib/server/retrieval/graph-context.ts
```

---

### P0-C: Embedding cache has no TTL → unbounded Redis growth
**Audit finding:** Dead Link #2 (Path 2, Step 10)  
`batch-embedder.ts` writes `embedding:{hash}` keys to Redis with no EXPIRE call.
At 768-dim float32 (~3KB per embedding) × thousands of chunks, this will silently fill Redis.

**Files:**
- `src/lib/server/batch-embedder.ts` — add `redis.expire(key, 86_400)` after cache SET
- `src/lib/server/grpc/embedding-client.ts` — same pattern if it caches locally

---

## P1 — Security & Rate Limit Gaps

### P1-A: `/api/rag/search` has no per-route rate limit tier
**Audit finding:** Middleware Gaps section  
`RATE_TIERS` in `rate-limiter.ts` covers `/api/rag/` at 30 req/60s but only for
hooks-level. If the hook skips unauthenticated POST bodies (reads IP from header that can
be spoofed), search can be hammered.

**Files:**
- `src/lib/server/middleware/rate-limiter.ts` — verify `/api/rag/search` tier entry
- `src/routes/api/rag/search/+server.ts` — confirm `checkRedisRateLimit` called inline

---

### P1-B: Qdrant chunk payload field names vs graph filter mismatch
**Audit finding:** Schema Mismatch #3 (Path 3, Step 8)  
`buildGraphShouldFilter()` searches for chunk payload keys:
`['document_id', 'evidence_id', 'source_id', 'node_id']`

If `qdrant-manager.ts` upserts with different field names (e.g. `evidenceId` camelCase),
graph boost silently fails — retrieval quality degrades without any error.

**Files:**
- `src/lib/server/vector/qdrant-manager.ts` — grep for upsert payload shape
- `src/lib/server/retrieval/graph-context.ts:126-148` — confirm field name list

**Verification:**
```bash
grep -n "document_id\|evidence_id\|source_id\|node_id" \
  src/lib/server/vector/qdrant-manager.ts \
  src/lib/server/retrieval/graph-context.ts
```

---

### P1-C: `.gitignore` was shadowing `src/routes/api/ai/models/` and `src/lib/models/`
**Status: FIXED** ✅ (commit `66d9009eb2`)  
`models/` (bare) → `/models/` (root-scoped) + `sveltekit-frontend/models/` explicit.  
`src/routes/api/ai/models/+server.ts` now force-tracked; no future routes under `*/models/*`
will be silently dropped.

**Residual risk:** Any future developer adding a directory named `models` under
`src/` will still need to `git add -f` it. Consider adding an exception line:
```
!sveltekit-frontend/src/**/models/
```
in the EXCEPTIONS section of `.gitignore` (after the LLM-models section).

---

## P2 — Quality & Reliability

### P2-A: ACE policy confidence filtering not confirmed in RAG path
**Audit finding:** Dead Link #3 / Shallow Wiring #3 (Path 3, Step 9)  
`determineACEPolicy()` is called but it's unclear whether its output actually filters
chunks before synthesis, or just annotates them. If filtering is skipped, low-confidence
marginal evidence is passed to the LLM unchanged.

**Files:**
- `src/lib/server/ace/policy.ts` — read return type and contract
- `src/routes/api/rag/search/+server.ts:~450-550` — verify filter is applied

---

### P2-B: Authority chain expansion scoring not applied to final ranking
**Audit finding:** Shallow Wiring #1 (Path 1, Step 9)  
`authorityChainExpansion()` computes precedent/jurisdiction/recency scores but may return
metadata without reranking the document list fed to the LLM.

**Files:**
- `src/lib/server/retrieval/authority-chain.ts` — check return type
- `src/routes/api/sse/chat/+server.ts:~500-550` — check if scores modify chunk order

---

### P2-C: `getRouterStatus()` never wired to an HTTP endpoint
**Audit finding:** Shallow Wiring #2 (Path 1, Step 13)  
`src/lib/server/inference/inference-router.ts` exports `getRouterStatus()` reporting
VRAM, temperature, utilization — but no route calls it.  
The 17-gate backend audit (G16) should surface this.

**Files:**
- `src/routes/api/infrastructure/status/+server.ts` — wire `getRouterStatus()` here
- Or create `src/routes/api/ai/router-status/+server.ts`

---

### P2-D: Route tests missing for codebase-index pipeline routes
**Status:** Tests for graph-sync, cluster-detect, recommendations, evidence-analyze
were patched for error leaks but test coverage was not added.

**Tests to write:**
- `tests/routes/codebase-index-degraded-shape.test.ts` (currently a placeholder)
- 4 routes × 4 baseline cases = 16 tests minimum

---

### P2-E: Degraded-shape audit Pass B — next 10 GET routes
**Status:** Pass A covered 7 routes + `ai/models`. Next batch:

| Route | Consumer | Status |
|-------|----------|--------|
| `GET /api/analytics/summary` | Dashboard widgets | ❓ check |
| `GET /api/analytics/token-usage` | Admin stats panel | ❓ check |
| `GET /api/ai/personas` | Chat UI persona picker | ❓ check |
| `GET /api/acp/tools` | ACP tool panel | ❓ check |
| `GET /api/admin/inference-stats` | Admin dashboard | ❓ check |
| `GET /api/admin/routes` | Route health table | ❓ check |
| `GET /api/codebase-index/stats` | Codebase index page | ❓ check (complex, FastAPI fallback) |
| `GET /api/statutes/[id]` | Statute detail view | ❓ check |
| `GET /api/evidence/[id]` | Evidence detail page | ❓ check |
| `GET /api/cases/[id]` | Case detail page | ❓ check |

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
P0-A (SSE rate limit) ←→ rate-limiter.ts, hooks.server.ts, redis-rate-limit.ts
P0-B (Neo4j export)   ←→ graph-context.ts, sse/chat/+server.ts
P0-C (embedding TTL)  ←→ batch-embedder.ts, embedding-client.ts

P1-A (RAG rate limit) ←→ rate-limiter.ts RATE_TIERS, rag/search/+server.ts
P1-B (Qdrant fields)  ←→ qdrant-manager.ts, graph-context.ts
P1-C (gitignore)      ←→ .gitignore ✅ FIXED

P2-A (ACE filtering)  ←→ ace/policy.ts, rag/search/+server.ts
P2-B (authority rank) ←→ authority-chain.ts, sse/chat/+server.ts
P2-C (router status)  ←→ inference-router.ts, infrastructure/status/+server.ts
P2-D (missing tests)  ←→ tests/routes/codebase-index-degraded-shape.test.ts
P2-E (Pass B audit)   ←→ 10 GET routes listed above

P3-A (raw SQL)        ←→ evidence/upload/+server.ts
P3-B (VLM config)     ←→ env.server.ts, inference-router.ts
P3-C (tier health)    ←→ inference-router.ts
```

---

## Recommended Sprint Order

```
Sprint 7A (this session)
  ├─ P0-B  Verify/fix getNeo4jMultiHopNeighbors export
  ├─ P0-C  Add embedding cache TTL
  └─ P1-B  Verify Qdrant payload field names

Sprint 7B
  ├─ P0-A  Wire SSE rate limiting + test
  ├─ P1-A  Confirm RAG /search rate tier
  └─ P2-D  Fill codebase-index-degraded-shape.test.ts (16 tests)

Sprint 7C
  ├─ P2-A  ACE policy audit + fix
  ├─ P2-B  Authority chain ranking audit
  ├─ P2-C  Wire getRouterStatus() to HTTP endpoint
  └─ P2-E  Degraded-shape Pass B (10 routes)

Backlog
  ├─ P3-A  Drizzle ORM migration for evidence upload
  ├─ P3-B  VLM model config split
  └─ P3-C  Inference tier background health polling
```

---

*Audit performed: 2026-04-16 — 35 hops traced across 3 critical paths.*  
*Wire integrity: 88% (4 dead links, 3 schema risks, 3 shallow wirings found).*
