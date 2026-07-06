# Topology Completion Audit

**Generated:** 2026-07-05T22:20:02.423Z

## Summary

- **Total packets:** 58365
- **SOM cells populated:** 799 / 400 (199.8%)
- **Packets with tree_node_id:** 58365 / 58365 (100.0%)
- **Packets with qdrant_point_id:** 3092 / 58365 (5.3%)
- **Packets with PageRank:** 12616 / 58365 (21.6%)
- **Packets with title_id:** 58365 / 58365 (100.0%)

## Gaps to Backfill

| Gap | Count | Coverage |
|-----|-------|----------|
| Missing SOM cluster | 61 | 1.0% |
| Missing tree_node_id | 0 | 100.0% |
| Missing qdrant_point_id | 55273 | 5.3% |
| Missing PageRank score | 45749 | 21.6% |
| Missing title_id | 0 | 100.0% |

## Topology Info

- **Current SOM grid:** 20×20
- **Target SOM grid:** 20×20 (400 cells)
- **SOM upgrade gap:** 0 cells

## Next Steps

1. Backfill missing SOM clusters via `npm run atlas:som:backfill`
2. Backfill missing tree_node_id via `npm run atlas:tree-node:backfill`
3. Sync missing qdrant_point_id via `npm run atlas:qdrant:sync`
4. Regenerate PageRank via `npm run atlas:pagerank:compute`
5. Assign title_id via `npm run atlas:title:assign`
