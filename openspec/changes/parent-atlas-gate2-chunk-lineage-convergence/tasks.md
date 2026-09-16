## 1. Workspace snapshot re-seal (read-only capture + validation)

- [x] 1.1 **Duplication check first**: `scripts/atlas/capture-workspace-source-snapshot-v1.mts`
      already exists and does exactly this (two-scan `observeSnapshot()`/`sealSnapshot()` pair,
      writes to `docs/reports/workspace-source-snapshots/<snapshotRevision>.json`) — reused
      rather than rewritten. Ran it: `npx tsx scripts/atlas/capture-workspace-source-snapshot-v1.mts
      --workspace-id 625743d2-092b-4fa8-abe0-9dc094920c80`. Result: fresh snapshot
      `sha256:e2fba635004f4b18396037fc1e1262adcfaf7f1d1e93c991e7a44be1a97523d9`, 25,637 sources
      (up from 25,542), 0 capture violations, `status: "CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK"`.
      No admission, no database access.
- [x] 1.2 Wrote `scripts/atlas/reseal-current-workspace-snapshot-v1.mts` (new — the readback+
      receipt step genuinely didn't exist yet) to run `validateSnapshot()` against the fresh
      manifest. Result: `status: "SNAPSHOT_BYTES_READBACK_PROVEN"`, `exactMatches: 25637` /
      `sourceCount: 25637` (100%), `violationCounts: {}`, `totalViolations: 0` — clean, unlike
      the prior snapshot's 303 mismatches.
- [x] 1.3 Receipt written to `docs/reports/workspace-snapshot-reseal-v1.json`
      (`status: "RESEAL_READBACK_PROVEN"`, `writesPerformed: false`).

## 2. Human-authorized re-admission

> **RESUME HERE (paused 2026-09-16, end of session — operator taking a break).**
> Task group 1 is fully done. Asked the operator for explicit admission authorization at the
> start of task 2.1 (per the hard gate this task group requires) and did not receive it before
> the session ended — **not a refusal, just not yet answered.** Do not treat silence as consent.
> Next session: re-present the fresh snapshot's receipt
> (`docs/reports/workspace-snapshot-reseal-v1.json`, `RESEAL_READBACK_PROVEN`,
> `sha256:e2fba635004f4b18396037fc1e1262adcfaf7f1d1e93c991e7a44be1a97523d9`, 25,637/25,637 exact)
> and ask again before writing anything to `workspace-revision-tournament-admission-v1.json`.
>
> **Note on the fresh snapshot manifest file itself**: `docs/reports/workspace-source-snapshots/
> e2fba635...json` (~15MB) was written to disk by task 1.1 but is **NOT committed to git** —
> every prior snapshot manifest in that directory is likewise untracked, consistent with this
> repo's documented pre-commit hook rejecting files >10MB. This is expected, not a mistake; the
> file is still on disk and still usable for task 2.x next session. Do not try to force-add it.

- [ ] 2.1 Present the fresh snapshot's readback-proven receipt to the operator and request
      explicit authorization (matching the existing `approval.confirmation:
      "AUTHORIZE_WORKSPACE_REVISION_TOURNAMENT_ADMISSION_V1"` contract) before writing a new
      `workspace-revision-tournament-admission-v1.json`.
- [ ] 2.2 On authorization, write the new admission receipt with `authority: true`, referencing
      the fresh `snapshotRevision`. On refusal or no response, stop — leave the prior admission
      receipt as the live one, unchanged.
- [ ] 2.3 Re-run `resolveCurrentWorkspaceFrameV1()` + `computeWorkspaceFrameAuthorityV1()`
      against the new admission and confirm `frameAuthoritative: true`, `authorityConflict:
      false`, zero blockers — the same bar Gate 1 already proved for the prior admission.

## 3. Single-owner cross-check on the fresh chain

- [ ] 3.1 Re-run `audit-canonical-source-inventory-hygiene-v1.mts` against the fresh snapshot and
      confirm `status: "SOURCE_INVENTORY_HYGIENE_PASS"` (readback drift should now be zero since
      the snapshot is fresh; `recurrencePrevented` should already be `true` from the prior
      exclusion-policy fix).
- [ ] 3.2 Re-run `audit-workspace-revision-admission-single-owner-v1.mts` against the fresh
      admission chain (plan/derivation/preflight/admission/consumer/canary) and record its real
      result — `PROVEN` or `BLOCKED` — do not assume `PROVEN` because the snapshot is fresh.
- [ ] 3.3 If still `BLOCKED`, record which specific checks fail and stop here — do not proceed
      to the chunk-native join against an unresolved single-owner chain without recording why.

## 4. Chunk-native lineage join (read-only classification)

- [ ] 4.1 Write `scripts/atlas/audit-current-source-chunk-owner-v1.mjs`: imports
      `resolveCurrentWorkspaceFrameV1()` + `computeWorkspaceFrameAuthorityV1()`; refuses to query
      Postgres if the frame is not `frameAuthoritative`. Implements the join described in
      `specs/chunk-native-lineage-join/spec.md`:
      `atlas_workspace_source_bindings` → `source_ref`+`source_revision` →
      `atlas_packet_chunk_lineage` WHERE `revision_status='PROVEN'` → `chunk_row_id` →
      `codebase_chunk_index.id` → `canonical_chunk_id` parity check.
- [ ] 4.2 Run it against the existing 52-row cohort (re-materialized from the fresh admission,
      per Gate 1's own instruction — not the stale in-place rows). Produces
      `docs/reports/current-source-chunk-owner-v1.json` with a `CurrentSourceChunkOwnerReceiptV1`-
      shaped per-row classification (`CANONICAL_CHUNK_ID_MATCH` / `MISSING_CANONICAL_OWNER` /
      `MISSING_SOURCE_REVISION` / `SOURCE_REVISION_MISMATCH` / `WORKSPACE_REVISION_MISMATCH` /
      `CANONICAL_CHUNK_ID_MISMATCH`), `writesPerformed: false`.
- [ ] 4.3 Record the result honestly in this change and in the parent change's tasks.md —
      whether the re-seal actually fixed the 0/52 workspace-match problem, or whether chunk
      ownership itself needs separate attention. Either result is a valid, useful outcome; do
      not treat a still-broken result as this change having failed.

## 5. Cohort extension decision (gated, do not skip ahead)

- [ ] 5.1 Only if 4.2's receipt shows zero `MISSING_CANONICAL_OWNER` /
      `SOURCE_REVISION_MISMATCH` / `WORKSPACE_REVISION_MISMATCH` / `CANONICAL_CHUNK_ID_MISMATCH`
      rows: extend the same join to the ~128-row deterministic cohort and re-run.
- [ ] 5.2 If any non-clean row exists at 52, stop — write up the specific blocking
      classification(s) and treat resolving them as the next distinct piece of work, not
      something to route around by jumping to the larger cohort.

## 6. Close-out

- [ ] 6.1 `openspec validate parent-atlas-gate2-chunk-lineage-convergence --type change --strict`
      passes.
- [ ] 6.2 Update `parent-atlas-retrieval-lineage-dag-convergence/tasks.md`'s Gate 1 section with
      a pointer to this change and its real outcome (re-seal result + chunk-native join result)
      rather than duplicating the detail there.
- [ ] 6.3 Decide, with the operator, whether to archive this change (`openspec archive`) once
      Gate 2 either closes clean or is explicitly handed off to a follow-up for the specific
      blocking classification found.
