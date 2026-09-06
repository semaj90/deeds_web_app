# Parent Atlas Residency Scheduler Boundary V1

## Purpose

Separate three kinds of parallelism:

1. **Retrieval fan-out** — up to `tau=3` independent logical evidence branches.
2. **Worker concurrency** — four CPU-side profiles can execute independent work.
3. **Representation residency** — packet projections move through COLD/WARM/HOT states.

These are independent limits.

## Invariants

- `SearchRuntime` remains the sole retrieval/fusion owner.
- `semantic_768` remains the single logical semantic representation.
- Qdrant, cuVS exact, CAGRA, and pgvector are physical semantic executors, never separate semantic votes.
- Canonical packet identity never changes when a representation is prefetched/promoted/demoted.
- Prefetch does not imply ContextManifest admission.
- PostgreSQL `analysis_jobs` remains canonical durable work state.
- RabbitMQ, if enabled, is dispatch only.
- GPU work is admitted through one logical `GPU-0` arbiter on the 8 GB class device.
- ACE controls residency/prefetch; ACE does not become semantic truth.

## Residency ladder

```text
BACKING STORE
    ↓
COLD
identity + artifact refs
    ↓
WARM
card / metadata / summary
    ↓
HOT_CPU
source spans / AST / graph neighborhood
    ↓
HOT_GPU
vectors / tensors / CSR
    ↓
CONSUMED
    ├─ expected reuse → retain
    └─ low reuse      → demote
```

## Example

```text
NOW
selector source                     HOT

PREFETCH
caller metadata                     WARM
capability card                     WARM
test names                           WARM

DON'T FETCH YET
full caller sources                 COLD
2-hop graph                         COLD
```

The decision is based on current relevance, predicted next-use probability, expected reuse,
historical utility, and resource cost. Hysteresis prevents hot/cold thrashing.

## Queue model

```text
Postgres analysis_jobs
    = canonical work state

RabbitMQ
    = optional wakeup/dispatch
    = manual ack
    = prefetch 1 by default

analysis_pass_results
    = append-only execution history
```

## GPU model

```text
CPU narrowing
   ↓
prefetch/hydration
   ↓
small GPU retrieval/graph/rerank jobs
   ↓
release unnecessary GPU residency
   ↓
Ornith/Gemma synthesis
```

nvCOMP is optional and should only be benchmarked for large payloads already destined for GPU
consumption. cuTile is a later fused scoring optimization, not a replacement for cuVS/cuGraph/nvCOMP.
