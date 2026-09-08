## ADDED Requirements

### Requirement: CodeEvidenceExtractionV1 output is exact-byte grounded
The system SHALL define a `CodeEvidenceExtractionV1` contract whose `grounded[]` entries each carry
a `class` (one of `SYMBOL`, `API`, `CONSTRAINT`, `INVARIANT`, `FAILURE_MODE`, `TEST`, `REQUIREMENT`,
`DATA_FLOW`, `OWNERSHIP`), `exactText`, `startByte`, `endByte`, `confidence`, and optional
`attributes`. Every `grounded[]` entry MUST resolve to exact source bytes within the bounded
candidate text it was extracted from (`startByte`/`endByte` into that candidate's text, not the
whole source file) and MUST carry the same `canonicalId`/`sourceRevision` the extraction request was
made against.

#### Scenario: Extraction without a valid byte span is rejected
- **WHEN** a `grounded[]` entry is validated and `endByte <= startByte`, or `exactText` does not
  match the candidate text at `[startByte, endByte)`
- **THEN** the entry is rejected, not silently accepted with a synthetic or approximate span

#### Scenario: Extraction preserves canonical identity across the call
- **WHEN** a `CodeEvidenceExtractionV1` result is returned for a request naming `canonicalId=X`,
  `sourceRevision=R`
- **THEN** the result's `identity.canonicalId` equals `X` and `identity.sourceRevision` equals `R`

### Requirement: Code-domain extraction never re-derives structural facts
The system SHALL require every `CodeExtractionRequestV1` to carry pre-computed `astFacts` and
`symbolFacts` (produced by Tree-sitter/ast-grep, not by the extraction call itself). The extraction
profile SHALL restrict its own semantic output to fields AST cannot reliably label (constraints,
invariants, failure modes, API relationships, test obligations, requirements) and SHALL NOT attempt
to re-discover symbol names, declarations, signatures, imports, calls, or exports that `astFacts`
already supplies.

#### Scenario: Request without structural facts is rejected
- **WHEN** a `CodeExtractionRequestV1` is submitted with `astFacts` missing or empty for non-trivial
  candidate text
- **THEN** the request is rejected before any LLM call is made, not passed through with a fallback
  "extract everything" prompt

### Requirement: Code extraction batches stay within the existing evidence-extraction bound
The system SHALL invoke `POST /v1/extract/code/batch` only on the same bounded, already-ranked
candidate set `CANDIDATE_EVIDENCE_EXTRACTION_MAX_BATCH` (30) already enforces for
`CandidateEvidenceCardV1`/`V2` batch extraction — never the full retrieval corpus for a single query.

#### Scenario: Batch request exceeding the bound is rejected
- **WHEN** a `/v1/extract/code/batch` request names more than 30 candidates
- **THEN** the request is rejected with the same bounded-batch error class
  `assertExtractionBatchBounded` already raises for `CandidateEvidenceCardV1`

### Requirement: mxbai is a conditional escalation, not the mandatory first semantic judge
The system SHALL compute structural/evidence features (from AST facts, `CodeEvidenceExtractionV1`,
and ontology/graph signals) for every post-RRF candidate BEFORE any cross-encoder (mxbai) call is
made for that candidate. The system SHALL only invoke the cross-encoder for candidates the cheap
tabular router (or, once built, AtlasGemma's `RankHead`) classifies as ambiguous.

#### Scenario: Clearly-useful candidate skips the cross-encoder
- **WHEN** a candidate's evidence features unambiguously indicate relevance (e.g. exact symbol match
  AND a passing test reference AND a matching API relationship, per the router's documented
  threshold)
- **THEN** the pipeline does not call the cross-encoder for that candidate

#### Scenario: Ambiguous candidate still reaches the cross-encoder
- **WHEN** a candidate's evidence features do not clear the router's confidence threshold in either
  direction, and (once built) AtlasGemma's own `RankHead` is also unconfident
- **THEN** the pipeline calls the cross-encoder (mxbai) for that candidate, preserving today's
  behavior as the fallback path, not removing cross-encoder coverage entirely

### Requirement: CandidateEvidenceCardV2 distinguishes "not extracted" from "extracted empty"
The system SHALL define `CandidateEvidenceCardV2` with an explicit `presenceMask` field recording,
per top-level section (`structural`, `semanticGrounding`, `graph`, `ontology`), whether extraction
for that section was attempted at all. Downstream consumers SHALL check `presenceMask` before
treating an empty array as "no evidence found" rather than "extraction was not run."

#### Scenario: Legal-domain-only extraction is visible as not-attempted, not empty
- **WHEN** a candidate's card was built using an extractor that does not support the candidate's
  domain (e.g. the legacy legal-domain extractor run against a code candidate, per the
  EVIDENCE-CARD-01 finding in `parent-atlas-retrieval-staging-planes`)
- **THEN** `presenceMask.semanticGrounding` (or the relevant section) reports `false`, not `true`
  with an empty array, so a downstream consumer can tell the difference

### Requirement: Stage ownership is explicit and non-overlapping (four-stage extension)
This extends, but does not replace or duplicate, the two-stage version of this requirement already
defined in `parent-atlas-retrieval-staging-planes`'s `ace-candidate-evidence-card` capability
(cross-encoder rank vs. grounded evidence). Within this capability's scope (code-domain extraction
routing), the system SHALL treat cross-encoder reranking (a relevance scalar), code-domain
LangExtract extraction (grounded structural/semantic extraction), ontology/graph signals (relational
evidence), and Ornith (reasoning/synthesis) as four distinct, non-competing stages. No stage SHALL be
silently substituted for another — code-domain LangExtract output SHALL NOT be treated as a
relevance ranking signal, and the cheap tabular router's classification SHALL NOT be treated as
grounded evidence.

#### Scenario: Router decision is logged separately from evidence content
- **WHEN** the tabular router classifies a candidate as clearly-useful and skips the cross-encoder
- **THEN** the routing decision (and its input features) is recorded separately from the
  `CandidateEvidenceCardV2.semanticGrounding` content that fed it, so an auditor can distinguish "why
  we skipped mxbai" from "what LangExtract actually found"
