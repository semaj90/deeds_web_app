# Provenance Tree

Generated: 2026-06-21T22:41:55.815Z
Status: PROOF_WITH_WARNINGS

## Summary

- queries: 1
- pass rows: 1
- degraded rows: 0
- failed rows: 0
- cache hit rows: 1
- cache hit source families: redis_exact_match
- cache namespaces: hyperrag:query
- replay rows: 1

## Nodes

| provenance_id | query_id | replay_id | task_id | story_id | worker_id | packet_key | source_ref_key | feature_id | graph_stage_status | graph_stage_reason | cache_namespace | cache_hit_source | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 9c23d9cf97898dfec8e43c8f | a1148d4ae02843fc7d0edce1791e6574bbcc948a59146ffdf80db0da4187f4ee | 1782081708433-3vgfzhw | atlas:replay:breadth:50 | proof-quality-lane | sveltekit-frontend | nes:utility:9fa84252 | src/lib/types/svelte5-api-types.d.ts | utility | GRAPH_DEGRADED | neo4j expansion not returned for this replay entry | hyperrag:query | redis_exact_match | pass |

## Idempotency

- deterministic seed strategy: sha256(query_hash|packet_key|source_ref|source_ref_key|feature_id|cache_hit_source|graph_stage_status|task_id|story_id|index)
- stable hash sample: af5db4016a3acacf8ce34b895ad8b597e896c581906c083e0c9ab599bd58aa8d

## Next Safe Action

Use the cache-hit namespaces as the proof source, then expand provenance breadth only if new warmed rows are added.
