# Qdrant Legacy/Ambiguous Slice Debug

**Date**: 2026-06-14T21:37:53.180Z
**Points Analyzed**: 5000
**Limit**: 5000

## Classification Summary

| Category | Count | % | Action |
|----------|-------|---|--------|
| canonical_match | 3558 | 71.2% | ✅ Safe repair |
| legacy_alias_match | 165 | 3.3% | ✅ Safe repair |
| ambiguous_skip | 79 | 1.6% | 🚫 Skip (multiple candidates) |
| no_candidate | 0 | 0.0% | ⏸️ Manual review |
| orphan_quarantine | 1099 | 22.0% | 🔒 Quarantine (legacy-only) |
| missing_source_ref | 99 | 2.0% | 📋 Data quality issue |

## Repair Strategy

**Safe to repair**: 3723 points (74.5%)
- canonical_match: use packet_key directly
- legacy_alias_match: update source_ref/sourceRef to canonical form

**Must skip**: 79 points
- Multiple candidates with equal confidence
- Would risk false joins

**Quarantine**: 1099 points
- No postgres match possible
- Keep as legacy-only without mutation

## Next Steps

1. Review first 100 points in detailed audit
2. Confirm safe repair candidates (canonical + legacy_alias)
3. Run repair script with --limit=500 --dry-run
4. After approval, run with --apply
5. Re-run verify gate to confirm clean

## Gate Status

- packet_key coverage: pending repair
- lineage_version coverage: pending repair
- ambiguous entries: explained and skipped
- Qdrant verify: ready for next repair script
