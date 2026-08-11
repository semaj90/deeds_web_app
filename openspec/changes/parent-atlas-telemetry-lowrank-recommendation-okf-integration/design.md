# Design: Parent Atlas Telemetry + Low-Rank + Recommendation + OKF Integration

## Contract split

The implementation is organized into four lanes:

1. OKF ontology / classification / linked tuples
2. telemetry breadth / timestamps / HyperLogLog
3. low-rank approximation / sampled call-stack features
4. recommendation scoring / exact oracle / executor

## Key principle

The durable knowledge layer is the OKF ontology and linked-evidence layer.
Everything else is derived:

- telemetry is observation,
- low-rank is approximation,
- recommendation is policy.

## Data flow

1. Collect packet and workflow telemetry.
2. Materialize breadth features from HyperLogLog counters and timestamps.
3. Build normalized feature blocks.
4. Optionally build low-rank sketch features.
5. Run GPU-assisted scoring.
6. Compare recommendation quality with an exact oracle.
7. Emit a recommendation judgment.
8. Let a separate executor decide whether to apply it.

## Required invariants

- Exact oracle remains the promotion gate.
- HyperLogLog never decides truth.
- OKF tuples never decide residency policy.
- GPU scoring never mutates canonical packet identity.
- Low-rank artifacts stay revisioned and explicit.

## Field families

- Ontology tuple:
  - `subject`
  - `predicate`
  - `object`
  - `evidenceRef`
  - `timestamp`
  - `sourceRevision`
  - `representationRevision`
  - `producerId`
  - `producerRevision`

- Telemetry breadth:
  - `packetKey`
  - `workflowHllKey`
  - `symbolHllKey`
  - `userHllKey`
  - `neighborhoodHllKey`
  - `countedAt`

- Low-rank feature block:
  - semantic
  - graph
  - workflow
  - cache
  - execution
  - approximation method
  - rank
  - sketch revision

- Recommendation judgment:
  - packet key
  - action
  - score
  - reasons
  - exact oracle delta
  - judged at

