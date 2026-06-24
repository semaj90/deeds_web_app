# Qdrant Payload Complete Backfill

Generated: 2026-06-24T05:35:45.268Z
Mode: apply
Collection: codebase_chunks_768
Database: postgresql://legal_admin:***@127.0.0.1:5434/legal_ai_db
Ledgers: atlas_codebase_packets, atlas_feature_packets, atlas_packets, task_semantic_packets, parent_atlas_documents

## Summary

- Postgres rows scanned: 41189
- Postgres rows matched: 39754
- Rows updated: 14950
- Rows already canonical: 37379
- Rows skipped: 12852
- Rows ambiguous: 277
- Rows unmatched: 12575
- Qdrant points scanned: 52606
- Qdrant points matched: 39754
- Qdrant points updated: 14950
- Qdrant points already canonical: 37379
- Qdrant points legacy only: 12575

## Canonical Coverage

- packet_key: 39754/39754 (100%)
- source_ref: 39754/39754 (100%)
- feature_id: 33544/33544 (100%)

## Ledger Counts

- atlas_codebase_packets: 0
- atlas_feature_packets: 520
- atlas_packets: 29314
- task_semantic_packets: 2
- parent_atlas_documents: 9918
- legacy_qdrant_only: 12575

## Sample

- 86694 | src/routes/api/research/concurrent-deep/stream/+server.ts:d391b7e92c36906b | already-canonical | packet_key
- 138065 | src/routes/api/recommendations/+server.ts:d5397aa82be3284c | already-canonical | packet_key
- 174637 | src/lib/server/ai/contextual-tools.ts:b65c6a4d | already-canonical | packet_key
- 188608 | src/lib/server/research/reddit-harvester.ts:78eef6c1 | already-canonical | packet_key
- 194586 | src/lib/server/gpu/libtorch-bridge.ts:44dd86e0eace5c71 | already-canonical | packet_key
- 227675 | src/lib/server/couchdb/mango-indexes.ts:dff1fbc9 | already-canonical | packet_key
- 292522 | src/lib/components/monitoring/CacheMonitoringWidget.svelte:f9470fb28e6f344a | already-canonical | source_ref
- 404803 | src/lib/server/data/legal-seed-data.ts:1ec45097 | already-canonical | packet_key
- 436451 | src/lib/components/citations/citationsaveform.svelte:77b10257 | already-canonical | packet_key
- 614211 | src/routes/(app)/admin/atlas/+page.server.ts:8ac8a88cbd487045 | already-canonical | packet_key
- 639944 | src/routes/admin/parents-atlas/+page.svelte:e6c919084ef1be4a | already-canonical | packet_key
- 727645 | src/lib/server/ai/mcp-tool-dispatch.ts:d962195ef653d759 | already-canonical | packet_key
- 761314 | src/lib/components/ai/CachePerformanceDashboard.svelte:2865def3ade42484 | already-canonical | source_ref
- 909958 | src/lib/server/retrieval/centroid-cache.ts:cfcce45038fad33b | already-canonical | packet_key
- 1080785 | src/lib/components/admin/AdminMonitoringDashboard.svelte:50e282945262eca8 | already-canonical | source_ref
- 1103029 | src/lib/components/graph/GraphifyViewer.svelte:81f6bc913c8bb05b | already-canonical | source_ref
- 1116368 | src/lib/server/retrieval/cluster-aware-reranker.ts:95647aa7 | already-canonical | packet_key
- 1146202 | src/lib/server/admin/retrieval-analytics-service.ts:8f0ca91b | already-canonical | packet_key
- 1249835 | src/lib/webgpu/gaussian-splat-renderer.ts:43c70c0a3ba7ff2c | already-canonical | packet_key
- 1354889 | src/lib/components/legal/EvidenceReportSummary.svelte:cd9b26086bb1ba11 | already-canonical | source_ref
- 1401737 | src/lib/db/schema/evidence.ts:bf52bff981024088 | already-canonical | packet_key
- 1536417 | src/mcp/tools/legal-skills.tool.ts:898b0571049c27e5 | already-canonical | packet_key
- 1604171 | src/lib/components/admin/ContextualAssistantModal.svelte:0947370c5e85da9a | already-canonical | source_ref
- 1612494 | src/lib/components/legal-ai/CaseDocumentWriter.svelte:61aa58a3a843005c | already-canonical | source_ref
- 1631859 | src/lib/server/indexer/directory-summarizer.ts:2de96f9c31988cc2 | already-canonical | packet_key