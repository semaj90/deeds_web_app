# NES Chrom Backfill Report

Generated: 2026-06-01T20:19:14.507Z

## Inputs

- source report: docs/reports/missing-features-review-latest.json
- source candidates: 25
- limit: 25

## Outputs

- packets written: 25
- hits written: 25
- kag_dag_runs seeded: 1

## Top Packets

- nes:ui:71db4b96c7f2c392:69a256e07545 :: src/lib/components/ui/index.ts :: ui
- nes:ui:71db4b96c7f2c392:2008c51548ef :: src/lib/components/ui/gaming/n64/index.ts :: ui
- nes:ui:71db4b96c7f2c392:e5bfa1d615a1 :: src/lib/components/ui/gaming/index.ts :: ui
- nes:ui:71db4b96c7f2c392:d46f789cc148 :: src/lib/components/ui/alert-dialog/index.js :: ui
- nes:unclassified:71db4b96c7f2c392:a8939096ca48 :: src/lib/icons/yorha/index.ts :: unclassified
- nes:ui:71db4b96c7f2c392:43fa8b523273 :: src/lib/components/ui/dialog/index.ts :: ui
- nes:ui:71db4b96c7f2c392:622703abaa52 :: src/lib/components/codebase/index.ts :: ui
- nes:ui:71db4b96c7f2c392:fc7e65d4c227 :: src/lib/components/ui/svelte5-index.ts :: ui
- nes:unclassified:71db4b96c7f2c392:76455727aa6b :: src/lib/index.ts :: unclassified
- nes:ui:71db4b96c7f2c392:b9c3a023e8eb :: src/lib/components/ui/table/index.ts :: ui

## Notes

- This backfill seeds packet rows from the existing missing-feature analysis so the NES/Glyph lane has live rows to query.
- The packet writer path remains unchanged; this only materializes durable rows for the read/query lane.
