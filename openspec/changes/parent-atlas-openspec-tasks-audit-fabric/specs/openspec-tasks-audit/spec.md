## ADDED Requirements

### Requirement: Audit script discovers every tasks.md in both openspec trees
The audit script SHALL discover every `tasks.md` file under `openspec/changes/**` (including
`openspec/changes/archive/**`) and `sveltekit-frontend/openspec/changes/**` (including
`sveltekit-frontend/openspec/changes/archive/**`). It SHALL NOT rely on a hardcoded file list —
discovery MUST be a live filesystem walk so the audit stays correct as changes are added, moved,
or archived.

#### Scenario: A newly-created change is picked up without script edits
- **WHEN** a new `openspec/changes/<name>/tasks.md` is created after the audit script was written
- **THEN** the next audit run includes it in the report without any change to the script itself

### Requirement: Per-change completion percentage
For each discovered `tasks.md`, the audit SHALL compute `done`/`total` checkbox counts (matching
`- [ ]` / `- [x]` / `- [X]` markdown checkbox syntax) and a `completionPct` in the 0-100 range. A
file with zero checkboxes (`total === 0`) SHALL be reported as `completionPct: null` (not `0` and
not `100`) with an explicit `noCheckboxes: true` flag, since 0/0 is a distinct case from "started,
0% done."

#### Scenario: A 0/0 proposal-only change is not misreported as 0% complete
- **WHEN** a `tasks.md` contains no checkbox lines at all
- **THEN** the report records `completionPct: null`, `noCheckboxes: true` for that change, not
  `completionPct: 0`

### Requirement: Per-change structural-completeness score
For each discovered change directory, the audit SHALL compute a `structuralScore` (0-100) from:
presence of a non-empty `proposal.md` (40 points), presence of a non-empty `specs/` directory
containing at least one `spec.md` (30 points), and the `tasks.md` itself being non-trivial — either
containing at least one checkbox or having a `## Purpose`/`## Why`/`# ` top-level heading with
substantive body text (30 points).

#### Scenario: A change missing proposal.md scores below full structural completeness
- **WHEN** a change directory contains only `tasks.md` and `specs/`, with no `proposal.md`
- **THEN** its `structuralScore` SHALL be at most 60 (missing the 40-point proposal.md component)

### Requirement: Staleness signal detection (informational, not authoritative)
The audit SHALL flag, per change, any self-declared supersession markers (case-insensitive
substring match on `SUPERSEDED`, `⛔`, `STALE`, or `PREMISE SUPERSEDED`) found in `tasks.md`, and
SHALL flag duplicate change-directory names that exist in both the root `openspec/changes/` tree
and the `sveltekit-frontend/openspec/changes/` tree. These flags are informational signals for a
human to investigate — the audit SHALL NOT auto-correct, auto-archive, or auto-delete anything.

#### Scenario: A change already carrying its own correction banner is flagged, not re-corrected
- **WHEN** a `tasks.md` contains the substring "PREMISE SUPERSEDED" (as already added to
  `parent-atlas-live-graph-proof/tasks.md` by a prior session)
- **THEN** the audit report flags it under `staleness_markers_found`, and does not modify the file

### Requirement: JSON report round-tripped through simdjson-bridge
The audit script SHALL serialize its full report to JSON, write it to
`docs/reports/openspec-tasks-md-audit-v1.json`, then re-parse that exact JSON string through
`fastJsonParse` from `sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts` (imported by
relative path, not through a SvelteKit `$lib` alias, since this script runs standalone via
Node/tsx from the repo root). The script SHALL record, honestly, whether the native simdjson addon
or the `JSON.parse` fallback path actually executed (via `isSimdJsonAvailable()`), and SHALL NOT
claim `simdjson` ran if the fallback was used.

#### Scenario: Native addon is unavailable in this environment
- **WHEN** `simd-bridge/cpp/build/Release/tensorrt_bridge.node` (or its documented alternate build
  paths) does not exist in the running environment
- **THEN** the report records `simdjsonAddonAvailable: false` and `parseMethod: "fallback"`, not a
  fabricated `"native"` claim

### Requirement: Timestamped human-readable report under next_steps/
Each audit run SHALL write one new timestamped Markdown file under `next_steps/active/`, named
`<YYYY-MM-DD>_openspec-tasks-md-audit.md` (or with an `_HHMMSS` suffix if a same-day report already
exists, matching this repo's existing `next_steps/active/` naming convention), summarizing: overall
aggregate stats, the list of changes scoring below a configurable gap threshold (default: audit
score < 80), and the staleness/duplicate flags found. This file SHALL NOT overwrite a prior run's
report — each run is its own dated artifact.

#### Scenario: Running the audit twice in one day produces two distinct reports
- **WHEN** the audit is run twice on the same calendar date
- **THEN** the second run's Markdown report uses an `_HHMMSS`-suffixed filename rather than
  overwriting the first run's file

### Requirement: Read-only — no mutation of audited files or canonical stores
The audit SHALL NOT modify any `tasks.md`, `proposal.md`, `design.md`, or `spec.md` file it reads.
It SHALL NOT write to Postgres, Redis/Valkey, Qdrant, or Neo4j. Its only writes are the JSON report
under `docs/reports/` and the Markdown report under `next_steps/active/`.

#### Scenario: Running the audit does not change any openspec change's content
- **WHEN** the audit script completes a full run
- **THEN** `git status` shows no modifications to any file under `openspec/changes/` or
  `sveltekit-frontend/openspec/changes/`
