# Tasks: Parent Atlas Graph Runtime Enhancement

## T0 — Capture only (2026-08-09)

This change was created to hold a fully-specified external plan (GR0–GR10, 24-file manifest — see
`proposal.md`) received mid-session while working `parent-atlas-agentic-repair-bundle-integration`
T22/T23. Per this repo's established discipline for external "bundles" (see that change's own T0,
blocked pending the actual repair-toolkit files), nothing here is implemented — this is
capture-and-reconcile only.

**What's real and already true, independent of this plan** (from T22, live-verified 2026-08-09):
- Neo4j has 23,114 `CodebaseFile` nodes, 2,754 `IMPORTS`, 1,572 `TEST_COVERS_FILE`, 9,988
  `BELONGS_TO_FEATURE` relationships.
- A `codebase_file_path` index on `CodebaseFile.path` exists and is `ONLINE` (created ad hoc this
  session — GR0/01-required-indexes.cypher would make this declarative).
- This was a **bounded 5,000-file** `--apply` run, not the full 61,659-file graph — GR1 explicitly
  calls this out as "STALE," not fresh.

## Open decision — how far to go before the next session

Not resolved yet. Three options, not mutually exclusive across gates:

- [ ] **(a) Docs-only for now.** Keep this change as pure specification until a human explicitly
      requests GR0 execution. Lowest risk, matches the repair-bundle's T0 precedent exactly.
- [ ] **(b) Scaffold stub files matching the manifest**, each clearly marked not-implemented
      (mirroring the plan's own stated intent for the Java procedure —
      `EXPERIMENTAL_NOT_IMPLEMENTED`). Gives the directory shape without claiming working code.
- [ ] **(c) Actually implement GR0–GR3** (capability preflight, indexes, APOC bounded traversal,
      GDS BFS/Dijkstra) since those don't require new plugin installation if APOC/GDS are already
      present — needs a live check first (see GR0 below) to know if this is even true yet.

**GR0 has not been run** — it is not yet known whether APOC Core and GDS are actually installed on
the live Neo4j instance. `CALL gds.list()` / `CALL apoc.help('path')` (or equivalent) should be run
before choosing between (b) and (c) above — if GDS/APOC aren't installed, (c) is blocked on a real
infrastructure change (placing plugin jars, restarting Neo4j), which is exactly the kind of action
that needs explicit operator confirmation per this repo's own risk-tiering rules, not something to
do unprompted mid-diagnosis.

## GR0 — Capability index proof

- [ ] Run `CALL gds.list()` and `CALL apoc.help('path')` (or equivalent) against the live Neo4j
      instance to confirm APOC Core and GDS are actually installed and which versions.
- [ ] If either is missing: this becomes its own confirmed infrastructure task (plugin jar
      placement + Neo4j restart), not silently bundled into a later gate.
- [ ] Formalize the already-live `codebase_file_path` index into
      `neo4j/01-required-indexes.cypher` (declarative, idempotent `CREATE INDEX ... IF NOT
      EXISTS`) once GR0 confirms the environment.

## GR1 — Fresh, frozen graphify revision

- [ ] Run `cd sveltekit-frontend && npm run graphify:daily` for the full, unbounded refresh (not
      the 5,000-file bounded slice from T22). This is a long-running, multi-stage, GPU-touching
      pipeline — run it as its own explicit, monitored action, not bundled with other work.
- [ ] Freeze the resulting revision (per the plan's `Run-Graphify-Then-Freeze.ps1` concept) before
      any PageRank/community-detection output changes downstream.

## GR2–GR10

Not started. See `proposal.md`'s "Gated rollout order" for the full sequence and dependencies.
Each gate should get its own task entry here, expanded at the point it's actually picked up —
not pre-written speculatively, to avoid this document drifting from what's actually built (the
same anti-pattern flagged repeatedly elsewhere in this repo's CLAUDE.md around status-language
discipline: PRESENT / STATICALLY_REFERENCED / RUNTIME_SMOKE_PROVEN, not aspirational checklists
mistaken for progress).

## Cross-references

- `openspec/changes/parent-atlas-agentic-repair-bundle-integration/tasks.md` T22 (live graph state
  this plan reconciles against), T23 (superseded by this change — T23 should be edited to point
  here rather than duplicating content).
- `openspec/changes/parent-atlas-agentic-repair-bundle-integration/tasks.md` T5/T5a (PageRank
  promotion gate — direct dependency for GR4).
