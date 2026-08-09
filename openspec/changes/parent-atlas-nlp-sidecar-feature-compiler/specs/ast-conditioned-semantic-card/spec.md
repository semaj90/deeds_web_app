## ADDED Requirements

### Requirement: AstUnit stays the canonical structural contract regardless of chunker implementation
The system SHALL normalize all structural extraction output (from
`treesitter-chunker` or any future replacement) into the `AstUnit` (Boundary
IR) contract matching `atlas_ast_nodes`' live schema (`source_ref,
source_revision, tree_node_id, symbol_version_id, language, node_kind,
qualified_symbol, byte_start/end, line_start/end, parent_symbol, imports,
exports, calls, references, tests, parser_revision, grammar_revision,
content_hash`), and SHALL NOT let a third-party chunker package's native
output shape leak into downstream consumers as the canonical contract.

#### Scenario: The structural extraction implementation changes
- **WHEN** `treesitter-chunker` is replaced by a different parser/chunker
  implementation (e.g. a future Rust reimplementation)
- **THEN** downstream consumers of `AstUnit` records SHALL require no
  changes, because the contract is `AstUnit`, not the producing package's
  native format

### Requirement: AstUnit records never carry packet identity
The system SHALL NOT write `packet_key` (or any packet-identity field) as
part of structural extraction output — matching `atlas_ast_nodes`' live
schema, which has no `packet_key` column.

#### Scenario: A structural extraction pass completes
- **WHEN** `treesitter_chunk` finishes producing `AstUnit` records for a file
- **THEN** those records SHALL NOT include a `packet_key` field, and packet
  identity resolution SHALL happen in a separate, later stage

### Requirement: Semantic cards condition embedding input without hiding AST structure
The system SHALL build a `SemanticCodeCard` (symbol, kind, role, calls,
references, invariants, bounded code excerpt) from `AstUnit` + linguistic
facts, and use that card as the text sent to the canonical embedding service
to produce `semantic_768` — and SHALL keep the underlying `AstUnit` fields
independently queryable rather than encoding them only inside the resulting
768-dimensional vector.

#### Scenario: A caller needs to know a candidate's AST role
- **WHEN** a retrieval consumer needs to know whether a candidate is a
  function, class, or interface
- **THEN** the system SHALL answer this from the `AstUnit`/`atlas_ast_nodes`
  record directly, and SHALL NOT require decoding this from `semantic_768`
