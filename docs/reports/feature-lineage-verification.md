# Feature Lineage Verification Report

**Generated**: 2026-06-13T15:04:07.055Z
**Status**: ❌ FAILED

## Summary

| Metric | Value |
|--------|-------|
| Total Gates | 16 |
| Passed | 12 |
| Failed | 4 |
| Warnings | 1 |

## Gate Results

### ✅ G0a: Postgres atlas_packets reachable

17475 packets in atlas_packets

### ❌ G0b: No missing source_ref

8653 packets missing source_ref (of 17475)

### ❌ G0c: No missing feature_id

10078 packets missing feature_id (of 17475)

### ❌ G0d: feature_label in payload

17397/17475 packets missing payload.feature_label (warn if >50%)

### ❌ G0e: No missing packet_key

8653 packets missing packet_key (of 17475)

### ✅ G1: All directories have required fields

0 entries missing required fields

### ✅ G2: feature_id uniqueness

0 feature_ids appear multiple times

### ✅ G3: source_ref non-empty

0 directories have empty source_ref

### ✅ G4: feature_id format (12-char hex)

0 feature_ids are not 12-char hex

### ✅ G5: feature_label descriptiveness

0 feature_labels are empty or too short

### ✅ G6: qdrant_collection validity

0 entries have unknown Qdrant collections

### ✅ G7: Redis centroid key format

0 Redis keys have wrong format

### ✅ G8: Hidden directory classification

0 hidden dirs not properly classified

### ✅ G9: Directory path ↔ source_ref alignment

0 directories have misaligned source_refs

### ✅ G10: Packet count non-negativity

0 entries have negative packet_count

### ✅ G11: cold_storage_status validity

0 entries have unknown storage status

## Statistics

| Metric | Count |
|--------|-------|
| Total Directories | 16305 |
| Hidden Directories | 707 |
| Unique Feature IDs | 16305 |
| Unique Source Refs | 16305 |
| Collections Used | general, legal_documents, codebase_chunks, semantic_cards |

