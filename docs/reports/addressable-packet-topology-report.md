# Packet Topology & Vectors Backfill Report

Generated: 2026-06-18T22:39:35.791Z
Mode: **APPLY**

## Statistics

| Metric | Value |
|:---|:---|
| **Total Scanned** | 17485 |
| **Successfully Backfilled** | 17485 |
| **Errors** | 0 |
| **GDS Enriched (PageRank/Louvain)** | 8744 |
| **SOM Enriched (BMU Grid)** | 3150 |

## Component Validation
- **Centroid Lookup Storage**: Populated dynamically from Valkey/Redis cache keys.
- **Vector Lookup Storage**: Cast and synchronized UUID mappings from `atlas_packets` to `atlas_vector_lookup`.
- **Packet Envelopes**: `topology` JSONB and `vectors` JSONB envelopes correctly mapped and populated.
