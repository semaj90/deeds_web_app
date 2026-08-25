## ADDED Requirements

### Requirement: Static-vs-dynamic code classification feeds the rerank blend
The system SHALL derive a static-vs-dynamic classification for each ranked code symbol/chunk from
the existing AST-grep storage-kind vocabulary, and SHALL make that classification available as a
component of the `domainScore` composite input to `blendScores()` (`runtime-reranker.ts`), per
design.md Decision 1/2. The system SHALL NOT introduce a second AST extraction engine to produce
this classification.

#### Scenario: Pure/const symbol classified static
- **WHEN** the AST-grep pipeline extracts a symbol that is a literal, `const` declaration, or a
  function with no detected side effects or runtime-only inputs
- **THEN** the classification derivation labels it `static` and that label is available to the
  rerank blend computation for that candidate

#### Scenario: Side-effecting or runtime-computed symbol classified dynamic
- **WHEN** the AST-grep pipeline extracts a symbol that performs I/O, mutates external state, or
  depends on a runtime-only value (e.g. `process.env`, a network response, `Date.now()`)
- **THEN** the classification derivation labels it `dynamic` and that label is available to the
  rerank blend computation for that candidate

#### Scenario: Unclassifiable symbol does not fabricate a label
- **WHEN** the AST-grep pipeline cannot determine static-vs-dynamic for a symbol (e.g. parse
  failure, unsupported language construct)
- **THEN** the classification derivation SHALL leave the field absent/undefined rather than
  guessing, consistent with `blendScores()`'s existing behavior of skipping undefined signals

### Requirement: User-vs-AI-generated provenance extends to code symbols
The system SHALL extend `source-kind-classifier.ts`'s existing `SourceKind` taxonomy
(`ai_generated`, `user_note`, `code`, `spec`, ...) so it can classify code symbols/chunks, not only
documentation files, and SHALL make that classification available to the rerank blend on the same
terms as the static-vs-dynamic classification above. The system SHALL NOT introduce a second
source-kind classifier.

#### Scenario: Code symbol provenance classified
- **WHEN** a code symbol/chunk is passed to the extended classifier alongside its source
  file/commit metadata
- **THEN** the classifier returns one of the existing `SourceKind` values (`ai_generated` for
  LLM-authored code, or `code` — the existing neutral value already used for source files, not
  `user_note` — for confidently human-authored code) rather than defaulting silently to `unknown`
  when real signal exists

#### Scenario: Ambiguous provenance does not fabricate a classification
- **WHEN** the extended classifier has insufficient evidence to distinguish AI-generated from
  human-authored code for a given symbol
- **THEN** it SHALL return `unknown` (the existing fallback value) rather than guessing, and this
  SHALL NOT be treated as equivalent to a confirmed classification anywhere the signal is consumed

### Requirement: Graph/spectral authority signal is verified before any wiring is attempted
The system SHALL verify, by reading source (not assuming from naming), whether
`graphScore`/`pagerankScore` (as populated today by `ai/graph-reranker.ts` and
`atlas/retrieval/graph-retriever.ts`) already derive from a Katz/eigenvector-family centrality
algorithm, and SHALL verify that any candidate replacement signal is real, canonical, and
promotion-eligible (not a schema-marked fixture/mock) before wiring a live reranker to consume it.
The system SHALL NOT wire a reranker to a signal whose own contract declares it
non-promotable, and SHALL NOT add a new graph-authority implementation merely to satisfy this
requirement — both are explicitly prohibited by this change's own Non-Goals.

#### Scenario: No real Katz/eigenvector implementation exists — do not wire, do not invent one
- **WHEN** verification finds (as it did: `grep -rni katz sveltekit-frontend/src` matches only an
  unrelated legal case name; the sole spectral-adapter candidate found is schema-declared
  `MOCK_CPU_REFERENCE`/`FIXTURE_ONLY`/`promotionEligible: false` and computes clustering, not
  centrality; the remaining candidate is a different implementation of the same plain PageRank
  algorithm already in use)
- **THEN** `ai/graph-reranker.ts` and `atlas/retrieval/graph-retriever.ts` remain unchanged, no
  new `graphScore`/`pagerankScore` populator is added, and the finding is recorded as evidence
  rather than treated as a blocker to work around

### Requirement: Blend weight schema integrity is preserved
The system SHALL NOT modify `BlendWeightsSchema`'s `.strict()` shape or its sum-to-1.0 invariant
unless every existing caller that constructs a `BlendWeights` object is updated in the same change.
If the chosen design folds new signals into the existing `domainScore` composite (per design.md
Decision 1/2), this requirement is satisfied without any `SIGNAL_KEYS` change.

#### Scenario: No new top-level signal keys added
- **WHEN** the implementation follows design.md's resolved decision (fold into `domainScore`)
- **THEN** `SIGNAL_KEYS`, `BlendWeightsSchema`, and `DEFAULT_BLEND_WEIGHTS` in
  `runtime-reranker.ts` remain unchanged, and all existing tests referencing the 7-key blend
  contract continue to pass unmodified

#### Scenario: New signal keys added only with full caller migration
- **WHEN** implementation evidence shows the composite-signal approach loses too much resolution
  and the fallback (new `SIGNAL_KEYS` entries) is chosen instead
- **THEN** every caller constructing a full `BlendWeights` object is identified and updated in the
  same change, and the sum-to-1.0 invariant is verified to still hold for each one before merge
