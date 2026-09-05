## ADDED Requirements

### Requirement: Workboard snapshot identity
The workstation SHALL consume the existing OpenSpec workboard projection and SHALL record the workboard source path, generated timestamp, report checksum, and task-ledger source checksums before selecting work.

#### Scenario: Stable snapshot
- **WHEN** the same task ledgers are used without changes
- **THEN** rebuilding the snapshot produces the same normalized task population and checksum apart from diagnostic timestamps

#### Scenario: Changed task ledger
- **WHEN** an authoritative task ledger changes
- **THEN** the next snapshot has a different source checksum and prior cached plans are not treated as current

### Requirement: Deterministic task identity and readiness
The workstation SHALL derive stable task identities from the OpenSpec change identifier, task source path, line/location, normalized task text, and task checksum, and SHALL classify readiness using explicit evidence and dependency rules.

#### Scenario: Blocked task
- **WHEN** a task has an unresolved blocker or missing required evidence
- **THEN** it is classified as `BLOCKED` or `NEEDS_PROOF` and cannot be selected as executable work

#### Scenario: Proven task
- **WHEN** a task has matching linked evidence, satisfied dependencies, and no stale or superseded marker
- **THEN** it may be classified `READY` for bounded planning

#### Scenario: Unclassified task
- **WHEN** a task is not covered by the portfolio classification
- **THEN** it remains explicitly `UNCLASSIFIED` and is not silently promoted by completion percentage

### Requirement: Bounded work plan
The workstation SHALL emit an `OpenSpecWorkPlanV1` containing one bounded next action, task identity, current state, blockers, prerequisites, evidence references, likely files, expected mutation class, and validation commands.

#### Scenario: Candidate cap
- **WHEN** more tasks are ready than the configured planning limit
- **THEN** deterministic dependency and priority rules select only the bounded limit and record excluded candidates

#### Scenario: No executable candidate
- **WHEN** all candidates are blocked, stale, superseded, or require human authorization
- **THEN** the plan reports `NO_EXECUTABLE_CANDIDATE` and does not invoke synthesis or mutation

### Requirement: Grounded ACE context
The workstation SHALL assemble ACE context from selected task and evidence references with a token budget, context checksum, and source/workboard revision set, and SHALL NOT pass the complete task backlog directly to a model.

#### Scenario: Context assembly
- **WHEN** a bounded candidate is selected
- **THEN** the resulting ContextManifest contains only selected references, checksums, and bounded materialized content

#### Scenario: Missing evidence
- **WHEN** a referenced receipt, report, source file, or test is missing
- **THEN** the candidate is downgraded or rejected and the missing reference is recorded

### Requirement: Governed Ornith synthesis
The workstation SHALL call the existing llama-server `:8090` boundary only with a validated context manifest and SHALL record the resolved loaded model, model/prompt revisions, input checksum, output checksum, and synthesis status.

#### Scenario: Dry-run synthesis
- **WHEN** a valid bounded context is supplied in dry-run mode
- **THEN** Ornith may produce a recommendation receipt, but the receipt cannot change task state, source identity, graph identity, or canonical evidence

#### Scenario: Runtime mismatch
- **WHEN** the loaded model is unavailable or violates the configured runtime policy
- **THEN** synthesis fails closed and no fallback model or Ollama chat path is selected

### Requirement: Revision-safe residency
BitFrost/Valkey residency SHALL store only references to revision-qualified context and plan artifacts, and SHALL verify the complete identity set on every read.

#### Scenario: Exact cache hit
- **WHEN** workboard, task, evidence, context, model, and prompt revisions all match
- **THEN** the cached plan may be reused and is reported as an exact hit

#### Scenario: Stale cache entry
- **WHEN** any required revision or checksum differs
- **THEN** the entry is rejected as stale and is not used as planning authority

### Requirement: Explicit mutation gate
The workstation SHALL keep planning and synthesis separate from mutation and SHALL require an explicit authorization plus a successful validation receipt before changing task ledgers or source files.

#### Scenario: Plan-only execution
- **WHEN** no mutation authorization is present
- **THEN** the workflow reports zero writes and leaves all task ledgers and source files unchanged

#### Scenario: Stale plan application
- **WHEN** the current task/source revision differs from the plan base revision
- **THEN** the mutation is rejected as stale and a new plan is required
