## ADDED Requirements

### Requirement: One MCP operation returns revision-qualified code intelligence for a symbol
Given a symbol/function in the current workspace, the system SHALL be able to return its
definition, references, direct callers, direct callees, file/module dependencies, semantic
neighbors, and likely blast radius — all revision-qualified (exact `source_ref` +
`source_revision`) and exposed through one existing MCP tool owner, not a new server.

#### Scenario: A symbol lookup returns evidence-backed results, not inferred ones
- **WHEN** a caller requests code intelligence for a symbol via the MCP operation
- **THEN** every returned reference/caller/callee carries an exact evidence ref (source_ref,
  source_revision, byte_start, byte_end) rather than a name-matched or inferred association

### Requirement: Parser/LSP evidence never becomes canonical identity
Clang/libclang/clangd and Tree-sitter/ast-grep observations SHALL remain evidence inputs only.
Neither may be treated as, or silently promoted to, canonical symbol/source identity — that
authority remains with the Parent Atlas Frozen Identity Contract's existing source_ref +
source_revision chain.

#### Scenario: A Clang-derived type resolution disagrees with the canonical symbol record
- **WHEN** libclang's AST resolution for a C/C++ symbol differs from the currently admitted
  symbol-version row
- **THEN** the canonical record is not silently overwritten; the disagreement is surfaced as a
  discrepancy for review, per this repo's Status Language discipline (`NOT_PROVEN` until reconciled)
