# Parent Atlas 1.0 Baseline Report

This document serves as the official "known-good" restore point baseline for **Parent Atlas 1.0**. All validation gates are fully satisfied and passing.

## Baseline Specifications

- **Git Commit SHA**: `3b153e0705c856c1158be94f2921d098102a487e`
- **Timestamp**: `2026-06-10T10:24:00-07:00`

---

## 📊 Core Metric Snapshot

### 1. Postgres Database
- **Table**: `atlas_feature_map`
  - Total Rows: `14,487`
  - Packet ID Coverage: `14,487` (`100.00%`)
- **Table**: `nes_chrom_packets`
  - Total Rows: `14,515`
  - Mismatches/Drift: `0`

### 2. Qdrant Semantic Store
- **Collection**: `codebase_chunks_768`
  - Total Points: `54,331`
  - Status: `green`
  - Stale Points: `0` (repaired / cleared)

### 3. Neo4j Topology Graph
- **CodebaseFile Nodes**: `31,543`
- **ParentAtlasFeature Nodes**: `1,701`
- **HAS_CENTROID Relationships**: `12,518`
- **SIMILAR_TOPOLOGY Relationships**: `170,809`

### 4. Redis/Valkey Cache
- **Redis LOD0 Source Keys**: `5,253` (`ace:source:*:lod0`)
- **Redis Dict Keys**: `6`
- **Lane Indexes**: `5`
- **Feature Indexes**: `1,559`

---

## 🏁 Completion Gate Summary Report

```text
==================================================
📊 PARENT ATLAS COMPLETION GATE SUMMARY REPORT
==================================================
  ✅ packet_id coverage >= 99.5%                        : 100.00%
  ✅ packet_id ↔ packet_key source_ref & feature_id match : 0 mismatches
  ✅ stale Qdrant Point IDs count (0 or fallback-repaired) : 0 stale points remaining (8 repaired)
  ✅ Neo4j CodebaseFile nodes exist                     : 31543 nodes
  ✅ Neo4j ParentAtlasFeature nodes exist               : 1701 nodes
  ✅ Neo4j HAS_CENTROID edges exist                     : 12518 edges
  ✅ Redis source cache hydrated                        : 5253 keys
  ✅ Contract Audit passes cleanly                      : PASS
  ✅ Multi-hop traversal smoke test                     : PASS
  ✅ Runtime telemetry packet replay smoke test         : PASS
--------------------------------------------------
  Completion Percentage: 100.0%

🎉 ALL GATES PASSED. Parent Atlas is 100% COMPLETE.
```
