# Policy routing requirements

## Requirement: Separate spaces
The implementation SHALL keep semantic embeddings, ranking features, HMM probabilities, graph
metrics, and policy-control features as distinct typed spaces.

## Requirement: Finite actions
The policy SHALL select only from a versioned finite action set. Model output SHALL NOT invent an
unbounded graph/search/tool action outside that set.

## Requirement: HMM ownership
The policy SHALL consume HMM/Viterbi state and SHALL NOT implement a second temporal-state owner.

## Requirement: Canonical asynchronous reduction
Concurrent pass results SHALL be reduced by canonical packet identity and revision tuple. Physical
completion order SHALL NOT alter final materialization.

## Requirement: Bounded tool concurrency
The orchestrator SHALL enforce a configurable maximum number of parallel tool executions and
resource-class limits independent of model-native parallel-tool behavior.

## Requirement: Geometry experiment isolation
SOM coordinates, KMeans cluster IDs, latent representations, and Jacobian diagnostics SHALL remain
derived experimental artifacts until an explicit evaluation/promotion gate passes.

## Requirement: Training provenance
Policy, QLoRA, preference, or RL datasets SHALL use provenance-backed outcomes. Unverified model
self-labels SHALL NOT be treated as ground truth.
