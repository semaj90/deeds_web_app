# Packet Topology & Vectors Backfill Report

Generated: 2026-07-04T06:25:39.519Z
Mode: **DRY-RUN**

## Statistics

| Metric | Value |
|:---|:---|
| **Total Scanned** | 58304 |
| **Successfully Backfilled** | 58304 |
| **Errors** | 0 |
| **GDS Enriched (PageRank/Louvain)** | 0 |
| **SOM Enriched (BMU Grid)** | 0 |
| **Tree Node Enriched** | 47100 |

## Component Validation
- **Centroid Lookup Storage**: Populated dynamically from Valkey/Redis cache keys.
- **Vector Lookup Storage**: Cast and synchronized UUID mappings from `atlas_packets` to `atlas_vector_lookup`.
- **Packet Envelopes**: `topology` JSONB and `vectors` JSONB envelopes correctly mapped and populated.
