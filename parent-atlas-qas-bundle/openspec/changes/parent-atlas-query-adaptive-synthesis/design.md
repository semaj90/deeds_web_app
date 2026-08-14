# Design

## Runtime DAG

QUERY
  -> QueryIntentEnvelopeV1
  -> SOM/domain route
  -> software-head activation
  -> cheap candidate sketch
  -> QueryConditionedSamplerV1
  -> exact promotion
  -> ContextManifest extension
  -> plan candidates
  -> plan selector
  -> model prefill/decode
  -> ExecutionReceipt / ValidationReceipt

Offline:
receipts -> recommendation analysis -> GEPA/GRPO shadow datasets -> shadow evaluation -> explicit promotion gate

## Software heads
- semantic: embedding/domain/ontology
- structural: AST/graph/process
- lexical: exact/FTS/trigram/BM42 when available
- execution: prior receipts/success/latency
- memory: reuse/residency/promotion cost
- program: examples/program/adapter eligibility

These are software feature producers, not transformer attention heads.

## Query-conditioned proposal score

For candidate i and query q:

base_i = ||x_i||_2^2
A(i,q) = sigmoid(
  ws * semanticAffinity +
  wg * graphAffinity +
  wd * domainAffinity +
  wp * processAffinity +
  we * executionPrior
)
p_i(q) ∝ base_i * max(A(i,q), epsilon)

The first production slice is deterministic weighted sampling with a seeded PRNG.
It is a Tang-inspired shadow estimator, not a claim to implement Tang's theorem.

## Exact baseline
Every QAS report must include:
- baseline candidate count
- sampled candidate count
- overlap@K with exact scorer
- recall@K
- selected canonical IDs after exact promotion
- estimated compute reduction
- policy revision
- feature revision
- SOM/topology revision when available

## Daily Graphify binding
Daily Graphify owns refresh of structural/topological inputs.
QAS runs AFTER successful Graphify refresh as a read-only shadow stage:
1. discover/validate current Graphify revision,
2. read feature/topology inputs,
3. produce QAS shadow report,
4. optionally materialize Kanban recommendations from durable evidence refs,
5. never make Graphify success depend on experimental QAS quality.

A QAS runtime failure must be reported but must not silently rewrite or invalidate Graphify truth.
