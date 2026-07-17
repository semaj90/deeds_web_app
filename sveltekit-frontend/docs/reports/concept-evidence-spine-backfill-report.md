# Concept Evidence Spine Backfill

Generated: 2026-07-17T06:17:52.600Z

## Summary

- mode: dry-run
- limit: all
- totalRows: 0
- eligibleRows: 0
- updatedRows: 0
- skippedRows: 0
- missingSpineRows: 0
- staleLegacyRows: 0

## Coverage

- packetKeys coverage: 0%
- featureIds coverage: 0%
- evidenceCards stale-legacy coverage: 0%

## Notes

- evidence_cards is the live concept evidence spine.
- packet_keys is the preferred source; feature_ids is used when packet_keys are missing.
- legacy card IDs remain in the evidence field for historical provenance.

- backup: `docs\reports\concept-evidence-spine-backfill-backup.json`
- report: `docs\reports\concept-evidence-spine-backfill-report.json`
