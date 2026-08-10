# Summary Storage Proof

Generated: 2026-08-10T18:35:58.558Z
Status: PASS

## Tables

- atlas_packets: PASS (61659 rows)
- atlas_summary_layers: PASS (18437 rows)

## JSONB Coverage

- atlas_packets.metadata: 100%
- atlas_packets.topology: 97.29%
- atlas_packets.vectors: 100%
- atlas_summary_layers.metadata: 100%

## Proof

- summary rows > 0: PASS
- summary JSONB metadata present: PASS
- packet JSONB coverage present: PASS