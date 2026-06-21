# SourceRef-First Parent Atlas Refresh

Generated: 2026-06-20T22:28:29.405Z
Mode: dry-run

## Inputs

- hot-join report: C:\Users\james\Videos\deeds-web-app\docs\reports\sourceRef-first-hot-join-warmup.json
- limit: all

## Output

- items processed: 2
- records written: 0
- vectors written: 0
- embedding mode: ollama-or-fallback
- errors: 0

## Top featureIds

- cluster:19067cadf0: 1
- feature:cache: 1

## Top sourceRefs

- src/lib/ai/citation-cache.ts: 1
- src/lib/ai/client-cache.ts: 1
- src/lib/ai/client-embed.ts: 1
- src/lib/ai/client-llm-synthesis.ts: 1
- src/lib/ai/client-quality.ts: 1
- src/lib/ai/client-router.ts: 1
- src/lib/cache/cache-service.svelte.ts: 1

## Notes

- This runner promotes the canonical sourceRef-first hot-join report into the existing parent atlas mirror tables.
- The join spine remains sourceRef + featureId + queryHash.
- No schema changes are performed.
