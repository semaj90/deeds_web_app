# Summary Storage Proof

Generated: 2026-06-29T03:24:34.040Z
Status: PASS

## Tables

- atlas_packets: PASS (58304 rows)
- atlas_summary_layers: PASS (336 rows)

## JSONB Coverage

- atlas_packets.metadata: 100%
- atlas_packets.topology: 0%
- atlas_packets.vectors: 0%
- atlas_summary_layers.metadata: 100%

## Proof

- summary rows > 0: PASS
- summary JSONB metadata present: PASS
- packet JSONB coverage present: PASS