# Parent Atlas Workstation Status

Generated: 2026-06-29T00:47:37.534Z

## Boundary

Parent Atlas workstation logic is the canonical indexing lane:

1. Rebuild packet spine in Postgres.
2. Generate Gemma4 summaries into `atlas_packets.summary`.
3. Materialize file-level rows into `atlas_summary_layers`.
4. Only after summaries exist, refresh feature envelopes, Qdrant, Redis/BitFrost, and Neo4j.

Legal-app runtime stores are mirrors/caches, not truth.

## Status

| Lane | Status |
|---|---|
| canonical_spine | READY |
| summaries | STARTED |
| summary_layers | STARTED |
| mirrors | READY_FOR_MIRROR_REFRESH |

## Tables

| Table | Rows |
|---|---:|
| atlas_packets | 58304 |
| atlas_packet_registry | 58304 |
| atlas_summary_layers | 336 |
| atlas_artifacts | 58312 |
| codebase_chunk_index | 40754 |
| parent_atlas_documents | missing |
| atlas_feature_envelopes | missing |
| atlas_retrieval_eval_times | missing |
| atlas_provenance_tree | missing |

## Metrics

| Metric | Value |
|---|---:|
| packet_summaries | 337 |
| summary_layers_populated | 336 |
| json_shaped_packet_summaries | 0 |
| json_shaped_summary_layers | 0 |
| missing_packet_registry_rows | 0 |

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
