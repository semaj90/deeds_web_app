## ADDED Requirements

### Requirement: Worker assignments are partitioned by ownership boundary, not completion percentage
The wave plan SHALL group OpenSpec changes into worker assignments based on shared implementation
files, shared canonical owners (e.g. SearchRuntime, domain-taxonomy, canonical-rerank-executor,
packet identity, shared ACE contracts), or shared architectural surface — never purely by sorting
on completion percentage. Two changes that share a canonical owner SHALL be assigned to the same
worker, even if that reduces parallelism.

#### Scenario: Two changes touching the same canonical owner are not split across workers
- **WHEN** `parent-atlas-neural-prefill-encoder` and `parent-atlas-prefill-routing-residency-convergence`
  both touch the neural-decoder prefill caller seam
- **THEN** both are assigned to the same worker, not two concurrent workers

### Requirement: Every worker starts with a read-only blocker census before implementing
Before making any code or schema change, each worker SHALL produce a written classification of
every remaining open task in its owned changes into one of: `PROVEN`, `CLOSED_NEGATIVE`, `BLOCKED`,
`READY_TO_IMPLEMENT`, or `OPERATOR_DECISION`. Implementation SHALL be limited to tasks classified
`READY_TO_IMPLEMENT` whose prerequisites are all independently `PROVEN`.

#### Scenario: A worker skips the census and starts implementing immediately
- **WHEN** a worker begins editing implementation files before producing the blocker census
- **THEN** that worker's output is non-conformant with this contract and must be redone with the
  census first

### Requirement: A disproven hypothesis is a valid terminal state
Workers SHALL treat `CLOSED_NEGATIVE` / `NOT_A_FUSION_LANE` / `BLOCKED_STRUCTURALLY_ABSENT` as
legitimate closed states for a task that set out to prove or disprove a specific claim. A task
SHALL NOT be left open merely because its answer turned out to be negative.

#### Scenario: A traced producer-to-persistence edge is proven absent
- **WHEN** a worker proves that a hypothesized data-flow edge does not exist (e.g. a materializer
  that reports `persistence: NOT_ATTEMPTED` with no downstream consumer)
- **THEN** the task is checked closed with a `CLOSED_NEGATIVE` annotation, not left as `[ ]` open

### Requirement: No new capability owner without a proven gap
Workers SHALL NOT install new dependencies, MCP servers, or frameworks, and SHALL NOT introduce a
second implementation of a capability that already has a `CANONICAL_OWNER` per
`docs/architecture/runtime-ownership-registry.json`, without first recording a capability-gap
justification per this repository's `DEPENDENCY-CAPABILITY-GUARD-01` rule.

#### Scenario: A worker wants ast-grep's official MCP server
- **WHEN** a worker considers adopting a new MCP integration to make a capability request-time-live
- **THEN** it records the capability gap and current-owner justification first, and does not install
  the dependency in the same pass that identifies the option

### Requirement: Shared-owner convergence is deferred, not resolved unilaterally by one worker
When two workers' assignments would both need to edit the same canonical owner, shared ownership
registry, or shared architecture document (e.g. `SearchRuntime`, `domain-taxonomy.ts`,
`canonical-rerank-executor.ts`, packet identity, ACE shared contracts), each worker SHALL stop at a
receipt/proposal boundary for that shared edit and defer it to an explicit convergence step, rather
than one worker unilaterally applying the change.

#### Scenario: Two workers' plans both require touching SearchRuntime's fusion lane set
- **WHEN** Worker E's retrieval-convergence assignment and Worker F's semantic-residency assignment
  both identify a needed SearchRuntime change
- **THEN** neither applies it directly; both record the proposed change as a receipt and the
  supervisor/operator performs the convergence

### Requirement: Actual subagent launch requires a separate, explicit go-ahead
Recording this wave plan (this change) SHALL NOT itself authorize spawning any subagent or worker.
A named wave (or a named subset of workers within a wave) SHALL only be launched after an explicit,
separate operator instruction identifying which wave/workers to launch.

#### Scenario: This change is committed but no agents have been launched yet
- **WHEN** this change's tasks.md is written and validated
- **THEN** zero subagents have been spawned as a result, and none should be inferred as authorized
