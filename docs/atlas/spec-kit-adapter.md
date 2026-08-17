# Parent Atlas Spec Kit Adapter

Spec Kit is an execution-planning adapter over canonical OpenSpec requirements.

## Authority rule

OpenSpec defines required behavior and invariants.

Spec Kit artifacts answer:

```text
specify → plan → tasks → implement
```

They SHALL reference canonical OpenSpec requirement IDs/paths and SHALL NOT redefine feature identity or completion semantics.

## Recommended mapping

| Spec Kit artifact | Parent Atlas meaning |
| --- | --- |
| specification | selected OpenSpec requirements + user intent |
| plan | implementation strategy, affected packages/tables/routes |
| tasks | executable work units with evidence expectations |
| implementation | repository mutations |
| verification | evidence/receipt that feeds `FeatureStateV1` |

## Suggested `.specify` projection

When Spec Kit is introduced, generate `.specify` artifacts from pinned OpenSpec revisions rather than hand-maintaining duplicate requirements.

Each generated task SHOULD carry:

- `feature_id` or `feature_key_hint`
- OpenSpec requirement refs
- expected evidence kinds
- dependency refs
- validation commands
- producer revision

## Round-trip rule

Implementation results flow back into Parent Atlas as evidence:

```text
OpenSpec
   ↓
Spec Kit plan/tasks
   ↓
implementation
   ↓
tests/runtime/receipts
   ↓
FeatureEvidenceV1
   ↓
FeatureStateV1
```

A Spec Kit task checkbox is therefore planning/execution evidence, not final truth.
