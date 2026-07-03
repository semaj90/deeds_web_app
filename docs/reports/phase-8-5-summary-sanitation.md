# Phase 8.5: Summary Sanitation Report

**Mode**: apply
**Timestamp**: 2026-07-03T17:15:06.819Z

## Summary

- **Total scanned**: 5000
- **Total contaminated**: 117 (2.3%)
- **Cleanable**: 41
- **Failed/Skipped**: 76

## Quality Results

| Status | Count | % |
|--------|-------|---|
| ✅ PASS | 32 | 78.0% |
| ⚠️ WARN | 9 | 22.0% |
| ❌ FAIL | 76 | 185.4% |

## Acceptance Gates

| Gate | Status | Details |
|------|--------|---------|
| Contamination rate < 2% | ✅ | 1.5% |
| Quality score > 0.8 | ✅ | Average quality score |
| No FAIL entries | ❌ | 76 failures |
| **Ready for Phase 9** | ❌ NO | All gates pass |

## Metrics

- **Before**: 212 chars avg, 2.3% contaminated
- **After**: 65 chars avg, 1.5% contaminated

## Top Contamination Patterns

- **shared-gemma4-sanitizer**: 42 occurrences (35.9%)
- **The code is:**: 1 occurrences (0.9%)

---

**Recommendation**: Phase 9 ACE extraction is ⚠️ BLOCKED.

Next steps:
1. Fix remaining contaminations and rerun sanitation
2. Materialize feature envelopes: `npm run atlas:materialize-envelopes:apply`
3. Warm Qdrant/Neo4j/Redis payloads
