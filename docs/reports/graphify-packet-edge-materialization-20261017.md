# Graphify Packet-Edge Materialization — 2026-10-17

## Result

Added a bounded, read-only-input adapter in the existing GraphSnapshot materializer for revision-qualified Graphify structural edges. It projects a resolved symbol reference onto packet nodes only when both symbol identities, exact source bytes, UTF-8 byte spans, source/workspace revisions, packet bindings, packet byte ranges covering the exact symbols, and source graph revision are supplied and agree. The generated GraphV2 edge retains the symbol keys, both symbol spans, reference/evidence identifiers, and source/target revision metadata; it is explicitly non-authoritative.

The materializer source-inventory hash includes the candidate, symbol records, graph revision, and source-byte digests. Unsupported predicates, unresolved symbols, source/span mismatches, absent packet nodes, revision mismatches, and self-loops are excluded with typed reasons.

The sparse-incidence float32 assertion was also verified in its current worktree state using approximate comparisons rather than exact decimal equality.

## Validation

- Sparse-incidence and N-ary tensor contracts: 2 files, 12 tests passed.
- GraphSnapshot materializer: 1 file, 14 tests passed, including positive exact-span projection and a mismatched-symbol-span rejection.
- GraphSnapshot materializer, GraphV2 retrieval fanout, N-ary admission, relation persistence, and both tensor incidence contracts: 6 files, 36 tests passed. The materializer fixtures include exact positive binding, bad symbol-span rejection, and packet-range coverage rejection.
- Full Svelte check was started but remained active without diagnostics at report time; it is not counted as a pass.
- No PostgreSQL, Neo4j, Qdrant, cache, projection writer, service, or GPU was used.
- Follow-up replay-to-Postgres-materializer bridge: focused replay/materializer/Postgres suites passed 21/21. This is fixture-only; the Postgres query adapter was injected and the test asserted no `INSERT` call.
- Follow-up multi-file pipeline batch assembly: `buildGraphifyPacketEdgeSourceBatchesV1` accepts existing per-file projection outputs and exact source-byte buffers, verifies the byte digests and cross-file source/workspace/symbol bindings, and emits deterministic admitted batches or typed rejections. The GraphSnapshot Postgres-path fixture now exercises that assembly through packet resolution and edge materialization. The three focused suites pass 22/22; the fixture query adapter asserts no `INSERT` calls.
- Combined regression rerun including the previously reported float32 incidence assertion: 4 files, 25 tests passed (graphify incidence/materializer, GraphSnapshot materializer/Postgres path, and sparse-incidence tensor).
- The Postgres adapter now retains batch/replay checksums, replay admission counts, resolved candidate count, and typed pre-materialization rejections in a non-authoritative, no-write proof block. The graph-only rerun after this addition passed 3 files/22 tests; the test checks both checksum formats and the zero-write fixture boundary.
- SearchRuntime, GraphV2 fanout, and N-ary admission regression rerun: 3 files, 28 tests passed. This proves fixture-level candidate flow through hydration and final Top-K, not live graph usefulness or ContextManifest production admission.

## Limits / Next Gate

This is a code and fixture boundary, not proof of a live graph cohort. The audited `graphify_edges` source was empty, and the production multi-file extraction/replay caller plus a reviewed persistence/readback execution remain absent. The optional bridge now connects supplied replay batches to the existing resolver and GraphSnapshot materializer, but it does not itself extract or authorize a production cohort. Keep GraphV2 fanout, PageRank, N-ary code RAG, and ContextManifest admission unpromoted until a current source-bound edge cohort is generated through the existing owner, independently read back, and replayed through SearchRuntime.

The new Postgres-loader fixture also carries packet byte ranges and checks the resulting structural edge plus the absence of SQL writes. Earlier iteration failed because the fixture's generic `packet_key = ANY` matcher intercepted the tree-node SELECT; the matcher now identifies the packet readback query specifically. The failure was test-fixture routing, not a production data or schema result.

The batch assembler is not a live extractor: it does not select a current source cohort, execute `buildGraphifyStructuralProjectionPipelineV1`, obtain exact bytes from the authoritative snapshot, or persist/read back GraphV2. Those remain required before this adapter can be called production wiring.
