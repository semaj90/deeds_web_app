# Parent Atlas OpenSpec Progress Audit Skill

Use this repository skill when an agent is asked to audit Parent Atlas progress, choose safe next work, inspect blockers, or explain code/runtime readiness.

## Authority order

1. OpenSpec `tasks.md` and admitted completion envelopes.
2. Execution-controller state and release receipts.
3. Proof/readback receipts qualified by workspace/source/graph/feature revisions.
4. Deterministic ranker among `ACTIONABLE` tasks only.
5. File graph, taxonomy, KMeans, low-rank, cache affinity, and learned preference signals are advisory only.

Never change a task from `WAITING` to `ACTIONABLE` because of similarity, graph proximity, cluster membership, cache warmth, or model recommendation.

## Audit sequence

### Workstation phase and revision crosswalk

When asked to work through Parent Atlas workstation phases, build a three-way
crosswalk rather than infer phase ownership from filenames or the generated
workboard:

`workstation phase ID ↔ OpenSpec change/task IDs ↔ field family + canonical owner`

For each row record the acceptance gate, current evidence/receipt, status
(`CREATED`, `WIRED`, `PROVEN`, `DONE`, `PARTIAL`, or `WAITING`), blocker owner,
and release condition. The OpenSpec task ledger and admitted receipts remain
authoritative; workboards are navigation/projection only. Do not transfer a
checked box or a report percentage into a proof claim.

Search revision-bearing work narrowly across the workstation ledger and
candidate OpenSpec owners, then inspect the matching task context:

```bash
rg -n "source_revision|workspace_revision|registry_revision|feature_revision|representation_revision|graph_revision|producer_revision" docs/parent-atlas-workstation-todo.md openspec/changes
rg -n "Phase [0-9]+|P[0-9]+|Post-P20|DEFERRED" docs/parent-atlas-workstation-todo.md openspec/changes/*/tasks.md
```

Operator sequencing rule (2026-10-15): defer implementation that creates,
persists, propagates, changes writer policy for, invalidates from, or backfills
`*_revision` fields until workstation P20+ gates and the GPU-sidecar patch
tournament are closed. Read-only audits and current runtime freshness checks
continue; missing/mismatched evidence still fails closed. Keep legacy phase
labels distinct from canonical workstation phase IDs, and surface any mapping
as unresolved until an owning ledger provides it.

Current namespace and owner-map sources:

- The canonical phase-to-owner index is in the root
  `parent-atlas-workstation-todo.md` under “Canonical phase index” (P11–P25);
  its “Post-P20 backlog” and operator work-order sections define sequencing.
  `docs/reports/parent-atlas-phase-roadmap-reconciliation-v1.json` corroborates
  the stable IDs and selected live updates.
- `docs/parent-atlas-workstation-todo.md` is a separate status projection with
  legacy summary rows; use it for dated evidence, not to replace the root
  canonical owner map.

- Canonical workstation phases are stable IDs `workstation-p11` through
  `workstation-p25`; legacy workstation rows 1–10 are unmapped.
- The legacy summary ordinals 22–24 are not the same as canonical P22–P24.
- The 2026-10-15 workboard snapshot has 1,075 task records but no
  `workstationPhaseId`/`roadmapId` field on each task. It is not a direct
  machine-joinable phase-to-task crosswalk. Use the root canonical owner index
  to locate existing changes, then join to exact task IDs and acceptance
  criteria. If a specific owner/task link is absent, mark that link
  `PHASE_MAPPING_UNRESOLVED` rather than guessing.
- Explicit task links remain a sparse, reviewed crosswalk, not a claim that
  the phase is done. The 2026-10-15 generated map has 20 links across P11–P21:
  Prime/RLM integration and route ownership, deferred P12 writer gates, one explicit owner gate
  each for P13–P19, DSPy P20, and GEPA P21. Inspect the live generator summary
  rather than hard-coding counts after edits. Add links only with the exact
  `workstation-pNN` tag after confirming task scope against the canonical
  phase index. Do not infer a phase link from task prose containing `P24`,
  `P12`, or similar.
- In particular, local phase labels such as `P24-LINEAGE-*` in
  `parent-atlas-agent-framework-integration-hardening/tasks.md` describe a
  local workstream and must not be silently mapped to canonical workstation
  P24 (GPU/vector residency). Require an explicit crosswalk row.
- “Trilinear mapping” is not a phase-owner map: the root ledger only points to
  `docs/master_feature_todo_1011.md`, where trilinear is mentioned among
  unverified research paths. Do not use that mention to assign phases or
  owners.
- Treat that workboard as a dated navigation snapshot, not live completion
  evidence. Refresh it only through its existing read-only builder after
  checking that the output path and side effects are safe.
- Generate a bounded owner/task crosswalk with
  `node scripts/atlas/build-parent-atlas-phase-task-crosswalk-v1.mjs --summary`.
  The full JSON output is suitable for piping to an explicitly chosen report
  destination. Exact owner matches are navigation candidates; only explicit
  canonical phase IDs create task links. Review each linked `taskRef` against
  its owner `tasks.md` acceptance criteria and current admitted receipt before
  deciding whether a phase gate is closed.
- The current `scripts/atlas/audit-phase17-21-workstation.mjs` is not a safe
  refresh command yet: it uses an inline database credential and overwrites
  fixed JSON/Markdown report paths. Do not run it until credentials are
  environment-backed and reports are written immutably/versioned.

Before claiming all phases are mapped, reconcile the current phase review,
canonical roadmap index, owner `tasks.md` files, and workboard task records.
Report mapped/unmapped counts per namespace; never flatten them into one
completion percentage. Phase closure requires each gate's current proof and
acceptance, not merely a task-to-file or field-name match.

Run from repository root:

```bash
npm run atlas:docs:execution-controller
npm run atlas:docs:blocker-audit
npm run atlas:docs:actionable-audit
node scripts/atlas/adapt-openspec-controller-to-ranker-v3.mjs docs/reports docs/reports/actionable-workboard-v3.json
node scripts/atlas/audit-openspec-directory-graph-v1.mjs . docs/reports/openspec-directory-graph-v1.json
python scripts/atlas/cluster-openspec-file-graph-v1.py docs/reports/openspec-directory-graph-v1.json docs/reports/openspec-file-kmeans-v1.json 12 1337
node scripts/atlas/audit-atlas-runtime-readiness-v1.mjs . docs/reports docs/reports/atlas-runtime-readiness-v1.json
node scripts/atlas/build-openspec-challenger-tournament-v1.mjs docs/reports docs/reports/openspec-challenger-tournament-v1.json
node scripts/atlas/audit-openspec-progress-v2.mjs docs/reports docs/reports/openspec-progress-audit-v2.json
```

The actionable audit is authoritative for queue shape, not for task authority:

- prefer the full execution-controller task set when the actionable export is capped;
- keep `ledgerState` (`OPEN`/checked) separate from `executionState`;
- treat `declaredSourceRef` and `declaredSourceRevision` as lineage metadata, not scheduling dependencies;
- use `dependsOnTaskIds`, `requiresReceipts`, `blockerKey`, and `releaseEvent` for readiness;
- treat lane labels and ranker/learned recommendations as navigation only.
- for basename-only file fanout, prefer live worktree paths over archived or
  orphaned snapshots; keep multiple live matches unresolved rather than guessing.

On Windows, path arguments in test harnesses must use `fileURLToPath(import.meta.url)`; do not pass a raw URL pathname to Node as a filesystem path.

## What to report

Summarize task totals by execution state, the promotion-critical completion envelope and first unresolved blocker, blocker owner/release event/retry changes, task DAG and task-to-file evidence links, related directories/files and taxonomy, Graphify/tree-node evidence separately from lexical imports, Qdrant/Valkey/BitFrost/ACE/prefill readiness, ACP/A2A configuration versus runtime proof, human approval readiness, shadow learning status, and the next deterministic execution wave.

## Fail-closed semantics

- `PROVEN`: qualifying current receipt exists.
- `READY`: prerequisites are present but the final proof has not run.
- `PARTIAL`: contract/config/fixture evidence exists, but live proof is missing.
- `WAITING`: a named upstream authority/dependency blocks execution.
- `UNPROVEN`: no sufficient evidence.

Code/config presence is never enough to claim live readiness. A Qdrant collection name does not prove lineage tags. An ACP/A2A enum does not prove protocol compliance. A warm cache does not prove canonical identity. A trained model does not authorize promotion.

## Human-in-the-loop / learning

Human decisions must be revision/evidence-qualified receipts. Export them to a training dataset only after identity validation. PyTorch helpers may create tensors and a shadow preference head, but learned scores may only enter the challenger tournament. They cannot alter execution state or promotion.

## Safe closeout behavior

When a completion envelope has two or fewer unproven required gates, enter closeout mode: no new architecture, executor, optimization, or OpenSpec change unless it is the minimum blocker repair. Prefer proof replay, an admitted fallback, or receipt emission.
