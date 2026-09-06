## ADDED Requirements

### Requirement: CandidateEvidenceCardV1 grounded-extraction contract
The system SHALL define a `CandidateEvidenceCardV1` Zod contract carrying `canonicalId`,
`packetKey`, `sourceRef`, `workspaceRevision`, `sourceRevision` (all strings); a `retrieval` object
with `lexicalRank`, `structuralRank`, `semanticRank`, `graphRank`, `rrfScore`, `crossRankScore`
(numbers); an `extracted` object with `symbols`, `apis`, `tests`, `constraints` (string arrays) and
`groundedFacts` (array of grounded-fact records, each traceable to a source span); `tokenCost`
(number); `evidenceRefs` (string array); `extractionRevision` (string); and `checksum` (string).
Enforced via `.strict()`.

#### Scenario: Valid evidence card passes validation
- **WHEN** an evidence card object supplies all required fields
- **THEN** `CandidateEvidenceCardV1Schema.parse(...)` succeeds

#### Scenario: Extracted facts are grounded, not free-form
- **WHEN** a `groundedFacts` entry is validated
- **THEN** it MUST resolve to a specific source span (via `evidenceRefs` or an equivalent span pointer), not a bare free-text string with no span reference

### Requirement: Batch extraction only runs on a bounded, already-ranked candidate set
The system SHALL invoke batch LangExtract extraction only on the top 20-30 candidates that have
already passed RRF fusion and (once built) cross-encoder reranking. The system SHALL NOT invoke
LangExtract extraction across the full retrieval corpus (e.g. all 100K indexed chunks) for a single
query.

#### Scenario: Extraction candidate count is bounded
- **WHEN** a `CandidateEvidenceCardV1` batch-extraction run is invoked for a query
- **THEN** the number of candidates submitted for extraction does not exceed the documented bound (20-30), and the system logs or records the actual count submitted for later audit

### Requirement: Stage ownership is explicit and non-overlapping
The system SHALL treat cross-encoder reranking (a relevance scalar), LangExtract extraction
(grounded structural extraction), and Ornith (reasoning/synthesis) as three distinct, non-competing
stages. No stage SHALL be silently substituted for another — e.g. LangExtract output SHALL NOT be
treated as a relevance ranking signal, and cross-encoder scores SHALL NOT be treated as grounded
evidence.

#### Scenario: Downstream consumer distinguishes rank from evidence
- **WHEN** ACE context assembly consumes a `CandidateEvidenceCardV1`
- **THEN** it reads `retrieval.crossRankScore` for ranking decisions and `extracted`/`groundedFacts` for evidence content, and does not conflate the two into a single score
