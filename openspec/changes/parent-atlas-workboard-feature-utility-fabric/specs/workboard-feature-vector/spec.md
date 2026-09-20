# Workboard feature vector

## ADDED Requirements

### Requirement: Tournament features are observations, not defaults

A workboard feature row entering a tournament MUST carry a presence mask per feature. A feature with
no real observation MUST be marked absent and MUST NOT be filled with a constant default that is later
treated as an observation.

#### Scenario: Missing feature is not fabricated

- **GIVEN** a task whose source rows carry no value for `estimatedMinutes`
- **WHEN** the feature row is built
- **THEN** `present=false` is recorded for that feature
- **AND** no default such as 15 or 0.5 is emitted as an observed value

#### Scenario: Degenerate feature matrix blocks challengers

- **GIVEN** fewer than two qualified features vary across the candidate tasks
- **WHEN** a challenger ordering is requested
- **THEN** the producer reports a degenerate status with an empty ordering
- **AND** the tournament reports no comparison

### Requirement: Challengers remain advisory

A tournament challenger MUST NOT reorder tasks or alter execution state. Deterministic critical-path
rank and upstream execution state remain authority.

#### Scenario: Challenger has no authority

- **GIVEN** a challenger ordering exists
- **WHEN** the tournament report is written
- **THEN** every row has `eligibleForAuthority=false`
- **AND** `writesPerformed=false`

### Requirement: Topic identity is not title identity

A topic MUST be identified by a deterministic id derived from a normalized topic key. A display title
MUST NOT be used as the identity, and a cluster or centroid MUST NOT become topic identity.

#### Scenario: Same key yields the same id

- **GIVEN** the same normalized topic key and namespace
- **WHEN** the topic id is derived twice
- **THEN** both ids are identical

#### Scenario: Version-distinct topics stay distinct

- **GIVEN** two documents for different language versions of one topic
- **WHEN** topic identity is derived
- **THEN** the version is part of the key where the versions differ materially
