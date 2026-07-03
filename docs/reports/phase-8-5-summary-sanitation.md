# Phase 8.5: Summary Sanitation Report

**Mode**: dry-run
**Timestamp**: 2026-07-03T05:31:17.011Z

## Summary

- **Total scanned**: 500
- **Total contaminated**: 8 (1.6%)
- **Cleanable**: 3
- **Failed/Skipped**: 5

## Quality Results

| Status | Count | % |
|--------|-------|---|
| ✅ PASS | 2 | 66.7% |
| ⚠️ WARN | 1 | 33.3% |
| ❌ FAIL | 5 | 166.7% |

## Acceptance Gates

| Gate | Status | Details |
|------|--------|---------|
| Contamination rate < 2% | ✅ | 1.0% |
| Quality score > 0.8 | ❌ | Average quality score |
| No FAIL entries | ❌ | 5 failures |
| **Ready for Phase 9** | ❌ NO | All gates pass |

## Metrics

- **Before**: 242 chars avg, 1.6% contaminated
- **After**: 69 chars avg, 1.0% contaminated

## Top Contamination Patterns

- **shared-gemma4-sanitizer**: 3 occurrences (37.5%)

---

**Recommendation**: Phase 9 ACE extraction is ⚠️ BLOCKED.

Next steps:
1. Fix remaining contaminations and rerun sanitation
2. Materialize feature envelopes: `npm run atlas:materialize-envelopes:apply`
3. Warm Qdrant/Neo4j/Redis payloads
