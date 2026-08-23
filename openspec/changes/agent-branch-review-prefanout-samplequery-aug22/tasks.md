## 1. `agent/pre-fanout-evidence-bundle-20260822` verification

- [x] 1.1 Confirmed 4 new files match the transcript's description (`observation-coordinate-v2.ts`, `ontology-observation-tuple-v1.ts`, `pre-fanout-evidence-bundle-v1.ts`, `pre-fanout-evidence-bundle-v1.spec.ts`).
- [x] 1.2 Ran the spec file for real: **4/4 tests passed.**
- [x] 1.3 **Flagged discrepancy**: transcript claimed "15 15 focused tests passed" for this work; the actual spec file has 4 `it()` blocks, confirmed by direct grep count. Not chased further to find where "15" might have come from (possibly a combined multi-file count from a different command) — recorded as an open question, not resolved.

## 2. `agent/sample-query-corpus-current-main-20260822` verification

- [x] 2.1 Confirmed this branch is the fresh rebase (merge-base with `main` == `main`'s exact tip at time of check), not the stale 33-commit-divergent `agent/sample-query-real-corpus-eval-20260822`.
- [x] 2.2 Ran both spec files for real: **11/11 tests passed** (`sample-query-matrix-v1.spec.ts` 5, `sample-query-corpus-evaluation-v1.spec.ts` 6).
- [x] 2.3 Ran `scripts/atlas/audit-sample-query-corpus-readiness.mts` for real: confirmed the exact 3 missing artifact producers claimed (`CandidateOrdinalMapV1 JSON`, `CandidateFeatureColumnarV1 JSON`, `exact CandidateOrdinalSetV1 JSON`), `noStoreAccess: true`, `canonicalWritesAttempted: false`.
- [ ] 2.4 The `scripts/atlas/evaluate-sample-query-corpus-v1.mts` full runner was NOT executed — it requires the 3 missing artifacts from 2.3, which don't exist yet. Confirmed present on disk but not run.

## 3. Environment finding (infra note, not code)

- [x] 3.1 Documented: shared `node_modules/.bin/` and `.svelte-kit/tsconfig.json` were found in a transiently-broken state mid-session (concurrent `npm install`/`svelte-kit sync` elsewhere). Worked around via direct entry-point invocation and fresh per-worktree `.svelte-kit` regeneration. No repo fix needed — this is a concurrency artifact of the current multi-agent session, not a code bug.

## 4. Not done this pass (explicitly out of scope)

- [ ] 4.1 Build the 3 missing artifact producers (`CandidateOrdinalMapV1` persist+checksum, `CandidateFeatureColumnarV1` corpus persist+checksum, exact `CandidateOrdinalSetV1` persist) — the concrete next coding tranche both agents converged on independently. Real new code, not started.
- [ ] 4.2 Review/verify the other 4 unmerged branches mentioned in the transcript (`pre-fanout-observation-lineage` ×2, `sample-query-matrix-ewintang`, `sample-query-python-cuda-split`, `agent-runtime-alignment-audit` 18 commits) — not reviewed this pass.
- [ ] 4.3 Merge decision for either verified branch — not made here, consistent with this session's standing caution around `main` given multiple concurrent agents actively pushing to it.
