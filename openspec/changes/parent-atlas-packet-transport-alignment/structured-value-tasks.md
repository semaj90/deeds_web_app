# Parent Atlas Structured Value / Tool Input Tasks

Status: IMPLEMENTATION_IN_PROGRESS

This supplement closes the value-shape seam between structural evidence, JSON/JSONL ingestion, packet transport, protobuf/gRPC, and deterministic DAG/tool inputs. It does not change canonical symbol/packet identity ownership.

## SV-0 — Freeze value semantics [DONE]

- [x] Add `AtlasStructuredValueV1`.
- [x] Separate scalar, ordered member, keyed entry and reference variants.
- [x] Preserve 64-bit/source integers as decimal strings across JS boundaries.
- [x] Forbid treating syntax/value shape as semantic collection proof.

Gate: `STRUCTURED_VALUE_SEMANTICS_FROZEN`.

## SV-1 — Ordered object/list representation [IMPLEMENTED_UNPROVEN]

- [x] OBJECT/MAP use repeated ordered `entries[]`.
- [x] LIST/TUPLE use repeated ordered `members[]`.
- [x] Add explicit `DictionaryView` duplicate policy: ERROR/FIRST_WINS/LAST_WINS.
- [x] Add tests covering duplicate keys and large integers.
- [ ] Run Vitest locally.

Gate: `ORDER_AND_DUPLICATE_KEY_PRESERVATION_PROVEN`.

## SV-2 — Protobuf projection [CREATED]

- [x] Add root `proto/active/atlas_structured_value.proto`.
- [x] Use repeated `KeyValueEntry`/`Member`; do not use protobuf map fields.
- [x] Add `ToolCallInput` repeated ordered arguments.
- [ ] Generate Go/TS/Python bindings with the existing root proto build pipeline.
- [ ] Round-trip duplicate-key fixture through protobuf without map conversion.

Gate: `STRUCTURED_VALUE_PROTO_ROUNDTRIP_PROVEN`.

## SV-3 — simdjson JSON/JSONL materialization [IMPLEMENTED_UNPROVEN]

- [x] Add `simdjson_structured_value.cpp` beside the existing JSONL scanner.
- [x] Iterate each On-Demand object once and append entries in encounter order.
- [x] Use dynamic number typing and retain integer tokens as decimal strings.
- [x] Never mint Tree-sitter/GIS source coordinates from JSON parsing.
- [ ] Compile against the vendored/workstation simdjson revision.
- [ ] Add fixture `{\"a\":1,\"a\":2}` and prove two ordered entries survive.
- [ ] Add JSONL multi-document order fixture.

Gate: `SIMDJSON_STRUCTURED_VALUE_PROVEN`.

## SV-4 — Structural AST adapter [PENDING]

- [ ] Project Tree-sitter parameters, arguments, arrays/tuples and object literal entries into `AtlasStructuredValueV1`.
- [ ] Preserve native `treeNodeId`, source byte interval, node type, AST path and child/field ordinal.
- [ ] Represent computed keys/spreads explicitly rather than evaluating them.
- [ ] Do not derive semantic LINKED_LIST/TREE/GRAPH/DAG claims from syntax alone.

Gate: `AST_STRUCTURED_VALUE_PROVENANCE_PROVEN`.

## SV-5 — Structured tool/DAG inputs [CREATED]

- [x] Add `atlas.structured-tool-input.v1`.
- [x] Preserve argument ordinal in addition to optional names.
- [x] Keep existing action/workflow authorization as the side-effect owner.
- [ ] Add adapter from query/tool-call planning into structured arguments.
- [ ] Validate against revisioned MCP/tool schema before dispatch.
- [ ] Replay one historical tool call through TS -> protobuf -> Go/Python -> same argument tree/checksum.

Gate: `STRUCTURED_TOOL_INPUT_ROUNDTRIP_PROVEN`.

## SV-6 — Arrow nested snapshot [PENDING]

- [ ] Define Arrow schema using List/Struct for members and repeated keyed-entry structs for provenance-preserving objects.
- [ ] Keep canonical ordinals/refs as scalar columns and large tensors as fixed-size/list/ref columns.
- [ ] mmap read from Python without reconstructing all rows as Python dicts.
- [ ] Compare Arrow nested snapshot checksum/order against protobuf/MessagePack projection fixtures.

Gate: `ARROW_STRUCTURED_VALUE_MMAP_PROVEN`.

## SV-7 — Semantic collection observation [PENDING]

- [ ] Define derived observations for LINKED_LIST/TREE/GRAPH/QUEUE/STACK/MAP/SET/DAG.
- [ ] Require multiple evidence classes where applicable: AST/type, assignment/data-flow, CodeQL/Souffle/rule evidence.
- [ ] Emit `OntologyObservationV1` first; canonical tuple/hyperedge promotion remains validator/materializer-owned.

Gate: `SEMANTIC_COLLECTION_PROMOTION_DISCIPLINE_PROVEN`.

## SV-8 — End-to-end proof [PENDING]

Prove one structured mutation/tool request end to end:

`Tree-sitter source object/arguments -> AtlasStructuredValueV1 -> StructuredToolInputV1 -> protobuf repeated entries -> Go/Python worker -> execution receipt -> same source/argument ordinals and refs`.

Also prove a raw JSON/JSONL packet fixture through:

`simdjson -> ordered structured values -> MessagePack/protobuf/Arrow -> hydrate -> identical ordered entry/member tree`.

Final gate: `PARENT_ATLAS_STRUCTURED_VALUE_FABRIC_PROVEN`.
