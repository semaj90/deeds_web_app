# Summary Storage Proof Validation

Generated: 2026-07-02T23:22:49.395Z
Status: PASS

## Commands

- storage proof script: node scripts/atlas/verify-summary-storage.mjs

## Assertions

- storage report exists: PASS
- surface report exists: PASS
- atlas_packets present: PASS
- atlas_summary_layers present: PASS
- summary rows present: PASS
- summary metadata present: PASS
- packet JSONB present: PASS

## Counts

- atlas_packets rows: 58304
- atlas_summary_layers rows: 12004
- summary surface ndjson rows: 313

## Coverage

- atlas_packets.metadata: 100%
- atlas_packets.topology: 0%
- atlas_packets.vectors: 5.3%
- atlas_summary_layers.metadata: 99.72%