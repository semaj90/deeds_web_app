# PyTorch / Qdrant / Redis / SOM Index - 2026-06-01

Generated: 2026-06-02T02:18:39.699Z

## Summary

- Vector64 compression: 768 -> 64 (91.67%)
- Vector64 avg reconstruction error: 0.04806
- SOM grid size: 20
- SOM total neurons: 400
- SOM embedding dim: 64
- SOM backend: gpu-trainSOM
- SOM assigned cards: 9372/9372
- SOM topology edges: 1482
- Cache effectiveness runs: 3
- Cache centroid hit rate: 0.00%
- Cache fallback count: 0
- Feature registry entries: 4209
- Parent atlas total entries: 9374
- Parent atlas unique kinds: 2
- Parent atlas unique sources: 1380
- Autoencoder/SOM map lines: 154
- SOM assignments: 9372
- Unique SOM card ids: 9372

## Active Entry Points

- scripts/atlas/build-all-lanes-parent-atlas.mjs
- scripts/atlas/atlas-parent-indexing.mjs
- scripts/atlas/backfill-som-coordinates.mjs
- scripts/atlas/build-atlas-token-map.mjs
- sveltekit-frontend/src/lib/server/graph/som-topology-pipeline.ts
- sveltekit-frontend/src/lib/server/gpu/pytorch-graph.ts
- sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts
- sveltekit-frontend/src/lib/server/retrieval/encoded-cluster-prefilter.ts
- docs/reports/autoencoder-som-map.md
- docs/reports/cache-effectiveness-report.json

## Notes

- The PyTorch lane is the experimental compression/training boundary.
- Qdrant carries semantic cluster recall and payload tagging.
- Redis/Bitfrost retains hot centroids and cache pointers for offline processing.
- The JSON tree artifacts are navigation surfaces for indexing, not a new source of truth.

## Qdrant / Redis Tags

- feature:gpu
- feature:som
- feature:centroid
- feature:cluster
- feature:vector64
