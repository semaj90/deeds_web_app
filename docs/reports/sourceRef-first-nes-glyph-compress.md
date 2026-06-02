# SourceRef-First NES/Glyph Compression

Generated: 2026-06-01T21:27:11.260Z
Mode: apply

## Inputs

- warmup report: C:\Users\james\Videos\deeds-web-app\docs\reports\sourceRef-first-join-warmup.json
- cluster limit: 1
- packet limit: 1
- Bifrost models: ollama/gemma4-rotorquant:latest, ollama/ibm/granite-docling:258m

## Output

- selected items: 2
- summaries generated: 2
- packets persisted: 2
- hits persisted: 7
- Bifrost fallbacks: 2
- errors: 2

## Top sourceRefs

- src/lib/ai/citation-cache.ts: 1
- src/lib/ai/client-cache.ts: 1
- src/lib/ai/client-embed.ts: 1
- src/lib/ai/client-llm-synthesis.ts: 1
- src/lib/ai/client-quality.ts: 1
- src/lib/ai/client-router.ts: 1
- src/lib/cache/cache-service.svelte.ts: 1

## Top featureIds

- cluster:19067cadf0: 1
- feature:cache: 1

## Notes

- This lane turns the sourceRef-first warmup report into reusable NES/Glyph packets.
- Gemma4/Bifrost summaries are best-effort and fall back to deterministic packet summaries if the gateway is slow or unavailable.
- The packet layer is persisted through the existing NES chrom packet service, so the join spine remains sourceRef + featureId + queryHash.
