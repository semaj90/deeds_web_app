# Session 180 — S180-4: Qdrant Payload v2 Contract Definition

**Status**: COMPLETED
**Date**: 2026-08-04T12:30:00Z
**Evidence Basis**: S180-3 Qdrant Payload Inventory Audit

---

## Summary

S180-4 defines the canonical Qdrant payload v2 contract for the `codebase_chunks_768` collection. Contract is based on S180-3 evidence: 105,761 points, 100% source_ref coverage, 49.6% workspace_id coverage, packet_key missing from schema.

**Deliverables**:
1. ✅ `docs/contracts/qdrant-payload-v2.schema.json` — formal JSON schema
2. ✅ `docs/contracts/qdrant-payload-v2.md` — identity rules, migration classifications, rollback contract
3. ✅ `docs/reports/session-180-s180-4-payload-v2-contract.md` — this report

---

## Contract Structure

### Required Canonical Identity (9 fields)

Must be present and non-empty in every v2 payload:
- `packet_key` (SHA-256 hash of identity tuple)
- `workspace_id` (multi-tenant scope)
- `workspace_revision` (version counter)
- `source_ref` (source file path)
- `source_revision` (source version)
- `representation_id` (chunk variant)
- `representation_revision` (variant version)
- `content_hash` (SHA-256 of content)
- `schema_version` (string: "atlas-qdrant-payload-v2")

### Conditional Structural (6 fields)

Required only when chunk has structural metadata:
- `tree_node_id`, `symbol_id`, `symbol_version_id`
- `chunk_id`, `start_byte`, `end_byte`

### Optional Enrichment (11 fields)

Never used for identity, safe to be sparse:
- Semantic: `feature_id`, `feature_label`
- Graph: `pagerank`, `pagerank_score`, `som_cell`, `community_id`, `authority_score`
- Ranking: `rerank_score`
- Migration: `migration_id`, `migration_batch_id`, `migrated_at`, `migration_source`, `rollback_identifier`

---

## Identity Rules

| Rule | Constraint | Enforcement |
|------|-----------|-------------|
| PostgreSQL is authoritative | All identity fields sourced from Postgres | Qdrant used as mirror only |
| packet_key ≠ point_id | Qdrant point_id is projection, not identity | Join back uses packet_key |
| source_ref alone insufficient | Multiple revisions/representations share source_ref | Use full tuple or packet_key |
| No semantic reconciliation | High similarity ≠ identity match | Only deterministic fields count |
| Revision drift detection | workspace/source/representation revisions are drift indicators | Compare Qdrant < Postgres = stale |

---

## Migration Classifications (7 categories)

Every point classified as one of:

| Category | Condition | Risk | Action |
|----------|-----------|------|--------|
| RECONCILABLE | Unique Postgres row + matching identity | LOW | Safe to keep/backfill |
| AMBIGUOUS | Multiple Postgres rows for source_ref | HIGH | BLOCKED, manual review |
| MISSING_POSTGRES_ROW | No Postgres row for packet_key | HIGH | BLOCKED, Postgres restore needed |
| STALE_REVISION | Qdrant revision < Postgres | LOW | Safe to backfill (update) |
| CONFLICTING_IDENTITY | Identity fields mismatch or unknown revision | HIGH | BLOCKED, investigation |
| INSUFFICIENT_IDENTITY | Missing required identity field | HIGH | BLOCKED, populate field |
| ALREADY_V2 | schema_version = v2 | NONE | No action |

---

## Rollback Contract

**Before any write to Qdrant:**

1. Insert rollback record to Postgres:
   - `collection_name`: "codebase_chunks_768"
   - `qdrant_point_id`: Qdrant ID
   - `previous_payload_hash`: SHA-256 of old payload
   - `previous_payload_json`: Full snapshot (immutable)
   - `new_payload_hash`: SHA-256 of new payload
   - `migration_batch_id`: Batch tag
   - `canonical_postgres_packet_key`: Deterministic identity
   - `recorded_at`: ISO timestamp

2. Rollback execution:
   - Query rollback_log by migration_batch_id
   - Upsert each point with previous_payload_json
   - Verify Qdrant == Postgres after rollback

---

## S180-5 Input Contract (Dry-Run Reconciliation)

S180-5 reads these fields from Postgres (10-row sample):
- packet_key, workspace_id, workspace_revision
- source_ref, source_revision, representation_id
- content_hash, schema_version

For each row:
1. Query Qdrant by packet_key (exact match, read-only)
2. Retrieve one point (0 or 1)
3. Compare all identity fields
4. Classify: RECONCILABLE | AMBIGUOUS | MISSING | STALE | CONFLICTING | INSUFFICIENT | ALREADY_V2

Output:
- JSON: matrix of 10 packets × classifications
- Markdown: summary counts, gate decision
- No writes, no mutations

Gate decision:
- ≥80% RECONCILABLE → PASS
- <80% but all STALE_REVISION → PARTIAL_PROVEN (safe backfill)
- Any CONFLICTING/INSUFFICIENT → BLOCKED

---

## Data Evidence (from S180-3)

| Metric | Value | Status |
|--------|-------|--------|
| Collection | codebase_chunks_768 | ✅ Exists |
| Total points | 105,761 | Confirmed |
| source_ref coverage | 100% | ✅ Complete |
| workspace_id coverage | 49.6% | ⚠️ Partial (52,381 missing) |
| packet_key in schema | NOT FOUND | ❌ Critical gap |
| workspace_revision in schema | NOT FOUND | ❌ Critical gap |
| source_revision in schema | NOT FOUND | ❌ Critical gap |
| content_hash in schema | NOT FOUND | ❌ Critical gap |

**Backfill required**: packet_key, workspace_id (52K rows), workspace_revision, source_revision, content_hash must be populated before Phase 5A.

---

## Verification Gates (S180-4)

| Gate | Check | Result |
|------|-------|--------|
| Schema defined | JSON schema complete | ✅ PASS |
| Identity fields documented | 9 required fields listed | ✅ PASS |
| Structural fields documented | 6 conditional fields listed | ✅ PASS |
| Enrichment fields documented | 11 optional fields marked non-canonical | ✅ PASS |
| Identity rules documented | 5 hard constraints specified | ✅ PASS |
| Revision rules documented | Drift detection logic defined | ✅ PASS |
| Migration classifications defined | 7 categories with risk levels | ✅ PASS |
| Rollback contract specified | Postgres log table schema | ✅ PASS |
| S180-5 input contract specified | 10-packet dry-run interface | ✅ PASS |

---

## Blocking Issues (For Phase 5A Entry)

1. **packet_key missing from Qdrant schema**
   - Must be backfilled from Postgres deterministic tuple
   - Without packet_key, Qdrant→Postgres join is ambiguous

2. **workspace_id 49.6% populated**
   - 52,381 points lack workspace scope
   - Multi-tenant queries will miss half the data

3. **Revision fields missing**
   - workspace_revision, source_revision, representation_revision all absent
   - Cannot detect stale payloads

4. **Real retrieval lanes NOT_PROVEN**
   - prepare-patch-context handler uses mock lanes only
   - MCP registration not yet confirmed (S180-2 BLOCKED)

---

## Status Summary

```
S180_1_COMPILE_AND_TESTS                PASS
S180_2_MCP_REGISTRATION                 NOT_PROVEN
S180_3_QDRANT_PAYLOAD_INVENTORY         PARTIAL_PROVEN (inventory complete, gaps documented)
S180_4_PAYLOAD_V2_CONTRACT              PASS
S180_4_SCHEMA_DEFINITION                PASS
S180_4_IDENTITY_RULES                   PASS
S180_4_MIGRATION_CLASSIFICATIONS        PASS
S180_4_ROLLBACK_CONTRACT                PASS
S180_5_INPUT_CONTRACT                   PASS
S180_5_READINESS                        BLOCKED (awaiting smoke test)
PHASE_5A_READINESS                      BLOCKED (real retrieval lanes NOT_PROVEN)
```

---

## Next Steps

**S180-5: Bounded Dry-Run Reconciliation**
- Use `scripts/validate/run-s180-step5-smoke.ps1` + `s180-step5-smoke.mjs`
- Sample 10 Postgres packets
- Classify into 7 migration categories
- Write reports to `docs/reports/session-180-step5-smoke-*.{json,md}`
- Do NOT perform mutations

**Outcome determines**:
- Backfill readiness (S180-6)
- Phase 5A entry gate (S180-7)
- Orphan reconciliation scope (Phase 5A proper)

---

**S180-4 Complete**: Payload v2 contract defined. All identity rules, revision rules, migration classifications, and rollback strategy documented. Ready for S180-5 smoke validation.

