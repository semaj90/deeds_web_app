## ADDED Requirements

### Requirement: Every legal move is typed and registered
The system SHALL represent every action an agentic repair/recommendation loop may select as a
typed `AgenticActionV1` record with `mutability` and `requiresHumanApproval` fields. An LLM SHALL
NOT invent tool/action semantics outside this registry.

#### Scenario: Action lookup by id
- **WHEN** a caller looks up action id `RUN_TYPECHECK` in the registry
- **THEN** it returns a typed `AgenticActionV1` record with `mutability: "READ_ONLY"` and
  `requiresHumanApproval: false`

### Requirement: Mutation actions require explicit mutability classification
Any action capable of writing to source, database, cache, or graph state SHALL declare a
non-`READ_ONLY` `mutability` value. No action defaults to a mutating capability.

#### Scenario: Source-mutating action is explicitly classified
- **WHEN** `APPLY_SOURCE_PATCH` is looked up
- **THEN** its `mutability` is `"SOURCE_WRITE"`, distinct from `READ_ONLY` actions like
  `RG_EXACT_SEARCH`

### Requirement: Registry is queryable, not just enumerable
The registry SHALL support lookup by exact `actionId` and SHALL support filtering by `kind` and
`mutability`, so a future BM25/lexical layer (a later, unimplemented gate) has a well-defined
in-memory source to eventually back with a searchable index.

#### Scenario: Filter by mutability
- **WHEN** a caller filters the registry for `mutability: "READ_ONLY"`
- **THEN** only non-mutating actions (e.g. `RG_EXACT_SEARCH`, `AST_EXPAND`, `RUN_TYPECHECK`) are
  returned

### Requirement: Agent proposals resolve through the existing action registry
The bounded agent runtime SHALL treat `CapabilityRegistryV1` as a revision-qualified projection of
the existing `AGENTIC_ACTION_REGISTRY_V1_SEED`, not as a second mutable or canonical registry.
Before execution it SHALL validate the proposal schema, exact action/capability revision, admitted
ContextManifest checksum and evidence references, read-only policy, and executor/tool revision.
Compact ordinals SHALL resolve only with the exact registry revision and SHALL never replace the
action or capability identity.

#### Scenario: Proposal names an unknown or stale action
- **WHEN** a proposal names an unregistered action or a revision other than the current registry
- **THEN** execution is rejected before the executor is invoked

### Requirement: Tool execution receipts are transport evidence only
Every read-only tool call SHALL produce a typed receipt binding the authorized proposal checksum,
execution step, capability revision, tool revision, input checksum, output checksum, and observation
time. MCP/OpenCode transport envelopes, tool receipts, and ephemeral RLM working state SHALL declare
`canonicalAuthority: false`; the existing workflow event and agent-work receipt owners remain the
run identity and durable receipt owners.

#### Scenario: Replay closes with verified receipts
- **WHEN** a frozen replay has a valid receipt for every expected step and each receipt matches
  its authorized proposal, exact tool revision, input, and observed output
- **THEN** the bounded replay may return a non-authoritative final result
- **AND** missing, stale, mismatched, or write-class steps prevent replay closure
