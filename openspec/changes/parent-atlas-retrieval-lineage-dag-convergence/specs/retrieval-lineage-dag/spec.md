# Retrieval Lineage and DAG Convergence

## MODIFIED Requirements

### Requirement: canonical semantic projection remains revision-qualified

The system MUST treat `semantic_768` as the canonical dense representation and
MUST keep Qdrant point identity separate from canonical packet/source identity.

#### Scenario: projection result hydration

- GIVEN a Qdrant `_768_v2` result
- WHEN the result is returned to retrieval or OaK execution
- THEN it MUST carry projection identity and hydrate canonical content through
  PostgreSQL without fabricating missing source or revision fields

### Requirement: unresolved lineage fails closed

The system MUST reject promotion and governed execution when required lineage
cannot be resolved exactly.

#### Scenario: missing source revision

- GIVEN a candidate or projection without required source lineage
- WHEN it enters promotion, bridge reconciliation, or governed execution
- THEN the operation MUST reject it with a typed failure and perform zero writes

### Requirement: one exact owner per DAG binding

The system MUST resolve every admitted DAG action to exactly one registered
callable implementation owner.

#### Scenario: implementation reference admission

- GIVEN a planned OaK action
- WHEN it is admitted to the bounded executor
- THEN its implementation reference, operator identity, bound-argument checksum,
  input contract, and output contract MUST match a registered callable owner

### Requirement: deterministic read-only replay

The system MUST produce the same deterministic receipt for repeated execution
of an unchanged read-only plan.

#### Scenario: replay the same frozen plan

- GIVEN unchanged evidence, revisions, and a frozen plan
- WHEN the plan executes twice in read-only mode
- THEN normalized action outputs, evidence references, statuses, and the final
  deterministic execution checksum MUST match
- AND timing, process, session, and transport metadata MUST NOT affect that checksum

### Requirement: learned and native representations remain distinct

The system MUST preserve distinct identities and revisions for native and
learned representations.

#### Scenario: representation tournament

- GIVEN one exact CandidateOrdinal cohort
- WHEN native MRL and learned latent representations are evaluated
- THEN each representation MUST retain a distinct representation ID and revision
- AND no learned representation may become canonical without a separate promotion receipt
