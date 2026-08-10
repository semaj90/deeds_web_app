## ADDED Requirements

### Requirement: One logical runtime capability SHALL have one canonical owner
Before registering a new runtime implementation of a capability (a retrieval
lane, reranker, graph algorithm, representation, sidecar service, ACP/MCP
tool, persistence writer, cache, feature producer, or chunking
implementation), the system SHALL identify the capability's current
canonical owner (if any), its live callers, its public contract, and its
persistence/output boundary before writing new code.

#### Scenario: An existing canonical owner is found
- **WHEN** a new implementation is proposed for a capability that already has
  a `CANONICAL_OWNER` entry in `docs/architecture/runtime-ownership-registry.json`
- **THEN** the new implementation SHALL be wired in behind the existing
  contract (as a `BACKEND` or `ADAPTER`), and SHALL NOT create a second
  independently-selectable route, dispatcher, persistence writer, or fusion
  vote for the same capability

#### Scenario: Multiple implementations already exist with no clear canonical owner
- **WHEN** an audit finds multiple implementations of one capability with no
  single one classified `CANONICAL_OWNER`
- **THEN** exactly one SHALL be classified `CANONICAL_OWNER` before further
  implementation work proceeds on that capability, and the others SHALL
  receive an explicit non-canonical classification
  (`BACKEND`/`ADAPTER`/`EXPERIMENT`/`COMPATIBILITY`/`FIXTURE_ONLY`/`DEAD`)

#### Scenario: Ownership cannot be established
- **WHEN** an agent cannot determine which implementation (if any) is
  canonical for a capability
- **THEN** the agent SHALL stop implementation and record the ambiguity in
  an OpenSpec change rather than guessing or picking one arbitrarily

### Requirement: Same vector dimension does not imply representation identity
The system SHALL NOT treat two representations as interchangeable or
mergeable solely because they share a vector dimension.

#### Scenario: A new 768-dimensional representation is proposed
- **WHEN** a new representation (e.g. `codebert_768` or `graphcodebert_768`)
  is proposed alongside the existing `semantic_768`
- **THEN** the system SHALL treat it as a distinct representation with its
  own `representation_id`, and SHALL NOT assume coordinate compatibility or
  promotion eligibility with `semantic_768` merely because both are 768-dim

### Requirement: Sidecar/backend passes are exposed through coarse-grained ACP tools, not one tool per pass
The system SHALL expose multiple internal implementation passes representing
one logical capability through a small number of coarse-grained ACP tools,
and SHALL NOT register a separate ACP tool per backend/pass.

#### Scenario: A sidecar gains a new internal pass
- **WHEN** a new internal pass is added to a sidecar's pass registry
- **THEN** it SHALL be exposed, where appropriate, through an existing
  coarse-grained ACP tool's input schema, and SHALL NOT by default require
  registering a new ACP tool

### Requirement: One logical retrieval lane contributes at most one independent fusion vote
The system SHALL ensure that new lexical, dense, sparse, graph, or rerank
backends pass through the canonical retrieval/rerank ownership for their
capability, contributing at most one independent vote to fusion/RRF.

#### Scenario: A new reranking backend is added
- **WHEN** a new reranking model (e.g. a new cross-encoder) is added
- **THEN** it SHALL be wired in as a backend behind the canonical reranker
  owner's existing fusion contribution, and SHALL NOT introduce a second,
  independently-scored fusion vote for reranking

### Requirement: The ownership audit distinguishes known-existing debt from new violations
The system SHALL classify an ownership audit finding as `KNOWN_EXISTING`
(warning only) if it matches an entry already recorded in
`docs/architecture/runtime-ownership-baseline.json`, and as a failing new
violation only if it does not.

#### Scenario: The audit runs against a diff with no new duplication
- **WHEN** `npm run atlas:audit:ownership` runs and every finding matches an
  entry in the baseline file
- **THEN** the audit SHALL report `status: 'PASS'`, even though pre-existing
  duplication is still present and reported as `known_existing`

#### Scenario: A diff introduces a new uncoordinated peer owner
- **WHEN** a new implementation is added that is not wired behind an
  existing canonical owner and is not recorded in the baseline
- **THEN** the audit SHALL report `status: 'FAIL'` with a violation in its
  `violations` array
