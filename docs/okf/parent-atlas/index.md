---
title: Parent Atlas OKF Bundle Index
bundle: parent-atlas
status: PARTIAL_PROVEN
owner: Parent Atlas / PostgreSQL
authority: canonical evidence and lineage
generated_from:
  - openspec/changes/parent-atlas-okf-knowledge-layers/proposal.md
  - openspec/changes/parent-atlas-okf-knowledge-layers/design.md
  - openspec/changes/parent-atlas-okf-knowledge-layers/tasks.md
evidence_refs:
  - openspec/changes/parent-atlas-okf-knowledge-layers/proposal.md
  - openspec/changes/parent-atlas-okf-knowledge-layers/design.md
---

# Parent Atlas OKF Bundle

This bundle is the hand-authored, canonical knowledge layer for Parent Atlas.
It records gaps, ownership, and evidence-backed status without allowing OpenWiki
or any agent runtime to become a competing source of truth.

## Layer contract

- Parent Atlas / PostgreSQL: canonical evidence, lineage, receipts, and issues
- OKF: portable knowledge bundles and reviewable concepts
- OpenWiki: generated documentation only, never canonical writes
- Deep Agents / LangGraph: bounded runtime and workflow execution only

## Bundle contents

- [log.md](log.md)
- [architecture/canonical-authority.md](architecture/canonical-authority.md)
- [event-pipeline.md](event-pipeline.md)
- [retrieval-lanes.md](retrieval-lanes.md)
- [agent-runtime.md](agent-runtime.md)
- [domains-identity.md](domains-identity.md)
- [parser-and-symbols.md](parser-and-symbols.md)
- [representations.md](representations.md)
- [concepts-and-ontology.md](concepts-and-ontology.md)
- [topology.md](topology.md)
- [graph-analytics.md](graph-analytics.md)
- [observability.md](observability.md)
- [integrations/postgres.md](integrations/postgres.md)
- [integrations/qdrant.md](integrations/qdrant.md)
- [integrations/redis-bitfrost.md](integrations/redis-bitfrost.md)
- [integrations/neo4j.md](integrations/neo4j.md)
- [integrations/kafka-debezium.md](integrations/kafka-debezium.md)
- [integrations/langfuse.md](integrations/langfuse.md)
- [integrations/opentelemetry.md](integrations/opentelemetry.md)
- [integrations/trace-mcp.md](integrations/trace-mcp.md)
- [gaps/missing-domain-lineage.md](gaps/missing-domain-lineage.md)
- [gaps/missing-concept-edge-ledger.md](gaps/missing-concept-edge-ledger.md)
- [gaps/fragmented-representations.md](gaps/fragmented-representations.md)
- [gaps/topology-schema-drift.md](gaps/topology-schema-drift.md)
- [gaps/missing-cluster-run-lineage.md](gaps/missing-cluster-run-lineage.md)
- [gaps/missing-som-run-lineage.md](gaps/missing-som-run-lineage.md)
- [workflows/repository-audit.md](workflows/repository-audit.md)
- [workflows/openwiki-crawl-index.md](workflows/openwiki-crawl-index.md)
- [gaps/missing-library-review.md](gaps/missing-library-review.md)
- [gaps/mock-stub-resolution.md](gaps/mock-stub-resolution.md)
- [gaps/agentic-error-fixing.md](gaps/agentic-error-fixing.md)

## Rule

If a page is not backed by Parent Atlas evidence, it stays `NOT_PROVEN`,
`PARTIAL_PROVEN`, or `MISSING` until the underlying ledger or proof exists.
