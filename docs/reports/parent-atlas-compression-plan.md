# Parent Atlas TurboVec Compression Plan

This plan reuses the existing parent-atlas, Qdrant bridge, vector64, and repo-consolidation outputs.

## What already exists

- Parent atlas: 9373 cards, 396 clusters
- TurboVec lane: 768d -> 64d, 91.67% compression, avg error 0.04806
- Qdrant bridge sample: 50 points, 36 bridge rows, 0 full matches, 24 unmatched
- Missing-features review: 14 registry prefix clusters, 1089 mapreduce prefix clusters, 28 duplicate-system pairs
- Stack health: pg18=healthy, redis=healthy, bifrost=healthy

## Reuse rules

- Use sourceRef + feature_id as the dedupe spine.
- Use parent_atlas_card_id only after path/file joins are resolved.
- Use Qdrant tags and registry prefix clusters to coalesce near-duplicate summaries.
- Keep TurboVec 64d compression as the packet prefilter, not the canonical store.
- Do not restate archive-only or experimental artifacts in Gemma summary packets.

## Gemma summary packet

- Max chunks: 10
- Max sourceRefs: 5
- Max summary tokens: 128
- Preferred inputs: parent atlas feature rows, repo consolidation feature map, missing-features review clusters, qdrant path bridge rows, vector64 compression metrics

## Keep set

### Production-ready code paths
- sveltekit-frontend/src/lib/server/analytics/ldr-ace-bridge.ts
- sveltekit-frontend/src/lib/server/features/cases/research-summaries-db.ts
- sveltekit-frontend/src/lib/server/db/schema-postgres.ts
- sveltekit-frontend/src/lib/server/cache/ace-packet-cache.ts
- sveltekit-frontend/src/lib/server/search/qdrant-search.ts

### Canonical production tables
- research_summaries (production)

## Key clusters to reuse

- src/lib/server/ace: 16 refs; featureIds=ace.packet_flow, cluster.cards, karpathy.hot_lane, memory.address.registry, semantic.cache.policy
- src/lib/server/atlas: 8 refs; featureIds=ace.packet_flow, cluster.cards, codebase.semantic_index, feature.labeling, karpathy.hot_lane, memory.address.registry, retrieval.spine, semantic.cache.policy
- src/lib/server/cache: 4 refs; featureIds=ace.packet_flow, cluster.cards, memory.address.registry, semantic.cache.policy
- .cache/ace: 3 refs; featureIds=memory.address.registry, semantic.cache.policy
- src/lib/server/retrieval: 3 refs; featureIds=retrieval.spine
- scripts/atlas: 2 refs; featureIds=cluster.cards
- src/lib/server/labels: 2 refs; featureIds=feature.labeling
- docs/architecture: 1 refs; featureIds=retrieval.spine

## Do not repeat

- Archive-only snapshots
- Experimental lanes (local-deep-research SQLite, cuVS/CAGRA, WSL2-only override)
- Duplicate generated reports that already landed in docs/reports

## Next step

Generate compact Gemma packets from the existing parent-atlas and cluster signals instead of rebuilding summaries from raw files.
