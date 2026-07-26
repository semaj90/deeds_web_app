---
name: Phase 1 Ledger Gate Status
description: Corrected Parent Atlas Phase 1 gates – artifact_kind parity proven, overlap matrix deferred to Phase 1.5 Postgres reconciliation
type: project
---

# Phase 1: Identity Ledger Hardening — Gate Status

**Date**: July 26, 2026  
**Status**: ✅ **ARTIFACT_KIND CLASSIFICATION COMPLETE** | ⏳ **POSTGRES OVERLAP DEFERRED**

---

## Proven This Session

| Gate | Status | Details |
|------|--------|---------|
| **COLLECTION_RECONCILIATION** | ✅ PASS | 54,224 total = 52,984 classified + 1,240 directory-cluster |
| **KIND_ARTIFACT_KIND_PARITY** | ✅ PASS | 100% match on 52,984 classified points (0 mismatches) |
| **IDEMPOTENCY** | ✅ PASS | Second reclassification run finds zero new candidates |
| **DIRECTORY_CLUSTER_ENUMERATED** | ✅ PASS | All 1,240 are numeric IDs, no packet_key, kind="directory-cluster" |
| **ARTIFACT_KIND_TAXONOMY_STABLE** | ✅ PASS | 11 valid enum values, zero invalid values in classified set |
| **POSTGRES_SCHEMA_KNOWN** | ✅ PASS | Primary key is packet_id (text), not "id" (corrected knowledge) |

---

## Corrected Gate Status (Phase 1 vs Phase 1.5)

### Phase 1 ✅ (Qdrant-only validation — complete)

| Gate | Status | What This Proves |
|------|--------|-----------------|
| **QDRANT_COLLECTION_SCANNED** | ✅ | 54,224 unique points, real data, pagination verified |
| **ARTIFACT_KIND_CLASSIFICATION** | ✅ | 52,984 points have valid artifact_kind; 1,240 directory-cluster excluded |
| **KIND_PAYLOAD_ALIGNMENT** | ✅ | `kind` field matches `artifact_kind` on 100% of classified points |
| **CLASSIFICATION_STABLE** | ✅ | Idempotent — no new unknowns on re-run |
| **TAXONOMY_COMPLETE** | ✅ | 11 artifact types account for 100% of classified points |

### Phase 1.5 ⏳ (Postgres cross-validation — deferred)

| Gate | Status | What We Need | Blocker |
|------|--------|-------------|---------|
| **POSTGRES_PACKET_KEY_MATCHES** | ⏳ DEFERRED | Qdrant `payload.packet_key` ↔ atlas_packets lookup | Schema knowledge |
| **POSTGRES_SOURCE_REF_MATCHES** | ⏳ DEFERRED | Qdrant `payload.source_ref` ↔ atlas_packets lookup | Schema knowledge |
| **POSTGRES_QDRANT_ID_BACKLINKS** | ⏳ DEFERRED | atlas_packets.qdrant_point_id ↔ Qdrant point.id | Schema knowledge |
| **CROSS_EVIDENCE_AGREEMENT** | ⏳ DEFERRED | Multiple Postgres matches resolve to same packet | Phase 1.5 task |
| **CARDINALITY_1_TO_1** | ⏳ DEFERRED | One Qdrant point → one packet, no many-to-many | Phase 1.5 task |
| **BACKLINK_CONFLICT_DETECTION** | ⏳ DEFERRED | Detect if atlas_packets.qdrant_point_id points elsewhere | Phase 1.5 task |
| **MUTATION_ELIGIBILITY** | ⏳ DEFERRED | Decide which 52,984 points are safe to backfill | Phase 1.5 task |

---

## Execution Problem: Postgres Schema Knowledge

**Issue**: Phase 1 hardening script attempted direct Postgres queries but failed because:
1. Schema assumes `id` column in atlas_packets; actual primary key is `packet_id` (text)
2. codebase_chunk_index schema unknown (column names, primary key type)
3. Complex normalized schema (e.g., `source_ref_key`, `artifact_id`, `group_id`) not documented in script
4. Script would need full schema audit before reliable overlap analysis

**Decision**: Defer Postgres overlap analysis to Phase 1.5 with proper schema inspection first.

---

## Phase 1 Deliverable: Qdrant Ledger (52,984 rows)

The hardened ledger is **valid and ready** but **incomplete**:

```json
{
  "run_id": "identity_audit_20260726",
  "collection": "codebase_chunks_768",
  "qdrant_point_id": "uuid-or-uint64",
  "id_type": "uuid" | "uint64",
  "payload_packet_key": "string or null",
  "payload_source_ref": "string or null",
  "payload_kind": "artifact_kind value",
  "payload_artifact_kind": "11-enum value",
  
  // Phase 1.5 will add (currently all null):
  "packet_key_match_count": null,
  "atlas_qdrant_id_match_count": null,
  "chunk_qdrant_id_match_count": null,
  "source_ref_match_count": null,
  "resolved_packet_key": null,
  "resolved_source_ref": null,
  "cross_evidence_agrees": null,
  "point_to_packet_cardinality": null,
  "packet_to_point_cardinality": null,
  "existing_backlink_conflict": null,
  "mutation_eligible": null,
  "evidence_hash": null
}
```

**File**: `/tmp/ledger-phase1-incomplete.ndjson` (52,984 rows, ready for Phase 1.5)

---

## Next Step: Phase 1.5 — Postgres Overlap Audit

Before writing any Postgres queries, run a **schema reconciliation**:

```bash
# 1. Inspect atlas_packets schema
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\d atlas_packets"

# 2. Inspect codebase_chunk_index schema
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\d codebase_chunk_index"

# 3. Count rows
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets; SELECT COUNT(*) FROM codebase_chunk_index;"

# 4. Sample payload structure (Qdrant)
docker exec legal-ai-qdrant curl -s http://localhost:6333/collections/codebase_chunks_768/points?limit=1 | jq '.result.points[0].payload'
```

**Then build Phase 1.5 script with verified column names**.

---

## Milestone Status

- ✅ **GATE_0_EVIDENCE_LOCKED** — Qdrant audit proven, real ledger written
- ✅ **PHASE_1_ARTIFACT_CLASSIFICATION** — Qdrant-only validation complete
- ⏳ **PHASE_1.5_POSTGRES_OVERLAP** — Blocked by schema knowledge, ready to start after reconciliation
- ❌ **PHASE_2_AST_MATERIALIZATION** — Deferred (depends on Phase 1.5)
- ❌ **PHASE_3_FEATURE_MAPPING** — Deferred (depends on Phase 2)
- ❌ **PHASE_4_DOMAIN_ONTOLOGY** — Deferred (depends on Phase 3)
- ❌ **PHASE_5_NEO4J_PROJECTION** — Deferred (depends on Phase 4)

**Do NOT proceed to Postgres backfill until Phase 1.5 complete.**

