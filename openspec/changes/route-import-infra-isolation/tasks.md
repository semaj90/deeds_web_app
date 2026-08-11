# Tasks — Route Import Infra Isolation (ROUTE_IMPORT_INFRA_ISOLATION_PROVEN)

## Done (2026-08-11)

- [x] Audit all 9 known callers of `redis.ts`'s legacy `redis` export; classify usage pattern
      (all 9: runtime method-call consumers only — see proposal.md for the exact list and grep
      evidence).
- [x] Convert `export const redis = redisPool.getConnection();` (eager) to a lazy `Proxy` (defers
      connection to first property/method access). Non-breaking for all 9 confirmed caller
      patterns.
- [x] Build a deterministic (not timing-based) proof gate:
      `scripts/smoke-redis-import-isolation.mjs`, monkey-patching `ioredis`'s
      `Redis.prototype.connect` to count real invocations during import. First attempt used
      wall-clock timing thresholds and produced false positives (first-import compile overhead in
      the same process swamped the signal) — rewritten to be deterministic.
- [x] G1 — importing `redis.ts` alone: 0 connect() calls. PASS.
- [x] G2 — importing 6 of 7 directly-testable callers (lib-level; 3 SvelteKit route files with
      `$lib` aliases excluded from this specific script, can't easily resolve outside SvelteKit
      context via plain `tsx`): 0 connect() calls. `chrrom/predictor.ts` is the one exception —
      see Root Cause 2 below, a *different* eager pattern, not this fix's regression.
- [x] G3 — `getRedis()` unaffected by this change (untouched code path). Not re-verified with a
      new test; no reason to expect regression since the function body wasn't touched.
- [x] G4 — no regression: `tests/redis-disposable.spec.ts` shows the identical 2-pass/2-fail
      result with and without the fix (confirmed via `git stash push -- redis.ts` /
      `git stash pop`). The 2 pre-existing failures are in `createDisposableRedis`, an unrelated
      code path (constructs its own `new Redis(...)` directly, not through `redisPool`).
- [x] G5 — no new test failures introduced anywhere touched.
- [x] G6 — reran `tests/routes/auto/sveltekit-frontend/**` (137 files) in isolation:
      **128 pass / 9 fail**, up from 123/14 before the fix.
- [x] G7 — 5 of the original 14 failing files now pass:
      `admin/parents-atlas/actions.test.ts`, `cases/__id.test.ts`,
      `codebase/search/multi-vector.test.ts`, `atlas/feature-labels.test.ts`,
      `simulation/__sessionId.test.ts`.
- [x] Found (not fixed) Root Cause 2: `chrrom/predictor.ts`'s module-level
      `export const predictor = new MarkovPredictorWithRedis();` singleton eagerly calls
      `ensureRedisReady()` in its constructor — a different pattern (eager class instantiation +
      async initializer) than the `redis.ts` export fix. Confirmed via the same connect()-counting
      smoke gate.
- [x] Wrote the superseded-observation table (791-file/117-fail is stale evidence, not a live
      defect count) into proposal.md so a future session can't resurrect the "mock 117 files"
      plan without first reading why that framing was wrong.
- [x] Deliberately did NOT trace the remaining 9 failures' individual import chains, per explicit
      scope boundary — that's next-session work (G8), not a tail-end continuation of this fix.

## Not done — explicit next steps

- [ ] G8 — classify the remaining 9 `tests/routes/auto/sveltekit-frontend/**` failures
      (`admin/routes.test.ts`, `ai/analyze/__scope.test.ts`, `ai/generate-report/__scope.test.ts`,
      `code-intel/clusters/__clusterKey.test.ts`, `code-intel/topology/node/__stableKey.test.ts`,
      `memory/agent-observation.test.ts`, `recommendations/__userId.test.ts`,
      `retrieval/go.test.ts`, `trpc/__...procedure.test.ts`) by their actual independent
      import-time side-effect owner. Expect a small number of shared causes (2-4), not 9
      independent ones, based on the pattern established by redis.ts.
- [ ] Decide whether to fix `chrrom/predictor.ts`'s eager singleton (operator call — this pattern
      may be intentional for production warm-start behavior, needs review before changing).
- [ ] Re-run the FULL 791-file `tests/routes/auto/**` tree (not just the 137-file repaired
      subtree) after G8 closes, to get a true updated baseline replacing the stale 674/117 number.
