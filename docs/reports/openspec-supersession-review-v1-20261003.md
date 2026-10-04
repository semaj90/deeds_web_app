# OpenSpec supersession review

- Existing owner retained: `scripts/atlas/build-openspec-workboard-v1.mjs`; no parallel supersession service added.
- Change: supersession-like task text now sets `supersessionReviewState=REVIEW_REQUIRED`; it is excluded from actionable ranking, remains a default-retrieval review candidate, and no longer becomes `SUPERSEDED_OR_HISTORICAL` solely from keywords.
- Fresh read-only builder snapshot: 10,455 task rows; 0 supersession text candidates; 0 `SUPERSEDED_OR_HISTORICAL` rows; no writes. The previous persisted workboard's 53 count is stale and was produced by the former text heuristic.
- Downstream TaskCard and triage projections recognize `SUPERSESSION_REPLACEMENT_EVIDENCE_REQUIRED`; candidate links remain unconfirmed, with no successor identity/revision, no receipt, and `retrievalSuppressed=false`.
- Proof level: `WIRED` for fail-closed heuristic handling; `NOT_PROVEN` for confirmed supersession because a reviewed source/successor revision-bound replacement receipt schema and loader do not yet exist.
- No workboard regeneration, task checkbox mutation, archival, or canonical write was performed.
- Focused tests: 52 Node tests passed across WFU metadata, OpenSpec program plan, TaskCard, report manifest, and triage suites. One isolated Vitest projection regression passed (18 related suite tests skipped by name filter).
- Full existing Workboard contract suite remains red: 3/19 pass, 16/19 fail against the shared `docs/reports/openspec-workboard-v1.json` because its implementation-program/work-package/wave data does not reconcile with the current strict contract. This suite failed before the projection change on an earlier strict-shape mismatch; after aligning builder-emitted shape, deeper parity failures remain. Shared Workboard regeneration is intentionally deferred, so these failures are not claimed as fixed or attributable to the review flag.
- OpenSpec CLI validation could not run because `openspec` is not installed/on PATH in this environment.

## Skill execution fields

- `likely_cause`: The Workboard previously promoted text-only supersession language directly to a historical execution state without replacement identity or revision-bound receipt evidence.
- `evidence`: `scripts/atlas/build-openspec-workboard-v1.mjs`; `scripts/atlas/lib/wfu-metadata.mjs`; `scripts/atlas/lib/openspec-task-card-v1.mjs`; `scripts/atlas/lib/openspec-report-manifest-v1.mjs`; `docs/reports/openspec-workboard-v1.json` (stale baseline).
- `patch_targets`: `scripts/atlas/build-openspec-workboard-v1.mjs`; `scripts/atlas/lib/wfu-metadata.mjs`; `scripts/atlas/lib/wfu-metadata.test.mjs`; `scripts/atlas/lib/openspec-program-plan-v1.mjs`; `scripts/atlas/lib/openspec-task-card-v1.mjs`; `scripts/atlas/lib/openspec-report-manifest-v1.mjs`; `sveltekit-frontend/src/lib/server/atlas/openspec-board/workboard-contract-v1.ts`; `sveltekit-frontend/src/lib/server/atlas/openspec-board/workboard-contract-v1.spec.ts`; `sveltekit-frontend/openspec/changes/parent-atlas-gpu-compute-lanes-consolidation/tasks.md`.
- `safe_next_command`: `node scripts/atlas/build-openspec-workboard-v1.mjs --task-snapshot-stdout`.
- `smoke_command`: `npx vitest run sveltekit-frontend/src/lib/server/atlas/openspec-board/workboard-contract-v1.spec.ts -t "projection keeps text-only supersession candidates visible for review but non-actionable"`.
- `report_path`: `docs/reports/openspec-supersession-review-v1-20261003.md`.
