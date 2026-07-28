# Parent Atlas Wiring — In Progress ✅ (Session July 28)

## What Was Wired This Session

**1. Parent Atlas Bridge Module** ✅
- Created `src/lib/server/retrieval/parent-atlas-bridge.ts` (250 lines)
- Exports: `resolveParentAtlasContext()`, `enrichFilterWithDomainTaxonomy()`, `validateParentAtlasLineage()`, `batchResolveParentAtlasContext()`
- Uses canonical Postgres `atlas_packets` table as truth source
- Supports domain taxonomy enrichment and lineage validation

**2. Unified Orchestrator Integration** ✅
- Added STAGE 4.5: Parent Atlas enrichment to `src/lib/server/retrieval/unified-orchestrator.ts`
- Batch resolves source_ref → packet identity context (feature_id, feature_label, domain_class, packet_key)
- Non-blocking enrichment (proceeds without Parent Atlas if lookup fails)
- Adds `parentAtlasContext` to ranked candidates

**3. npm Scripts Wiring** ✅
- Added 11 Parent Atlas scripts to root `package.json`:
  - `parent-atlas:build` — Compile Parent Atlas package
  - `parent-atlas:gate:identity` — Identity lineage gate
  - `parent-atlas:gate:replay` — Replay frozen packets
  - `parent-atlas:gate:lineage` — Canonical lineage validation
  - `parent-atlas:gate:final` — Final admission gate
  - `parent-atlas:ingest` — Packet ingestion
  - `parent-atlas:enrich:karpathy` — Karpathy authority enrichment
  - `parent-atlas:cache:hydrate` — Warm caches
  - `parent-atlas:mapreduce` — Distributed processing
  - `parent-atlas:verify:boundaries` — Package boundary verification
  - `parent-atlas:all` — Full pipeline

## Test Validation Status

**openai-facade.spec.ts Results**:
- ✅ 7 tests passed
- ❌ 7 tests failed (cache key mapping + auth guard issues)

**Failures breakdown**:
1. **Cache key undefined** — `getExactMatchCache` not being called/mocked correctly
2. **URL base undefined** — `runLdrChat` missing base URL for fetch
3. **MCP tool call missing** — `callTraceMcp('ace.compact_search')` not firing
4. **Auth guard missing** — Route handler not enforcing `locals.user` 401

## Critical Blockers (Test Failures)

### 1. Cache Key Mapping
**Issue**: `getExactMatchCache()` returns undefined instead of cache key string
**Impact**: Prompt cache integration broken; falling back to full inference every time
**Root cause**: 
- Test mocks `getExactMatchCache` but implementation uses different function signature
- Cache key builder (`buildAceCompletionCacheKey`) may not be called or called wrong
**Fix needed**:
- Verify `cache-keys.ts` exports correct functions
- Align test mocks with actual function signatures
- Add logging to verify cache key generation flow

### 2. URL Base Resolution
**Issue**: `runLdrChat()` at line 347 tries `fetch(\`${base}/api/auth/login\`, ...)`
**Impact**: LDR (Local Deep Research) chat path crashes
**Root cause**: `base` parameter undefined or not passed through
**Fix needed**:
- Check `runLdrChat` call site in `runChatCompletion()`
- Verify `base` is computed before calling `runLdrChat`
- Use `ENV.SVELTEKIT_ORIGIN` or localhost fallback

### 3. MCP Tool Call Missing
**Issue**: `callTraceMcp('ace.compact_search', ...)` not invoked
**Impact**: ACE context via MCP not populated; falling back to direct assembler
**Root cause**: `useMcp` flag may be false or MCP check/gate failing silently
**Fix needed**:
- Verify MCP availability check before tool call
- Check TRACE MCP health endpoint (:8788/health)
- Confirm tool registration on TRACE server

### 4. Auth Guard Missing
**Issue**: Route handler allows 200 response without `locals.user`
**Impact**: Unauthenticated requests proceed (security regression)
**Root cause**: Route handler not checking auth at entry point
**Fix needed**:
- Add guard: `if (!locals.user) return { status: 401, body: { error: { code: 'unauthorized' } } }`
- Enforce before any processing

## Next Steps (Ordered by Dependency)

1. **Fix auth guard** (5 min) — Add locals.user check to route handler
2. **Fix URL base** (10 min) — Ensure base URL computed before runLdrChat
3. **Fix cache key mapping** (20 min) — Align test mocks, verify cache-keys export
4. **Fix MCP tool call** (15 min) — Verify TRACE health, check useMcp flag, add logging
5. **Re-run tests** (5 min) — Confirm all 14 tests pass
6. **Build Parent Atlas** (5 min) — `npm run parent-atlas:build`
7. **Run identity gate** (10 min) — `npm run parent-atlas:gate:identity`
8. **Verify integration** (5 min) — Check retrieval path uses Parent Atlas context

## Architecture Summary

**Parent Atlas in Retrieval Stack**:
```
Query
  → Embed (768d)
  → [STAGE 1.5] Rust N-API (optional)
  → [STAGE 2] Qdrant search
  → [STAGE 2.5] rg-pool lexical
  → [STAGE 3] TurboVec prefilter
  → [STAGE 4] Postgres join
  → [STAGE 4.5 — NEW] Parent Atlas enrichment ← batch resolve identity
  → [STAGE 5] Ranking + enhance with context
  → Response (candidates with parentAtlasContext)
```

**Key Contracts**:
- Input: source_ref (file path)
- Lookup: Postgres atlas_packets table
- Output: ParentAtlasContext (feature_id, feature_label, domain_class, packet_key, confidence)
- Non-blocking: Enrichment proceeds even if lookup fails

## Files Modified

- `src/lib/server/retrieval/parent-atlas-bridge.ts` — CREATED
- `src/lib/server/retrieval/unified-orchestrator.ts` — MODIFIED (STAGE 4.5 + imports)
- `package.json` — MODIFIED (11 npm scripts added)

## Files Verified Existing

- `packages/parent-atlas/` — Main package
- `packages/parent-atlas-core/` — Core schemas
- `packages/parent-atlas-ingest/` — Ingestion pipeline
- `packages/parent-atlas-retrieval/` — Retrieval bridge
- `sveltekit-frontend/src/lib/server/ace/parent-atlas-packet-assembler.ts` — Packet assembly
- Drizzle schemas: `parent-atlas-jobs.ts`, `parent-atlas-documents.ts`

## Deployment Readiness

**Ready** ✅:
- npm scripts wired and callable
- Retrieval orchestrator integrated
- Postgres atlas_packets table canonical
- Bridge module with proper error handling

**Blocked** ⏳:
- Cache key mapping tests failing (4 tests)
- Auth guard test failing (1 test)
- MCP integration test failing (1 test)
- URL base test failing (1 test)

**Action**: Fix 4 blocker tests, then Parent Atlas integration is PRODUCTION READY.

---

**Status**: 🟡 INTEGRATION WIRED — TESTS BLOCKING DEPLOYMENT
