# NES Chrom Packet Recent Hits

Generated: 2026-06-01T20:20:19.904Z

## Inspection

1. Writer path: sveltekit-frontend/src/lib/server/features/ai/ace/nes-chrom-packet-service.ts
2. ACE assembly hook path: sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts
3. Read/query path: sveltekit-frontend/src/routes/api/atlas/nes-chrom/+server.ts
4. DB table names: nes_chrom_packets, nes_chrom_kag_dag_hits
5. Existing report paths: docs/reports/nes-chrom-packet-kag-dag-map.md, docs/reports/nes-chrom-packet-recent-hits.{json,md}
6. sourceRef/sourceRefs preserved: yes / yes
7. featureId/feature_id preserved: yes
8. parentAtlasCardId/parent_atlas_card_id preserved: no
9. CHR97 and NES chrom lane relationship: separate-but-adjacent lanes: CHR97 is the cartridge fast-path search lane; NES chrom is the durable ACE packet + hit report lane.
10. Recommended canonical report path: docs/reports/nes-chrom-packet-kag-dag-map.md + docs/reports/nes-chrom-packet-recent-hits.{json,md}

## Counts

- packets: 3
- hits: 3

## Database Status

- packet table present: yes
- hit table present: yes
- note: Both NES chrom tables are present in the current database.

## Coverage

- sourceRef: 1
- featureId: 1
- parentAtlasCardId: 0
- queryHash: 1
- chunkId: 1

## Replay Spine

- sourceRef + feature_id intact: yes
- packets with sourceRefs array: all sampled packets

## Top SourceRefs

- src/lib/components/ui/gaming/index.ts: 1
- src/lib/components/ui/gaming/n64/index.ts: 1
- src/lib/components/ui/index.ts: 1

## Top FeatureIds

- ui: 3

## Missing feature_id rows

- none

## Missing sourceRef rows

- none

## Notes

- parentAtlasCardId coverage reflects payload/metadata presence only; there is no dedicated packet-table column for it in the current lane.
- This script is read-only and reports on the existing NES chrom packet tables without mutating schemas, packets, or retrieval behavior.
