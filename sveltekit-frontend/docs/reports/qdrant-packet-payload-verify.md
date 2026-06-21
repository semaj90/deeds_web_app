# Qdrant Packet Payload Verify

Generated: 2026-06-21T17:12:40.184Z
Qdrant: http://127.0.0.1:6333
Collection: codebase_chunks_768
Sample limit: 50

## Summary

- Sample rows: 50
- Qdrant points found: 32
- Agreements: 20
- Mismatches: 12
- Missing points: 18
- Agreement pct: 40
- Point found pct: 64

## Field Coverage

- source_ref: 23/50 (46%)
- feature_id: 23/50 (46%)
- feature_label: 23/50 (46%)
- qdrant_tag_id: 0/50 (0%)
- cluster_id: 9/50 (18%)
- community_id: 12/50 (24%)
- som_cluster: 0/50 (0%)
- domain_class: 11/50 (22%)
- domain: 0/50 (0%)
- neo4j_node: 0/50 (0%)
- metadata: 23/50 (46%)

## Sample

- src/lib/components/editor/LLMS.md | point=554327204 | matched=5/5
- src/lib/server/features/ai/ai/raptor-summarizer.ts | point=619807723 | matched=5/5
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/rag/documents/+server.ts | point=n/a | matched=0/5
- ../scripts/api-cleanup/reports/backup-2025-12-14T21-11-49-641Z/rag/status/[jobId]/LLMS.md | point=n/a | matched=0/5
- src/lib/components/recommendations/index.ts | point=423899075 | matched=5/5
- src/lib/server/evidence/docling-structure.test.ts | point=1428752701 | matched=0/5
- src/lib/stores/unified/evidence-store.svelte.ts | point=200259260 | matched=0/5
- src/lib/server/inference/adapter-manifest.ts | point=69695524 | matched=5/5
- ../scripts/tests/test-phoenix-prosecutor.mjs | point=n/a | matched=0/5
- src/lib/server/ai/backend-runtime-guards.ts | point=1854573517 | matched=5/5