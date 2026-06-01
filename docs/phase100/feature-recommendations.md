# Phase 100 Feature Recommendations

Generated from the current live parent-atlas and Gemma reasoning outputs.

## Current inputs

- `sveltekit-frontend/.tmp/unknown-reasoning-results.json`
- `sveltekit-frontend/.tmp/unknown-reasoning-results.md`
- `sveltekit-frontend/.tmp/gemma-recommendations.jsonl`
- `memory/exports/parent-atlas-report.json`
- `memory/exports/parent-atlas/parent_atlas_index.json`

## Current counts

- Schema gaps: 7
- Weak SOM clusters: 18
- Materialized Gemma recommendations: 25
- Parent atlas entries: 9,373
- Parent atlas clusters: 396

## High-priority schema gaps

1. `codebase_embeddings`
2. `codebase_files`
3. `codebase_relationship_reports`
4. `feature_cards`
5. `feature_registry_vectors`
6. `intent_synthesis_rewards`
7. `vector_smoke`

Each of these is currently represented as a high-risk live undeclared active drift item. The next action is to keep the Drizzle sidecar and the live DB contract aligned before any further schema promotion.

## Weak SOM clusters

The current recommendation pass surfaced weak clusters around:

- `src/lib/server/db/schema-postgres.ts`
- `src/lib/server/types/synthesis.ts`
- `src/lib/ai/client-embed.ts`
- `src/lib/server/vector/multi-store.ts`
- `src/lib/server/concurrency/advisory-locks.ts`
- `src/lib/components/ui/gaming/types`
- `src/lib/types/evidence.ts`
- `src/lib/server/db/schema-gpu-cache.ts`
- `src/lib/services/error-analysis/types.ts`

These are not automatic deletions. They are candidates for manual review, merge, or reclassification.

## Materialized recommendation lane

The Gemma pass materialized 25 recommendation records into:

- `sveltekit-frontend/.tmp/gemma-recommendations.jsonl`
- `sveltekit-frontend/.tmp/kanban_tasks.jsonl`
- `.tmp/ingest/lanes/gemma_recommendation.ndjson`

That lane is now available for downstream parent-atlas and token-remap ingestion.

## Next actions

1. Treat UUID drift in archived schema copies as historical cleanup only; the live runtime schema is aligned.
2. Promote the parent-atlas ingestion output after review.
3. Use the recommendation lane to drive ticketing and manual review, not broad refactors.
4. Treat the weak SOM clusters as topology signals for pruning and merge decisions.
