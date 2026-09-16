## Context

Gate 1 (`CURRENT-WORKSPACE-FRAME-ADMISSION-01`, closed this session in
`parent-atlas-retrieval-lineage-dag-convergence`) proved that the bounded 52-row source cohort is
a **stale workspace projection**: 52/52 exact `source_ref`+`source_revision` matches, 0/52 matches
against the current, cleanly-selected, conflict-free admitted workspace revision
(`sha256:e24bb97187...`). The selector that produced this proof
(`scripts/atlas/lib/current-workspace-frame-selector-v1.mjs`, plus its
`computeWorkspaceFrameAuthorityV1()` authority-semantics wrapper) is real, tested (7/7), and
already on `main` — recovered from a never-merged branch (`agent/current-revision-selector-
convergence-20260913`) rather than rebuilt from scratch.

Two real, separate follow-on findings surfaced while closing Gate 1, both still open:

1. The admission receipt itself rests on a snapshot manifest sealed 2026-09-15, already 303
   files stale relative to the live tree (25,239/25,542 exact byte matches on readback) — mostly
   this session's own `openspec/*/tasks.md` edits, plus 8 files from one archived change. This
   is why the recovered single-owner cross-check
   (`audit-workspace-revision-admission-single-owner-v1.mts`) reports `BLOCKED` on
   `hygienePass` even though the admission itself is internally consistent.
2. The chunk-native lineage join (`atlas_workspace_source_bindings` → `atlas_packet_chunk_lineage`
   → `codebase_chunk_index.id` → `canonical_chunk_id`) has never been run against a confirmed
   admitted binding — it is the next unopened gate, not yet even attempted.

This design covers closing both, in that order, since (1) blocks a clean re-run of (2).

## Goals / Non-Goals

**Goals:**
- Produce one fresh, non-stale, human-authorized admitted workspace revision.
- Prove the chunk-native lineage join on the existing bounded cohort (52 rows, or whatever the
  fresh admission's re-materialized cohort turns out to be) with an explicit read-only
  classification of every row — canonical-chunk-owner match, missing owner, missing source
  revision, mismatch, or ambiguous.
- Extend to the ~128-row deterministic cohort only after the smaller cohort is clean.

**Non-Goals:**
- Cleaning up the 1,063 existing junk `atlas_packets` rows from the unrelated `.tmp/workspace-
  source-snapshots/` incident (separate, operator-gated, already tracked elsewhere).
- Any write to `atlas_packets`, `atlas_workspace_source_bindings`, `atlas_packet_chunk_lineage`,
  or `codebase_chunk_index`. The only write in this entire change is one new admission receipt,
  and only with explicit human authorization.
- `CandidateOrdinalMapV1` consumption, semantic/XGBoost/ACE/GPU work — all remain gated behind a
  clean cohort, per the parent change's `do_not_do` list, unchanged here.
- Rebuilding or replacing the recovered selector/authority-semantics helper — reused as-is.

## Decisions

**Re-seal before re-admitting, never patch the existing admission in place.** The current
admission (`sha256:e24bb97...`) is not wrong — it is internally consistent and passed Gate 1's
own conflict/authority checks. The problem is that the *snapshot underneath it* has aged. Sealing
a fresh snapshot and running a fresh, explicitly-authorized tournament admission is the correct
fix, matching this repo's own established pattern (draft → dry-run → human-authorized apply) —
not editing `workspace-revision-tournament-admission-v1.json`'s fields directly, which would
fabricate an authority claim without the underlying proof.

**Human authorization stays a hard requirement, not softened for convenience.** The existing
admission receipt already carries `approval.confirmation:
"AUTHORIZE_WORKSPACE_REVISION_TOURNAMENT_ADMISSION_V1"`. This design keeps that exact gate for
the re-seal's admission step — the re-seal and readback validation are read-only and can run
without a human in the loop, but the admission itself cannot.

**Chunk-native join is read-only-first, classification before any fix.** Mirrors Gate 1's own
discipline exactly: run the join, classify every row into an explicit status
(`CANONICAL_CHUNK_ID_MATCH`, `MISSING_CANONICAL_OWNER`, `MISSING_SOURCE_REVISION`,
`SOURCE_REVISION_MISMATCH`, `WORKSPACE_REVISION_MISMATCH`, `CANONICAL_CHUNK_ID_MISMATCH`), write a
receipt, and stop. Per the parent change's explicit instruction: "do not compare whole-source
digest to chunk content hash; do not copy a source revision onto a chunk merely because the file
path matches" — the join key is exact `(source_ref, source_revision, workspace_revision)`, never
a path-only or digest-only fallback.

**Reuse `resolveCurrentWorkspaceFrameV1()` for the chunk-native join's workspace-revision input,
not a second lookup.** The join script imports the same selector Gate 1 already proved correct,
rather than re-deriving "current workspace revision" a third way. This is the same
Duplication-Prevention discipline already applied when Gate 1 rewired
`audit-current-source-cohort-lineage-v1.mjs` — one selector, every consumer.

**128-row cohort extension is sequenced strictly after the 52-row (or re-materialized) cohort is
clean**, not run in parallel "to save time." A dirty extension would mix a proven-clean subset
with an unproven larger one, defeating the point of a bounded canary.

## Risks / Trade-offs

- **[Risk] Re-sealing produces a different admitted workspace revision than expected, or the
  tournament again finds ambiguous/conflicting candidates** (as `current-graphify-snapshot-
  authority-v1.json` already does today — `AMBIGUOUS_QUALIFYING_EXECUTIONS`, `ownerSelection:
  null`) → **Mitigation**: the re-seal driver stops and reports rather than picking a default;
  resolving execution ambiguity is out of scope for this change and gets its own follow-up if it
  recurs.
- **[Risk] The chunk-native join reveals the cohort is still 0% owned even against a fresh
  admission** (i.e., staleness wasn't the only problem) → **Mitigation**: this is a valid, useful
  result, not a failure of the gate — it would mean the chunk-lineage writer itself needs
  attention, a different (larger) follow-up. The classification receipt makes this
  distinguishable from a re-seal that simply didn't help.
- **[Risk] Concurrent work in the same repo** (confirmed active this session — another process
  independently repointed `upsert-whole-codebase-atlas-packets.mjs` mid-session) **touches the
  same admission/snapshot files** → **Mitigation**: re-fetch and re-check `git status` /
  `git diff --stat` immediately before each commit in this change's task sequence, same
  discipline already used to safely incorporate that concurrent edit.
- **[Trade-off] Re-sealing takes real wall-clock time** (the existing seal covered 25,542
  sources) and produces a large new manifest artifact under `docs/reports/workspace-source-
  snapshots/` → accepted; the alternative (admitting against a known-stale snapshot) is worse.

## Migration Plan

Not applicable — no schema or data migration. Sequenced task rollout only (see `tasks.md`):
snapshot re-seal (read-only capture) → human-authorized re-admission → single-owner recheck →
chunk-native join (read-only classification) → cohort extension decision. Rollback at any step is
"do nothing further" — no step before the admission step writes anything, and the admission step
itself only ever produces a new, additively-named receipt file (never overwrites the prior
admission in a way that loses it — `git` history retains the prior receipt regardless).

## Open Questions

- Should `current-graphify-snapshot-authority-v1.json`'s `AMBIGUOUS_QUALIFYING_EXECUTIONS` /
  `ownerSelection: null` state be resolved before or independently of this change? Currently
  independent — the selector already tolerates it (falls back to the admission receipt alone
  when the snapshot-authority receipt isn't itself authoritative-and-conflicting).
- Is 128 rows still the right target cohort size, or should it be revisited once the
  chunk-native join's real match rate on 52 rows is known? Deferred to that point.
