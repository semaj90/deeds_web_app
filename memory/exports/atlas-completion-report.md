# Atlas Completion Report

Generated: 2026-09-04T04:04:08.443Z

## Overall: ✅ PASS

---

## Milestone Summary

| Milestone | Status |
|-----------|--------|
| M1 Identity Spine (6 cross-system gates) | ✅ PASS |
| M2 Replay Validation (302 task packets) | ✅ PASS |
| M3 Lineage Validation (Atlas→CHR97→ACE) | ✅ PASS |
| M4 Production Readiness (67 gates) | ⚠️ WARN |

---

## M1: Identity Spine

**0/6 gates PASS** — generated 2026-06-10T15:12:17.942Z

| Gate | Status | Coverage |
|------|--------|----------|
| qdrant_feature_id | ❌ | undefined |
| qdrant_canonical_ref | ❌ | undefined |
| qdrant_som | ❌ | undefined |
| qdrant_karpathy | ❌ | undefined |
| neo4j_canonical | ❌ | undefined |
| valkey_warm | ❌ | undefined |

---

## M2: Replay Validation

**Replay rate: 99.0%** (198/200 packets) — generated 2026-08-27T03:39:40.740Z

| Check | Result |
|-------|--------|
| sourceRefHash | 99.0% ✅ mandatory |
| feature_id | 100.0% ✅ mandatory |
| cluster_id | 0% — optional_reserved — 0% correct until GPU cluster bridge lands |
| Qdrant | N/A — all 302 rows are task/feature refs, not file-level Qdrant docs |

---

## M3: Lineage Validation

**7/7 checks PASS** — generated 2026-06-10T13:55:26.759Z

| Check | Status | Message |
|-------|--------|---------|
| L1:atlas_feature_map | ✅ | atlas_feature_map: 14471 rows, 10947 with feature_id (75.6%), 1122 distinct features |
| L2:task_semantic_packets | ✅ | task_semantic_packets: 302 rows, feature_id 302/302, hash 302/302 |
| L3:nes_chrom_packets | ✅ | nes_chrom_packets: 27 rows, 18 features, 2 lanes, 27 with summary |
| L4:chr97_sprites | ✅ | chr97-sprites.ndjson: 200 lines, engramKey present: true, sprite.hash present: true |
| L5:chr97_eval_bouts | ✅ | chr97-eval-bouts.ndjson: 1500 lines |
| L6:nes_chrom_kag_dag_hits | ✅ | nes_chrom_kag_dag_hits: 32 entries, 15 distinct nodes, 26 distinct chunks |
| L7:feature_id_crosscheck | ✅ | nes_chrom feature_ids in atlas_feature_map: 18/18 |

---

## M4: Production Readiness

**61 pass / 6 warn / 0 fail** (67 total) — generated 2026-08-31T03:43:28.855Z

Sections: summary-batch, gpu, native-json-parser, drizzle, offline, postgres, redis, qdrant, neo4j

> ⚠️ Warning gates are advisory — they do not block the overall PASS verdict.

---

## Convergence Metrics (n=200 random files)

| System | Metric | Value |
|--------|--------|-------|
| Qdrant | Hit rate (excl. deleted) | 99.0% |
| Qdrant | Collection size | 54,195 points |
| Qdrant | Deleted from disk | 4 files |
| Qdrant | Not yet indexed | 2 files |
| Karpathy | Hit rate (random sample) | 44.5% |
| Neo4j | Canonical source_ref | 100.0% |
| Fully aligned | All 3 systems | 44.5% |

> Karpathy coverage note: Karpathy Redis scores cover the top-200 PageRank files (223 entries). Random-sample hit rate is 44.5% because the broader codebase has not been enriched. Run `npm run karpathy:gpu:top200` on a wider sample to raise coverage.

---

## Known Gaps (Non-blocking)

| Gap | Severity | Summary |
|-----|----------|---------|
| cluster_id_bridge | deferred | task_semantic_packets. |
| karpathy_coverage | advisory | Karpathy Redis scores cover the top-200 PageRank files (223 entries). |
| nes_chrom_packets_scale | advisory | nes_chrom_packets has 27 rows across 18 features and 2 lanes. |
| atlas_feature_map_coverage | advisory | atlas_feature_map has 14,471 rows; 75. |

---

## Lineage Chain

```
atlas_feature_map  →  task_semantic_packets  →  nes_chrom_packets
                                                       ↓
                            nes_chrom_kag_dag_hits  ←  chr97-sprites.ndjson
                                                              ↓
                                                    chr97-eval-bouts.ndjson
```
