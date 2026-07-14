# Parent Atlas Workstation Status

Generated: 2026-07-14T16:12:52.044Z

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
| canonical_spine | NEEDS_REBUILD |
| summaries | STARTED |
| summary_layers | STARTED |
| mirrors | READY_FOR_MIRROR_REFRESH |

## Tables

| Table | Rows |
|---|---:|
| atlas_packets | 58365 |
| atlas_packet_registry | 58324 |
| atlas_summary_layers | 18423 |
| atlas_artifacts | 58312 |
| codebase_chunk_index | 52417 |
| parent_atlas_documents | missing |
| atlas_feature_envelopes | 58365 |
| atlas_retrieval_eval_times | 25 |
| atlas_provenance_tree | missing |

## Metrics

| Metric | Value |
|---|---:|
| packet_summaries | 6883 |
| summary_layers_populated | 7640 |
| json_shaped_packet_summaries | 17 |
| json_shaped_summary_layers | 17 |
| missing_packet_registry_rows | 41 |

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
