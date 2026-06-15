# Parent Atlas Feature Lineage Verification Report

**Generated**: 2026-06-14T23:44:14.408Z
**Status**: PASS
**Database**: 127.0.0.1:5434/legal_ai_db

## Summary

| Metric | Value |
|--------|-------|
| Total Packets | 0 |
| Valid Lineage | 0 |
| Coverage | NaN% |

## Failures

| Failure Type | Count |
|--------------|-------|
| missing_source_ref | 0 |
| missing_feature_id | 0 |
| missing_feature_label | 0 |
| missing_packet_key | 0 |
| duplicate_source_ref | 0 |
| duplicate_packet_key | 0 |
| directory_mismatch | 0 |

## Hard Fail Conditions (Parent Atlas Contract)

✓ missing_source_ref = 0
✓ missing_feature_id = 0
✓ missing_feature_label = 0
✓ missing_packet_key = 0
✓ duplicate_source_ref = 0
✓ duplicate_packet_key = 0
✓ directory_mismatch = 0

**RESULT**: ✅ PASS — Lineage is frozen and ready for error-fixing.





## Remediation

See `remediation.sql` in the same directory.

```bash
# Review the remediation SQL
cat C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\docs\reports\lineage-verify-2026-06-14.sql

# Apply if confident
psql -U legal_admin -d legal_ai_db < C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\docs\reports\lineage-verify-2026-06-14.sql
```
