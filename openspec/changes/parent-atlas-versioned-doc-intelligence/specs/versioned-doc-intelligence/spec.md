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

LLM-derived facts (`DocumentationFactV1`) SHALL carry `sourceUrl`, `sourceRevision`, `startChar`,
and `endChar` such that `evidenceText` matches the canonical UTF-8 source bytes at that span
exactly (exact alignment first, fuzzy fallback only when exact alignment fails). A fact whose span
does not validate against the canonical source SHALL NOT be admitted.

#### Scenario: Fact admission requires span validation

- **GIVEN** a `DocumentationFactV1` with a `[startChar, endChar)` span
- **WHEN** the span is read back against the canonical UTF-8 source bytes for that `sourceRevision`
- **THEN** the resulting substring equals `evidenceText` exactly, or the fact is rejected

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
