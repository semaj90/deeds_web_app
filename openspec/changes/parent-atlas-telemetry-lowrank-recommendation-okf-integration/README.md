# parent-atlas-telemetry-lowrank-recommendation-okf-integration

Status: Proposed

This OpenSpec integrates five separately owned lanes under one control-plane umbrella:

- deterministic event hypergraph / n-ary symbolic events
- OKF ontology / domain classification / linked tuples
- HyperLogLog and timestamp-based telemetry
- low-rank approximation / sampled feature construction
- recommendation scoring with exact-oracle validation

The OKF ontology layer is the durable classification and lineage surface. It is not the owner of
telemetry, approximation, event truth, or recommendation policy.

Deterministic AST structure remains the upstream truth source. The event hypergraph lane sits
between AST truth and the recommendation engine: it compiles n-ary symbolic events from exact
structural evidence, while semantic enrichment remains a separate interpretive pass.

Implementation note: the first concrete contract file now lives at
`sveltekit-frontend/src/lib/server/analysis/event-hypergraph-contract.ts`, with a matching
contract test at `sveltekit-frontend/src/lib/server/analysis/event-hypergraph-contract.spec.ts`.
