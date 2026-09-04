# Policy routing requirements

## ADDED Requirements

### Requirement: Separate spaces
The implementation SHALL keep semantic embeddings, ranking features, HMM probabilities, graph
metrics, and policy-control features as distinct typed spaces.

#### Scenario: Feature spaces are constructed
- **WHEN** semantic embeddings, ranking features, HMM probabilities, graph metrics, and
  policy-control features are produced
- **THEN** each is stored/typed as its own distinct space, never merged into a shared untyped blob.

### Requirement: Finite actions
The policy SHALL select only from a versioned finite action set. Model output SHALL NOT invent an
unbounded graph/search/tool action outside that set.

#### Scenario: Policy selects an action
- **WHEN** the policy chooses a next action
- **THEN** the choice is drawn from the current versioned finite action set
- **AND** an action outside that set is rejected rather than invented from raw model output.

### Requirement: HMM ownership
The policy SHALL consume HMM/Viterbi state and SHALL NOT implement a second temporal-state owner.

#### Scenario: Temporal state is needed
- **WHEN** the policy needs current temporal/sequence state
- **THEN** it reads it from the existing HMM/Viterbi owner
- **AND** no second, competing temporal-state implementation is introduced.

### Requirement: Canonical asynchronous reduction
Concurrent pass results SHALL be reduced by canonical packet identity and revision tuple. Physical
completion order SHALL NOT alter final materialization.

#### Scenario: Concurrent pass results arrive out of order
- **WHEN** multiple concurrent pass results for the same logical packet complete in different order
- **THEN** they are reduced by canonical packet identity and revision tuple
- **AND** the final materialized result is identical regardless of arrival order.

### Requirement: Bounded tool concurrency
The orchestrator SHALL enforce a configurable maximum number of parallel tool executions and
resource-class limits independent of model-native parallel-tool behavior.

#### Scenario: Multiple tool calls are requested
- **WHEN** the model requests more parallel tool executions than the configured limit
- **THEN** the orchestrator enforces the configured maximum and resource-class limits
- **AND** does not defer to whatever concurrency the model itself attempted.

### Requirement: Geometry experiment isolation
SOM coordinates, KMeans cluster IDs, latent representations, and Jacobian diagnostics SHALL remain
derived experimental artifacts until an explicit evaluation/promotion gate passes.

#### Scenario: A geometry artifact is produced
- **WHEN** SOM coordinates, KMeans cluster IDs, latent representations, or Jacobian diagnostics are computed
- **THEN** they are treated as derived/experimental only
- **AND** they are not promoted to canonical/authoritative use until an explicit evaluation/promotion gate passes.

### Requirement: Training provenance
Policy, QLoRA, preference, or RL datasets SHALL use provenance-backed outcomes. Unverified model
self-labels SHALL NOT be treated as ground truth.

#### Scenario: A training dataset is assembled
- **WHEN** policy, QLoRA, preference, or RL training data is assembled
- **THEN** each example's outcome label is provenance-backed (traceable to a real, verified result)
- **AND** an unverified model self-label is never treated as ground truth.
