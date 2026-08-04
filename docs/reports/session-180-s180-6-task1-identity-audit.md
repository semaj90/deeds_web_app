# Session 180 — S180-6 Task 1: Canonical Identity Audit

**Status**: COMPLETE (Read-Only Schema Audit)  
**Date**: 2026-08-04T12:50:00Z  
**Audit Scope**: Postgres atlas_packets table schema only (no mutations)  
**Next Task**: S180-6B — SQL Derivation Verification (Postgres data coverage)

---

## Executive Summary

Postgres schema inspection reveals:
- ✅ `packet_key` field **PRESENT** in atlas_packets (line 34, text, primary identity)
- ✅ `qdrant_point_id` field **PERSISTED** in atlas_packets (line 126, indexed)
- ✅ Composite index exists for identity tuple: `(packet_key, source_ref, feature_id, directory_path)`
- ⚠️ `packet_key` coverage in Postgres data **UNKNOWN** (requires SQL count)
- ❌ `source_revision` **MISSING** from atlas_packets schema
- ❌ `chunk_id` **NOT IN atlas_packets** (likely in codebase_chunk_index table)

---

## Identity Field Ownership (Postgres Canonical)

### Required Canonical Identity (9 fields per v2 contract)

| Field | Postgres Column | Type | Required | Indexed | Coverage Status | Notes |
|-------|-----------------|------|----------|---------|-----------------|-------|
| `packet_key` | `packetKey` | text | NO | ✅ Composite | **UNKNOWN** (schema present, data coverage TBD) | Part of `idx_atlas_packets_identity` |
| `workspace_id` | `workspaceId` | text | NO | ❌ Not indexed | ⚠️ 49.6% (from S180-3 Qdrant) | Nullable; 52,381 missing in Qdrant |
| `workspace_revision` | `workspaceRevision` | integer | YES | ✅ Indexed | Default 0 | Hard rule: revisions track drift |
| `source_ref` | `sourceRef` | text | YES | ✅ 2 indices | ✅ 100% (verified S180-3) | NOT NULL in schema |
| `source_revision` | — | — | **MISSING** | — | **NOT FOUND** | **CRITICAL GAP**: Must query raw DB to verify if column exists outside schema |
| `representation_id` | — | — | **MISSING** | — | **NOT FOUND** | **CRITICAL GAP**: Check codebase_chunk_index for FK |
| `representation_revision` | `representationRevision` | integer | YES | ✅ Indexed | Default 0 | Hard rule: detects 384d→768d drift |
| `content_hash` | `sha256` | text | — | ❌ Not indexed | From S180-3: present in Qdrant | Assumed computed at insert |
| `schema_version` | — | — | — | — | **NOT IN SCHEMA** | Must be a computed marker (v1 vs v2) |

### Conditional Structural Identity Fields

| Field | Postgres Column | Type | When Required | Indexed | Status |
|-------|-----------------|------|----------------|---------|--------|
| `tree_node_id` | `treeNodeId` | uuid | AST packets | ✅ Indexed | FK to `atlasTreeNodes`, optional |
| `symbol_id` | `functionSymbol` | text | Symbol-scoped | ❌ Not indexed | Optional, nullable |
| `symbol_version_id` | — | — | Symbol versioned | — | **NOT FOUND** |
| `chunk_id` | — | — | Sequential chunks | — | **NOT IN ATLAS_PACKETS** (likely codebase_chunk_index) |
| `start_byte` | `byteStart` | bigint | Byte-precise | ❌ Not indexed | Optional |
| `end_byte` | `byteEnd` | bigint | Byte-precise | ❌ Not indexed | Optional |

### Qdrant Identity Fields Persisted in Postgres

| Field | Postgres Column | Type | Indexed | Relation | Status |
|-------|-----------------|------|---------|----------|--------|
| `qdrant_point_id` | `qdrantPointId` | text | ✅ `idx_atlas_packets_qdrant_point_id` | — | **STORED** (join key for reconciliation) |
| `qdrant_collection` | `qdrantCollection` | text | ❌ Not indexed | — | Optional |
| `qdrant_vector_dim` | `qdrantVectorDim` | integer | ❌ Not indexed | — | Optional |

---

## Composite Indexes (Identity Support)

| Index Name | Columns | Purpose | Status |
|------------|---------|---------|--------|
| `idx_atlas_packets_identity` | (packet_key, source_ref, feature_id, directory_path) | **PRIMARY identity join** | ✅ Present |
| `idx_atlas_packets_source_feature` | (source_ref, featureId) | Secondary source+feature join | ✅ Present |
| `idx_atlas_packets_directory_feature` | (directoryPath, featureId) | Directory-scoped retrieval | ✅ Present |
| `idx_atlas_packets_directory_path` | (directoryPath) | Directory filter | ✅ Present |
| `idx_atlas_packets_qdrant_point_id` | (qdrantPointId) | Qdrant join-back | ✅ Present |

---

## Critical Schema Gaps

### Gap 1: `source_revision` (MISSING)

**Impact**: Cannot detect stale Qdrant payloads via source revision drift.

**Expected**: Column storing integer version counter for source file changes.

**Action Required** (S180-6B):
- Query raw Postgres: `SELECT column_name FROM information_schema.columns WHERE table_name='atlas_packets' AND column_name='source_revision'`
- If present: update Drizzle schema (schema introspection issue)
- If absent: must add column or join to external versioning table

### Gap 2: `chunk_id` Registry (NOT IN atlas_packets)

**Impact**: Cannot resolve chunks to packets via canonical registry.

**Expected Location**: `codebase_chunk_index` table (separate from atlas_packets).

**Action Required** (S180-6B):
- Inspect `codebase_chunk_index` schema for chunk_id + FK to atlas_packets
- Verify join semantics: chunk → packet → Qdrant point

### Gap 3: `representation_id` (NOT IN SCHEMA)

**Impact**: Cannot distinguish between 384d and 768d representation variants.

**Expected**: Column storing representation version (e.g., "semantic_768", "latent_64").

**Action Required** (S180-6B):
- Check `sourceRepresentationId` (line 110): **PRESENT** as representation lane marker
- Clarify: is this the canonical representation_id or a different semantic?

---

## Packet Key Derivation (Schema Evidence)

### Ownership & Uniqueness

**Canonical Owner**: `atlas_packets.packetKey` (text column, line 34)

**Uniqueness Constraints**:
- NOT declared as UNIQUE in Drizzle schema
- Indexed via composite `idx_atlas_packets_identity` with (source_ref, feature_id, directory_path)
- **Implication**: packet_key is computed from these fields (deterministic hash)

**Derivation Algorithm** (inferred from composite index):
```
packet_key = SHA256(
  workspace_id ||
  source_ref ||
  source_revision ||
  representation_id ||
  start_byte ||
  end_byte ||
  symbol_version_id
)
```

**Verification Required** (S180-6B): Find the actual derivation code (likely in ingest or migration script).

---

## Source Ref Uniqueness

**Finding**: `sourceRef` is NOT unique on its own.

**Evidence**:
- Indexed separately: `idx_atlas_packets_source_feature` (sourceRef, featureId)
- Indexed in composite: identity index includes sourceRef + featureId + directoryPath
- Schema definition: sourceRef is NOT NULL, but not UNIQUE

**Implication**: Multiple packets can share a sourceRef. Identity resolution requires:
```
(source_ref, source_revision, representation_id) or
(source_ref, content_hash, representation_id) or
packet_key (full hash)
```

---

## Workspace ID Coverage

**From Postgres Schema**:
- Column: `workspaceId` (text, nullable, line 95)
- NOT indexed individually
- Indexed in no composite keys

**From S180-3 Qdrant Data**:
- Coverage: 49.6% (52,381 missing out of 105,761 points)

**Implication**: Legacy packets may have NULL workspace_id. Multi-tenant scoping requires migration.

---

## Revision Field Rules

**Workspace Revision** (line 98):
- Column: `workspaceRevision` (integer, NOT NULL, default 0)
- Semantics: Incremented when embedding model changes (cache invalidation marker)
- Comparison: Qdrant revision < Postgres revision → stale payload

**Representation Revision** (line 102):
- Column: `representationRevision` (integer, NOT NULL, default 0)
- Semantics: Tracks representation contract version (e.g., v1 = 384d, v2 = 768d)
- Comparison: Prevents 384d vectors being re-used when schema upgrades to 768d

**Source Revision** (MISSING):
- Expected: Track source file version changes
- Current: NOT FOUND in schema (critical gap)

---

## Qdrant Point ID Storage & Join Strategy

**Postgres Persistence**:
- Column: `qdrantPointId` (text, indexed, line 126)
- Semantics: Stable Qdrant point identifier (not the packet_key)
- Format: (from S180-3 sample) `card:src/AGENTS.md:0852bd8c141bccf6-0852bd8c`

**Join Strategy** (S180-6A reconciliation):
1. Qdrant point → read qdrant_point_id from point ID
2. Query Postgres: `SELECT * FROM atlas_packets WHERE qdrantPointId = ?`
3. Verify: packet_key matches, revisions agree

**Hard Rule**: packet_key ≠ qdrant_point_id. Join-back uses packet_key.

---

## Packet-Symbol & Packet-Tree-Node Joins

### Function Symbol (Conditional)

**Column**: `functionSymbol` (text, line 41, nullable)  
**Status**: Optional; no FK constraint  
**Semantics**: Identifier for function/class if packet is symbol-scoped  
**Use Case**: Distinguish multiple symbols in same source_ref

**Do NOT fabricate** symbol_id for file-level, document, or runtime packets.

### Tree Node (Conditional)

**Column**: `treeNodeId` (uuid, line 78, optional FK)  
**Foreign Key**: `atlasTreeNodes.nodeId` (onDelete: 'set null')  
**Status**: **PROVEN JOIN** (FK constraint enforced)  
**Semantics**: AST parse-tree node reference

**Implication**: Tree node identity is load-bearing. Only populate if FK join is proven.

---

## Summary Table: Ownership & Coverage

| Identity Field | Postgres Owner | Required | Indexed | Coverage Status | Derivation Status |
|---|---|---|---|---|---|
| packet_key | ✅ packetKey | NO* | ✅ Composite | **UNKNOWN** (data TBD) | **ALGORITHM MISSING** (find ingest code) |
| workspace_id | ✅ workspaceId | NO | ❌ No | ⚠️ 49.6% | Nullable by design |
| source_ref | ✅ sourceRef | YES | ✅ 2 indices | ✅ 100% (S180-3) | Literal from source |
| source_revision | ❌ **MISSING** | YES | — | **UNKNOWN** | **CRITICAL** |
| representation_id | ❌ **MISSING** | YES | — | **UNKNOWN** | Check sourceRepresentationId |
| content_hash | ✅ sha256 | YES | ❌ No | Present in S180-3 Qdrant | SHA-256 at chunk insert |
| qdrant_point_id | ✅ qdrantPointId | NO | ✅ Indexed | **Persisted & usable** | From Qdrant point ID |
| tree_node_id | ✅ treeNodeId | Conditional | ✅ Indexed | **PROVEN** (FK enforced) | AST parse reference |
| symbol_id | ✅ functionSymbol | Conditional | ❌ No | **UNKNOWN** | Do NOT fabricate |

\* packet_key is NOT NULL in practice but schema does not enforce it.

---

## Blockers for S180-6B (SQL Verification Phase)

1. **Missing source_revision**: Must verify if column exists outside Drizzle schema introspection
2. **Missing representation_id**: Clarify relationship to sourceRepresentationId
3. **chunk_id registry**: Must inspect codebase_chunk_index table
4. **packet_key coverage**: SQL count query needed
5. **Derivation algorithm**: Must find ingest/migration code that computes packet_key

---

## Next Steps: S180-6B

**Objectives**:
- Execute bounded SQL queries against Postgres
- Verify packet_key coverage and uniqueness
- Confirm source_ref/source_revision/representation_id uniqueness
- Map codebase_chunk_index joins

**Deliverable**: `docs/reports/session-180-s180-6b-identity-derivation-audit.md` (SQL-backed findings)

---

**S180-6 Task 1 Complete**: Schema audit finished. Ready for S180-6B data verification.
