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

### Requirement: Program readiness and scheduler permission are independent

The workboard MUST emit an implementation-program classification for each open task and MUST keep
readiness separate from explicit scheduler permission. `READY`, `ADVANCEABLE`, task counts, and completion
percentage MUST NOT grant execution selection. A task MUST default to `NOT_SELECTED`; only an explicit,
validated selection manifest keyed by the existing stable task identity may mark it `SELECTED`. Missing
owners, dependencies, receipts, and mutation risk MUST remain unknown rather than inferred.
The program MUST expose control-plane Wave 0 plus Waves 1–10, grouped under exactly six macro-milestones
M1–M6; Wave 0 is a foundation and is not a macro-milestone.
Each wave MUST have an explicit gate node for its exit condition; gate prerequisites MUST mirror the
declared wave edges, and work packages MUST reference exactly one gate. Gate nodes are unproven and
unselected until an independent proof receipt is present.

The generated program MUST also expose a separate architecture-only overlay with the seven top-level
milestones M0–M6, program domains, corpus boundaries, canonical ownership roles, and explicit
prerequisite-gate edges. This overlay MUST NOT duplicate leaf tasks, infer task dependencies from
milestone/wave order, or claim runtime evidence. The legacy execution-wave hierarchy and the
architecture overlay are distinct metadata layers and MUST NOT be conflated.
Heuristic change-to-program mappings MUST remain provisional until reviewed. The implementation
program MUST expose a change-level review record with every matching domain rule, candidate corpus,
and impacted open-task count; that review record MUST NOT duplicate leaf-task entries, silently
change the primary mapping, or grant scheduler permission.

#### Scenario: Ready work is not implicitly selected

- **GIVEN** an open task classified as `READY`
- **WHEN** the workboard is generated without an explicit selection manifest
- **THEN** `schedulerPermission=NOT_SELECTED`
- **AND** the task may appear only in advisory recommendations

#### Scenario: Explicit selection is identity-bound

- **GIVEN** a valid selection manifest containing an existing stable task key
- **WHEN** the workboard is generated
- **THEN** only the listed task receives `schedulerPermission=SELECTED`
- **AND** unknown or duplicate selection keys fail closed

#### Scenario: Every open task remains visible in the program plan

- **GIVEN** the current OpenSpec task inventory
- **WHEN** the implementation program is generated
- **THEN** every open task appears exactly once in a classified wave or a separate unclassified review queue
- **AND** a review-queue task has no inferred wave or milestone
- **AND** program grouping does not claim canonical ownership or task completion

#### Scenario: Wave dependencies require proof but do not select tasks

- **GIVEN** an implementation program with ordered waves
- **WHEN** the program plan is generated
- **THEN** each wave exposes its prerequisite wave IDs and prerequisite exit gates
- **AND** a dependent wave is not considered unlocked without a current proof receipt for each prerequisite
- **AND** wave readiness does not grant scheduler selection to any leaf task

#### Scenario: Architecture overlay remains separate from task scheduling

- **GIVEN** the generated implementation program
- **WHEN** its architecture overlay is inspected
- **THEN** it contains milestones M0–M6, architecture domains, corpus boundaries, ownership roles, and explicit gate edges
- **AND** it contains no leaf-task assignment list
- **AND** milestone or wave membership creates no implicit task dependency or scheduler selection
- **AND** overlay evidence is labeled as architectural constraint rather than current runtime proof

#### Scenario: Provisional program mappings expose collisions for review

- **GIVEN** an open change whose name matches one or more provisional program-domain rules
- **WHEN** the implementation program is generated
- **THEN** a change-level review record reports every matching domain and its corpus
- **AND** the record identifies the impacted open-task count
- **AND** ambiguous matches remain provisional without altering leaf assignments or selecting tasks

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
