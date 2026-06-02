# SourceRef-First Join Warmup

Generated: 2026-06-02T02:22:24.899Z

## Inputs

- cluster limit: 1
- packet limit: 1
- mode: apply
- Bifrost model: ollama/gemma4-rotorquant:latest

## Neo4j Expansion

- applied: no
- communities: 0
- total clusters: 0
- total members: 0
- turbo hits: 0
- turbo misses: 0

## Redis / Bitfrost Warmup

- clusters warmed: 0
- packets warmed: 0
- contexts registered: 2
- errors: 0

## Top FeatureIds

- cluster:19067cadf0: 1

## Top SourceRefs

- src/lib/ai/citation-cache.ts: 1

## Top Clusters

- cluster:gpu:19: 4

## Notes

- The script reuses the existing hot-cluster reader and the NES packet lane, keyed by sourceRef + featureId.
- Neo4j expansion comes from the existing community graph builder; Redis/Bitfrost warmup uses the Bifrost cache gateway and KAG context registry.
- Dry-run does not mutate Redis, Bifrost, Neo4j, or Postgres.
