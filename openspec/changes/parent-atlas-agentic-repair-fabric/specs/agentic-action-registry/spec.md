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
