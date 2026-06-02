# SourceRef-First Hot Join Warmup

Generated: 2026-06-02T02:19:18.916Z
Mode: apply

## Inputs

- compressed report: C:\Users\james\Videos\deeds-web-app\docs\reports\sourceRef-first-nes-glyph-compress.json
- limit: 5

## Output

- items: 2
- Redis warmups: 2
- Bifrost warmups: 2
- Neo4j applied: no
- Neo4j communities: 0
- Neo4j total clusters: 0
- Neo4j total members: 0
- errors: 0

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

- The compressed packet report is the canonical source for hot joins.
- Redis/Bitfrost warmup reuses the compressed packet summary and the same sourceRef + featureId + queryHash spine as the NES/Glyph packets.
- Neo4j expansion is optional and can be skipped when the report should remain read-only.
