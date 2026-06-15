# Bifrost Packet Mirroring Wiring

## 🎯 Purpose
This document outlines the process of creating a **read-only, hot mirror** for critical feature metadata from Postgres into Redis/Valkey. This allows downstream services to quickly look up associated data points without querying the primary database tables directly.

## 📜 Core Rule
*   **Source of Truth**: `postgres` (`atlas_higher_hop_index`) is the single source of truth for all data.
*   **Mirroring Layer**: Redis/Valkey acts only as a **hot cache**. Data written here must *never* be used to write back to Postgres, and no updates should occur on the primary database from this script.
*   **Execution**: The mirroring process is initiated via `scripts/atlas/wire-bifrost-packet-mirror.mjs`.

## ⚙️ Source Table & Fields (Postgres)
The data is read from: `public.atlas_higher_hop_index`
Key fields used for mirroring:
*   `packet_key`: The primary identifier for the record.
*   `feature_id`: The specific feature associated with the packet.
*   `community_id`: Used as a key component and stored value.
*   `som_cluster`: The SOM cluster ID.
*   `qdrant_payload_key`: A key used to locate related data in Qdrant.

## 🔑 Redis Key Structure & Mapping
The data is mirrored to the following key pattern:
`bifrost:packet:{packet_key}`

The stored JSON payload contains:
```json
{
    "feature_id": "...",
    "community_id": "...",
    "som_cluster": "...",
    "qdrant_payload_key": "...",
    "last_updated": "..."
}
```

## ⚠️ Execution Notes
1.  **Dry Run**: Always run the mirroring script with a dry-run flag or by inspecting the SQL query first to ensure no unintended data is read/written.
2.  **Idempotency**: The current implementation assumes that running the script multiple times will simply overwrite the cache key, which is acceptable for hot caching but should be monitored.

---
*Last updated: [Current Date]*