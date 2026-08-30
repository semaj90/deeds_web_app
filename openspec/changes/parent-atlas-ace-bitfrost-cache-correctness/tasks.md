# Tasks: parent-atlas-ace-bitfrost-cache-correctness

## Context

A background fork investigated the ACE → BitFrost → MCP path for verifiable optimizations this
session (read `context-assembler.ts` full, `ace-top-retrieval-cache.ts` full, spot-checked
`topo-candidate-cache.ts`). It surfaced 5 findings; 2 were fixed immediately (below), 3 remain
open. MCP tool-call parallelism, `search-router.ts`, `multi-lane-retrieval.ts`, and the
query-synthesis/prompt-build stage feeding Ornith were **not reached** — explicitly unexamined,
not confirmed clean.

## T1 — Fixed this session

- [x] `context-assembler.ts` (`sveltekit-frontend/src/lib/server/ace/context-assembler.ts`):
      `assemble()`'s cache key hashed only `queryText + embedding[0:10]`, no revision binding —
      `validateCachedPacket()`'s staleness check existed but was dead code since nothing ever set
      `workspace_revision` on an assembled packet. Fixed: `assemble()` now takes optional
      `workspaceRevision`/`sourceRevision` params, folds them into `cache_key` when supplied, and
      stamps them onto the packet. Backward-compatible (optional params); the one existing caller
      (`phase110-end-to-end-retrieval-flow.ts`) doesn't currently pass a revision, so this closes
      the structural gap without forcing a caller change yet.
- [x] `ace-top-retrieval-cache.ts`
      (`sveltekit-frontend/src/lib/server/cache/ace-top-retrieval-cache.ts`):
      `setAceTopRetrievalPointer()` used plain `redis.set()` — no TTL, unbounded growth. Fixed to
      `redis.setex(..., 300, ...)`, matching the sibling `topo-candidate-cache.ts` TTL pattern.
      `buildAceTopRetrievalCacheKey()` also gained an optional `workspaceRevision` param.
      **Note**: this module currently has zero callers anywhere in the app — the bug was real but
      dormant. Don't wire up callers as part of this change without being asked.

## T2 — Open, not started (from the fork's report)

- [ ] `context-assembler.ts:67-71` — `getACEContextAssembler()` singleton opens its own
      `.duplicate()`d Redis connection instead of reusing `getValkeyClient()`. Low severity, one
      extra persistent connection, not per-request.
- [ ] `context-assembler.ts:97` — `total_tokens`/`compression_ratio` computed from
      `packet_key.length`/`source_ref.length`, not any real content field (the `ACEPacket`
      candidate shape doesn't carry summary text at all). Every compression ratio this class
      reports is measuring the wrong thing.
- [ ] `context-assembler.ts:108` — `candidates.slice(0, 50)` with no visible sort call in this
      file. Not confirmed as a live bug (callers not traced) — check whether callers guarantee
      score-sorted input before `assemble()`; if not, this silently drops higher-scoring
      candidates past index 50.

## T3 — Unexamined (budget-limited, not clean)

- [ ] MCP tool-call parallelism (serial vs. parallel invocation patterns)
- [ ] `search-router.ts`
- [ ] `multi-lane-retrieval.ts`
- [ ] Query-synthesis / prompt-build stage feeding Ornith

## T4 — Cache identity / deterministic proof tranche — IMPLEMENTED, PROOF PENDING

Web alignment checked before implementation against current upstream Valkey/vLLM/OpenTelemetry
behavior: regular application `KEYS` traversal is not appropriate for production invalidation;
prefix-cache identity should bind exact tokens plus runtime identity extras; cached-input-token
telemetry is a distinct measured counter rather than an inferred savings number.

- [x] Added `sveltekit-frontend/src/lib/server/cache/cache-identity-v2.ts`.
      `CacheIdentityV2` uses SHA-256 over deterministic length-prefixed fields. Exact semantic
      vectors are canonicalized to FP32 and hashed over every coordinate; exact token sequences
      use u32 little-endian IDs. Physical keys include `cacheEpoch`.
- [x] Preserved legacy `hashQuery()`/`hashEmbedding()`/key helpers for compatibility but marked
      them non-promotion-grade. Added `hashQueryV2()`, `hashEmbeddingV2()`, `atlasRedisKeyV2()`,
      and `atlasBifrostKeyV2()`.
- [x] Migrated the unified `atlas-cache-cascade.ts` L1/L2 reads and L1 writes to V2 identities.
      `invalidateAtlasCacheEpoch()` now performs O(1) logical invalidation by advancing
      `atlas:graph_version` and `atlas:cache_epoch`; no `KEYS`/bulk `DEL` traversal remains on
      this invalidation path. Old epoch-qualified entries are disposable and age out by TTL.
- [x] Added `CacheExecutionReceiptV1` with the required bounded state machine:
      `MISS → COMPUTE → WRITE → READBACK_HIT → INVALIDATE → POST_INVALIDATION_MISS`.
      Promotion requires checksum parity, positive readback `PTTL`, initial/post-invalidation
      `PTTL=-2`, and explicit `canonicalAuthority:false`.
- [x] Added `sveltekit-frontend/scripts/atlas/prove-valkey-cache-execution-v1.mts`.
      It operates on a unique proof namespace, records only bounded hashes/counts/timings, advances
      the logical cache epoch, cleans its old proof key, and emits
      `docs/reports/valkey-cache-execution-receipt-v1.json`.
- [x] Added `parent-atlas-cache-receipt-projection-v1.ts`; a proven Valkey receipt advances only
      `valkey_cache`. BitFrost, ACE prefill, and KV-prefix remain independent gates until their own
      receipts exist. The admin HUD/report emitter consume the projection.
- [x] HUD now distinguishes observed proof-cache hit rate from baseline-derived efficiency and
      displays the count of proven cache tiers. Cache hits cannot raise token-savings telemetry.
- [x] Added BitFrost `PrefixCacheIdentityV2` plus `getPrefixTokenV2()` / `registerPrefixV2()`.
      Identity binds exact token IDs, model revision, tokenizer revision, prompt-template revision,
      ContextManifest checksum, optional adapter revision, and optional cache salt. Existing
      content-only prefix methods remain compatibility-only and cannot advance `kv_cache_identity`.
- [ ] **PROOF PENDING:** execute focused unit tests/typechecks and the bounded live Valkey replay.
- [ ] Add a BitFrost V2 live MISS→WRITE→HIT→identity-change MISS receipt before advancing
      `bitfrost_cache` or `kv_cache_identity`.
- [ ] Trace and migrate the actual prefill caller to V2 token/revision identity. Do not count the
      compatibility-only `optimizeMessages()` path as KV proof.
- [ ] Trace the live ACE assembler caller and pass authoritative workspace/source revisions;
      optional revision parameters alone do not prove revision-qualified caching.
- [ ] Add a cold/warm frozen-input replay before publishing token or wall-time savings. Use
      runtime/provider cache-read/cache-write token counters when available; do not estimate from
      prompt length, files, packet count, or hit count.
- [ ] Consider single-flight miss suppression only after correctness proof. It is a resilience /
      latency optimization, not a cache-correctness prerequisite.

### T4 validation commands

```bash
cd sveltekit-frontend
npx vitest run \
  src/lib/server/cache/cache-identity-v2.spec.ts \
  src/lib/server/cache/cache-execution-receipt-v1.spec.ts \
  src/lib/server/atlas/tournament/parent-atlas-cache-receipt-projection-v1.spec.ts
npm run check

# Mutates only atlas:cache_epoch plus a unique short-lived proof key.
npx tsx scripts/atlas/prove-valkey-cache-execution-v1.mts
npx tsx scripts/atlas/emit-parent-atlas-tournament-progress-v1.mts

cd ../packages/parent-atlas-retrieval
npm run typecheck
npx vitest run src/bifrost/bifrost-cache-manager.spec.ts
```

Do not mark T4 `PROVEN` until these commands execute successfully on the workstation and the live
receipt validates.

## Run receipt

See `parent-atlas-agentic-run-receipt-binding/tasks.md` T3 — this change is the first real
`openspecChange` binding target for that new capability once it lands. Historical agent metrics
may be backfilled only if their actual workflow identity can be recovered; do not synthesize an
event merely to raise Tournament EXP.
