## ADDED Requirements

### Requirement: Build source-label features from revision-qualified evidence
The label-feature adapter SHALL consume the existing domain taxonomy revision, source role,
revision-qualified AST keyword signals, and optionally revision-qualified NLP/domain evidence. It
SHALL require sourceRef, sourceRevision, workspaceRevision, producer revision, taxonomy revision,
and at least one evidence reference. Evidence with mismatched source/workspace/taxonomy revisions
SHALL be rejected. It SHALL emit a deterministic checksum and `canonicalAuthority=false`; it SHALL
NOT assign packet, feature, symbol, or ontology identity and SHALL NOT persist or project labels.

#### Scenario: Exact AST feature becomes a deterministic label feature
- **WHEN** AST keyword counts and a predicted domain carry matching admitted source/workspace and
  producer/taxonomy revisions with evidence references
- **THEN** the adapter SHALL emit a stable checksummed `LabelFeatureV1`
- **AND** the predicted domain SHALL belong to the supplied existing canonical domain vocabulary

#### Scenario: Stale or unsupported labels fail closed
- **WHEN** evidence revisions disagree or a proposed domain is outside the supplied taxonomy
- **THEN** the adapter SHALL reject the feature rather than normalize, infer, or promote a label

### Requirement: Emit noncanonical label proposals for review
Label classifier/rule/NLP results SHALL be represented as `LabelProposalV1` values bound to the
feature checksum, source/workspace revisions, taxonomy revision, producer revision, and evidence
references. Proposals SHALL remain review-required and noncanonical; only the existing ontology
resolver may admit a canonical assignment. Proposal generation SHALL be deterministic and SHALL
reject a mutated feature checksum.

#### Scenario: Revision-bound evidence produces review proposals
- **WHEN** a validated label feature contains evidence from the active taxonomy revision
- **THEN** each supported label SHALL become a deterministic review-required proposal
- **AND** proposal output SHALL retain the source/workspace and evidence lineage
- **AND** no ontology assignment or store write SHALL occur
