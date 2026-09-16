## 1. Workspace snapshot re-seal (read-only capture + validation)

- [ ] 1.1 Write `scripts/atlas/reseal-current-workspace-snapshot-v1.mts`: calls the existing
      `observeSnapshot()`/`sealSnapshot()` pair (`scripts/atlas/lib/workspace-snapshot-capture-v1.mts`)
      twice (matching the existing two-scan-then-diff pattern already used by `sealSnapshot()`
      itself) and writes the sealed manifest to `docs/reports/workspace-source-snapshots/<snapshotRevision>.json`.
      No admission, no database access.
- [ ] 1.2 Immediately run `validateSnapshot()` against the freshly-sealed manifest and confirm
      `status: "SNAPSHOT_BYTES_READBACK_PROVEN"` with zero `violationCounts` entries. If not
      clean, stop — do not proceed to admission with a snapshot that fails its own readback.
- [ ] 1.3 Record the new snapshot's `snapshotRevision`, `sourceCount`, and readback result in
      `docs/reports/workspace-snapshot-reseal-v1.json` (new receipt, `writesPerformed: false`).

## 2. Human-authorized re-admission

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
