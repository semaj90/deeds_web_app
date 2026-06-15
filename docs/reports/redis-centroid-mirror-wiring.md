# Redis Centroid Mirroring Wiring

## 🎯 Purpose
This document outlines the process of creating a **read-only, hot mirror** for centroid data from the primary source of truth (Postgres) into Redis/Valkey. This is necessary to allow downstream services to query recent or frequently accessed centroid information without hitting the main Postgres database every time.

## 📜 Core Rule
*   **Source of Truth**: `postgres` (`atlas_higher_hop_index`) is the single source of truth for all data.
*   **Mirroring Layer**: Redis/Valkey acts only as a **hot cache**. Data written here must *never* be used to write back to Postgres, and no updates should occur on the primary database from this script.
*   **Execution**: The mirroring process is initiated via `scripts/atlas/wire-redis-centroid-mirror.mjs`.

## ⚙️ Source Table & Fields (Postgres)
The data is read from: `public.atlas_higher_hop_index`
Key fields used for mirroring:
*   `packet_key`: The primary identifier for the record.
*   `community_id`: Used as a key component and stored value.
*   `som_cluster`: The SOM cluster ID.
*   `centroid_label`: The descriptive label of the centroid.
*   `karpathy_score`: The associated confidence score.

## 🔑 Redis Key Structure & Mapping
The data is mirrored to the following key pattern:
`redis:centroid:{community_id}`

The stored JSON payload contains:
```json
{
    "som_cluster": "...",
    "label": "...",
    "score": 0.0,
    "last_updated": "..."
}
```

## ⚠️ Execution Notes
1.  **Dry Run**: Always run the mirroring script with a dry-run flag or by inspecting the SQL query first to ensure no unintended data is read/written.
2.  **Idempotency**: The current implementation assumes that running the script multiple times will simply overwrite the cache key, which is acceptable for hot caching but should be monitored.

---
*Last updated: [Current Date]*