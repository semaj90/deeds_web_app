# Workboard GEPA Validation Branch Review — 2026-10-03

## GitHub and integration state

- Reviewed `origin/chatgpt/workboard-gepa-validation-v1` at `48e7db5570193bdfb01ad9c83b58e67c410c9d6b`.
- The branch contains 11 commits beyond its merge base and is one commit behind `origin/main` (`93db7ba97f4f12596551c510acf12b0ea1be9301`).
- GitHub REST lookup found no pull request with this branch as its head, open or merged.
- A read-only `git merge-tree` preview against the current `HEAD` completed without conflicts. The active worktree is dirty, so no merge was applied.

## Findings

1. **Blocking: built validation plans can fail their own checksum verification.** In `packages/parent-atlas/src/core/workboard-validation-v1.ts`, `buildFeatureValidationPlanV1()` hashes requirements before Zod inserts default fields (`command`, `artifactRef`, `route`, `viewport`, `readOnly`). It then returns the parsed plan with those fields present. `verifyFeatureValidationPlanV1()` hashes the parsed form, so the checksum differs whenever an input omits a defaulted field. The included fixture omits defaults and calls this verifier, so the focused test is expected to fail.
2. **Receipt verification is incomplete at the TODO compiler boundary.** `compileMissingValidationTodosV1()` checks only `receipt.planChecksum`; it does not parse or verify the receipt checksum, task ID/revision, or receipt status. A modified receipt can therefore inject missing-validator TODO candidates.
3. **A required PASS can be marked PROVEN without evidence references.** `evidenceRefs` defaults to an empty array, and receipt construction does not require references for PASS observations. The result can claim proof without a linked test/readback artifact.
4. **The health GET response shape varies across authorization and database failure states.** The unauthorized path returns only `status` and `error`; the unavailable path omits `postgres`, while the healthy response includes it. This conflicts with the repository GET contract requiring stable top-level JSON keys and empty defaults.
5. **The browser test does not establish that the SvelteKit client bundle executed.** It checks built-in browser globals and that an `/_app/*.js` resource loaded; those facts do not prove the app bundle ran. The test also requires a dev-authenticated request because it skips global setup and the endpoint checks `locals.user`.

## OpenSpec status and disposition

The matching `parent-atlas-compute-rank-cache-eval-dspy-gepa` change still has GEPA runtime pinning, frozen evaluation splits, an actual shadow run, and promotion gates open. The branch adds an optional adapter and shadow contract but does not close those runtime/evaluation tasks. No OpenSpec task ledger was changed by the branch.

**Recommendation:** Do not merge this branch yet. Fix the checksum and receipt/evidence invariants, make the health response shape stable, strengthen the browser execution proof, and then run the branch's focused commands on the target workstation. The merge preview is clean, but the behavioral review is not.

## Validation performed

- Inspected all eight changed paths and their patch against the current `origin/main` ancestry.
- Confirmed the remote branch ref, ancestry counts, lack of a matching PR, and a conflict-free merge-tree preview.
- Did not run tests or modify/merge the branch.
