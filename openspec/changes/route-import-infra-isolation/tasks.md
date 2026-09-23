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

- [x] G8 — **DONE (2026-09-05), with a major regression found — this is now a much bigger issue
      than the original 9-file scope.** Re-ran `tests/routes/auto/sveltekit-frontend/**` fresh
      (JSON reporter, structured breakdown, not eyeballed): the suite has regressed to **27 failed
      / 110 passed** (out of 137 files), up from the 9/128 baseline this file recorded on
      2026-08-11 — three times worse. Root-cause breakdown across all 27 failures:
      - **24 of 27 (89%) share one exact root cause** — confirming this file's own prediction of
        "a small number of shared causes, not N independent ones," just far more concentrated than
        expected. `src/lib/server/llm/runtime-contract.ts:27-33` has a **module-level top-level
        `throw`**: `const resolvedModelPath = ENV.ROTORQUANT_MODEL_PATH ?? ENV.TURBO_MODEL_PATH ??
        null; if (!resolvedModelPath) { throw new Error('[llm-runtime-contract]
        ROTORQUANT_MODEL_PATH is required...') }` — this is structurally the **exact same bug
        class** this OpenSpec change exists to catch (an eager, import-time side effect that
        crashes any test importing the module transitively), just in a different file than the
        original `redis.ts` fix. `git log` confirms this contract file didn't exist at the
        2026-08-11 baseline (earliest commit touching it is `2ef643810b`, 2026-08-12; most recently
        touched `b5cb5ebd8b`, 2026-09-03) — this is a genuinely new regression introduced after this
        change's own G6/G7 baseline, not a pre-existing issue this task missed. `ROTORQUANT_MODEL_PATH`
        is not set anywhere in `vitest.config.ts`/`vite.config.ts`, and no `.env.test` file exists —
        so any route test whose import chain reaches this module (directly, or via
        `src/lib/server/ai/local-llama-provider.ts` and similar) crashes at import time unless the
        real operator's `.env` happens to have this var set. 11 of the 24 were traced to their exact
        failing test file: `acp/kv-cache-stats`, `admin/atlas/cluster-search`,
        `admin/atlas/couchdb-synthesize`, `ai/analyze/__scope`, `ai/generate-report/__scope`,
        `atlas/mastra-agent`, `codeintel/clusters/__id`, `code-intel/topology/node/__stableKey`,
        `knowledge/document/__id`, `opencode-dispatch`, `tasks/packets/workflow`. The other 13
        sharing this same top-level error message were not individually traced to a specific test
        file in this pass — grep-attribute them the same way (`rg "ROTORQUANT_MODEL_PATH" -l
        src/lib/server` for callers, cross-reference against the full 27-file fail list) before
        attempting a fix.
      - **1 unrelated** — `AssertionError: expected 401 to be 400` (an actual logic/assertion
        mismatch, not an import-time crash — separate bug, out of this task's scope).
      - **1 unrelated** — `Error: Cannot overwrite keys on object schemas containing refinements.
        Use \`.safeExtend()\` instead.` — a Zod API-surface break (likely a Zod version bump
        somewhere between 2026-08-11 and now introduced `.extend()` on a `.refine()`-carrying
        schema, which newer Zod versions reject) — separate bug, out of this task's scope.
      - **1 unclassified** — recorded only as `STACK_TRACE_ERROR` with no further detail captured
        in this pass (matches the `wiki/page/__id.test.ts` hook-timeout symptom seen in an earlier,
        differently-configured run of this same suite — not confirmed identical, not chased
        further).
      **Not fixed here** — this task was scoped to classification, and the fix (making
      `runtime-contract.ts`'s model-path resolution lazy, matching the `redis.ts` pattern this
      change already established, or setting a test-safe default) is real code-change work deserving
      its own explicit go-ahead, especially given it affects a dominant fraction of the route-test
      suite.

## G8 deep audit — why it actually regressed (2026-09-05, read-only, no fix applied)

Traced the `ROTORQUANT_MODEL_PATH` failure to its true root cause rather than stopping at "the
module throws." This is **not simply a missing test-env variable** — it's an env-plumbing gap with
a second, more serious production-facing implication found along the way.

**The mechanism, confirmed empirically (temporary probe test, run, then removed — not committed)**:
- `.env` at repo root of `sveltekit-frontend/` genuinely has `ROTORQUANT_MODEL_PATH` set to a real
  path (`models/ornith-1_5-9b-ad-q5_k-q4_k/hforf.gguf`).
- `src/lib/server/env.server.ts:20` defines `const privateEnv: NodeJS.ProcessEnv = process.env;` —
  it reads **raw `process.env` directly**, not SvelteKit's `$env/dynamic/private` virtual module.
- Probed both inside a running vitest test: `process.env.ROTORQUANT_MODEL_PATH` is `undefined`, but
  `(await import('$env/dynamic/private')).env.ROTORQUANT_MODEL_PATH` correctly resolves to the real
  `.env` value. **SvelteKit's own env virtual module sees `.env` fine under vitest; raw
  `process.env` does not.** This is because `vite dev`/`vite build`'s CLI entrypoints call Vite's
  `loadEnv()` and merge the result into `process.env` before any app code runs, but the `vitest` CLI
  entrypoint does not replicate that step — only Vite's plugin-level virtual modules (like
  SvelteKit's `$env/*`) see the loaded values inside vitest.
- `vitest.config.ts` has `setupFiles: ['src/test-setup.ts', 'tests/setup.ts']`; neither file loads
  `dotenv` or touches `process.env`. Confirmed via `node -e "require('dotenv/config'); ..."` that
  `dotenv/config` alone correctly populates `process.env.ROTORQUANT_MODEL_PATH` from `.env`.
- **The repo already owns a canonical fix for exactly this, with near-zero adoption** — found after
  the diagnosis above, and it changes the recommendation (do not introduce a parallel mechanism, per
  CLAUDE.md's Duplication Prevention rule): `src/lib/server/analysis/test-env-bootstrap.ts` loads
  `.env.local` then `.env` into `process.env` and its own header comment states this problem almost
  verbatim — *"for vitest specs that hit a real Postgres connection directly (bypassing SvelteKit's
  request-scoped `$env/dynamic/private` injection, which vitest unit-test files never go through)"*
  — including the correct precedence rationale (dotenv never overwrites an already-set var, so
  `.env.local` wins, matching Vite's own convention) and the ESM import-ordering caveat (import it
  FIRST, before any import that transitively reaches `db/client.ts`). **It has exactly 2 importers
  repo-wide** (`code-evidence-readback.spec.ts`, `code-evidence-outbox.spec.ts`) — so the mechanism
  that would prevent all 24 failures already exists and is already correct; it simply was never
  applied globally.
- **Standing diagnostic probe kept, not deleted**: `tests/atlas/env-loading-probe.spec.ts` reports
  both values side by side (`process.env` vs `$env/dynamic/private`) and passes today, printing
  `undefined` for the former and the real `.env` value for the latter. Deliberately asserts nothing
  about which is set, so it stays green once the fix lands rather than becoming a gate that pins the
  broken state. Companion DB-side probe for a different blocker:
  `scripts/atlas/audit-error-research-lane-blockers-v1.mts`.

**Second, more serious finding — this is not purely a test artifact.** `.env.example:160` documents
`ROTORQUANT_MODEL_PATH="REPLACE_ME"` — a placeholder, not a real path. On a **fresh clone**, running
`vite dev`/`vite build` for real (not vitest) would load `.env.example`-derived values (if copied to
`.env` verbatim, as the file's own name and convention implies a new operator should do) and hit
this exact same module-level `throw` at server startup — crashing the entire app before it can even
render an unrelated page, not degrading gracefully. This means the `setupFiles`/`dotenv` fix above
only repairs the **test-suite** symptom; it does nothing for the **production/dev-server
robustness** problem, which needs the actual code fix (`runtime-contract.ts`'s resolution made
lazy — thrown only when a caller actually needs `ROTORQUANT_MODEL_PATH`/`LLM_MODEL_ID`, not at
module-import time), matching the `redis.ts` Proxy pattern this OpenSpec change already established
and proved safe for exactly this failure class.

**Independent corroboration this is a known, recurring pain point, not a one-off**: a *different*
OpenSpec change (`inference-wiring-deep-audit-aug22/tasks.md`, its `context-assembler.ts`
verification entry) independently hit the identical symptom weeks earlier while trying to get a
live runtime proof outside the SvelteKit/Vite dev-server context via plain `tsx` — recorded there as
"this file has module-scope side effects (`ROTORQUANT_MODEL_PATH` validation throws on missing
env)... that make standalone execution fail for reasons unrelated to this change." Same root module,
same failure class, different execution context (`tsx` there, `vitest` here) — both are instances of
"code that imports `runtime-contract.ts` outside a real Vite/SvelteKit-managed process boundary
breaks," which is the general form of the bug.

**Recommended fix path (option 1 empirically proven live, then reverted — not left applied; option 2
not applied, still needs explicit go-ahead given the blast radius)**:
1. Short-term, test-only, low-risk: load `.env` into `process.env` globally for the test run —
   **preferably by adding the existing `src/lib/server/analysis/test-env-bootstrap.ts` to
   `vitest.config.ts`'s `setupFiles`** rather than adding a second bare `import 'dotenv/config'`,
   since that module already exists, already handles `.env.local`-over-`.env` precedence, and
   already documents the ESM import-ordering caveat (see above). **Verified live, not just
   theorized**: applied the equivalent one-line `import 'dotenv/config';` to `src/test-setup.ts`,
   re-ran the 3 previously-failing files that most directly exercise the `ROTORQUANT_MODEL_PATH`
   crash (`acp/kv-cache-stats`, `ai/analyze/__scope`, `atlas/mastra-agent`) — **all 3 now pass**
   (`3 passed (3)` test files) — then reverted via `git checkout --` immediately after, since
   applying it for real wasn't authorized in this pass. Fixes the test regression without touching
   application code. Does not fix the fresh-clone production-crash risk below.
2. Correct, complete fix: make `runtime-contract.ts`'s `resolvedModelPath`/`ROTORQUANT_MODEL_PATH`/
   `LLM_MODEL_ID` lazy (computed on first access via a function or `Proxy`, matching the `redis.ts`
   fix this same change already applied and proved non-breaking for its 9 real callers), so the
   module can be imported safely from any context — test, `tsx` script, or a fresh clone that
   hasn't configured a model path yet — and only throws when inference is actually attempted.
   Requires auditing every current importer of `LLM_MODEL_ID`/`ROTORQUANT_MODEL_PATH` first (this
   pass did not enumerate them) to confirm none rely on the throw firing at import time as a
   fail-fast guard.

- [ ] Decide whether to fix `chrrom/predictor.ts`'s eager singleton (operator call — this pattern
      may be intentional for production warm-start behavior, needs review before changing).
- [x] Re-run the FULL 791-file `tests/routes/auto/**` tree (not just the 137-file repaired
      subtree) after G8 closes, to get a true updated baseline replacing the stale 674/117 number.
      Interim run 2026-09-21: `tests/routes/auto` (787 files found, not 791): first run 4,273 tests =
      1,172 pass / 14 fail / 3,087 `it.todo` stubs (about 72% placeholders, not coverage), 11 failing
      files. After fixes the full-tree rerun = 1,185 pass / 1 fail; that 1
      (`api/v1/chat/completions` stream test) was then fixed (2 consecutive isolated passes). Full
      tree not re-run after that last fix at the time.
      Causes: 2 production bugs (`api/retrieval/go` Zod `.extend()` -> `.safeExtend()`, crashed at import;
      `lib/server/ai/tool-selection.ts` read `d.points` instead of `d.result.points`, Qdrant tool lane always
      empty); 4 hook timeouts (`vitest.config.ts` `hookTimeout: 30000`, bare `STACK_TRACE_ERROR`); 8 stale/
      order-dependent tests (select-tools auth + mock shape, outbox-worker 384->768, system/health port 8080->8090,
      api/health `not_configured`, gds-status needs `apply:true`, contextual-chat mock path, chat/completions
      stream test depended on live Redis cache state — now mocked). tsgo: no errors in the two touched sources.

      **Real final baseline, re-run for real (2026-09-22)**: `npx vitest run tests/routes/auto
      --reporter=json` — 2,646 test suites (2,637 passed / 9 reported failed at the suite level),
      4,273 tests total = **1,183 pass / 3 fail / 3,087 `it.todo`**. All 3 failures were
      `STACK_TRACE_ERROR` inside `beforeEach` (`api/evidence/upload`, `api/synthesis/generate`,
      `api/trpc/[...procedure]`'s 401-unauth tests) — the exact hook-timeout-under-load symptom
      this file's own Lessons section already documents. **Verified not a regression, not
      assumed**: re-ran all 3 files in isolation (`npx vitest run <3 files>`) — all 3 pass cleanly,
      5.4s/6.2s/9.6s respectively, well inside the 30s hook timeout when not contending with 787
      other files for CPU. **Real, confirmed full-tree result: 1,186/1,186 non-todo tests pass
      (1,183 + the 3 isolated-confirmed), 0 genuine failures.** This is a real improvement over the
      prior interim 1,185/1 baseline, not just a re-confirmation — the previously-open
      `api/v1/chat/completions` fix held, and no new regression was introduced since. `git log`
      confirms `runtime-contract.ts`'s `ROTORQUANT_MODEL_PATH` eager throw (still present in source,
      unfixed — see the caller-audit finding immediately below) did not fire in this run because
      this dev environment's `.env` has the variable set; this remains a fresh-clone risk, not a
      currently-observable test failure.

      **`runtime-contract.ts` importer census (2026-09-22, read-only, blocks the "correct, complete
      fix" item above)**: grepped for real importers (`from '$lib/server/llm/runtime-contract'` and
      equivalent relative-path forms) across `src` and `scripts` — **152 files import this module**,
      far more than practical to individually audit for reliance on the eager-throw-as-fail-fast-
      guard behavior in one pass. The task's own caveat ("Requires auditing every current importer
      first — this pass did not enumerate them") was correct to flag this as unfinished; it is now
      enumerated (152 files) but **not** individually checked. **Not fixing the lazy-Proxy pattern
      in this pass** — the surface is too large to safely convert without that per-file check, and
      an incorrect conversion (removing a guard some caller genuinely depends on) is exactly the
      kind of silent regression this repo's Duplication Prevention / evidence-laundering rules
      exist to prevent. Left as a real, now-better-scoped next step, not attempted.
- [x] TTS-PIPER-WASM-UNRESOLVED-01 (2026-09-21 diagnosed; fixed 2026-09-22 via option (b) from this task's own list — genuinely optional import, no new dependency, no capability decision needed, per CLAUDE.md's "UI bugs are HOT" rule). `sveltekit-frontend/src/lib/services/tts.ts`: replaced the static `import type { PiperWasm } from 'piper-wasm'` with a local `PiperWasmInstance`/`PiperWasmModule` interface (matches only the two members this file actually calls), and replaced the literal `await import('piper-wasm')` with a non-literal-specifier `/* @vite-ignore */` dynamic import (same pattern already used in `granite-docling.ts` for `pdfjs-dist`/`@napi-rs/canvas`), wrapped in its own try/catch that throws a clear "package is not installed" error instead of letting Vite's import-analysis pass fail the whole module. Evidence: `npx tsgo --noEmit` (project-wide) reports zero diagnostics for `tts.ts` (previously 3: unresolvable module, ArrayBufferLike/ArrayBuffer mismatch, unused-type warning — all fixed). Live-verified against the running dev server: `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5173/src/lib/services/tts.ts` now returns `200` (was the reported `500`), and the served module body contains no `Failed to resolve import` text. Options (a) and (c) from this task's original list were not taken — no new dependency declared, `SimpleWorkingChat.svelte`'s import of `ttsService` is unchanged.
