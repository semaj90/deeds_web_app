# Replay Telemetry Breadth Audit

- Generated: 2026-06-19T22:24:46.612Z
- Status: READY
- Rows: 307
- Distinct queries: 228
- Duplicate query rows: 79
- One-row-per-query ratio: 74.27%

## Scenario Counts

- cache_hit: 29
- fusion: 256
- lexical_only: 20
- vector_only: 20
- cold_path: 10
- low_density: 160
- kanban: 1
- graph: 6
- golden: 20

## Missing Scenarios

- none

This audit is read-only. It does not delete duplicate rows or synthesize missing
scenarios.
