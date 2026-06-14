# Qdrant Payload Contract Repair

**Timestamp**: 2026-06-14T21:01:36.122Z
**Mode**: APPLY
**Status**: WARN

## Collection

- **Name**: codebase_chunks_768

## Steps


### 1. verify_collection

**Status**: ok
- point_count: 52606


### 2. sample_coverage_before

**Status**: ok
- sampled: 200
- coverage: {"packet_key":179,"source_ref":200,"feature_id":200,"lineage_version":200}...


### 3. build_candidates

**Status**: ok
- candidate_count: 3251


### 4. match_candidates

**Status**: ok
- matched: 161
- no_source_ref: 0
- ambiguous: 16
- mismatches: [{"point_id":1937330,"source_ref":"sveltekit-frontend/src/routes/api/synthesis/generate/+server.ts",...


### 5. apply_repairs

**Status**: ok
- mode: APPLY
- applied_count: 161
- failure_count: 0


### 6. verify_repairs

**Status**: ok
- coverage_after: {"packet_key":179,"source_ref":200,"feature_id":200,"lineage_version":200}...


## Pass Condition

✅ packet_key coverage >=95%
✅ source_ref coverage >=99%
✅ lineage_version coverage >=95%
✅ Using official Qdrant payload endpoint

