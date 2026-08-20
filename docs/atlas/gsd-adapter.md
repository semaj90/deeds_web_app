# Parent Atlas GSD-Style Execution Adapter

GSD-style execution is useful for turning a large Atlas feature gap into small, bounded, verifiable work slices.

It is an execution discipline, not a competing specification authority.

## Input

A work slice begins from canonical feature state:

- `feature_id`
- current `FeatureStateV1`
- blockers
- missing acceptance evidence
- OpenSpec requirement refs
- graph/retrieval context
- resource budget

## Slice contract

Each execution slice SHOULD contain:

- one bounded objective
- explicit files/symbols/tables expected to change
- evidence refs that justify the target
- validation commands
- rollback boundary
- completion condition
- attempt/token/tool budget

## Hierarchical decomposition

```text
Feature gap
   ↓
Milestone
   ↓
Work package
   ↓
Execution slice
   ↓
Patch
   ↓
Validation
   ↓
Receipt
```

A parent slice MAY spawn children when evidence shows independent subproblems. Child completion rolls up only through verified evidence.

## Parent Atlas integration

The scheduler SHOULD prioritize slices using feature priority signals such as blockers, PageRank/fanout, user criticality, regression risk and uncertainty.

Priority does not change feature completion.

## Done rule

A slice is done when its configured validation evidence is recorded. The corresponding feature may remain incomplete if other acceptance dimensions remain unsatisfied.

## Recommended use

Use GSD-style slices after retrieval and feature-state reconciliation. Do not start by asking a model to invent a broad TODO list from repository text; derive tasks from explicit missing evidence and dependency structure.
