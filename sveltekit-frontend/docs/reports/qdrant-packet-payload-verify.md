# Qdrant Packet Payload Verify

Generated: 2026-07-14T16:13:25.608Z
Qdrant: http://127.0.0.1:6333
Collection: codebase_chunks_768
Sample limit: 50

## Summary

- Sample rows: 50
- Qdrant points found: 50
- Agreements: 0
- Mismatches: 50
- Missing points: 0
- Contradictions: 0
- Agreement pct: 0
- Point found pct: 100
- postgres_qdrant_no_contradictions: PASS

## Field Coverage

- source_ref: 50/50 (100%)
- feature_id: 50/50 (100%)
- feature_label: 50/50 (100%)
- qdrant_tag_id: 0/50 (0%)
- cluster_id: 0/50 (0%)
- community_id: 0/50 (0%)
- som_cluster: 0/50 (0%)
- domain_class: 50/50 (100%)
- domain: 0/50 (0%)
- neo4j_node: 0/50 (0%)
- metadata: 0/50 (0%)

## Sample

- proto:CyberElephantService.UpdateClusters | point=1144636562 | matched=4/6
- proto:CyberElephantService.GetClusters | point=656102470 | matched=4/6
- proto:RetrievalService.SearchEvidence | point=953813387 | matched=4/6
- proto:ChatAssistantService.StreamMessage | point=2672128997 | matched=4/6
- proto:CyberElephantService.ProcessDocuments | point=2287758340 | matched=4/6
- proto:TurboVecService.Transform | point=391145144 | matched=4/6
- proto:TurboVecCudaService.EncodeLatent | point=1631541034 | matched=4/6
- proto:EnrichmentService.BatchEnrich | point=1491512751 | matched=4/6
- proto:RetrievalService.GetTopologyContext | point=841719032 | matched=4/6
- proto:GpuBridgeService.EncodeLatent | point=3512513412 | matched=4/6

## Contradictions

- none