# Parent Atlas Code Intelligence E2E Convergence

## ADDED Requirements

### Requirement: Current-revision code-intelligence evidence is exact and fail-closed
The system SHALL admit code-intelligence evidence only when it can be resolved through the existing canonical owners to the exact current source revision and symbol/version identity required by the consuming lane.

#### Scenario: Exact current lineage is available
- **WHEN** a source observation carries an exact source reference, source revision, and byte interval that resolves through the existing symbol/version owner
- **THEN** the system SHALL preserve that exact lineage into downstream graph, retrieval, feature, and context artifacts
- **AND** it SHALL NOT replace those identities with parser ids, graph node ids, vector point ids, classifier labels, or ontology tuples.

#### Scenario: Exact current lineage is missing or ambiguous
- **WHEN** any required source, revision, interval, symbol/version, or representation binding is absent, stale, ambiguous, or only inferable by "latest"
- **THEN** the system SHALL fail closed for canonical admission
- **AND** it SHALL record the missing or stale boundary as evidence rather than fabricating a join.

### Requirement: Structural, semantic, and tooling observations remain subordinate to canonical identity
The system SHALL treat Tree-sitter, ast-grep, LSP, Clang/clangd, SocratiCode, Neo4j, NetworkX, cuGraph, Qdrant, and semantic-derived topology as observation or execution surfaces rather than independent canonical identity owners.

#### Scenario: C or C++ semantic evidence is produced
- **WHEN** Clang/libTooling/clangd provides declarations, references, types, overload, include, definition, hover, or diagnostic evidence
- **THEN** the evidence SHALL remain revision-qualified observation data until it resolves through the existing source/symbol identity owners
- **AND** Clang USRs, clangd ids, or backend node ids SHALL NOT become Parent Atlas canonical identity by themselves.

#### Scenario: Existing structural evidence is consumed
- **WHEN** Tree-sitter, ast-grep, LSP, or SocratiCode graph facts are used downstream
- **THEN** the system SHALL preserve their evidence spans and producer metadata
- **AND** consumer readability of stored ids SHALL NOT be treated as proof that the producer-to-persisted-row lineage was established.

### Requirement: Semantic k-NN topology is a noncanonical derived retrieval artifact
The system SHALL allow a bounded semantic k-NN graph to be constructed from semantic vectors for challenger topology analysis without promoting that graph to canonical code-graph authority.

#### Scenario: A semantic k-NN graph is built
- **WHEN** semantic_768 vectors are transformed into a deterministic cosine k-NN adjacency
- **THEN** the resulting artifact SHALL be labeled as derived semantic topology with `canonicalAuthority=false`
- **AND** its edges SHALL NOT be described as import, call, reference, include, or other canonical code relationships unless separately proven by the structural graph owners.

#### Scenario: PageRank is run over semantic embeddings
- **WHEN** PageRank is requested for semantic embeddings
- **THEN** the system SHALL first construct a real bounded adjacency matrix
- **AND** it SHALL NOT pass the raw embedding matrix directly as PageRank adjacency
- **AND** the PageRank result SHALL remain a challenger/retrieval feature rather than the canonical Graphify authority score.

### Requirement: Semantic graph algorithm execution reuses the existing GPU graph owner
The system SHALL route semantic PageRank, attention, KMeans, and SOM execution through the existing pytorch-graph owner or an equivalent already-owned execution boundary rather than duplicating native addon contracts.

#### Scenario: Semantic graph algorithms execute
- **WHEN** the semantic topology experiment executes PageRank, attention, KMeans, or SOM
- **THEN** inputs SHALL be shaped according to the existing owner contract
- **AND** GPU/CPU execution source SHALL be observable
- **AND** native addon path selection, VRAM guards, and CPU fallback behavior SHALL remain owned by the existing GPU graph runtime.

#### Scenario: PageRank result is checked
- **WHEN** semantic PageRank produces a result
- **THEN** the bounded experiment SHALL compare it with a CPU oracle over the same adjacency
- **AND** record the maximum absolute difference or an equivalent explicit parity metric before any promotion decision.

### Requirement: Retrieval-to-ContextManifest convergence preserves one identity and revision chain
The system SHALL preserve one revision-qualified candidate identity chain from retrieval through ordinalization, feature materialization, ContextManifest admission, and MCP/tool proposal construction.

#### Scenario: A candidate reaches ContextManifest
- **WHEN** a candidate is admitted from lexical, semantic, or graph retrieval
- **THEN** canonical candidate identity SHALL be resolved before CandidateOrdinalMap assignment
- **AND** CandidateFeatureMatrix evidence SHALL derive from the same frozen snapshot
- **AND** ContextManifest SHALL preserve the evidence and revision references needed to audit the admission.

#### Scenario: An MCP/tool proposal is prepared
- **WHEN** an admitted ContextManifest produces an MCP/tool proposal
- **THEN** the proposal SHALL resolve against the existing revisioned tool/registry owner
- **AND** the registry or tool execution surface SHALL NOT mint source, symbol, graph, vector, or cache identity.

### Requirement: End-to-end proof is bounded, current, and non-destructive
The system SHALL provide a bounded proof that one current code-intelligence question can traverse the existing source, symbol, AST/LSP, graph, retrieval, ContextManifest, and MCP boundaries without stale or inferred joins.

#### Scenario: The bounded E2E proof runs
- **WHEN** the E2E proof is executed for a known file/symbol question
- **THEN** it SHALL record correct-file-at-k, correct-symbol-at-k, stale-join count, missing-authority count, relevant latency measurements, and evidence references
- **AND** any admitted evidence lacking exact current lineage SHALL make the proof fail closed
- **AND** the first proof SHALL NOT require datastore, cache, projection, or model-state writes.

