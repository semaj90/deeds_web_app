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

### 2026-09-18 — fresh snapshot readback recheck (read-only)

- Re-ran `scripts/atlas/reseal-current-workspace-snapshot-v1.mts` against the existing fresh
  manifest `sha256:e2fba635004f4b18396037fc1e1262adcfaf7f1d1e93c991e7a44be1a97523d9`.
- Result: `RESEAL_READBACK_BLOCKED`; 25,525 / 25,637 exact matches and 112
  `SOURCE_BYTES_CHANGED` violations. `writesPerformed: false`.
- Gate 2.1 remains open: no new admission was written. Do not treat the fresh manifest as
  current authority until the snapshot is stable and the operator supplies the exact
  `AUTHORIZE_WORKSPACE_REVISION_TOURNAMENT_ADMISSION_V1` confirmation.

### 2026-09-18 — stable snapshot reseal after checksum repair (read-only)

- Fixed the snapshot capture receipt checksum bug: `captureAttempts` and
  `transientDriftObserved` are now included using the same normalized body that
  `validateSnapshot()` verifies.
- Re-captured the moving worktree as snapshot
  `sha256:fb841747bf03aa6f83cc5c214080863a0fd6f04e62336e71fe909f8587045b3d` with 25,775
  sources and no capture violations.
- Reseal readback is now `RESEAL_READBACK_PROVEN`: 25,775 / 25,775 exact matches,
  zero violations, `writesPerformed: false`.
- This proves snapshot integrity only. It does not admit the workspace or authorize
  packet/chunk writes; Gate 2.1 remains open for the exact operator confirmation.

### 2026-09-18 — admission-chain receipts refreshed (read-only)

- Against the stable snapshot, source hygiene is `SOURCE_INVENTORY_HYGIENE_PASS`:
  25,775 candidate paths, 25,580 canonical sources, no known junk matches, and
  `writesPerformed: false`.
- Revision derivation is `WORKSPACE_REVISION_CANDIDATE_READY_FOR_ADMISSION`; the
  current candidate is recorded in `docs/reports/workspace-revision-from-sealed-multi-repo-snapshot-v1.json`.
- Tournament source authority is `CANDIDATE_READY_FOR_EXPLICIT_TOURNAMENT_ADMISSION`;
  `authority: false` and no admission or projection write occurred.
- The current admission receipt remains stale relative to this candidate. Gate 2.1
  still requires the exact operator confirmation before any new admission receipt is written.

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

## 7. New finding from the end-of-day sweep — do not silently regenerate or commit (2026-09-16)

While staging the day's broader accumulated work for an end-of-session commit, found 7 report
files that are far outside normal receipt size (40MB–332MB, one is a literal leftover
`.tmp-3904` write-in-progress file) and deliberately did **not** commit any of them:

```
docs/reports/feature-ontology-current-cohort-v1.json            332,702,851 bytes
docs/reports/feature-ontology-current-cohort-v1-codex.json      332,702,851 bytes  (duplicate)
docs/reports/feature-ontology-current-cohort-v1.json.tmp-3904   332,702,851 bytes  (debris)
docs/reports/feature-ontology-packet-lineage-v1.json            328,426,665 bytes
docs/reports/graphify-current-candidate-binding-v1.json          44,518,241 bytes
docs/reports/current-graphify-snapshot-binding-recheck-v1.json   43,696,635 bytes
docs/reports/graphify-workspace-snapshot-binding-v1-rerun-20260914.json 43,680,228 bytes
docs/reports/graphify-workspace-snapshot-binding-v1.json         44,883,450 bytes
```

- [ ] 7.1 Determine whether `feature-ontology-current-cohort-v1-codex.json` and
      `feature-ontology-current-cohort-v1.json.tmp-3904` are genuinely stale duplicates of
      `feature-ontology-current-cohort-v1.json` (byte-identical size strongly suggests yes) — if
      confirmed, archive per this repo's archive-not-delete convention rather than deleting.
- [ ] 7.2 Investigate why `feature-ontology-current-cohort-v1.json` / `-packet-lineage-v1.json`
      are ~330MB — almost certainly a producer bug (e.g. writing a full corpus dump instead of a
      bounded cohort, matching this same session's earlier discovery that "current cohort" work
      is supposed to be bounded to 52/128 rows, not full-corpus). Do not regenerate at this size
      again without root-causing first.
- [ ] 7.3 None of these files are required inputs to Gate 1 or Gate 2 in this change or the
      parent change — confirmed by grep, not assumed. Leaving them untracked/uncommitted is safe
      for now; this task group exists so they aren't silently forgotten, not because Gate 2 is
      blocked on them.

### 2026-09-16 — current snapshot reseal rerun

- Re-captured the moving worktree with the existing two-scan snapshot owner using workspace
  `625743d2-092b-4fa8-abe0-9dc094920c80`.
- Fresh snapshot: `sha256:2d330876e01b0e2d3c2d80ce6ca8e433534766261b6aaf9d70e0ba3ce933a9a4`,
  25,638 sources, zero capture violations.
- Immediate readback: 25,638/25,638 exact byte matches, zero violations,
  `RESEAL_READBACK_PROVEN`, `writesPerformed: false`.
- Gate 2.1 remains intentionally open: admission still requires the exact operator confirmation
  `AUTHORIZE_WORKSPACE_REVISION_TOURNAMENT_ADMISSION_V1`; no admission receipt or database row was
  changed in this rerun.

### 2026-09-16 — fresh-manifest hygiene and single-owner cross-check

- Re-ran hygiene with the explicit fresh manifest rather than selecting a manifest by filesystem
  mtime. Result: `SOURCE_INVENTORY_HYGIENE_PASS`, snapshot
  `sha256:d25810ade66736ca8bc7fa31c683d09972f10ef7d241b4ab8e64b2cdd7ef6122`,
  25,644 candidates, 25,449 canonical sources, zero known-junk matches, and
  `recurrencePrevented: true`.
- Re-ran `audit-workspace-revision-admission-single-owner-v1.mts`. Result remains
  `WORKSPACE_REVISION_ADMISSION_SINGLE_OWNER_BLOCKED`, now specifically on stale
  plan/derivation/preflight/consumer/canary receipts: `derivationReady: false`, snapshot and
  inventory checksums do not match the fresh manifest. This is a receipt-chain refresh blocker,
  not a snapshot-byte or exclusion-policy failure.
- Both audits remain read-only with `writesPerformed: false`; Gate 2 chunk lineage must not start
  until the admission-chain receipts are regenerated against this exact manifest and explicit
  admission authorization is supplied.
