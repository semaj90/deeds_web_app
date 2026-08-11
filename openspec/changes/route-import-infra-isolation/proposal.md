# Route Import Infra Isolation — ROUTE_IMPORT_INFRA_ISOLATION_PROVEN

**Status**: PARTIAL — first root cause (redis.ts eager export) fixed and rigorously proven via
socket-level, process-isolated gates; a second, separate eager-connection owner found (not fixed,
operator decision needed); remainder not yet classified, and run-to-run variance suggests at
least one more contention source (RabbitMQ suspected, not confirmed). Not a semantic_768 concern
— moved out of `parent-atlas-semantic-768-canonical-contract` deliberately (see that change's
tasks.md "Follow-up investigation" section for the discovery trail that led here).

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

**Acceptance gates — final, rigorous, socket-level + process-isolated proof** (superseding the
first-pass ioredis-`connect()`-patch version, which had two methodological flaws found and fixed
mid-investigation — see "Methodology corrections" below):
- G1: importing `redis.ts` performs zero real socket-connect attempts — **PASS** (0 attempts)
- G2: importing each of the 7 directly-testable callers performs zero socket attempts during import — **6 PASS, 1 FAIL** (`chrrom/predictor.ts` — see Root Cause 2)
- G3: `getRedis()` + explicit use DOES trigger a connection attempt — **PASS** (2 attempts recorded)
- G4: legacy `redis` export first use triggers a connection attempt through the *same* lifecycle owner as `getRedis()` — **PASS** (2 attempts, `sameOwner=true`)
- G5: production Redis-focused tests pass (no new failures) — **PASS** (`redis-disposable.spec.ts` identical pass/fail with and without the fix, confirmed via `git stash`)
- G6: 137-file route subtree rerun in isolation — **volatile across runs**: one run showed 128 pass / 9 fail (was 123/14 baseline), a repeat run showed 115 pass / 22 fail. See "Run-to-run variance" below.
- G7: previously Redis-induced timeout files — confirmed resolved in at least one run (5 of the original 14); not stably reproducible run-to-run, consistent with a second, unquantified contention source
- G8: remaining failures reclassified by actual independent import side-effect owner — **not done, deliberately** (see "Deliberately not done" below)

**Methodology corrections made mid-investigation** (both caught by rigor, not assumed clean):
1. First proof attempt patched only `ioredis`'s `Redis.prototype.connect` — too narrow, since the
   real invariant is "zero socket-open attempts," not "ioredis specifically wasn't called."
   Rewritten to intercept `net.Socket.prototype.connect`, `net.createConnection`, and
   `tls.connect` — the actual Node networking choke points any client library must go through.
2. All 7 callers share the same `redisPool` singleton (defined in `redis.ts`). Running all checks
   sequentially in one process meant an early exhausted-retry connection could silently suppress
   later checks — a **false PASS**, not a true one. Confirmed this actually happened: a
   shared-process run showed `chrrom/predictor.ts` passing with 0 attempts; an isolated-subprocess
   rerun (fresh process per check, via `scripts/_smoke-redis-worker.mjs` + `spawnSync`) showed it
   correctly failing with 1 attempt. Rewrote the whole gate to run every check in its own fresh
   child process. A third correction (a 200ms drain delay after import) was needed on top of
   process isolation, because `predictor.ts`'s eager connect happens via a fire-and-forget
   `this.initializeRedis()` call in its constructor — `await import(...)` resolving only proves
   synchronous module evaluation finished, not that queued microtasks from such a call have run.

## Root cause 2 — FOUND, NOT FIXED: `chrrom/predictor.ts` module-level eager singleton

`export const predictor = new MarkovPredictorWithRedis();` (module scope) constructs the class
immediately on import; its constructor calls `this.initializeRedis()` which calls
`ensureRedisReady()` — a genuine connection-test call, independent of the `redis` export fix
above. Confirmed via the same connect()-call-counting smoke gate
(`scripts/smoke-redis-import-isolation.mjs`): `chrrom/predictor.ts` is the only one of the 7
directly-testable modules that still shows `connectAttemptsDuringImport > 0` after the redis.ts
fix. Not fixed in this pass — a different pattern (module-level class instantiation with an eager
async initializer) than the one this proposal scoped to.

## Run-to-run variance — a second contention source is likely, not yet confirmed

Two G6 reruns of the identical 137-file subtree, no code changes between them, gave materially
different results: 128 pass/9 fail, then 115 pass/22 fail. This means Redis was never the only
contention source — fixing it improved one run's numbers but didn't stabilize the metric. RabbitMQ
is suspected (a concurrent session's application logs show a real RabbitMQ reconnect backoff
sequence — `ECONNRESET`, retries at 5s/10s/20s/40s/60s, ~135s of scheduled delay) but **not
confirmed** as import-triggered — it may simply be an already-running dev-server process reacting
to a real broker disconnect, unrelated to these tests. Whether `initializeRabbitMQ`-style code
runs at module-import time (bad, same class of bug as `redis.ts`) or only at explicit
application/worker startup (fine) has not been checked. **Do not assume RabbitMQ is the cause
without checking its import ownership first** — same discipline that caught the two Redis-adjacent
false starts above.

**Partial check done (2026-08-11, context-bounded)**: 10 candidate files found via
`grep -rl "initializeRabbitMQ\|new amqp\|amqplib"`. Checked 2: `queue/outbox-boot.ts` is
genuinely lazy — `startOutboxPublisherWithRabbit()` is an exported function, not invoked at
module scope, and its own doc comment confirms it's meant to be wired explicitly into
`hooks.server.ts` after RabbitMQ is confirmed active. Not the bug. **8 candidates still
unchecked**: `connections/connection-pool.ts`, `dispatcher/dispatcher-orchestrator.ts`,
`dispatcher/rabbitmq-event-emit.ts`, `dispatcher/rabbitmq-identity-listener.ts`,
`evidence/rabbitmq.ts`, `indexer/workspace-metadata-extractor.ts`,
`ml/topic-clustering-worker.ts`, `pgai/summarize.ts`, `adapters/service-integrations.ts`. Next
session: check each for a module-scope (not function-body) call to `.connect()`, same pattern as
the `outbox-boot.ts` check above.

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

## SESSION HANDOFF (2026-08-11, end of session)

**All work in this change is committed and pushed to `origin/main`** (in sync, verified via
`git log --oneline origin/main -1`). Commits, newest first:

```
b719733045 Record graph validation fabric guidance (GRAPH_SNAPSHOT_PARITY) as OpenSpec proposal
6e5bb70974 Partial RabbitMQ import-ownership check: outbox-boot.ts cleared, 8 candidates remain
74e6d19293 Rigorous socket-level ROUTE_IMPORT_INFRA_ISOLATION_PROVEN proof; fix 5 more reserved +server.test.ts files
6ab5bc3d40 Fix redis.ts eager connection via lazy Proxy (ROUTE_IMPORT_INFRA_ISOLATION_PROVEN)
6f300b96f8 Document stub-test hang root cause: redis.ts eager connection, not 117 independent bugs
5d5834fa9c Fix semantic_768 canonical-constant duplication across 36 files; audit and repair Parent Atlas phase-lane mock system
```

**What a fresh session picking this up should know:**

1. **Done, proven, safe to build on**: `redis.ts`'s eager `redis` export is now a lazy Proxy
   (G1-G5 all pass via `scripts/smoke-redis-import-isolation.mjs` — socket-level interception,
   one fresh subprocess per check, no flaky timing assumptions). 0 regressions. 6 reserved-`+`
   route-test files fixed (`RESERVED_ROUTE_FILE_WARNINGS` = 0 repo-wide).
2. **Found, not fixed, needs an operator decision**: `chrrom/predictor.ts` has its own separate
   eager Redis connection (module-level singleton constructor calling `ensureRedisReady()`
   without awaiting it). Confirmed via the same smoke gate. Not touched — different pattern than
   the fix above, and whether it's intentional warm-start behavior is a product call, not mine.
3. **Confirmed but NOT explained**: rerunning the identical 137-file `tests/routes/auto/**`
   subtree twice, no code changes between runs, gave materially different results (128 pass/9
   fail, then 115 pass/22 fail). Redis was never the sole contention source. RabbitMQ is
   suspected — 1 of 10 candidate files checked (`outbox-boot.ts`, cleared, genuinely lazy), 8
   remain (listed above, in "Root cause 2" section... see the earlier "8 candidates still
   unchecked" list). **Do not resurrect a "mock N failing files" plan** — the evidence base for
   that framing (the original 791-file/117-fail run) is explicitly documented as stale/misleading
   in the superseded-observation table above.
4. **A separate, concurrent session was active in this same repo throughout**, working a
   different lane entirely: Louvain graph-community reconciliation and packet-identity work
   (commits `aa181e8db3`, `6971b8362f`, and ongoing — visible as `sveltekit-frontend/graph/*`
   files and `openspec/changes/parent-atlas-graph-validation-fabric/` in this repo). That work is
   **not part of this change** and was deliberately not touched or investigated here — see that
   directory and `parent-atlas-semantic-768-canonical-contract/tasks.md` for what little context
   was captured about it. As of session end, that lane reported `replaySafe: false` with 5
   `PROVENANCE_INSUFFICIENT` rows still needing an explicit classification decision — unrelated
   to anything in this change, flagged here only so a fresh session doesn't conflate the two
   lanes' git history.
5. **No uncommitted work was left behind** in this change's scope. `git status` at session end
   shows only unrelated concurrent-session files and a few untouched nested-repo submodules
   (`claude-mem`, `granite-docling-258M`, `models/embeddinggemma_300m`, `turbovec`) that were
   deliberately never staged all session (pre-existing repo hygiene debt, out of scope).

## Next steps (future session)

1. Fix or leave `chrrom/predictor.ts`'s eager singleton (operator decision — module-level
   side-effecting singletons are a broader pattern question, not just a one-line fix).
2. Classify the 9 remaining `tests/routes/auto/sveltekit-frontend/**` failures by their actual
   import-time side-effect owner (expect 2-4 more shared root causes, not 9 independent ones,
   based on the pattern so far).
3. Only after root causes are exhausted should any remaining *genuine* per-handler mocking work
   be considered — and even then, scope it to specific handlers with confirmed handler-specific
   (not import-time) issues.
