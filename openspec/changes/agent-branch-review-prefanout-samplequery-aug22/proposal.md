## Why

Operator pasted a large status transcript from a separate agent session (working via a GitHub-connector-based tool that can read/write files but **cannot execute the workstation's Vitest** — the other agent's own words: "I have not claimed those tests pass because the GitHub connector cannot execute your workstation Vitest environment"). Two branches were the focus: `agent/pre-fanout-evidence-bundle-20260822` (new evidence-join contracts for FANOUT admission) and `agent/sample-query-corpus-current-main-20260822` (Ewin Tang low-rank sampling evaluator, freshly rebased onto current `main`). Operator asked what to do; chose "run the unrun test suites for real" over reviewing/merging/building new code.

## What this session did

Ran every test and script the other agent's transcript described as written-but-unexecuted, in isolated detached worktrees (never touching the shared working directory). All commands run with real output, not assumed from the transcript's prose.

**`agent/pre-fanout-evidence-bundle-20260822`** (4 new files: `observation-coordinate-v2.ts`, `ontology-observation-tuple-v1.ts`, `pre-fanout-evidence-bundle-v1.ts`, `pre-fanout-evidence-bundle-v1.spec.ts`):
- `vitest run --config vitest.lane-contracts.config.ts pre-fanout-evidence-bundle-v1.spec.ts` → **4/4 tests passed, real.**
- **Discrepancy found and flagged**: the other agent's transcript claimed "Validation 15 15 focused tests passed" for this work. Directly counted `it(`/`test(` occurrences in the actual spec file: **4**, not 15. Either the "15" referred to a different/larger combined run (the transcript's own suggested next-command bundles 4 different spec files from 3 different branches together), or it's a real overclaim. Recorded per this repo's Agent Execution Integrity discipline — the underlying code is fine (4/4 real passes), but the "15" claim as stated for this specific file does not hold up.

**`agent/sample-query-corpus-current-main-20260822`** (fresh rebase onto current `main`'s tip, confirmed via `git merge-base`):
- `vitest run --config vitest.lane-contracts.config.ts sample-query-matrix-v1.spec.ts sample-query-corpus-evaluation-v1.spec.ts` → **11/11 tests passed, real** (5 + 6).
- `npx tsx scripts/atlas/audit-sample-query-corpus-readiness.mts` → ran successfully, confirmed real: exactly the 3 missing artifact producers the transcript claimed (`CandidateOrdinalMapV1 JSON`, `CandidateFeatureColumnarV1 JSON`, `exact CandidateOrdinalSetV1 JSON`), `noStoreAccess: true`, `canonicalWritesAttempted: false` — matches the "read-only, no promotion" framing exactly.

**Environment note, worth recording**: mid-session, the shared `sveltekit-frontend/node_modules/.bin/` directory was found nearly empty (1 entry instead of hundreds) and `.svelte-kit/tsconfig.json` was missing — both symptoms of a concurrent `npm install`/`svelte-kit sync` actively running elsewhere in this heavily-shared working environment (dozens of concurrent agent processes this session). Worked around by invoking `vitest`/`svelte-kit` via their real entry-point paths directly (`node node_modules/vitest/vitest.mjs`, `node node_modules/@sveltejs/kit/svelte-kit.js sync`) rather than relying on `npx`/`.bin` resolution, and regenerating `.svelte-kit` fresh inside each isolated worktree rather than reusing the shared (actively-mutating) one via junction.

## Non-Goals

- Does not merge either branch into `main`.
- Does not build the 3 missing artifact producers the sample-query branch needs for a real corpus run — that's the next concrete coding tranche both agents converged on, not done here.
- Does not review `agent/pre-fanout-observation-lineage-20260822`, `agent/pre-fanout-observation-lineage-v2-20260822`, `agent/sample-query-matrix-ewintang-20260822`, `agent/sample-query-python-cuda-split-20260822`, or the 18-commit `agent-runtime-alignment-audit` branch mentioned in the pasted transcript — out of scope for this pass, which was specifically "run the two flagged unrun test suites."

## Impact

- **Code affected**: none — this is a verification-only pass. Both branches remain unmodified, unmerged.
- **Confidence**: both branches' core functional claims (tests pass, readiness audit behaves as described) are independently verified real, with one flagged discrepancy in a claimed test count.
