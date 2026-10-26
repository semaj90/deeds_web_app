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

#### Scenario: missing or conflicting projection content binding

- GIVEN a Qdrant result with a PostgreSQL row identifier
- WHEN either content hash is missing, the hashes differ, source references
  disagree, a supplied chunk identifier disagrees, or canonical content is absent
- THEN hydration MUST reject that result rather than return Qdrant payload content
- AND duplicate canonical readback rows MUST NOT be resolved by last-row selection
- AND successful batch hydration MUST preserve candidate order without assigning
  a Qdrant point identifier as packet identity

#### Scenario: lineage cannot substitute for chunk row revisions

- GIVEN a projection candidate joined to packet/chunk lineage and source bindings
- WHEN the chunk row's source or workspace revision is absent or differs from
  the qualified lineage and requested workspace
- THEN revision-qualified hydration MUST reject the candidate
- AND competing source binding rows MUST remain visible to ambiguity checks,
  not be hidden by choosing the newest binding

### Requirement: unresolved lineage fails closed

The system MUST reject promotion and governed execution when required lineage
cannot be resolved exactly.

#### Scenario: symbol-scoped callable projection reconciliation plan

- GIVEN one explicit symbol-version ID and workspace revision
- WHEN the existing symbol reconciliation workflow plans a callable projection refresh
- THEN it MUST use a database-enforced read-only transaction and the existing source/AST qualifier
- AND it MUST record observed values, proposed deltas and a deterministic plan checksum
- AND changed AST identity bridges MUST require separate review
- AND missing canonical signature columns MUST NOT be fabricated
- AND planning MUST reject apply/create flags and preserve existing reports
- AND the plan MUST NOT authorize source-revision propagation or production admission

#### Scenario: missing source revision

- GIVEN a candidate or projection without required source lineage
- WHEN it enters promotion, bridge reconciliation, or governed execution
- THEN the operation MUST reject it with a typed failure and perform zero writes

#### Scenario: symbol nomination with a placeholder revision

- GIVEN a symbol nomination whose source or workspace revision is not a canonical `sha256:<64 lowercase hex>` digest
- WHEN it enters canonical symbol promotion
- THEN promotion MUST reject the nomination before opening a database connection
- AND no registry, alias, symbol-version, or callable-projection writes may occur

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
