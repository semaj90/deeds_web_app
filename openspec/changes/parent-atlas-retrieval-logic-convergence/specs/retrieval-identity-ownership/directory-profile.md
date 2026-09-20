# Directory profile and ranking hints

## ADDED Requirements

### Requirement: Directory profiles are deterministic derived projections

Directory profiles MUST derive their identity from repository identity, a
normalized directory path, and workspace revision. They MUST preserve the
revision-qualified file and chunk evidence used to build their bounded
aggregates and MUST NOT become canonical source or packet identity.

#### Scenario: Equivalent path forms share one derived directory identity

- **GIVEN** equivalent Windows and POSIX path separators for the same
  repository, directory, and workspace revision
- **WHEN** directory profiles are aggregated
- **THEN** the normalized directory path and deterministic directory identity
  are equal

### Requirement: Directory metadata is a bounded weak prior

Directory and domain metadata MAY adjust an existing candidate score by a
bounded amount, but MUST NOT create an independent retrieval lane or override
exact symbol or identifier evidence solely because a path matches.

#### Scenario: Exact evidence is protected from a path-only boost

- **GIVEN** a candidate has an exact symbol or identifier match
- **WHEN** directory and domain metadata also match
- **THEN** the weak-prior adjustment is zero
- **AND** the candidate remains in its existing logical lane

## ADDED Requirements

### Requirement: Retrieval text is revisioned and bounded

The semantic input text MUST be deterministically assembled from grounded
identity and evidence fields, record a template revision and checksum, and
bound embedded source text. Building this representation MUST NOT write or
promote a vector.

#### Scenario: Same grounded input replays identically

- **GIVEN** the same packet, source, workspace, evidence fields, and template
  revision
- **WHEN** retrieval text is built repeatedly
- **THEN** the text and checksum are identical
- **AND** canonical authority remains false
