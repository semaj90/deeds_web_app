# Tasks: parent-atlas-openspec-tasks-audit-fabric

## Context

Follows a 2026-09-16 manual survey of all 109 `tasks.md` files across `openspec/changes/` (root)
and `sveltekit-frontend/openspec/changes/`. That survey found real structural gaps (2 changes with
no `proposal.md`, at least one change silently built on a since-reversed premise) that a one-off
`bash`/`awk` pass could only surface by accident, not systematically. This change makes that audit
a real, re-runnable script instead of a manual pass.

## 1. Build the audit script

- [x] **1.1** Create `scripts/atlas/audit-openspec-tasks-md-v1.mts`. Discover all `tasks.md` under
      `openspec/changes/**` and `sveltekit-frontend/openspec/changes/**` (including each tree's
      `archive/` subdirectory) via a live filesystem walk, not a hardcoded list.
- [x] **1.2** Per change: compute `done`/`total` checkbox counts and `completionPct` (0-100, or
      `null` + `noCheckboxes: true` when `total === 0`).
- [x] **1.3** Per change: compute `structuralScore` (0-100) from `proposal.md` presence (40),
      non-empty `specs/` presence (30), non-trivial `tasks.md` presence (30).
- [x] **1.4** Per change: detect staleness markers (`SUPERSEDED`, `⛔`, `STALE`, `PREMISE
      SUPERSEDED` — case-insensitive substring match) and duplicate change-directory names present
      in both trees.
- [x] **1.5** Blend `completionPct` (or 100 if archived + no checkboxes, since archived-with-0/0 is
      not a gap) and `structuralScore` into one `auditScore` (0-100) per change:
      `auditScore = round(structuralScore * 0.4 + (completionPct ?? 50) * 0.6)` — a `null`
      completion (proposal-only, 0/0) is treated as a neutral midpoint (50) so it doesn't
      auto-fail purely for being early-stage, while `structuralScore` still penalizes a missing
      `proposal.md` on a 0/0 change.

## 2. Wire simdjson round-trip

- [x] **2.1** Import `fastJsonParse`/`isSimdJsonAvailable` from
      `sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts` by relative path (verified this
      file has zero `$lib` imports, so it resolves fine from a standalone `tsx` invocation at the
      repo root — no SvelteKit context needed).
- [x] **2.2** After writing the JSON report to disk, re-read and re-parse the exact JSON string
      through `fastJsonParse`. Record `simdjsonAddonAvailable` (from `isSimdJsonAvailable()`) and
      `parseMethod` (`"native"` or `"fallback"`) honestly in the report — do not claim native
      simdjson ran if the compiled addon isn't present in this environment.

## 3. Reports

- [x] **3.1** Write the full machine-readable report to
      `docs/reports/openspec-tasks-md-audit-v1.json` (overwritten each run, matching this repo's
      existing `docs/reports/*-v1.json` convention).
- [x] **3.2** Write one timestamped, human-readable Markdown summary to
      `next_steps/active/<YYYY-MM-DD>_openspec-tasks-md-audit.md` per run (append `_HHMMSS` if a
      same-day file already exists — never overwrite a prior day's or prior run's report).
      Summary includes: aggregate stats, every change scoring `auditScore < 80` (the "gaps for
      further tasks.md organization" the run was asked to find), and the staleness/duplicate flags.

## 4. Run it for real and record the result

- [x] **4.1** Run the script once against the live repo state (not a dry-run stub) and confirm it
      completes without modifying any audited file (`git status` clean on both openspec trees
      after the run).
- [x] **4.2** Confirm the JSON report and the timestamped Markdown report both exist on disk with
      real content matching the 2026-09-16 manual survey's aggregate numbers (109 files, ~64%
      aggregate completion) as a sanity cross-check — if the script's aggregate diverges
      significantly from the manual count, treat that as a bug in the script, not a corpus change,
      and fix it before trusting the report.

## Second real bug found while acting on the audit's own output (2026-09-16)

While closing structural gaps the audit flagged, `parent-atlas-grounded-knowledge-fabric` was
reported as missing `specs/` (`hasSpecs: false`) despite genuinely having a spec — just as a
top-level `spec.md` directly in the change directory, not nested under `specs/<capability>/spec.md`
like every other checked change. Checked before "fixing" it by moving the file: this is a real,
existing, non-broken convention in this repo, not a missing spec. Fixed the audit script's spec
detector (`hasSpecEvidence()`) to also accept a top-level `spec.md`, rather than forcing a file
move to satisfy the script's narrower original assumption. This is the same discipline as the
staleness-marker fix above — when the audit's own heuristic produces a wrong-looking result, check
whether the heuristic or the audited file is actually wrong before acting.

## Third limitation, found while acting on a low-scoring change (2026-09-16)

`parent-atlas-graphify-recovery-proof-ladder` scored 0/9 (checkboxes), reading as "not started."
Checked the file directly before treating that as ground truth for implementation: it's an
18-phase document tracking real, substantial work (Phases 1-6 are `PASS`/`PARTIAL_PROVEN`/`DONE,
VERIFIED LIVE`, each with live evidence — a real concurrency test with two OS processes racing a
lock file, a real `--apply --limit=5` database write with spot-checked output, a real stall root
cause diagnosed and fixed in a 313KB vendored bundle) — but tracked via **prose status headers**
(`## Phase N — STATUS`), not markdown checkboxes. The only literal `- [ ]` checkboxes in the whole
file are a 9-item to-do list for one specific sub-lane (Neo4j→Qdrant fan-out), which genuinely is
unstarted and is explicitly gated behind other work per the document's own ordering — so the "0/9"
number is *accurate for what it counts*, but gives a false impression of the file's overall state.

This is a real, unresolved limitation of the checkbox-counting completion model this script uses —
not a bug with a clean fix. Detecting and scoring prose status vocabularies
(`PASS`/`PROVEN`/`PARTIAL_PROVEN`/`NOT_PROVEN`/`BLOCKED`/`NOT STARTED`, which this repo uses
extensively and inconsistently across different changes) would require parsing free-text status
words per phase heading, which risks false confidence of a different kind (misreading a status
word out of context) rather than fixing the honesty problem outright. Recorded here rather than
attempted, per the Duplication Prevention / Agent Execution Integrity principle of flagging what's
out of scope instead of guessing at a fix. **Do not treat a low `completionPct` alone as evidence a
change is unstarted** — always skim the actual file, especially for large multi-phase documents,
before picking one to "finish."

## Known limitation, found while running this for real

The staleness-marker heuristic is a plain substring match, so it will flag this very change's own
`tasks.md`/`proposal.md` when they quote the marker literals (`⛔`, `SUPERSEDED`) as examples —
confirmed live in the 2026-09-16 run (`parent-atlas-openspec-tasks-audit-fabric` appears in its own
`stalenessFlagged` list for exactly this reason). This is a real, known false-positive mode, not a
bug to silently work around — a human still needs to read the flagged line, not just trust the
count. An earlier version of this heuristic was case-insensitive on the bare word `stale`, which
matched 71/108 changes purely on ordinary prose (e.g. "replace the stale claim with...") — tightened
to case-sensitive, all-caps marker matching (`⛔`, `SUPERSEDED`, `PREMISE SUPERSEDED`,
`STATUS: STALE`) after finding that live, which reduced true flags to 25/108, all of them real
supersession banners on inspection.

## Explicitly out of scope

- Auto-fixing any flagged gap (missing `proposal.md`, staleness marker, low `structuralScore`) —
  this change is audit-only, per its own Requirement "Read-only — no mutation."
- Any Postgres/Redis/Qdrant/Neo4j write — this is a pure filesystem + report-file tool.
- A CI gate or scheduled re-run — this is a manually-invoked script for now
  (`npx tsx scripts/atlas/audit-openspec-tasks-md-v1.mts`); wiring it into `graphify:daily` or a
  cron job is a future, separate decision.
