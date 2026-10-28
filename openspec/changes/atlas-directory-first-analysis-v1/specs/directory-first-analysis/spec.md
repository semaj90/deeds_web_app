## ADDED Requirements

### Requirement: Directory-first bounded analysis
The system SHALL analyze a repository by directory and bounded source cohorts before requesting semantic embeddings, and SHALL reuse the existing source-inventory, directory-feature, AST/symbol, graph, retrieval, and ACE owners.

#### Scenario: Large repository analyzed without corpus-wide embedding
- **WHEN** an analysis plan is built for a repository revision
- **THEN** it emits deterministic directory/source cohorts and does not require embedding every eligible file

#### Scenario: Existing owner is available
- **WHEN** a stage has an existing canonical Parent Atlas owner
- **THEN** the plan references that owner and does not create a parallel identity, graph, event, ranking, fusion, or persistence owner

### Requirement: Revision-bound source observations
The system SHALL bind parser, LSP, feature, and summary observations to the exact source bytes and workspace/source revisions from which they were produced.

#### Scenario: LSP positions converted to source byte spans
- **WHEN** an LSP observation uses UTF-16 positions
- **THEN** conversion to UTF-8 byte offsets uses the exact verified source bytes and rejects out-of-range or mismatched-revision spans

#### Scenario: Source changed after inventory
- **WHEN** source bytes differ from the inventory digest before extraction
- **THEN** the stale observation is refused and the source is scheduled for revision-qualified retry rather than counted complete

### Requirement: Explainable directory priority
The system SHALL produce deterministic advisory directory priorities with a versioned feature/weight manifest and component-level explanations.

#### Scenario: Same inputs replay
- **WHEN** the same admitted input manifests and policy revision are evaluated
- **THEN** directory ordering, scores, exclusions, and output checksums are reproducible

#### Scenario: Advisory score consumed by retrieval
- **WHEN** directory priority informs candidate planning
- **THEN** it does not create a canonical identity, promotion, or additional SearchRuntime logical-lane vote

### Requirement: Selective canonical embedding
The system SHALL request embeddings only for explicitly selected, canonical-eligible, source/chunk-bound records using the existing canonical embedding producer and its recorded recipe.

#### Scenario: Candidate lacks canonical lineage
- **WHEN** a candidate has no exact packet/chunk/source and workspace revision binding
- **THEN** embedding generation and persistence are refused for that candidate

#### Scenario: Embedding model family differs
- **WHEN** model, tokenizer, prompt/task recipe, pooling, normalization, dimension, or corpus provenance differs
- **THEN** the representation is kept separate and no vector parity or compatibility is inferred

### Requirement: Optional GPU feature projection
The system SHALL treat cuVS/cuML/cuGraph clustering and graph computations as optional projections over frozen, checksummed inputs, and SHALL require resource admission and CPU-oracle parity before results are eligible for downstream evaluation.

#### Scenario: GPU resources unavailable or unapproved
- **WHEN** live GPU headroom, slot availability, or operator approval is absent
- **THEN** GPU execution does not start and the CPU/advisory plan remains available

#### Scenario: GPU output differs from oracle
- **WHEN** GPU output fails deterministic identity/order or configured numerical parity against the CPU oracle
- **THEN** the output is marked failed and cannot alter canonical identity, retrieval fusion, or persistence

### Requirement: WAL/outbox transport separation
The system SHALL treat Kafka, if introduced, as a replaceable consumer/transport adapter for the existing WAL/outbox owner and SHALL preserve that owner's event identity and replay semantics.

#### Scenario: Duplicate or replayed event
- **WHEN** an outbox event is delivered more than once or replayed after restart
- **THEN** consumers use the existing idempotency identity and do not create duplicate canonical effects

#### Scenario: Event transport unavailable
- **WHEN** Kafka or another optional transport is unavailable
- **THEN** canonical outbox state remains authoritative and events remain recoverable through the existing delivery owner

### Requirement: JSON ingestion preserves provenance
The system SHALL treat JSON/JSONL decomposition as bounded parsing and SHALL preserve repository-relative source path, source reference, detected language, source/workspace revision, and byte provenance without treating parser output as source authority.

#### Scenario: Parser benchmark selection
- **WHEN** SIMDJSON, GPJSON, or a GPU parser is evaluated
- **THEN** selection uses representative end-to-end throughput, transfer cost, memory bound, and exact semantic/output parity; no parser dependency is added solely from a microbenchmark

#### Scenario: Malformed or unbound upload row
- **WHEN** an upload row is malformed or lacks required provenance
- **THEN** it is quarantined with a deterministic diagnostic and is not admitted to embeddings, clustering, or ACE context

### Requirement: Bounded residency and artifact cache
The system SHALL keep transient CPU/GPU cache entries bounded and revision-addressed, and SHALL store durable bulk artifacts only through existing checksummed artifact owners.

#### Scenario: Cache eviction and replay
- **WHEN** a cache entry is evicted or a process restarts
- **THEN** active leases are respected and the entry can be reloaded from a verified artifact reference without changing canonical state

#### Scenario: Hidden runtime state
- **WHEN** memory or cache artifacts are created
- **THEN** hidden thoughts, chain-of-thought, KV cache, and raw live tensor state are not persisted as durable memory

### Requirement: Qualified ACE prefill trace
The system SHALL pass selected results to the LLM only through the existing SearchRuntime and ACE ContextManifest/PromptPlan path with exact source-backed evidence and bounded context.

#### Scenario: Directory recommendation reaches prefill
- **WHEN** an agentic query uses directory-first recommendations
- **THEN** the trace proves canonical identity/revisions, selected evidence checksums, one-vote-per-logical-lane fusion, and ContextManifest/PromptPlan readback before synthesis

#### Scenario: Only advisory or raw hits exist
- **WHEN** results lack qualified source evidence or final ACE canonicalization
- **THEN** raw hits and advisory directory scores are not passed directly to the LLM
