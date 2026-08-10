# Parent Atlas Policy Routing Integration

Status: SCAFFOLDED / NOT PROMOTED

Dependency note: betweenness-dependent graph features remain blocked until Patch H is proven against a
fresh frozen graph artifact. The policy layer may be compiled/tested using already-proven features,
but no Patch-H-derived feature may enter a promoted policy until the graph verifier is green.

Key contracts:

- small `PolicyStateTensor`, not `semantic_768`
- covector/linear heads for finite action scores
- HMM remains temporal-state owner
- max 3 concurrent tool tasks at Atlas executor boundary
- GPU_HEAVY and LLM default to concurrency 1
- asynchronous result reduction by canonical packet + revision
- JVP/VJP diagnostics rather than full Jacobian materialization
- 20x20 SOM experiment is derived routing metadata only
