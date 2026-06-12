# Concept Evidence Spine Backfill

Generated: 2026-06-12T13:16:16.861Z

## Summary

- mode: dry-run
- limit: 25
- totalRows: 10
- eligibleRows: 0
- updatedRows: 0
- skippedRows: 10
- missingSpineRows: 0
- staleLegacyRows: 0

## Coverage

- packetKeys coverage: 100%
- featureIds coverage: 100%
- evidenceCards stale-legacy coverage: 0%

## Notes

- evidence_cards is the live concept evidence spine.
- packet_keys is the preferred source; feature_ids is used when packet_keys are missing.
- legacy card IDs remain in the evidence field for historical provenance.

- backup: `docs\reports\concept-evidence-spine-backfill-backup.json`
- report: `docs\reports\concept-evidence-spine-backfill-report.json`
