# Summary Storage Proof

Generated: 2026-07-02T23:22:48.384Z
Status: PASS

## Tables

- atlas_packets: PASS (58304 rows)
- atlas_summary_layers: PASS (12004 rows)

## JSONB Coverage

- atlas_packets.metadata: 100%
- atlas_packets.topology: 0%
- atlas_packets.vectors: 5.3%
- atlas_summary_layers.metadata: 99.72%

## Proof

- summary rows > 0: PASS
- summary JSONB metadata present: PASS
- packet JSONB coverage present: PASS