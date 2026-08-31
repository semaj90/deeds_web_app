# Parent Atlas Workstation Status

Generated: 2026-08-31T03:35:24.770Z

## Boundary

Parent Atlas workstation logic is the canonical packet and lane reconciliation boundary:

1. Rebuild packet spine in Postgres.
2. Generate Gemma4 summaries into `atlas_packets.summary`.
3. Materialize file-level rows into `atlas_summary_layers`.
4. Only after summaries exist, refresh feature envelopes, Qdrant, Redis/BitFrost, and Neo4j.

Legal-app runtime stores are mirrors/caches, not truth.

## Lane Map

| Lane | Contract |
|---|---|
| okf | declarative contract lane |
| msgpack | compact packet / cache codec lane |
| arrow_ipc | bounded batch export lane |
| grpc_protobuf | live service boundary lane |
| redis_bitfrost | hot cache and replay lane |
| qdrant | semantic lookup mirror |
| postgres | canonical identity and provenance store |
| embedding_family | embeddinggemma |
| canonical_embedding_lane | 512 |
| main_chunk_lane | 768 |
| projection_lane | 384 |
| routing_lane | 64 |

## Status

| Lane | Status |
|---|---|
| canonical_spine | NEEDS_REBUILD |
| summaries | STARTED |
| summary_layers | STARTED |
| mirrors | READY_FOR_MIRROR_REFRESH |

## Tables

| Table | Rows |
|---|---:|
| atlas_packets | 61660 |
| atlas_packet_registry | 58324 |
| atlas_summary_layers | 18437 |
| atlas_artifacts | 58312 |
| codebase_chunk_index | 55853 |
| parent_atlas_documents | 61660 |
| atlas_feature_envelopes | 58365 |
| atlas_retrieval_eval_times | 26 |
| atlas_provenance_tree | missing |

## Metrics

| Metric | Value |
|---|---:|
| packet_summaries | 6886 |
| summary_layers_populated | 7654 |
| json_shaped_packet_summaries | 17 |
| json_shaped_summary_layers | 17 |
| missing_packet_registry_rows | 3336 |

## Next Commands

```powershell
npm run atlas:workstation:status
npm run atlas:workstation:summaries:100
npm run atlas:workstation:status
```

After summary coverage is meaningful:

```powershell
npm run atlas:feature-metadata:verify
npm run atlas:qdrant-payload:verify:verbose
npm run atlas:bitfrost-semantic-cache:audit
```
