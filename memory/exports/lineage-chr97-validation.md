# Atlas CHR97 Lineage Validation

Generated: 2026-06-10T04:06:11.438Z

## Result: ✅ PASS (13/13 checks, 100.0% pass rate)

> **Taxonomy note**: `nes_chrom_packets.feature_id` and `atlas_feature_map.feature_id` use different classification systems (fine-grained vs coarse). Exact label match is not expected. C1 checks structural source_ref presence only.

| Check | Status | Message |
|-------|--------|---------|
| C1:ncp_in_atlas | ✅ | nes_chrom_packets in atlas_feature_map: 27/27 (100.0%) |
| C2:ncp_feature_id | ✅ | nes_chrom_packets with feature_id: 27/27 (100.0%) |
| C3:ncp_chunk_id | ✅ | nes_chrom_packets with chunk_id: 27/27 (100.0%) |
| C4:ncp_kag_node_key | ✅ | nes_chrom_packets with kag_node_key: 27/27 (100.0%) |
| C5:ncp_qdrant_reachability | ✅ | nes_chrom_packets qdrant_point_id: 20/27 have ID (74.1%); Qdrant reachable: 10/10 sampled (100.0%) |
| C6:kag_hits_to_ncp | ✅ | nes_chrom_kag_dag_hits → nes_chrom_packets: 32/32 (100.0%) |
| C7:kag_chunk_join | ✅ | kag_dag_hits chunk_id → nes_chrom_packets: 32/32 (100.0%) |
| C8:kag_source_ref_join | ✅ | kag_dag_hits → nes_chrom_packets (source_ref OR chunk_id): 32/32 (100.0%) |
| C9:sprite_engramKey | ✅ | chr97-sprites engramKey: 200/200 (100.0%) |
| C10:sprite_hash | ✅ | chr97-sprites sprite.hash: 200/200 (100.0%) |
| C11:sprite_reward_score | ✅ | chr97-sprites rankedCard.score > 0: 200/200 (100.0%) |
| C12:bout_winner | ✅ | chr97-eval-bouts with winner: 1500/1500 (100.0%) |
| C13:bout_reward_scores | ✅ | chr97-eval-bouts with valid challenger+defender rewards: 1500/1500 (100.0%) — note: reward_delta is negative when defender wins (expected bout semantics) |

## Lineage Chain

```
nes_chrom_packets ──source_ref──► atlas_feature_map
      │                  chunk_id ─► codebase_chunks_768 (Qdrant)
      │                  id ───────► nes_chrom_kag_dag_hits
      │                               ↑ chunk_id / source_ref back-refs
      ↓
chr97-sprites.ndjson   (engramKey + sprite.hash + rankedCard.score)
      ↓
chr97-eval-bouts.ndjson  (winner + reward_delta)
```
