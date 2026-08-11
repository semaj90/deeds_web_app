# Route Import Infra Isolation — ROUTE_IMPORT_INFRA_ISOLATION_PROVEN

**Status**: PARTIAL — first root cause (redis.ts eager export) fixed and proven; remainder not
yet classified. Not a semantic_768 concern — moved out of
`parent-atlas-semantic-768-canonical-contract` deliberately (see that change's tasks.md
"Follow-up investigation" section for the discovery trail that led here).

## TL;DR

`tests/routes/auto/**` route-handler stub tests were widely believed to have "117 independent
failing handlers." They don't. Running the repaired 137-file subtree **in isolation** (not
alongside the other 654 always-passing files) showed the real number was **14 failures**, not
117 — the rest was vitest worker-pool contention amplifying a small number of shared root causes.
One of those root causes (`src/lib/server/redis.ts`'s eager-connecting `redis` export) has been
fixed and behaviorally proven safe. After the fix: **9 failures remain** (down from 14).

**Do not** resurrect a "write 117 (or 14, or 9) individual `vi.hoisted()` mocks" plan. The
evidence shows this is a small number of production import-time side effects, not per-handler
test debt — fix the side effects at their source, and large swaths of failures disappear at once.

## Superseded observation record

| Observation | Run | Result | Interpretation |
|---|---|---|---|
| OLD | 791-file concurrent run (full suite) | 674 pass / 117 fail | **WRONG interpretation at the time**: read as ~117 independent handler-test bugs |
| CONTROLLED | 137-file repaired subtree, isolated | 123 pass / 14 fail | Failure amplification is contention-sensitive; real defect count is much smaller |
| AFTER FIX | 137-file repaired subtree, isolated, post-redis.ts-fix | 128 pass / 9 fail | One shared root cause (redis.ts) accounted for 5 of the 14 |

**Any future session must treat the 791-file/117-fail number as superseded evidence, not a live
defect count.**

## Root cause 1 — FIXED: `src/lib/server/redis.ts` eager `redis` export

`export const redis = redisPool.getConnection();` ran at **module-evaluation time**, opening a
real Valkey/Redis socket the instant anything imported `redis` (even transitively), regardless of
whether any Redis method was ever called. Its sibling `getRedis()` was already lazy (the function
CLAUDE.md calls "canonical" for long-running server code) — only the legacy `redis` export had
this defect.

**Fix**: converted `redis` to a lazy `Proxy` (same non-breaking precedent as
`vector/qdrant-manager.ts`'s `export const qdrant = new Proxy(...)`). Connection is deferred to
first property/method access, not import.

**Caller audit** (all 9 confirmed 2026-08-11, before the fix):
`chrrom/predictor.ts`, `redis-service.ts`, `rg-atlas/karpathy-blend.ts`,
`search/semantic-cache.ts`, `services/knowledge-search/ACPToolRegistry.ts`,
`services/knowledge-search/RedisCacheService.ts`,
`routes/api/simulation/[sessionId]/strategy/+server.ts`,
`routes/api/statutes/[id]/summary/+server.ts`,
`routes/api/synthesis/evaluation/[id]/+server.ts`. All 9 use `redis` purely as a runtime
method-call target (`.get`/`.set`/`.del`/`.keys`/`.setex`/`.hmget`, one reference assignment) — no
`instanceof`, no destructuring, no module-init-time access. This is exactly the caller shape a
lazy Proxy preserves behaviorally.

**Acceptance gates** (behavioral, not "Proxy implemented" — see tasks.md for full results):
- G1: importing `redis.ts` performs zero real `connect()` calls — **PASS**
- G2: importing 6/7 directly-testable callers performs zero real `connect()` calls during import — **6 PASS, 1 FAIL** (see Root cause 2 below — that failure is NOT from this fix)
- G3: `getRedis()` still connects on explicit use — unchanged, not touched by this fix
- G4: legacy `redis` export still behaves equivalently for all existing caller patterns — **PASS** (pre-existing `redis-disposable.spec.ts` failures identical with/without the fix, confirmed via `git stash`)
- G5: production Redis-focused tests pass (no new failures) — **PASS**
- G6: 137-file route subtree rerun in isolation — **128 pass / 9 fail** (was 123/14)
- G7: previously Redis-induced timeout files stop timing out — **5 of 14 confirmed resolved**
- G8: remaining failures reclassified by actual independent import side-effect owner — **not done, deliberately** (see "Deliberately not done" below)

## Root cause 2 — FOUND, NOT FIXED: `chrrom/predictor.ts` module-level eager singleton

`export const predictor = new MarkovPredictorWithRedis();` (module scope) constructs the class
immediately on import; its constructor calls `this.initializeRedis()` which calls
`ensureRedisReady()` — a genuine connection-test call, independent of the `redis` export fix
above. Confirmed via the same connect()-call-counting smoke gate
(`scripts/smoke-redis-import-isolation.mjs`): `chrrom/predictor.ts` is the only one of the 7
directly-testable modules that still shows `connectAttemptsDuringImport > 0` after the redis.ts
fix. Not fixed in this pass — a different pattern (module-level class instantiation with an eager
async initializer) than the one this proposal scoped to.

## Deliberately not done in this pass

Per explicit operator instruction: **do not trace the remaining 9 failing files' import chains
individually.** The evidence (14 → 9 after fixing exactly one shared cause) already disproves the
"117/14/9 independent bugs" framing; further individual tracing is next-session work, not a
tail-end continuation of this pass. **Do not write `vi.hoisted()` mocks for the remaining 9 (or
any number) as a default next step** — investigate their actual import-time side effects first,
the same way redis.ts and predictor.ts were found, before assuming mocking is the right fix.

## Files

- `sveltekit-frontend/src/lib/server/redis.ts` — the fix (lazy Proxy)
- `sveltekit-frontend/scripts/smoke-redis-import-isolation.mjs` — deterministic G1/G2 gate (monkey-patches `ioredis`'s `Redis.prototype.connect` to count real connection attempts; not timing-based, which proved unreliable — first-import compile overhead swamps a naive wall-clock threshold)

## Next steps (future session)

1. Fix or leave `chrrom/predictor.ts`'s eager singleton (operator decision — module-level
   side-effecting singletons are a broader pattern question, not just a one-line fix).
2. Classify the 9 remaining `tests/routes/auto/sveltekit-frontend/**` failures by their actual
   import-time side-effect owner (expect 2-4 more shared root causes, not 9 independent ones,
   based on the pattern so far).
3. Only after root causes are exhausted should any remaining *genuine* per-handler mocking work
   be considered — and even then, scope it to specific handlers with confirmed handler-specific
   (not import-time) issues.
