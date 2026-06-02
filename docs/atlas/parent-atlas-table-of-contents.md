# Parent Atlas Table of Contents

This page is the navigation entry for the Parent Atlas workstream. It links the active design notes, storage decisions, execution lanes, and the current todo spine in one place.

## Core References

- [Parent Atlas - Storage & Runtime Decision](</C:/Users/james/Videos/deeds-web-app/docs/atlas/parent-atlas-storage-decision.md>)
- [Parent Atlas - Data Spine](</C:/Users/james/Videos/deeds-web-app/docs/atlas/parent-atlas-data-spine.md>)
- [Parent Atlas Karpathy Pipeline](</C:/Users/james/Videos/deeds-web-app/docs/architecture/parent-atlas-karpathy-pipeline.md>)
- [Kanban and Parent Atlas Alignment](</C:/Users/james/Videos/deeds-web-app/docs/architecture/kanban-parent-atlas-alignment.md>)
- [Local Deep Research Boundary](</C:/Users/james/Videos/deeds-web-app/docs/architecture/local-deep-research-boundary.md>)
- [Legal-AI Parent Atlas Product Integration](</C:/Users/james/Videos/deeds-web-app/docs/architecture/legal-ai-parent-atlas-product-integration.md>)
- [Neo4j GraphRAG Parent Atlas](</C:/Users/james/Videos/deeds-web-app/docs/architecture/neo4j-graphrag-parent-atlas.md>)
- [Unified ACE / Engram / NES Pipeline](</C:/Users/james/Videos/deeds-web-app/docs/architecture/unified-ace-engram-pipeline.md>)
- [Offline Synthesis Parent Atlas](</C:/Users/james/Videos/deeds-web-app/docs/architecture/offline-synthesis-parent-atlas.md>)
- [VRAM Hygiene Policy](</C:/Users/james/Videos/deeds-web-app/docs/architecture/vram-hygiene-policy.md>)

## Active Todo Spine

- [MASTER FEATURE TODO](</C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md>)
- [Implementation Status](</C:/Users/james/Videos/deeds-web-app/IMPLEMENTATION_STATUS.md>)
- [Master todo kanban board](</C:/Users/james/Videos/deeds-web-app/docs/graph/kanban-board.json>)
- [Master todo consolidation report](</C:/Users/james/Videos/deeds-web-app/memory/exports/master-todo-consolidation-report.json>)
- [TurboVec kanban consolidation report](</C:/Users/james/Videos/deeds-web-app/docs/reports/kanban-turbovec-consolidation-latest.md>)
- [Raw rg transcript organizer](</C:/Users/james/Videos/deeds-web-app/docs/reports/parent-atlas-rg-dump-organizer.md>)
- [Raw rg transcript projection](</C:/Users/james/Videos/deeds-web-app/docs/reports/parent-atlas-rg-dump-projection.md>)
- [Offline synthesis mapreduce DuckDB](</C:/Users/james/Videos/deeds-web-app/docs/reports/offline-synthesis-mapreduce-duckdb-report.md>)
- [Doc-feature crosswalk](</C:/Users/james/Videos/deeds-web-app/docs/reports/doc-feature-crosswalk-2026-06-01.md>)
- [PyTorch / Qdrant / Redis / SOM index](</C:/Users/james/Videos/deeds-web-app/docs/reports/pytorch-qdrant-redis-som-index-2026-06-01.md>)
- [Repo dirty tree classification](</C:/Users/james/Videos/deeds-web-app/docs/reports/repo-dirty-tree-classification-2026-06-01.md>)
- [Repo archive move plan](</C:/Users/james/Videos/deeds-web-app/docs/reports/repo-archive-move-plan-2026-06-01.md>)
- [Parent Atlas feature command atlas](</C:/Users/james/Videos/deeds-web-app/docs/reports/parent-atlas-feature-command-atlas.md>)
- [Parent Atlas feature command atlas projection](</C:/Users/james/Videos/deeds-web-app/docs/reports/parent-atlas-feature-command-atlas-projection.md>)
- [Parent Atlas feature command atlas Qdrant projection](</C:/Users/james/Videos/deeds-web-app/docs/reports/parent-atlas-feature-command-atlas-qdrant.md>)
- [Parent Atlas feature command atlas Postgres mirror](</C:/Users/james/Videos/deeds-web-app/docs/reports/parent-atlas-feature-command-atlas-postgres.md>)
- [Parent Atlas Cypher apply report](</C:/Users/james/Videos/deeds-web-app/docs/reports/parent-atlas-cypher-apply-report.md>)
- [SourceRef context Neo4j projection](</C:/Users/james/Videos/deeds-web-app/docs/reports/sourceRef-context-neo4j-report.md>)
- [All-lanes parent atlas report](</C:/Users/james/Videos/deeds-web-app/memory/exports/all-lanes-parent-atlas-report.json>)

## Lane Index

### Storage and retrieval
- Postgres 18 + pgvector
- Qdrant ANN and payload filters
- Neo4j graph traversal
- Redis / Bitfrost hot cache
- DuckDB offline analysis
- offline synthesis mapreduce DuckDB
- SeaweedFS artifact storage

### Agent and packet flow
- ACE packet generation
- task semantic packets
- OpenCode / Gemma4 pickup tuple
- sourceRef + feature_id replay spine
- Phase 101 parent-atlas packetizer (dry-run first)

### Atlas generation
- feature labeling
- kanban merge
- TurboVec kanban consolidation report
- raw rg transcript organizer
- raw rg transcript projection
- Parent Atlas feature command atlas
- Parent Atlas feature command atlas projection
- Parent Atlas feature command atlas Qdrant projection
- Parent Atlas feature command atlas Postgres mirror
- Parent Atlas Cypher apply
- SourceRef context Neo4j projection
- parent atlas indexing
- validation and consistency audits
- offline synthesis

### Remaining todo focus
- finish P3 provenance parity and quality review
- finish P4 provenance UI and trust-tier editing
- finish P5 feature registry reconciliation and command mapping
- keep offline mirrors downstream-only

## Notes

- This TOC is intentionally short and stable.
- Use the linked docs for lane details, and the master todo for execution state.
- The canonical join spine remains `sourceRef + feature_id`.
