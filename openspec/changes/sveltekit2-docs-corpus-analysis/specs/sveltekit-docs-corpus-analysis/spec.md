## ADDED Requirements

### Requirement: Pinned corpus manifest and coverage
The analysis SHALL enumerate raw Markdown pages, record byte length and SHA-256 for each, compute a corpus checksum over deterministically sorted file records, and compare raw-page coverage with the chunk JSONL by validated page identity.

#### Scenario: Complete and reproducible manifest
- **WHEN** the raw files and chunk JSONL cover the same page set
- **THEN** the manifest reports matching page counts, per-file checksums, and a deterministic corpus checksum

#### Scenario: Incomplete page coverage
- **WHEN** a raw page or chunk page has no counterpart
- **THEN** the manifest reports the unmatched page explicitly and does not infer a mapping

### Requirement: Navigation hierarchy mapping
The analysis SHALL derive the section/page hierarchy from the pinned documentation table of contents and map each raw page to exactly one node, reporting unmatched or multiply matched pages without guessing.

#### Scenario: Unique page mapping
- **WHEN** a raw page has exactly one matching navigation entry
- **THEN** the hierarchy output links that page to its single section and page node

#### Scenario: Missing or ambiguous navigation entry
- **WHEN** no unique navigation entry exists for a raw page
- **THEN** the output lists the page as unresolved and does not assign a section

### Requirement: Lexical terms and ranking
The analysis SHALL preserve literal identifiers while separately extracting sub-tokens and prose word n-grams, then rank terms at page, section, and corpus levels using a documented TF-IDF-style formula.

#### Scenario: Identifier and prose extraction
- **WHEN** a page includes identifiers such as `$app/state` or `page.data` and prose
- **THEN** output retains each literal identifier and emits its split tokens separately from prose n-grams

#### Scenario: Deterministic term ranking
- **WHEN** identical corpus inputs are analyzed more than once
- **THEN** term scores and ordering are identical and the scoring formula is included in the receipt

### Requirement: Advisory domain proposals and grouping
The analysis SHALL propose page labels and term-based groups using only navigation and extracted-term evidence, mark each label `PROPOSED_NOT_ADMITTED`, and report NLP agreement separately from reviewed accuracy.

#### Scenario: Unreviewed proposal output
- **WHEN** labels or clusters are generated without human-reviewed ground truth
- **THEN** outputs remain advisory and make no reviewed-accuracy claim

### Requirement: Stable filtered lexical search
The analysis SHALL provide BM25-style top-k search over corpus chunks, support section/page filters, and paginate in deterministic score-descending then chunk-ID order.

#### Scenario: Filtered pagination
- **WHEN** a query is paginated with an optional hierarchy filter
- **THEN** each page contains only matching chunks, uses stable ordering, and continuation does not duplicate or skip equal-score chunk IDs

### Requirement: Read-only analysis receipts and evaluation
Each analysis stage SHALL record input/output checksums, counts, and zero committed writes. Retrieval evaluation SHALL use a declared query set and report tie-aware Recall@K.

#### Scenario: No datastore writes
- **WHEN** any corpus analysis stage completes
- **THEN** its receipt states `canonicalAuthority=false` and `datastoreWritesCommitted=0`

#### Scenario: Recall cutoff tie
- **WHEN** multiple candidates tie at the Recall@K boundary
- **THEN** the evaluation reports the tie policy and counts the tied relevant candidates accordingly
