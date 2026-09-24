## ADDED Requirements

### Requirement: Documentation identity is version-qualified and never overwritten

Every crawled documentation page and chunk SHALL carry an explicit `DocCoordinateV1`
(`provider`, `product`, `productVersion`, `architecture`, `language`, `url`, `sectionAnchor`,
`contentHash`, `evidenceRevision`). A crawl of the same URL under a different `productVersion`
SHALL produce a distinct identity, never an overwrite of the prior version's row.

#### Scenario: Same URL, two product versions, no collision

- **GIVEN** a page has been crawled and stored under `productVersion: "13.2"`
- **WHEN** the same URL is crawled again under `productVersion: "13.3"`
- **THEN** both versions exist as distinct, independently retrievable rows

#### Scenario: Version-filtered query never returns a different version's content

- **GIVEN** documentation exists for both `productVersion: "13.1"` and `productVersion: "13.2"`
  of the same product
- **WHEN** a query explicitly requests `productVersion: "13.2"`
- **THEN** no chunk from `productVersion: "13.1"` is returned

### Requirement: Postgres is the canonical evidence owner; okf only classifies

External documentation pages and chunks SHALL have a canonical Postgres row before being treated
as promotable evidence. Domain/taxonomy classification (okf) SHALL be a derived, non-authoritative
annotation (`canonicalAuthority: false`) and SHALL NOT itself serve as the identity or evidence
owner. Qdrant and Neo4j projections SHALL remain rebuildable mirrors of the Postgres row, per this
repo's existing Postgres-is-truth convention.

#### Scenario: A Qdrant-only chunk is not promotable

- **GIVEN** a document chunk exists in Qdrant with no corresponding Postgres row
- **WHEN** a caller attempts to treat that chunk as canonical evidence
- **THEN** the system rejects the promotion (no canonical Postgres row to promote from)

### Requirement: Deterministic structure is extracted before any LLM involvement

For every crawled page, structural fields (URL, title, version, heading path, code fences,
function signatures, class names, parameter tables, return types, language, anchors) SHALL be
extracted via deterministic HTML/DOM parsing (BeautifulSoup/lxml) before any LLM (LangExtract,
Ornith) is invoked on that page's content.

#### Scenario: Structural fields do not depend on model output

- **GIVEN** a documentation page with a code block and a heading structure
- **WHEN** the page is processed through the deterministic extraction stage
- **THEN** `headingPath`, `codeBlocks`, and `apiSignatures` are populated without any LLM call
  having been made

### Requirement: Semantic extraction is source-grounded with exact character spans

LLM-derived facts (`DocumentationFactV1`) SHALL carry `sourceUrl`, `sourceRevision`, diagnostic
`startChar`/`endChar`, and authoritative `startByte`/`endByte` offsets into the canonical UTF-8
source. `evidenceText` MUST match those bytes exactly. A fact whose span does not validate against
the canonical source SHALL NOT be admitted; fuzzy or lesser alignment may be reported but is not
promotion-eligible.

#### Scenario: Fact admission requires span validation

- **GIVEN** a `DocumentationFactV1` with character and byte spans
- **WHEN** the byte span is read back against the canonical UTF-8 source bytes for that `sourceRevision`
- **THEN** the resulting substring equals `evidenceText` exactly, or the fact is rejected

### Requirement: Documentation API rules share the grounded extraction boundary

`ApiRuleV1` SHALL be emitted by the same bounded LangExtract execution as documentation facts,
with a revision-qualified evidence span containing authoritative UTF-8 byte offsets. The sidecar
response SHALL keep `canonicalAuthority=false`; durable admission remains a separate owner.

#### Scenario: API rule output remains evidence-only

- **GIVEN** a grounded API rule with a valid source revision and UTF-8 byte span
- **WHEN** the sidecar returns the documentation extraction response
- **THEN** the rule carries its evidence span and `canonicalAuthority=false`, and no durable
  ontology or retrieval projection is written

### Requirement: Structural patch targeting uses stable coordinates, not line numbers

Proposed code repairs SHALL be expressed as `PatchTargetV1` (stableSymbolId, node kind, byte
range, ast-grep pattern, matched metavariables) and `PatchProposalV1` (ast-grep rewrite, diff
preview, validation commands) rather than free-text line-number instructions. ast-grep SHALL own
structural localization and mechanical rewrite application; the model SHALL only propose the
semantic correction.

#### Scenario: A patch proposal is reviewable as a diff before application

- **GIVEN** a `PatchProposalV1` referencing a `PatchTargetV1`
- **WHEN** the proposal is presented for review
- **THEN** a diff preview is available and no text is applied to the source file until the diff is
  explicitly accepted

### Requirement: The repair packet is bounded compiled evidence, not raw corpus text

`AceRepairPacketV1` SHALL assemble only the compiled evidence needed for one repair (diagnostic,
structural target, exact-version doc excerpts, applicable `ApiRuleV1` entries, graph
callers/callees, validation commands) — not the full documentation corpus or full source files.

#### Scenario: Repair packet stays bounded regardless of corpus size

- **GIVEN** a documentation corpus of arbitrary size indexed for a given product/version
- **WHEN** an `AceRepairPacketV1` is assembled for one specific error
- **THEN** the packet contains only the evidence relevant to that error, not the entire indexed
  corpus

### Requirement: Summary claim validation is strict, revision-qualified derived evidence

Each `SummaryClaimValidationV1` SHALL identify the exact canonical external-document chunk
evidence revision and the input/output summary checksums from which one claim was extracted.
Claim content checksums SHALL use the shared canonical JSON hashing owner; execution-local
`claimOrdinal` SHALL NOT participate in canonical source or claim identity. Validator outputs SHALL
use typed deterministic, semantic, source-span, and ontology slots. A claimed source span is only
structurally recorded here and MUST be independently verified against canonical UTF-8 chunk bytes
before it can support an admission decision. The envelope SHALL remain derived and noncanonical;
this contract does not implement a verdict algorithm or execute a semantic/OaK judge.

At the individual-claim level, the technical-token validator MUST fail invented or corrupted
technical identifiers. Omission of other identifiers present in the source chunk MUST remain
observable in `missingTechnicalTokens` but MUST NOT by itself fail or route that individual claim
to review; summary-wide coverage is a separate signal.

#### Scenario: Malformed or unqualified validation evidence fails closed

- **GIVEN** a summary claim validation envelope with an empty identity, placeholder revision,
  malformed checksum/span, unknown field, or unsupported verdict
- **WHEN** the envelope is parsed by the TypeScript contract
- **THEN** validation fails without coercion or canonical promotion

#### Scenario: Claim ordinal does not affect claim content checksum

- **GIVEN** the same claim text emitted at different execution-local ordinals
- **WHEN** the canonical claim checksum is computed
- **THEN** both checksums are identical, while changing the claim text changes the checksum

#### Scenario: Summary judge input is limited to one exact chunk and one claim

- **GIVEN** a checksum-sealed deterministic claim-validation artifact and a chunk row read back by
  both `chunkId` and `chunkEvidenceRevision`
- **WHEN** `SummaryJudgeInputV1` is built
- **THEN** the builder rejects any row whose identity/revision differs and freezes only the exact
  chunk text (bounded to 32 KiB UTF-8), prompt-visible product/version/title/heading metadata, the
  single claim, its summary output checksum, prompt revision, and the technical/numeric/version/
  source-span findings
- **AND** the strict contract rejects web results, neighboring chunks, Qdrant, ACE history, model
  execution fields, and all other unknown context; it performs no retrieval, inference, or final
  admission decision

#### Scenario: Semantic judge evaluates one sealed claim through the resolved synthesis model

- **GIVEN** a valid sealed `SummaryJudgeInputV1` and a runtime-resolved model ID listed by the
  existing llama-server model endpoint
- **WHEN** the VAL-07 adapter sends its bounded request
- **THEN** the request uses that exact model ID and contains only the one canonical chunk, one
  claim, allowlisted metadata, deterministic findings, and frozen prompt revision
- **AND** an invalid response or transport failure produces `JUDGE_ERROR`, never a support verdict
- **AND** semantic output is evidence only; it does not verify byte spans or compute admission
- **AND** no retrieval, OaK call, analysis-row write, or durable store mutation occurs

#### Scenario: Deterministic claim resolution preserves validator precedence

- **GIVEN** a sealed claim envelope containing technical, numeric, version, source-span, semantic,
  and optional typed-ontology findings
- **WHEN** the VAL-09 resolver derives the final claim result
- **THEN** deterministic hard failures, rejected spans, and explicit semantic contradiction reject
- **AND** semantic evidence cannot override a deterministic hard failure
- **AND** unrun, partial, judge-error, unverified-span, or unresolved typed-ontology evidence routes
  to review
- **AND** only passing deterministic findings plus a supported semantic verdict admit
- **AND** the result is re-sealed derived evidence and never canonical authority
