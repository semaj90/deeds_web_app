# Atlas Lineage Validation

Generated: 2026-09-10T17:42:29.930Z

## Result: ❌ FAIL (6/7 checks passed)

| Check | Status | Message |
|-------|--------|---------|
| L1:atlas_feature_map | ✅ | atlas_feature_map: 4748 rows, 4747 with feature_id (100.0%), 3151 distinct features |
| L2:task_semantic_packets | ✅ | task_semantic_packets: 2 rows, feature_id 2/2, source_ref 2/2 |
| L3:nes_chrom_packets | ✅ | nes_chrom_packets: 1992 rows, 1378 features, 1 lanes, 0 with summary |
| L4:chr97_sprites | ✅ | chr97-sprites.ndjson: 200 lines, engramKey present: true, sprite.hash present: true |
| L5:chr97_eval_bouts | ✅ | chr97-eval-bouts.ndjson: 1500 lines |
| L6:nes_chrom_kag_dag_hits | ❌ | nes_chrom_kag_dag_hits: 0 entries, 0 distinct nodes, 0 distinct chunks |
| L7:feature_id_crosscheck | ✅ | nes_chrom feature_ids in atlas_feature_map: 1378/1378 |

## Lineage Chain

```
atlas_feature_map  →  task_semantic_packets  →  nes_chrom_packets
                                                       ↓
                            nes_chrom_kag_dag_hits  ←  chr97-sprites.ndjson
                                                              ↓
                                                    chr97-eval-bouts.ndjson
```
