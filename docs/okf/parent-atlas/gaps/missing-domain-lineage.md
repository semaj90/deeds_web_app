---
title: Missing Domain Lineage
bundle: parent-atlas
status: NOT_PROVEN
severity: high
owner: Parent Atlas / PostgreSQL
evidence_refs:
  - openspec/changes/parent-atlas-okf-knowledge-layers/proposal.md
---

# Missing Domain Lineage

`atlas_packets.domain_class` exists, but the canonical classifier lineage table
with classifier ID, revision, confidence, and evidence digest is not present.
