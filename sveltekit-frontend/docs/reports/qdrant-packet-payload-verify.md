# Qdrant Packet Payload Verify

Generated: 2026-08-02T11:08:07.808Z
Qdrant: http://127.0.0.1:6333
Collection: codebase_chunks_768
Sample limit: 50

## Summary

- Sample rows: 100
- Qdrant points found: 51
- Agreements: 0
- Mismatches: 51
- Missing points: 49
- Contradictions: 0
- Agreement pct: 0
- Point found pct: 51
- postgres_qdrant_no_contradictions: PASS

## Field Coverage

- source_ref: 15/100 (15%)
- feature_id: 0/100 (0%)
- feature_label: 0/100 (0%)
- qdrant_tag_id: 0/100 (0%)
- cluster_id: 0/100 (0%)
- community_id: 0/100 (0%)
- som_cluster: 0/100 (0%)
- domain_class: 0/100 (0%)
- domain: 0/100 (0%)
- neo4j_node: 0/100 (0%)
- metadata: 0/100 (0%)

## Sample

- sveltekit-frontend/src/lib/components/ai/AskAI.svelte | point=2204 | matched=0/7
- sveltekit-frontend/src/lib/components/evidence/CaseEvidenceOrganizer.svelte | point=1057 | matched=0/7
- sveltekit-frontend/src/lib/gpu/gpu-compute-pipeline.ts | point=2611 | matched=0/7
- sveltekit-frontend/src/lib/server/db/schema/jurisdictions.ts | point=18688 | matched=0/7
- packages/parent-atlas-retrieval/src/gpu/background-analyzer.ts | point=4235 | matched=1/7
- sveltekit-frontend/src/routes/(app)/active-cases/+page.svelte | point=1520 | matched=0/7
- sveltekit-frontend/src/routes/api/cases/[id]/overview/+server.ts | point=5995 | matched=0/7
- docs/metadata-contract-schema.json | point=1285 | matched=1/7
- scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/cache/redis/get-recent/+server.ts | point=13482 | matched=1/7
- docs/engram-offline-processing-pipeline.md | point=1668 | matched=1/7

## Contradictions

- none