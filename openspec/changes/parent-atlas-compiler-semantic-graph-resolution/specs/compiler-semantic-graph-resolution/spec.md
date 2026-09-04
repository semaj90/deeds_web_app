# Compiler-Semantic Graph Resolution

## ADDED Requirements

### Requirement: Preserve LSP protocol coordinates and canonical UTF-8 source coordinates

The compiler-semantic observation adapter MUST preserve the language-server
position encoding and original protocol ranges while converting validated
target and selection ranges into UTF-8 byte offsets against the exact,
revision-qualified source bytes. The adapter MUST reject ranges that do not
have an exact target source revision, exceed the source buffer, split a UTF-8
sequence, or fail expected-text validation. The adapter MUST remain
non-canonical and MUST perform no durable writes.

#### Scenario: UTF-16 LSP target is aligned to UTF-8 bytes

- **GIVEN** a language server returns a UTF-16 target range for a source file
- **AND** the adapter has the exact source buffer and matching source revision
- **WHEN** the target range is normalized
- **THEN** the original UTF-16 range is retained
- **AND** the normalized target range is expressed as UTF-8 byte offsets
- **AND** the result records the position encoding and source revision
- **AND** canonical authority remains false

#### Scenario: Invalid or stale target evidence fails closed

- **GIVEN** a target range has a missing or mismatched source revision, an
  out-of-bounds offset, a split UTF-8 sequence, or mismatched expected text
- **WHEN** the adapter validates the range
- **THEN** it rejects the alignment
- **AND** it does not emit canonical structural identity
- **AND** it performs no durable write

### Requirement: Workspace authority is explicit and nullable

The read-only compiler-semantic proof MUST consume the existing workspace
revision authority. A fresh, complete authority value MAY be carried into the
receipt; stale or incomplete authority MUST remain null with an explicit
reason and evidence reference when available. The proof MUST NOT fabricate a
workspace revision.

#### Scenario: Fresh workspace authority is carried through

- **GIVEN** the workspace authority helper reports a fresh proven revision
- **WHEN** the read-only LSP proof emits its receipt
- **THEN** the receipt carries that revision and authority state
- **AND** the source revision and UTF-8 target alignment remain bound

#### Scenario: Missing workspace authority degrades without synthesis

- **GIVEN** workspace authority is stale or incomplete
- **WHEN** the read-only LSP proof emits its receipt
- **THEN** workspace revision is null
- **AND** the receipt records the authority state and reason
- **AND** no synthetic revision is created
