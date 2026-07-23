# Parent Atlas Proof System

Parent Atlas is architecture-frozen. New ML, schema, or transport lanes must not
open until the proof gates below pass against the current packet spine.

## Canonical Retrieval Contract

```text
query
  -> embedding_768
  -> Qdrant dense + Postgres BM25
  -> Neo4j expansion
  -> Redis/Bitfrost runtime mirrors
  -> RRF candidate fusion
  -> latent_64 / SOM / manifold_4d routing bonus
  -> Gemma4 synthesis
  -> ACE packet
  -> OpenCode tool call
```

`packet_key`, `source_ref`, `feature_id`, and Postgres rows remain canonical.
Qdrant, Neo4j, Redis/Valkey, SOM, latent vectors, and Gemma4 output are derived.

## P0 - Proof Of Truth

Purpose: identical query and data produce identical packet identities and rank.

Proof command:

```powershell
npm run atlas:proof:truth
```

Required output:

- 50 cold misses
- 50 warm hits
- 50 second-warm hits
- identical packet keys, source refs, feature IDs, and ranks
- replay ID and cache source on every response

Report:

- `docs/reports/parent-atlas-proof-of-truth.json`
- `docs/reports/parent-atlas-proof-of-truth.md`

## P1 - Runtime Reliability

Purpose: optional mirror failure degrades retrieval without changing truth.

Proof command:

```powershell
npm run atlas:proof:runtime-failures:apply
```

The harness stops and restores Valkey, Neo4j, and Qdrant one at a time.
Postgres is never stopped or mutated.

Report:

- `docs/reports/runtime-degradation-proof.json`
- `docs/reports/runtime-degradation-proof.md`

## P2 - Operator Experience

Every packet RPC response exposes:

- `packet_key`
- `source_ref`
- `canonical_source_ref`
- `feature_id`
- `qdrant_point_id`
- `community_id`
- `som_cluster`
- `fusion_score`
- `reason`
- `recommended_action`
- `verification_command`
- `cache_source`
- `retrieval_strategy`
- `worker`
- `run_id`
- `task_id`
- `replay_id`
- `cache_namespace`

Cache namespace proof:

```powershell
npm run atlas:proof:cache-namespaces
```

## P3 - Research Boundary

AE/SOM remains a compatibility and routing lane:

```text
embedding_768 -> latent_128 -> latent_64 -> SOM 20x20 -> manifold_4d
```

Allowed:

- routing bonus
- topology labels
- cluster cards
- cache routing

Forbidden:

```text
query -> latent_64 cosine -> answer
```

PPO, adapters, TensorRT expansion, and custom CUDA kernels remain behind replay
and evaluation improvement gates.
