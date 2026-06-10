# Atlas Lineage Validation

Generated: 2026-06-10T13:55:26.759Z

## Result: ✅ PASS (7/7 checks passed)

| Check | Status | Message |
|-------|--------|---------|
| L1:atlas_feature_map | ✅ | atlas_feature_map: 14471 rows, 10947 with feature_id (75.6%), 1122 distinct features |
| L2:task_semantic_packets | ✅ | task_semantic_packets: 302 rows, feature_id 302/302, hash 302/302 |
| L3:nes_chrom_packets | ✅ | nes_chrom_packets: 27 rows, 18 features, 2 lanes, 27 with summary |
| L4:chr97_sprites | ✅ | chr97-sprites.ndjson: 200 lines, engramKey present: true, sprite.hash present: true |
| L5:chr97_eval_bouts | ✅ | chr97-eval-bouts.ndjson: 1500 lines |
| L6:nes_chrom_kag_dag_hits | ✅ | nes_chrom_kag_dag_hits: 32 entries, 15 distinct nodes, 26 distinct chunks |
| L7:feature_id_crosscheck | ✅ | nes_chrom feature_ids in atlas_feature_map: 18/18 |

## Lineage Chain

```
atlas_feature_map  →  task_semantic_packets  →  nes_chrom_packets
                                                       ↓
                            nes_chrom_kag_dag_hits  ←  chr97-sprites.ndjson
                                                              ↓
                                                    chr97-eval-bouts.ndjson
```
