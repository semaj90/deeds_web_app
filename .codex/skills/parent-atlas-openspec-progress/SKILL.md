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
