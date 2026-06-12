# Higher-Hop Enrichment Report

Generated: 2026-06-12T12:15:47.157Z

## Summary

- feature-lineage sourceRef coverage: 100%
- feature-lineage featureId coverage: 100%
- selected_concepts coverage: 100%
- runtime packet rows: 33
- RRF avgNDCG@10: 0.544

## Hop Coverage

| Hop | Coverage | State | Missing Rows |
|-----|----------|-------|--------------|
| somCluster | 0% | MISSING | 100 |
| glyphRecord | 0% | MISSING | 100 |
| qdrantHit | 0% | MISSING | 100 |
| redisHotKey | 0% | MISSING | 100 |
| neo4jNode | 0% | MISSING | 100 |

## Recommended Next Actions

- Re-derive som_cluster from topology / cluster join (0%, 100 missing rows)
- Materialize glyph_record from SOM / glyph lane (0%, 100 missing rows)
- Backfill qdrant_point_id / Qdrant payload join (0%, 100 missing rows)
- Replay runtime packets and restore Redis hot keys (0%, 100 missing rows)
- Relink or materialize Neo4j node mapping (0%, 100 missing rows)

## Notes

- This is a report-only lane.
- The gap rows are higher-hop lineage fields, not base sourceRef/featureId coverage.
- Use the existing backfill scripts only after the report indicates a concrete fill path.
