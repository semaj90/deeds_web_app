---
title: Topology Schema Drift
bundle: parent-atlas
status: NOT_PROVEN
severity: high
owner: Parent Atlas / PostgreSQL
evidence_refs:
  - openspec/changes/parent-atlas-okf-knowledge-layers/proposal.md
---

# Topology Schema Drift

Topology records are currently live outside the main Drizzle-managed schema,
with missing cluster and SOM lineage fields.
