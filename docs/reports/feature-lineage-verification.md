# Feature Lineage Verification Report

**Generated**: 2026-06-13T19:40:22.494Z
**Status**: ✅ PASSED

## Summary

| Metric | Value |
|--------|-------|
| Total Gates | 16 |
| Passed | 16 |
| Failed | 0 |
| Warnings | 1 |

## Gate Results

### ✅ G0a: Postgres atlas_packets reachable

8822 packets in atlas_packets

### ✅ G0b: No missing source_ref

0 packets missing source_ref (of 8822)

### ✅ G0c: No missing feature_id

0 packets missing feature_id (of 8822)

### ✅ G0d: feature_label in payload

0/8822 packets missing payload.feature_label (warn if >50%)

### ✅ G0e: No missing packet_key

0 packets missing packet_key (of 8822)

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

