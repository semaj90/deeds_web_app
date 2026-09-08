## ADDED Requirements

### Requirement: AtlasPassCheckpointV1 is the shared resumability contract for bounded compute passes
The system SHALL define `AtlasPassCheckpointV1` carrying `passId`, `algorithmRevision`,
`inputSnapshotChecksum`, `iteration`, `maxIterations`, `derivedArtifactChecksum`,
`ordinalMapChecksum`, `converged`, and a bounded `stopReason` enum. Any bounded, resumable compute
pass (K-means, PCA/SVD, SOM training, Graphify AST/graph lowering, Hilbert-range topology
enrichment, agent/error-fixing traversal) that wants checkpoint/resume behavior SHALL use this
contract rather than a bespoke per-pipeline checkpoint shape.

#### Scenario: Resuming from a checkpoint reproduces the uninterrupted result
- **WHEN** a bounded compute pass is checkpointed mid-run, the process is killed, and the pass is resumed from that checkpoint
- **THEN** the final `derivedArtifactChecksum` matches what an uninterrupted run over the same `inputSnapshotChecksum` and `algorithmRevision` would produce

#### Scenario: A checkpoint records why the pass stopped
- **WHEN** a compute pass reaches a stopping condition
- **THEN** `stopReason` is set to one of the defined enum values, never left null on a converged or terminated pass

### Requirement: AtlasPassCheckpointV1 excludes ML activation checkpoints and LLM KV cache
The system SHALL NOT use `AtlasPassCheckpointV1` to represent PyTorch activation-checkpoint
memory-tradeoff state or LLM KV-cache execution state. Those remain their own separate,
already-defined mechanisms.

#### Scenario: A training activation checkpoint is not modeled as an AtlasPassCheckpointV1
- **WHEN** a PyTorch training loop uses activation checkpointing for memory savings
- **THEN** no `AtlasPassCheckpointV1` row is created to represent that forward/backward recompute boundary

#### Scenario: LLM KV cache is never persisted as a pass checkpoint
- **WHEN** an LLM inference call produces KV-cache tensors
- **THEN** those tensors are never serialized into an `AtlasPassCheckpointV1` or any other durable Atlas contract
