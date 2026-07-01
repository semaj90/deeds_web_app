# Summary Storage Proof

Generated: 2026-07-01T01:01:42.258Z
Status: PASS

## Tables

- atlas_packets: PASS (58304 rows)
- atlas_summary_layers: PASS (11939 rows)

## JSONB Coverage

- atlas_packets.metadata: 100%
- atlas_packets.topology: 0%
- atlas_packets.vectors: 4.99%
- atlas_summary_layers.metadata: 99.72%

## Proof

- summary rows > 0: PASS
- summary JSONB metadata present: PASS
- packet JSONB coverage present: PASS