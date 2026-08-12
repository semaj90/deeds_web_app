# Parent Atlas Fabric Lanes — 2026-08-11

This is a support note, not a new owner.

## Identity

- Canonical logical packet identity: `packet-key-builder.ts`
- Compatibility / scoped-address helper: `compute-packet-key.ts`
- Workspace scope stays outside logical packet identity.

## Pass fabric

- PF0-PF3 are verified done from direct source read.
- PF4 is proven via live current-materialization receipt.
- Deterministic replay and stochastic execution history stay separate.
- `analysis_pass_current` is the eligible-materialization projection, not final truth.

## Retrieval / topology / approximation

- exact kNN: canonical semantic retrieval proof lane
- GNN / graph-message passing: graph evidence lane, not truth
- KMeans / SOM: cache-hint routing only
- Ewin Tang / low-rank: approximation / shadow lane only

## Telemetry

- HyperLogLog is telemetry projection only.
- Breadth counts are derived, not canonical state.

## Recommendation / task board

- Recommendation is a deterministic baseline + exact oracle + shadow lane.
- Kanban is the execution surface for recommendations and receipts.
- The task board must not become a truth owner.

## Open gates

- live Valkey HLL materializer
- recommendation promotion guard
- graph dispatcher registry completeness
- Louvain durable persistence receipt
- one-vote-per-lane / live fusion-owner matrix
