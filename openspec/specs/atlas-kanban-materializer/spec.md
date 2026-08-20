# Parent Atlas Kanban Materializer — Requirements

## Requirement: Kanban is a projection

The Kanban board SHALL be rebuilt from canonical `FeatureV1`, `FeatureEvidenceV1` and `FeatureStateV1` records.

Manual board text SHALL NOT override canonical feature/evidence state.

---

## Requirement: Current-state reconstruction

Given a repository revision and evidence snapshot revision, Atlas SHALL be able to reconstruct the current feature board without relying on an old progress document.

---

## Requirement: Board columns

The materialized board SHALL support at least:

- `EVIDENCE_NEEDED`
- `MISSING`
- `SPECIFIED`
- `IMPLEMENTING`
- `VERIFY`
- `VERIFIED`

---

## Requirement: Card contents

Each feature card SHALL include at least:

- `feature_id`
- `feature_label`
- `completion` (0–100)
- `confidence` (0–100)
- `state`
- `priority`
- `blockers[]`
- `recommendations[]`
- `evidence_summary`
- `feature_revision`
- `state_revision`

---

## Requirement: Evidence-based recommendations

Recommendations SHOULD be generated from missing acceptance evidence, unresolved ownership, stale projections, failing validations, graph bottlenecks and high-value uncertain areas.

Recommendations SHALL include evidence references explaining why the task exists.

---

## Requirement: Hierarchical board views

The board MAY group features by domain, parent feature, repository package, workstream or graph community.

Grouping SHALL NOT change canonical feature identity or completion.

---

## Requirement: Historical comparison

Atlas SHOULD support comparing two board revisions and reporting feature state deltas, including newly satisfied evidence, regressions, changed blockers and priority movement.

---

## Requirement: Phase status is separate

Project phase progress MAY be displayed, but phase completion SHALL NOT be conflated with feature completion or application readiness.
