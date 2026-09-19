# Parent Atlas actionable lane/dependency audit V3

This patch addresses issues exposed by the live `openspec-actionable-work-v1.json` exploration.

## Fixes

1. Detects implicit actionable-export truncation (for example 200 exported vs 2,313 controller-actionable).
2. Treats `declaredSourceRef` / `declaredSourceRevision` as lineage metadata, **not** task dependencies.
3. Keeps `ledgerState` (`OPEN`/checked) separate from `executionState` (`ACTIONABLE`, `WAITING_*`, etc.).
4. Reclassifies the overloaded `GENERAL` / `RETRIEVAL_ACE` buckets into narrower deterministic lanes.
5. Flags text that *looks* authority-gated but has no machine dependency metadata. This is advisory only; it never changes execution state.
6. Ranker adapter V3 prefers the full execution-controller task set over a potentially capped actionable export.

## New deterministic lanes

- IDENTITY_AUTHORITY
- DIRECTORY_INDEXING
- AST_SYMBOL
- SEMANTIC_ANN
- LEXICAL_SEARCH
- GRAPH_TOPOLOGY
- RETRIEVAL_FUSION
- PREFILL_CONTEXT
- ACE_BITFROST_CACHE
- AGENT_PROTOCOLS
- HITL_LEARNING
- MIGRATION_DATABASE
- ADMIN_OBSERVABILITY
- RESEARCH_CHALLENGER
- GOVERNANCE_PROOF
- GENERAL

Lane classification is navigation/ranking metadata only. It cannot make a task actionable.

## Install

Copy `scripts/atlas/lib/lane-taxonomy-v2.mjs`, `audit-openspec-actionable-readiness-v2.mjs`, and `adapt-openspec-controller-to-ranker-v3.mjs` into the repository.

Suggested package scripts:

```json
{
  "atlas:docs:actionable-audit": "node scripts/atlas/audit-openspec-actionable-readiness-v2.mjs",
  "atlas:ranker:adapt:v3": "node scripts/atlas/adapt-openspec-controller-to-ranker-v3.mjs"
}
```

Run:

```bash
npm run atlas:docs:execution-controller
npm run atlas:docs:blocker-audit
npm run atlas:docs:actionable-audit
npm run atlas:ranker:adapt:v3
```

## Expected interpretation of the live output

If the controller summary says `actionable: 2313` but the actionable report contains only 200 task objects, the 200-row file is a navigation sample, not a complete scheduler queue. Ranker V3 therefore reads the full execution-controller object array when it is available.

A query such as:

```js
!t.declaredSourceRef && !t.declaredSourceRevision
```

does **not** mean “no dependencies”. Those fields describe lineage/source qualification. Real scheduling dependencies must come from fields such as `dependsOnTaskIds`, `requiresReceipts`, `blockerKey`, and `releaseEvent`.

## Safety

- read-only
- no task checkbox mutation
- no DB/Qdrant/Valkey/BitFrost writes
- no state promotion based on text heuristics or lane assignment
