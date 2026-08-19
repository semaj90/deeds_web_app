# Parent Atlas structured-value proof sequence

## Status semantics

`IMPLEMENTED_UNPROVEN` means the contract/reference implementation and tests exist on this branch. It does **not** mean the live parser, runtime, mmap, Python/PyTorch/cuDF consumer, parity, or end-to-end gates have passed.

```text
SV-0  semantics                         DONE
SV-1  ordered members/entries           IMPLEMENTED_UNPROVEN
SV-2  protobuf projection               CREATED
SV-3  simdjson JSON/JSONL               IMPLEMENTED_UNPROVEN
SV-4  Tree-sitter AST adapter           IMPLEMENTED_UNPROVEN
SV-5  structured DAG/tool input         CREATED
SV-6  nested Arrow mmap snapshot        IMPLEMENTED_UNPROVEN
SV-7  semantic collection observation   PENDING
SV-8  end-to-end roundtrip              PENDING
```

## SV-4 — Tree-sitter syntax + TypeScript semantic enrichment

### Ownership

- Tree-sitter owns syntax node kinds, UTF-8 byte spans, grammar fields, native child order and AST paths.
- Consiliency `treesitter-chunker` IDs are upstream provenance. The Node adapter MUST NOT synthesize identifiers and call them Consiliency-native.
- `ts-morph` owns TypeScript/JavaScript compiler/type enrichment only: inferred/apparent types, resolved signatures, parameter metadata, return types, symbols, declarations and references.
- TypeScript Language Service/tsserver is an optional interactive executor for diagnostics, definition/reference/rename/code-fix/open-buffer state. It does not replace Tree-sitter syntax provenance.
- `.okf` owns domain/ontology vocabulary, OpenSpec owns behavioral requirements, PostgreSQL owns promoted canonical materialization.

### Join invariant

Tree-sitter positions are UTF-8 byte offsets. TypeScript/ts-morph positions are text offsets. An enrichment is valid only after deterministic byte↔UTF-16 conversion and exact equality of:

```text
source_ref
source_revision
start_byte
end_byte
source_span_checksum
tree_node_id (when present)
```

No overlap-only, line-only or symbol-name-only semantic attachment is promotable.

### Structured syntax requirements

The adapter MUST preserve source order and explicit syntax for:

- arrays and tuple-like values
- call arguments
- formal parameters
- object property entries
- shorthand entries
- object spreads
- computed property names
- non-literal expressions as exact `SOURCE_EXPRESSION` values rather than guessed scalar values

### SV-4 proof gates

- `SV4-SPAN`: UTF-8 byte spans roundtrip source text exactly, including non-ASCII fixtures.
- `SV4-ORDER`: arrays/arguments/parameters/object entries retain native order and dense local ordinals.
- `SV4-AST-PATH`: every nested value carries a deterministic named-child path and grammar field when supplied.
- `SV4-ID-GUARD`: no local Node path can label a synthesized identifier as a native Consiliency ID.
- `SV4-ID-JOIN`: supplied native IDs attach only on exact byte-span + content checksum match.
- `SV4-TS-TYPE`: exact-span ts-morph enrichment emits type facts without altering Tree-sitter provenance.
- `SV4-SIGNATURE`: call-like expressions can carry resolved parameter/return signature facts.
- `SV4-REFS`: declaration/reference coordinates are source-grounded and revision-qualified.
- `SV4-CONSILIENCY-BOUNDARY`: bounded fixtures compare Consiliency chunk UTF-8 byte spans, node-kind semantics, source-span checksums and supplied upstream IDs with the Node parser.
- `SV4-CONSILIENCY-ORDER`: full ordered-child parity is a separate future gate. The public `CodeChunk` surface is a chunk/XRef abstraction and does not by itself expose the complete named-child parser sequence, so the current fixture MUST NOT claim this gate.
- `SV4-OKF`: Zod projection validates `.okf` authority boundaries.

## SV-6 — Nested Arrow IPC file snapshot

### Physical model

Do not encode the recursive value graph as millions of nested JavaScript/Python dictionaries and do not require a recursive Arrow datatype.

Flatten all structured values into dense snapshot-local rows:

```text
value_ordinal: Int
value_id: Utf8
kind: Utf8
scalar columns
provenance: Struct<...>
members: List<Struct<ordinal, role, field_name, child_value_ordinal>>
entries: List<Struct<ordinal, entry_kind, key_text, key_node_type,
                    computed, spread, child_value_ordinal,
                    entry_source_span_checksum>>
```

The child ordinal references reconstruct the recursive structure losslessly while preserving columnar access.

### Identity rules

- `value_ordinal` is dense `0..N-1` and snapshot-local.
- `value_ordinal` is never Atlas canonical identity.
- `row_identity_checksum` covers ordinal/value/source-span identity.
- `structure_checksum` covers kind/member/entry topology.
- `ipc_file_checksum` covers encoded Arrow transport bytes only.
- A different Arrow implementation or encoding may produce different transport bytes without changing logical structured-value identity.

### SV-6 proof gates

- `SV6-DENSE`: rows are dense and child refs are in range.
- `SV6-NESTED`: physical Arrow schema contains Struct provenance and List<Struct> member/entry columns, not JSON strings.
- `SV6-IPC-FILE`: writer uses Arrow IPC file/random-access format, not stream format.
- `SV6-ROUNDTRIP`: IPC decode returns the same row count, ordinals and child topology.
- `SV6-MMAP-PY`: Python reads the frozen IPC file through a memory-mapped source and verifies row/structure checksums.
- `SV6-PYTORCH`: PyTorch consumer resolves dense ordinals without treating them as canonical IDs.
- `SV6-CUDF`: cuDF/Arrow consumer reads the compatible nested projection or an explicit normalized child table derived from the same snapshot.
- `SV6-REVISION`: source/grammar/semantic changes create a new snapshot revision rather than mutating a frozen file.

## Bounded cross-runtime proof

The fixture is deliberately small but exercises the dangerous boundaries:

```text
TypeScript source containing π + 😀
        ↓
Node Tree-sitter exact UTF-8 byte ranges
        ↓
Consiliency treesitter-chunker function chunk
        ↓
exact span + semantic node kind + source checksum
        ↓
attach supplied upstream ID as NATIVE_UPSTREAM
        ↓
object literal with shorthand / nested array / computed key / spread
        ↓
ts-morph exact-span type enrichment
        ↓
resolved call signature
        ↓
Arrow JS nested IPC file
        ↓
PyArrow memory-map readback
        ↓
row_identity_checksum + structure_checksum parity
        ↓
StructuredValueCrossRuntimeProofV1
```

A green receipt is `FIXTURE_ROUNDTRIP_PROVEN`. Missing Node parser packages and missing Python chunker support are explicit blocked states rather than parity failures. No regex fallback is allowed inside this proof.

The executable proof must preserve one subtle distinction:

```text
Consiliency upstream ID exists
        ≠
Node generated the same ID
```

The Node adapter may only attach the supplied Consiliency ID after exact byte-span and source-span checksum equality. It remains `NATIVE_UPSTREAM`, not Node-minted canonical identity.

## Frozen proof runtime

`packages/parent-atlas/fixtures/structured-value/runtime-manifest.json` pins the bounded proof runtime:

```text
Node:
  tree-sitter             0.25.1
  tree-sitter-typescript  0.23.2

Python:
  treesitter-chunker      4.0.0
  Python                  >= 3.11
  PyArrow                 required / observed in receipt
```

Run the capability probe first:

```bash
node scripts/atlas/probe-structured-value-proof-runtime.mjs
```

Then run the bounded proof:

```bash
npx tsx sveltekit-frontend/scripts/atlas/prove-structured-value-roundtrip.mts
```

Expected artifact directory:

```text
.tmp/atlas/structured-value-proof/
  receipt.json
  treesitter-chunker.json
  snapshot.json
  structured-value.arrow
  ts-morph-object.json
  ts-morph-call.json
```

These runtime-generated artifacts are proof outputs; do not promote them merely because the source harness exists.

## Current written artifacts

- `packages/parent-atlas/src/core/structured-value-ast.ts`
- `packages/parent-atlas/src/core/structured-value-arrow.ts`
- `packages/parent-atlas/src/core/structured-value-parity.ts`
- `packages/parent-atlas/fixtures/structured-value/ts-parity-fixture.ts`
- `packages/parent-atlas/fixtures/structured-value/runtime-manifest.json`
- `packages/parent-atlas/test/structured-value-ast.test.mjs`
- `packages/parent-atlas/test/structured-value-arrow.test.mjs`
- `packages/parent-atlas/test/structured-value-parity.test.mjs`
- `sveltekit-frontend/src/lib/server/atlas/language/node-tree-sitter-structured-value.ts`
- `sveltekit-frontend/src/lib/server/atlas/language/ts-morph-structured-value-enricher.ts`
- `sveltekit-frontend/src/lib/server/atlas/language/ts-morph-structured-value-enricher.spec.ts`
- `sveltekit-frontend/scripts/atlas/prove-structured-value-roundtrip.mts`
- `python/prove_structured_value_chunker_fixture.py`
- `python/atlas_structured_value_arrow.py`
- `python/test_atlas_structured_value_arrow.py`
- `scripts/atlas/probe-structured-value-proof-runtime.mjs`
- `scripts/atlas/write-structured-value-arrow.mjs`
- `scripts/atlas/write-structured-value-arrow.test.mjs`
- `.okf/domains/structured-value.yaml`

## Remaining promotion order

```text
SV4/SV6 contracts build
    ↓
install the pinned proof runtimes without changing their manifest revisions
    ↓
runtime probe READY
    ↓
Node ↔ Consiliency bounded chunk-boundary fixture
    ↓
exact-span ts-morph enrichment + resolved signature
    ↓
SV6 JS nested IPC write/roundtrip
    ↓
Python mmap readback
    ↓
FIXTURE_ROUNDTRIP_PROVEN receipt
    ↓
PyTorch/cuDF ordinal consumer proof
    ↓
full Consiliency parser-child parity if/when a native AST child surface is exposed
    ↓
SV-7 semantic collection observation
    ↓
SV-8 source → AST → value → Arrow → Python → reconstruction roundtrip
```
