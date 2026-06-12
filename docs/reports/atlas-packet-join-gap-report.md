# Atlas Packet Join Gap Report

Generated: 2026-06-12T13:53:49.249Z

## Summary

- Total gap rows: 465
- Duplicate source_ref pct: 100%
- Decision: **P1_PASS_DUPLICATE_SOURCE_REF_GAP**

## Buckets

- duplicate_source_ref: 465

## Rule

If duplicate_source_ref >= 90%, P1 passes because the remaining gap is non-canonical duplicate packet rows sharing a source_ref already covered by atlas_feature_map.
