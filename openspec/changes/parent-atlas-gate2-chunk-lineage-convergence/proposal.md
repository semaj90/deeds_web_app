## Why

`parent-atlas-retrieval-lineage-dag-convergence` closed Gate 1
(`CURRENT-WORKSPACE-FRAME-ADMISSION-01`) this session: a recovered, hardened
`resolveCurrentWorkspaceFrameV1()` selector proves a single authoritative admitted workspace
revision (`sha256:e24bb97...`), with zero conflict and zero blockers, and the bounded 52-row
cohort was independently re-verified against it. Verdict: `STALE_WORKSPACE_PROJECTION` — 52/52
rows have exact source-revision matches, but 0/52 match the current workspace binding.

That file's own tasks.md is 14,900+ lines and growing every session; continuing to bolt Gate
2+ work onto it makes the next real step (the chunk-native lineage join) hard to find, hard to
review, and hard to close as its own unit. This change carves out exactly the two remaining,
well-scoped steps into a fresh, reviewable artifact set: **(1)** re-seal a fresh workspace
snapshot so the admission itself is no longer built on a one-day-stale manifest (25,239/25,542
exact byte matches — 303 legitimate drifted/deleted files, mostly this session's own openspec
edits), and **(2)** the chunk-native lineage join that re-materializes the 52-row (then bounded
128-row) cohort's chunk ownership from that admitted binding, per Gate 1's own explicit
instruction: "if confirmed stale, re-materialize the derived cohort from the admitted workspace
binding instead" — never patch the existing rows in place.

## What Changes

- Re-seal a fresh `workspace-source-snapshot-capture-v1` manifest (read-only capture + seal,
  no admission yet) so a new tournament admission can be built on a snapshot that reflects the
  current tree, not one that is already 303 files stale.
- Re-run `workspace-revision-tournament-admission-v1` against the fresh snapshot, producing a
  new admitted workspace revision. **Human-authorized step** (the existing admission receipt's
  own `approval.confirmation: "AUTHORIZE_WORKSPACE_REVISION_TOURNAMENT_ADMISSION_V1"` field shows
  this has always required explicit authorization — this change does not relax that).
- Re-run the recovered single-owner cross-check
  (`audit-workspace-revision-admission-single-owner-v1.mts`) against the fresh admission to
  confirm the whole `plan → derivation → preflight → admission → consumer → canary` receipt
  chain is checksum-consistent (currently `BLOCKED` on `hygienePass`, itself downstream of the
  stale-snapshot readback failure this re-seal fixes).
- Build `CURRENT-SOURCE-CHUNK-OWNER-01`: a read-only-first chunk-native lineage join —
  `atlas_workspace_source_bindings` (source_ref + source_revision, keyed to the newly-admitted
  workspace revision) → `atlas_packet_chunk_lineage` WHERE `revision_status='PROVEN'` →
  `chunk_row_id` → `codebase_chunk_index.id` → assert `canonical_chunk_id` parity. Classifies
  (does not fix) the previously-found "4,275 canonical chunk owner missing" / "19,906 content
  present but owner lacks source revision" rows.
- Extend the bounded cohort from 52 rows toward the ~128-row deterministic cohort once the
  chunk-native join is clean on the smaller cohort — not attempted until the 52-row (or its
  re-materialized replacement) cohort passes with zero identity/revision errors.
- **Not in scope**: cleaning up the 1,063 existing junk `atlas_packets` rows from the separate
  `.tmp/workspace-source-snapshots/` incident (operator-gated, tracked in the parent change);
  `CandidateOrdinalMapV1` consumption, semantic/XGBoost/ACE/GPU promotion (all explicitly gated
  behind this change's own exit criteria, per the parent change's `do_not_do` list).

## Capabilities

### New Capabilities
- `workspace-snapshot-reseal`: read-only-capture-then-human-authorized-admission workflow for
  producing a fresh, non-stale admitted workspace revision, replacing an ad hoc one-off script
  invocation with a documented, repeatable, gated procedure.
- `chunk-native-lineage-join`: the `atlas_workspace_source_bindings` → `atlas_packet_chunk_lineage`
  → `codebase_chunk_index` → `canonical_chunk_id` join contract and its read-only classification
  audit, extending the bounded cohort from 52 toward ~128 rows.

### Modified Capabilities
(none — no existing `openspec/specs/*` capability's requirements change; this is new read-only
tooling plus one human-authorized admission step already specified by the existing admission
receipt contract)

## Impact

- **Code**: new scripts under `scripts/atlas/` (snapshot re-seal driver, chunk-native lineage
  join auditor); no changes to `sveltekit-frontend/src` runtime code.
- **Data**: Postgres reads only for the chunk-native join audit. The re-seal step captures a new
  snapshot manifest (new file under `docs/reports/workspace-source-snapshots/`) and, only with
  explicit human authorization, writes a new `workspace-revision-tournament-admission-v1.json`
  receipt — no `atlas_packets`, `atlas_workspace_source_bindings`, `atlas_packet_chunk_lineage`,
  or `codebase_chunk_index` row is written by this change.
- **Dependencies**: builds directly on `parent-atlas-retrieval-lineage-dag-convergence`'s Gate 1
  closure (the recovered `current-workspace-frame-selector-v1.mjs` and its authority-semantics
  helper, both already on `main`) and the same session's `PACKET_WRITER_SHARED_EXCLUSION_POLICY_01`
  fix (unrelated data-hygiene concern, already closed, not reopened here).
- **Downstream**: unblocks `CandidateOrdinalMapV1` consumption and everything currently gated
  behind a clean bounded cohort in the parent change (semantic_768 admission, structural
  features, `CandidateFeatureMatrix`, classifier/XGBoost, ACE/BitFrost, GPU execution,
  ContextManifest/DAG) — none of that is built in this change, only unblocked by it.
