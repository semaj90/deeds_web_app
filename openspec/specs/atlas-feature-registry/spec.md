# Parent Atlas Feature Registry — Requirements

## Purpose

Define stable feature identity, revision, labels, and evidence-based promotion boundaries.

## Requirements

### Requirement: Stable feature identity

The system SHALL assign each canonical application capability a stable `feature_id` and `feature_key` independent of file paths, graph node IDs, Qdrant point IDs, cluster IDs, or human-readable labels.

### Scenario: File move

Given a feature implementation moves to a different source path,
when repository evidence is re-ingested,
then the canonical `feature_id` SHALL remain unchanged when semantic identity is preserved.

---

### Requirement: Feature labels are mutable metadata

`feature_label`, aliases and descriptions MAY change without changing canonical feature identity.

---

### Requirement: Tree and cluster identifiers are projections

`tree_node_id`, hierarchy paths, K-means cluster IDs, SOM cells and graph community IDs SHALL be treated as revision-qualified projections.

They SHALL NOT be used as canonical feature identity.

---

## Requirement: Feature revision

Each materialized feature SHALL carry a `feature_revision` derived from canonical semantic fields and evidence lineage.

---

## Requirement: Candidate promotion

Repository evidence MAY create `FeatureCandidateV1` values.

A candidate SHALL NOT become canonical `FeatureV1` until identity promotion resolves it against existing features or explicitly creates a new feature.

---

## Requirement: Canonical feature record

A canonical feature record SHALL support at least:

- `feature_id`
- `feature_key`
- `feature_label`
- `aliases[]`
- `domain`
- `parent_feature_id?`
- `feature_revision`
- `status`
- `created_from_evidence[]`
- `producer_revision`

---

## Requirement: Feature hierarchy is semantic

Parent/child feature relationships SHOULD represent capability decomposition rather than filesystem containment.

Filesystem hierarchy MAY be evidence for the relationship but SHALL NOT define it by itself.
