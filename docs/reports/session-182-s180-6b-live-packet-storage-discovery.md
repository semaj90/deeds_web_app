# S180-6B — Live Packet Storage Discovery (READ ONLY)

**Date**: 2026-08-04 | **Mode**: READ_ONLY_LIVE_DISCOVERY | **Mutations**: 0

## Correction Notice

The session-181 "S180-6 Task 1" audit concluded `atlas_packets` did not exist in the live
database. **That conclusion is false.** It was derived by reading the Drizzle schema *file*
and an earlier failed query, not by querying live Postgres directly via `docker exec`.
This report re-derives every claim from a live, read-only transaction against
`legal-ai-postgres` / `legal_ai_db`.

## Terminal Statuses

| Status | Value |
|---|---|
| `LIVE_ATLAS_PACKETS_RELATION` | **PRESENT** |
| `ATLAS_PACKETS_MIGRATION` | **UNKNOWN** (both migration ledgers empty) |
| `PACKET_QDRANT_BRIDGE_ROLE` | **PROJECTION_BRIDGE** |
| `CANONICAL_PACKET_OWNER` | **PROVEN** = `atlas_packets` |
| `DRIZZLE_SCHEMA_ALIGNMENT` | **DRIFT** |
| `ACTIVE_READER_ALIGNMENT` | **PARTIAL** |
| `ACTIVE_WRITER_ALIGNMENT` | **FAIL** |
| `S180_6_IDENTITY_AUDIT` | **INVALIDATED_BY_LIVE_SCHEMA** |
| `S180_6_PRODUCTION_BACKFILL` | **BLOCKED** |

## 1–2. Search path + relation existence

```
current_database=legal_ai_db  current_schema=public  search_path="$user", public
to_regclass('atlas_packets')         → atlas_packets  (relkind='r', table)
to_regclass('public.atlas_packets')  → atlas_packets
to_regclass('packet_qdrant_bridge')  → packet_qdrant_bridge (relkind='r', table)
```
No search-path ambiguity. Both tables live in `public`, unqualified names resolve correctly.

## 3. Packet/chunk/qdrant table inventory (37 relations)

Includes `atlas_packets` (61,659 rows), `atlas_packet_registry`, `codebase_chunk_index`
(52,417 rows — **also falsely reported absent last session**), `packet_qdrant_bridge`
(4,725 rows), plus 33 more packet/chunk/qdrant-named tables and 3 views. Full list in the
JSON sibling report.

## 4–5. `packet_qdrant_bridge` inspection → PROJECTION_BRIDGE

- PK: `packet_key` (no FK to anything)
- All 8 non-PK columns `NOT NULL`: `source_ref`, `qdrant_point_id`, `qdrant_collection`,
  `matched_by`, `confidence`, `created_at`, `updated_at`
- `matched_by` = `'source_ref_relative_path'` for 100% of rows
- **4,725 / 4,725 (100%) of its `packet_key` values join exactly to `atlas_packets.packet_key`**

A table with zero content/provenance columns, zero FKs, and 100% key containment inside a
much larger table (61,659 rows) is a **sync bookkeeping projection**, not a second canonical
identity source. `atlas_packets` is the superset; `packet_qdrant_bridge` only records which
7.7% of packets have been Qdrant-synced so far.

## 6. Migration history

```
drizzle.__drizzle_migrations → 0 rows
public.migrations            → 0 rows
```
Neither ledger has ever recorded an entry. `atlas_packets`' full 200+ column live shape
(workspace_revision, representation_revision, som_*, pagerank_*, embedding_eligible, etc.)
was built **out-of-band** — manual SQL, ALTER scripts, or an untracked `drizzle-kit push` —
not through either tracked migration mechanism. Cannot classify APPLIED vs UNAPPLIED with
current evidence → **UNKNOWN**, not "missing migration."

## 7. Active readers/writers (200+ files reference `atlasPackets`/`atlas_packets`)

`atlas_packets` is **not orphaned code** — it is the read/write target for `ace/`,
`retrieval/`, `workers/`, `mcp/`, `routes/api/`, and multiple test suites.

| File | Classification | Alignment |
|---|---|---|
| `workers/qdrant-sync-worker.ts:60-61` | READS_CANONICAL_STATE | ✅ ALIGNED (camelCase `packetKey` matches schema) |
| `workers/identity-worker.ts:136-138` | WRITES_CANONICAL_STATE | ❌ **BROKEN** — `atlasPackets.packet_key` (snake_case) does not exist on the Drizzle table object; schema defines `packetKey`. `eq(atlasPackets.packet_key, ...)` resolves to `eq(undefined, ...)`. |
| `workers/identity-worker.ts:206-221` | WRITES_CANONICAL_STATE | ❌ **BROKEN** — `.set({ repository_id, directory_id, ... })` uses snake_case keys against a camelCase Drizzle table; same `.where()` bug as above. |
| `db/schema-postgres.ts:33,5308` | re-export | ✅ single source of truth confirmed — no duplicate/competing table definitions under the same export name |

## 8. Canonical packet owner — PROVEN

`atlas_packets`:
- 61,659 rows
- `packet_key`: 100% present, 100% unique, DB-enforced `UNIQUE (packet_key)` constraint
- `source_ref`: 100% present
- `workspace_id`: 100% present, real directory-path values (not tenant/workspace semantics assumed by prior audit)
- Actively read AND written by 200+ live TypeScript files across every major subsystem

`packet_qdrant_bridge` is a derived sync-status projection scoped to the 4,725 packets
(7.7%) that have completed Qdrant backfill so far — not a competing canonical source.

## 9. Drizzle schema alignment — DRIFT (not absence)

Live columns exist but under different names/shapes than the payload-builder code assumes:

| Payload code expects | Live column | Coverage | Note |
|---|---|---|---|
| `source_revision` | *(none literal)* — closest: `workspace_revision` / `representation_revision` | both `NOT NULL`, default 0 | no column named `source_revision` exists |
| `representation_id` | *(none literal)* — closest: `source_representation_id` / `projection_representation_id` | **0% populated** (both fully NULL) | columns exist but are dead/unused |
| `content_hash` | `content_hash` column exists | **0% populated** | `sha256` (different column) is 7.6% populated instead |
| `tree_node_id` FK (Drizzle: uuid + FK to `atlasTreeNodes`) | live: `text`, no FK, 100% populated, 100% distinct | **DRIFT** — Task-1's "PROVEN JOIN (FK constraint enforced)" claim is false; no FK exists live |
| `chunk_id` / `symbol_id` (Drizzle: uuid, implies FK) | live: uuid, 94.7% populated, **zero rows join to `codebase_chunk_index` by any tested key** | orphan self-generated UUIDs, not a real join |

Real, working join instead: `atlas_packets.source_ref = codebase_chunk_index.source_ref` → 52,417 matches.

## Decision-tree classification

This is **Case 3 variant, not Case 4**: a canonical table exists (`atlas_packets`), but two
of its identity-adjacent fields (`chunk_id`, `symbol_id`) are populated with values that do
not join anywhere, and two payload-contract fields (`source_revision`, `representation_id`)
have no live column at all. This is not "no canonical packet table exists" — it is "the
canonical table exists, is heavily used, but has unmapped/dead fields plus at least one
confirmed broken writer."

## S180_6_PRODUCTION_BACKFILL: BLOCKED — reasons (revised)

1. **Field-mapping ambiguity**: `source_revision` and `representation_id` in
   `qdrant-sync-payload.ts` have no 1:1 live column. Must decide: map to
   `workspace_revision`/`representation_revision` and `source_representation_id`/
   `projection_representation_id` (currently 0% populated), or treat as a genuine gap
   requiring a new column + backfill.
2. **Broken writer**: `identity-worker.ts` cannot correctly read or update `atlas_packets`
   today due to the snake_case/camelCase mismatch — this must be fixed before it can be
   trusted as part of any identity-write path.
3. **Orphan structural fields**: `chunk_id`/`symbol_id` in `atlas_packets` are self-generated
   UUIDs with zero proven join to `codebase_chunk_index`. Do not populate Qdrant payload
   `chunk_id` from these fields without first deciding whether they're intentional synthetic
   IDs (fine, just document it) or a defect (needs re-derivation from the proven
   `source_ref` join).

No DDL, no backfill, no Graphify run, no Qdrant mutation was performed to produce this report.
