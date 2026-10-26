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

## 2026-10-03 follow-up: report audit and promotion gate

- [x] **5.1** Inventory the uncommitted `docs/reports/openspec-evidence/` tree and related generated reports by provenance, size, repeatability, sensitivity, and whether each artifact is a durable summary or raw run output. Do not infer promotion from filename or recency alone. Evidence: `docs/reports/openspec-evidence-disposition-v1.json` covers 1,255 files / 14,335,596,326 bytes; it records SHA-256, size, source revision/run metadata, classification, repeatability, and sensitivity state. Complete source-content and sensitivity review remains explicitly unperformed.
- [x] **5.2** Produce a read-only disposition manifest listing each report as `PROMOTE`, `ARCHIVE`, `RETAIN_LOCAL`, or `REGENERATE`; include source run, checksum, byte size, reason, and proposed destination. Preserve raw evidence and archive rather than delete it. Evidence: all 1,255 source reports are `RETAIN_LOCAL`; the manifest contains per-file checksums, reasons, and unchanged proposed paths; no file was moved or deleted.
- [x] **5.3** Promote only reviewed, reproducible summaries and manifests into tracked paths; enforce a hard 10 MB per-file gate before staging and confirm committed Git blobs are also under 10 MB. Evidence: the seven-file promotion set is limited to the inventory, generator, index, handoff, prompt, task ledger, and ignore rules; every staged filesystem file and staged Git blob is below 10,000,000 bytes. Verify committed object sizes immediately after the focused commit.
- [x] **5.4** Add or refine narrowly-scoped ignore rules for repeat-generated raw evidence only after checking that no existing tracked source or required report is hidden by the rule. Evidence: `.gitignore` rules are limited to 2026-10-03 pipeline paths; `git ls-files` returned no tracked matches.
- [x] **5.5** Update the relevant report index/README and record the final disposition, excluded paths, checksums, and validation commands in a dated Markdown handoff. No database, cache, vector, graph, or production writes are authorized by this follow-up. Evidence: `docs/reports/openspec-evidence/README.md`, `docs/reports/openspec-evidence-disposition-20261003.md`, and `next_steps/10_3_26.md` record the scope and gates; `node --check` and the full inventory run succeeded.
- [ ] **5.6** Create a focused commit containing only the reviewed promotion set; verify staged and committed size gates, inspect the complete staged scope, and push only after `origin/main` alignment is confirmed.

## 2026-10-14 check-only evidence-fabric refresh

- Ran `npx tsx scripts/atlas/audit-openspec-evidence-fabric-v1.mjs --check-only` (exit 0). The script's `--check-only` branch emits no artifacts (`outputs: []`); this run made no report writes.
- Current filesystem census: 128 changes (118 active, 10 archived), 12,812 tasks, 7,814 checked and 4,998 unchecked. Do not report 7,814 checked tasks as completed capabilities: **0 checked tasks bind qualifying evidence** and **7,814 checked tasks have no qualifying evidence** in this census.
- Evidence binding diagnostics: 1,234 receipt candidates; 137 typed receipts; 261 matched receipt references; 90 exact, 51 alias, and 161 source-ref bindings; 2 candidate-only and 41 ambiguous; 930 orphan/missing-task receipts; 1,140 missing-revision receipts; 52 stale-evidence candidates. Counts describe overlapping diagnostic categories, not additive partitions.
- Identity/ledger quality prevents promotion: 7,427 tasks lack explicit task IDs, 398 task identities are ambiguous, 12,776 duplicate declared IDs, 153 duplicate derived keys, and 30 dependency references are missing. `censusStatus=DIAGNOSTIC_ONLY_NOT_PROMOTABLE`, `promotionEligible=false`, `ownerConflictAuditCurrent=false`.
- Run ID `20261014182238213-c8604281cbea`; workspace revision `sha256:c8604281cbea3641ca1b7b8c2992c07e1a1ca168157255e7fc35dad3d700352b`. This is a fresh diagnostic census, not an authoritative portfolio completion score. The former 61.6% workboard figure is checkbox accounting and must not be used as capability completion.
- Follow-up diagnosis using the census API in memory (no output files): the fresh workspace revision changed to `sha256:b77f645b4fe9da3edf54ba733f9f0ab57865991da43437de783ff4251bc52fcf` after ledger/report edits. Across 1,234 receipt matches, 137 have canonical schemas and 261 bind to tasks, but **0/1,234 have a current workspace revision**, only 7 have current source revisions, 92 match task revisions, 99 match a source line span, and 8 have all source refs current. The 135 `PROVEN` verdict labels therefore do not produce current proof cards. Source inspection confirms `workspaceRevision` hashes all files under both OpenSpec change roots, including archives; adding or editing an unrelated task ledger changes that global revision and invalidates otherwise task-local receipts.
- Do not lower freshness requirements or re-label these historical receipts as current. Add a separate design gate before changing the proof authority: preserve the receipt's as-of workspace snapshot, while evaluating whether exact task revision + line-qualified source-reference checks can provide current task-local proof without requiring every unrelated OpenSpec file to remain byte-identical. Any revised contract needs versioned semantics, regression tests for relevant-source edits versus unrelated-ledger edits, and independent readback. Until then, `checkedWithEvidence=0` is the valid current result; the census remains diagnostic and non-promotable.
- Added diagnostic-only `taskLocalEvidenceCandidateReceipts` and `tasksWithTaskLocalEvidenceCandidates` counters to the check-only report. They require a canonical schema, unique task binding, current task revision, exact task line span, current source refs, `PROVEN` verdict, and no supersession; they deliberately do not bypass the strict global-workspace proof gate or affect cards/proof state. Regression coverage proves an unrelated ledger edit yields one local candidate while `checkedWithEvidence` remains zero, and relevant source/task edits remove that candidate. `node --check scripts/atlas/audit-openspec-evidence-fabric-v1.mjs` and `node --test scripts/atlas/audit-openspec-evidence-fabric-v1.test.mjs` passed (21/21); the check-only portfolio audit exited 0 with 6 candidate receipts across 2 tasks, 0 globally current proofs, and `promotionEligible=false`. The local candidate counter is a diagnostic lead, not a completion numerator or authority.
- Fresh continuation census, `node scripts/atlas/audit-openspec-evidence-fabric-v1.mjs --check-only` (exit 0; `outputs: []`): run `20261014191727547-e1dcd0b434ba`, workspace revision `sha256:e1dcd0b434ba0c2e4918f0339e94385d454b40fdf86bc264b99429c1a547f537`; 128 changes (118 active, 10 archived), 12,812 tasks, 7,814 checked, 4,998 unchecked, 0 checked rows with qualifying `PROVEN` evidence, and `promotionEligible=false`. Diagnostics include 7,427 missing task IDs, 398 ambiguous identities, 12,776 duplicate declared-ID groups, 153 duplicate derived keys, 931 orphan/missing-task receipts, 1,141 missing-revision receipts, and 52 stale-evidence candidates. This census is diagnostic-only; counts do not establish that evidence is absent, only that current binding/freshness cannot promote it. The workboard’s fresh 7,309/11,974 (61.04%) is checkbox-only and scans top-level root changes; the evidence census additionally includes nested/frontend and archived changes. Do not report either ratio as capability completion. Analysis: `docs/reports/parent-atlas-open-spec-progress-evidence-2026-10-14.md`.
- Fresh continuation census, `node scripts/atlas/audit-openspec-evidence-fabric-v1.mjs --check-only` (exit 0; `outputs: []`): run `20261015190508808-697a288d32e5`, workspace revision `sha256:697a288d32e57a01a232620f5c283f9f053bef0baa270fd22ea10cb3a7251bb2`; 130 changes (120 active, 10 archived), 13,106 tasks, 7,910 checked, 5,196 unchecked, and 0 checked rows bound to qualifying current evidence. Diagnostics: 946 orphan/missing-task receipts, 1,156 missing-revision receipts, 404 ambiguous task identities, 51 stale-evidence candidates, `DIAGNOSTIC_ONLY_NOT_PROMOTABLE`, `promotionEligible=false`. Transcript `.tmp/atlas/phase-closure-evidence-census-20261015.txt`, SHA-256 `6391c20636bd2ff445920a3ee4edb362d1599f89d71eee9189d531846cc4b4ad`. The exact task/revision binding and stale evidence remain the portfolio bottleneck; use this census to triage owner ledgers, not as a completion percentage.
