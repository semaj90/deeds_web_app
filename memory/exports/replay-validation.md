# Atlas Replay Validation

Generated: 2026-06-10T14:13:42.702Z
Sample: 302 packets | Threshold: 95%

## Result: ✅ PASS

| Metric | Value |
|--------|-------|
| Replay rate | 100.0% (302/302) |
| sourceRefHash | 100.0% |
| feature_id | 100.0% |
| cluster_id (optional_reserved) | 0.0% |
| Qdrant found | 0/0 with qdrant_point_id |
| Qdrant aligned | 0 aligned, 0 misaligned |

## Check Details

- **sourceRefHash**: 302 pass / 0 fail — mandatory
- **feature_id**: 302 pass / 0 fail — mandatory
- **cluster_id**: 0 pass / 302 fail — optional_reserved — GPU cluster bridge not yet implemented
- **Qdrant lookup**: 0 found / 0 missing (of 0 eligible; 302 task-refs skipped)
- **feature_id alignment**: 0 aligned / 0 misaligned

## Failures

None.
