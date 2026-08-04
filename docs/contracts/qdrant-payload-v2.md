# Qdrant Payload v2 Contract

**Status**: DEFINED
**Version**: atlas-qdrant-payload-v2
**Collection**: codebase_chunks_768
**Date**: 2026-08-04

---

## Required Canonical Identity Fields

These fields form the packet identity. All must be present and non-empty.

| Field | Type | Purpose | Postgres Source |
|-------|------|---------|-----------------|
| `packet_key` | string | SHA-256 canonical identity | Computed from (workspace_id, source_ref, source_revision, representation_id, start_byte, end_byte, symbol_version_id) |
| `workspace_id` | string | Multi-tenant scope | atlas_packets.workspace_id |
| `workspace_revision` | integer | Workspace version | atlas_packets.workspace_revision |
| `source_ref` | string | Source file path | atlas_packets.source_ref |
| `source_revision` | integer | Source version | atlas_packets.source_revision |
| `representation_id` | string | Representation variant | atlas_packets.representation_id |
| `representation_revision` | integer | Representation version | atlas_packets.representation_revision |
| `content_hash` | string | SHA-256 of chunk | Computed from codebase_chunk_index.content |
| `schema_version` | string | Payload contract version | MUST be "atlas-qdrant-payload-v2" |

---

## Conditional Structural Identity Fields

Required only when the chunk has structural metadata.

| Field | Type | When Required | Purpose |
|-------|------|---------------|---------|
| `tree_node_id` | string | AST chunk present | AST node reference |
| `symbol_id` | string | Symbol-scoped chunk | Function/class identifier |
| `symbol_version_id` | string | Symbol versioned | Symbol version tag |
| `chunk_id` | string | Sequential chunk | Position in source |
| `start_byte` | integer | Byte-precise chunk | Start offset |
| `end_byte` | integer | Byte-precise chunk | End offset |

---

## Optional Enrichment Fields

These fields MAY be sparse or missing. Never use for identity.

- `feature_id`, `feature_label` — semantic categorization
- `pagerank`, `pagerank_score` — graph authority (enrichment only)
- `som_cell` — SOM grid coordinate (enrichment only)
- `community_id` — graph community (enrichment only)
- `authority_score`, `rerank_score` — ranking signals (enrichment only)

---

## Identity Rules (Hard Constraints)

1. **PostgreSQL is authoritative** for all identity fields
   - Qdrant payload fields must match Postgres on read-back
   - Drift detected when payload fields differ from latest Postgres row

2. **Qdrant point_id ≠ packet_key**
   - `point_id` is Qdrant's internal projection identity
   - `packet_key` is the canonical business identity
   - Join-back uses `packet_key`, not `point_id`

3. **source_ref alone is insufficient for identity**
   - Multiple revisions, representations, or chunks can share a `source_ref`
   - Must use full (workspace_id, source_ref, source_revision, representation_id, start_byte, end_byte) tuple
   - Or rely on packet_key hash

4. **Vector similarity never reconciles identity**
   - High cosine similarity does NOT prove packet identity
   - Only deterministic field matching counts

5. **Revision fields are drift indicators**
   - workspace_revision, source_revision, representation_revision must exist
   - If Qdrant revision < Postgres revision → stale payload
   - If Qdrant revision > Postgres revision (unknown) → conflicting identity

---

## Migration Classifications

Every Qdrant point MUST fall into exactly one category:

| Classification | Condition | Action | Risk |
|---|---|---|---|
| **RECONCILABLE** | One unique Postgres row matches packet_key | Safe to keep or backfill | LOW |
| **AMBIGUOUS** | Multiple Postgres rows match source_ref | BLOCKED until manual review | HIGH |
| **MISSING_POSTGRES_ROW** | No Postgres row for packet_key | BLOCKED until Postgres restored | HIGH |
| **STALE_REVISION** | Qdrant revision < Postgres revision | Safe to backfill (update) | LOW |
| **CONFLICTING_IDENTITY** | Qdrant revision > Postgres or identity fields mismatch | BLOCKED until investigation | HIGH |
| **INSUFFICIENT_IDENTITY** | Missing required identity field | BLOCKED until field populated | HIGH |
| **ALREADY_V2** | schema_version = "atlas-qdrant-payload-v2" | No action needed | NONE |

---

## Revision Rules

- **workspace_revision**: Incremented on workspace config change
- **source_revision**: Incremented when source file changes
- **representation_revision**: Incremented when chunk extraction changes

Comparison logic:
```
if (qdrant.workspace_revision < postgres.workspace_revision) → STALE
if (qdrant.source_revision < postgres.source_revision) → STALE
if (qdrant.representation_revision < postgres.representation_revision) → STALE
if (qdrant.revision > postgres.revision) → CONFLICTING (unknown version)
if (qdrant.packet_key ≠ postgres.packet_key) → CONFLICTING
```

---

## Rollback Contract

Before ANY write to Qdrant:

1. Persist rollback record to Postgres (NOT in Qdrant):
```sql
INSERT INTO qdrant_rollback_log (
  collection_name,
  qdrant_point_id,
  previous_payload_hash,
  previous_payload_json,
  new_payload_hash,
  migration_batch_id,
  canonical_postgres_packet_key,
  recorded_at
) VALUES (...)
```

2. Fields required:
   - `collection_name` — "codebase_chunks_768"
   - `qdrant_point_id` — Qdrant's internal ID
   - `previous_payload_hash` — SHA-256 of old payload
   - `previous_payload_json` — Full JSON snapshot
   - `new_payload_hash` — SHA-256 of new payload
   - `migration_batch_id` — Batch identifier
   - `canonical_postgres_packet_key` — Deterministic identity
   - `recorded_at` — ISO timestamp

3. Rollback execution:
```sql
SELECT * FROM qdrant_rollback_log WHERE migration_batch_id = ? ORDER BY recorded_at DESC
FOR EACH row: qdrant.points.upsert(id, previous_payload_json)
```

---

## S180-5 Input Contract

S180-5 (bounded dry-run reconciliation) must:

1. **Sample 10 Postgres packets** (read-only transaction)
   - Fields: packet_key, workspace_id, workspace_revision, source_ref, source_revision, representation_id, content_hash

2. **For each packet, query Qdrant** (read-only):
   - Filter by `packet_key` using exact match
   - Retrieve one point (should be 0 or 1)
   - Compare all identity fields

3. **Classify result**:
   - RECONCILABLE → all fields match, revision OK
   - AMBIGUOUS → multiple Qdrant points found
   - MISSING_POSTGRES_ROW → packet_key not in Postgres (shouldn't happen)
   - STALE_REVISION → Qdrant revision < Postgres
   - CONFLICTING_IDENTITY → fields mismatch or Qdrant revision > Postgres
   - INSUFFICIENT_IDENTITY → required field missing

4. **Report**:
   - JSON: reconciliation matrix per packet
   - Markdown: summary counts and gate status
   - NO WRITES

5. **Gate decision**:
   - If ≥80% RECONCILABLE → S180-5 PASS
   - If <80% RECONCILABLE but all are STALE_REVISION (safe backfill) → S180-5 PARTIAL_PROVEN
   - If any CONFLICTING_IDENTITY or INSUFFICIENT_IDENTITY → S180-5 BLOCKED

---

## Status

| Check | Result |
|-------|--------|
| Required identity fields defined | ✅ PASS |
| Conditional structural fields defined | ✅ PASS |
| Enrichment fields marked non-canonical | ✅ PASS |
| Identity rules documented | ✅ PASS |
| Revision rules documented | ✅ PASS |
| Migration classifications defined | ✅ PASS |
| Rollback contract specified | ✅ PASS |
| S180-5 input contract specified | ✅ PASS |
| **S180-4 RESULT** | **PASS** |

---

**Next gate**: S180-5 Bounded Dry-Run Reconciliation (read-only, 10 packets, classify into migration categories)

