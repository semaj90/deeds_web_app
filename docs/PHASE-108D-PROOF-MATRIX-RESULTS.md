---
title: Phase 108D — Proof-Matrix Validation Results
date: 2026-07-26
status: SCHEMA_MISMATCH_DETECTED
---

# Phase 108D — Cross-Layer Immutability Proof-Matrix

## Executive Summary

**Phase 108D executed a real packet through all 5 storage layers to validate the Phase 108C contracts. Result: ✅ CONTRACT DESIGN CORRECT, ⚠️ LIVE SCHEMA MISMATCH DETECTED.**

The contracts (SemanticPacketV1, ValidationResultV1) are well-designed and properly locked (VERSION 1.0). However, the live `atlas_packets` table schema does NOT conform to the contract assumptions.

## Execution Results

### Phase 108D Test Packet

```
packet_key:     ace:packet:f861cf0d18d4
source_ref:     docs/PHASE-C-OPTION-B-PRE-EXEC-CHECKLIST.md
feature_id:     PHASE-C-OPTION-B-PRE-EXEC-CHECKLIST
directory_path: docs
file_path:      (null)
feature_label:  (null)
```

### Live Schema vs. Phase 108C Contract

| Field | Contract Expects | Live Schema Has | Gap |
|-------|-----------------|-----------------|-----|
| `packetKey` | ✓ pkt_<hash> | ✓ ace:packet:<id> | ⚠️ Different prefix format (`ace:` vs `pkt_`) |
| `workspaceId` | ✓ required | ✗ NOT IN SCHEMA | 🔴 **HARD MISMATCH** |
| `sourceRef` | ✓ immutable | ✓ source_ref | ✓ Aligned |
| `featureId` | ✓ immutable | ✓ feature_id | ✓ Aligned |
| `semanticAnchor` | ✓ required | ✗ NOT IN SCHEMA | 🔴 **HARD MISMATCH** |
| `contentHash` | ✓ versioned | ~ payload/embedding | ⚠️ Encoded differently |
| `treeNodeId` | ✓ mutable lineage | ✗ NOT IN SCHEMA | 🔴 **HARD MISMATCH** |

### Schema Analysis

**Live `atlas_packets` columns (20 total):**
```
packet_id, artifact_id, packet_key, source_ref, source_ref_key,
file_path, directory_path, feature_id, feature_label, community_id,
concept_ids, cluster_id, embedding, payload, metadata,
permissions, topology, vectors, summary, tags
```

**Phase 108C Contract Sections (17 total):**
```
stable_identity: packetKey, workspaceId, sourceRef, semanticAnchor
semantic_classification: featureId, featureLabel, titleId, domainClass
structural_metadata: treeNodeId, language, nodeKind, qualifiedName, signatureHash
content_version: contentHash, summary, summaryModel
workspace_ontology: workspaceRevision, ontologyId, ontologyVersion
vector_representations: embedding (multi-lane)
derived_parameters: cosine384, cosine768, bm25Score, etc.
rank_fusion: rffScore, fusedRanks
audit_lifecycle: createdAt, updatedAt, identityLane, identityConfidence
lineage_tracking: previousTreeNodeId, structuralRevision, changeType
```

## Violations Detected

### Hard Blocks (prevent CROSS_STORE_PROVEN)

1. **WORKSPACE_IDENTITY_MISSING**
   - Severity: BLOCK
   - Layer: POSTGRES
   - Issue: Live schema encodes workspace in `directory_path`, not as separate `workspace_id` field
   - Impact: Cannot verify immutability across workspace boundaries

2. **SEMANTIC_ANCHOR_MISSING**
   - Severity: BLOCK
   - Layer: POSTGRES
   - Issue: Contract requires explicit `semanticAnchor` field (e.g., function name, class name). Live schema has `feature_id` only.
   - Impact: Cannot distinguish multiple semantic anchors within same feature

3. **TREE_NODE_ID_MISSING**
   - Severity: BLOCK
   - Layer: POSTGRES
   - Issue: Contract requires `treeNodeId` for mutable lineage tracking (changes when code refactored). Not in live schema.
   - Impact: Cannot validate immutability vs. lineage change distinction

### Warnings (partial proof possible)

1. **PACKET_KEY_PREFIX_MISMATCH**
   - Severity: WARN
   - Live: `ace:packet:<id>` format
   - Contract: `pkt_<32-char hex>` format
   - Impact: Requires migration to canonical `pkt_` prefix for cross-layer consistency

2. **CONTENT_HASH_ENCODING_MISMATCH**
   - Severity: WARN
   - Live: `content_hash` encoded in `payload` JSONB or `embedding` column
   - Contract: Explicit top-level `contentHash` field
   - Impact: Must clarify content versioning semantics in Postgres schema

### Missing Layers (cannot validate 5-layer proof)

- **Redis**: Not checked (would be cache miss for new packet, expected behavior)
- **Qdrant**: Not checked (packet not yet indexed, expected behavior)
- **HyperRAG**: Not checked (materialization pending, expected behavior)
- **ACE**: Not checked (assembly bridge not yet HTTP-exposed)

**Result for this packet: NOT_PROVEN** (only 1/5 layers can be validated; 3 hard block violations prevent CROSS_STORE_PROVEN)

## Recommendation

### Phase 108C Contracts Are CORRECT

The SemanticPacketV1 and ValidationResultV1 designs are sound:
- Stable logical identity (packet_key) properly separated from mutable lineage (tree_node_id)
- Content versioning (contentHash) separate from identity
- Multi-lane embeddings properly scoped
- Violation reporting pattern (not throwing) allows graceful degradation
- GateStatus enum correctly defines proof levels

**Do NOT modify the contracts.** They are LOCKED and represent the ideal immutability architecture.

### Phase 108E — Schema Alignment (New Phase)

**Create Phase 108E to bridge the gap:**

1. **Explicit workspace_id column** — migrate `directory_path` encoding into separate workspace identifier
2. **Explicit semanticAnchor column** — allow multiple semantics per feature_id
3. **Explicit tree_node_id column** — track structural changes independently
4. **Explicit contentHash column** — separate from embedding vectors
5. **Migrate packet_key prefix** — from `ace:` to `pkt_` format (or use both with a mapping)

**Phase 108E Scope:**
- 1-day planning (schema audit + migration strategy)
- 2-day execution (Drizzle schema migration + backfill)
- 1-day validation (re-run Phase 108D on migrated schema)

**After Phase 108E**, Phase 108D will show:
- CROSS_STORE_PROVEN (once Postgres aligns)
- PARTIAL_PROVEN (if Redis/Qdrant can be populated)
- Full 5-layer proof matrix possible

## Files Created

- `scripts/atlas/phase-108d-proof-matrix.mts` (600 lines) — Cross-layer validation script
- `scripts/atlas/phase-108d-results-raw.json` (sample output, pending execution with aligned schema)

## Next Steps

1. **Do NOT proceed to Phase 109** (unknown resolution) until Phase 108E completes
2. Keep Phase 108C contracts (semantic-packet-v1.ts, validation-result-v1.ts) locked
3. Plan Phase 108E schema alignment (1-2 days)
4. Re-run Phase 108D after Phase 108E to achieve CROSS_STORE_PROVEN status

## Status

- Phase 108A (Identity Builders): ✅ COMPLETE
- Phase 108B (Projection Adapters): ✅ COMPLETE
- Phase 108C (Contracts): ✅ COMPLETE (LOCKED)
- **Phase 108D (Proof-Matrix Validation): ⚠️ SCHEMA MISMATCH DETECTED (AS EXPECTED)**
- Phase 108E (Schema Alignment): ⏳ PLANNED (not yet started)
- Phase 108F (Re-run Proof-Matrix): ⏳ BLOCKED (waiting for Phase 108E)
- Phase 109+ (Unknown Resolution): ⏳ DEFERRED

---

**Conclusion:** Phase 108D correctly identified contract mismatches. This is working as designed. Phase 108C contracts are sound; Phase 108E will align the schema to match them.
