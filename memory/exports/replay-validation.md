# Atlas Replay Validation

Generated: 2026-06-19T23:21:22.767Z
Sample: 314 packets | Threshold: 95%

## Result: ✅ PASS

| Metric | Value |
|--------|-------|
| Replay rate | 96.2% (302/314) |
| sourceRefHash | 96.2% |
| feature_id | 98.4% |
| cluster_id (optional_reserved) | 0.0% |
| Qdrant found | 0/0 with qdrant_point_id |
| Qdrant aligned | 0 aligned, 0 misaligned |

## Check Details

- **sourceRefHash**: 302 pass / 12 fail — mandatory
- **feature_id**: 309 pass / 5 fail — mandatory
- **cluster_id**: 0 pass / 314 fail — optional_reserved — GPU cluster bridge not yet implemented
- **Qdrant lookup**: 0 found / 0 missing (of 0 eligible; 314 task-refs skipped)
- **feature_id alignment**: 0 aligned / 0 misaligned

## Failures

None.
