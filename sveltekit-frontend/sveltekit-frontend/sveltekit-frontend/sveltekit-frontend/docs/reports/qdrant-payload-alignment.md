# Qdrant Packet Payload Verification

**Generated**: 2026-06-14T02:31:51.537Z

## Summary
❌ **FAIL** — Qdrant payloads are incomplete.

## Collection Status

- **Collection**: codebase_chunks_768
- **Total points**: 54,898
- **Sampled**: 1000 points

## Payload Field Coverage

| Field | Coverage | Status |
|-------|----------|--------|
| packet_key | 49.6% | ❌ FAIL |
| source_ref | 0.5% | ❌ FAIL |
| feature_id | 94.6% | ✅ PASS |
| feature_label | 92.3% | ✅ PASS |
| domain_class | 46.9% | ❌ FAIL |
| community_id | 49.4% | ❌ FAIL |
| tags | 95.1% | ✅ PASS |

## Purpose

These payload fields enable:
- **packet_key**: Exact-match retrieval + deduplication
- **source_ref**: Multi-hop Neo4j joins + Redis centroid lookup
- **feature_id**: Grouping + Karpathy ranking key
- **feature_label**: UI context + ranking blend context
- **domain_class**: Domain filtering + agentic grouping
- **community_id**: Community scoping + confidence scoring
- **tags**: Concept filtering + multi-vector queries
- **som_cluster**: SOM topology routing (optional, preferred when available)

## Next Steps


❌ Qdrant payload alignment incomplete. Diagnose:
1. Is Qdrant running? `curl http://localhost:6333/collections`
2. Check point sample: `curl -X POST http://localhost:6333/collections/codebase_chunks_768/points/scroll -d '{"limit":1}' -H 'Content-Type: application/json'`
3. Re-run enrichment: `npm run atlas:4b:qdrant-payload --apply`

