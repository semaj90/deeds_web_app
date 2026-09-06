## Why

Reconcile existing implementation work with explicit memory/agent ownership.

## What Changes

## Memory/agent ownership update — 2026-09-05

This updates the existing candidate-feature-execution-fabric owner; no new OpenSpec change or control plane.
The accompanying design addendum and spec scenarios govern the new tasks; historical
findings below remain dated evidence, not a competing current execution queue.

QueryFingerprintV1 and LexicalFingerprintV1 are derived feature contracts under
this existing fabric. Their checksums bind normalization and corpus revisions; observedAt
is diagnostic recency, excluded from deterministic feature identity. Counts need an
explicit corpus and denominator; unavailable statistics are not fabricated zero values.
Use existing PostgreSQL lexical sources with bounded read-only snapshot queries.

Join only through CandidateFeatureSnapshotV1 and its admitted ordinal map. A lexical
cluster is routing metadata, not identity or a new RRF lane. KMeans remains optional and
evaluation-gated. Reuse WorkflowExecutionCoordinatesV1 for orchestration/checkpoint
coordinates; no second workflow identity. Develop implementation in scripts/atlas first.

Impact: planning/spec/task reconciliation only. Runtime implementation and datastore
mutation are not performed by this update. See tasks.md for pending proof gates.
