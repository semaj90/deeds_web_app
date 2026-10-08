# AVX2 / simdjson / TurboVec / N-ary concept tile contract (design-only)
Status: draft; neither live CPU SIMD dispatch nor RTX/cuVS execution is proved here.

## Owner reuse
- JSON parsing: `simd-bridge/cpp/simdjson_bridge.cc`, `sveltekit-frontend/scripts/lib/avx2-simdjson-bridge.mjs`, `packages/parent-atlas-retrieval/src/gpu/simdjson-bridge.ts`.
- Hypergraph facts: `sveltekit-frontend/src/lib/server/atlas/graph/ontology-tuple-nary-proposal-v1.ts` and API proposal.
- Manifest: `sveltekit-frontend/src/lib/server/ace/context-compiler.parent-atlas.ts`.
- Dense lane: Qdrant semantic_768; TurboVec is a challenger executor, never another fusion vote.

## Contract: CandidateConceptTileV1 (not canonical storage)
A `4 x 6` FP32 tile = four revision-valid candidates by six **derived** features.
Define feature slots only after mapping from source owners; proposed slots:
0 exact_match, 1 semantic_score, 2 domain_alignment, 3 nary_fact_overlap,
4 graph_prior, 5 provenance_confidence.
A tile is **not** a semantic_768 vector, not an HNSW index, and not model KV.

Candidate row identity is a tuple, not a hash-only pointer:
`(packet_key, symbol_version_id?, source_revision, workspace_revision, graph_revision, representation_revision, domain_taxonomy_revision, feature_schema_revision)`.
For each selected N-ary fact retain `fact_id`, revision, participant canonical IDs, participant roles, evidence_refs and checksum.
Do not infer a source revision from an ordinal, file path or ANN index.

Tensors: `values[4,6] float32`, `missing[4,6] uint8`, `valid_rows[4] uint8`.
Value bytes = 96; missing bytes = 24; valid rows = 4; minimum raw payload 124 bytes, excluding descriptor, alignment, offsets and metadata. AVX2 operates on 8 FP32 lanes per 256-bit vector; a six-element row needs padding or packed vectorization, and padded values must be masked.

## Execution boundaries
1. Parse JSONL using existing simdjson bridge; validate **full schema**, ID/revision fields and N-ary role/evidence invariants before admission. simdjson On Demand may defer validation of unread fields.
2. Resolve domain classification and ontology tuple/N-ary facts from existing grounded owners; join by revision-qualified canonical IDs.
3. Map into tile with deterministic candidate ordering and an explicit missing mask (no zero-as-missing ambiguity), plus feature-schema checksum and evidence lineage.
4. CPU oracle computes tile transform and stable rank; AVX2 implementation may dispatch only on capable CPUs with scalar fallback.
5. Optional RTX/cuVS path operates on separate semantic_768 vectors and ordinal map. Its Top-K results contribute candidate IDs, **not tile storage**. An optional Torch CUDA tile scorer must match CPU within tolerance and retain deterministic tie policy.
6. Cache immutable tile artifact in existing ACE/BitFrost residency owner, keyed by full identity/revisions + feature schema + evidence/content checksum. Store bounded handles and readback receipts, not raw process pointers.
7. Prefill/synthesis consumes ContextManifest-approved evidence; llama-server owns KV pages and can reuse matching prompt prefixes. Never insert arbitrary retrieval tensors or graph tuples directly into model KV.
8. On revision/lease/cache-generation mismatch, state machine transitions to `INVALIDATED`, then re-resolves and rematerializes from canonical stores.

## Suggested state machine
`UNRESOLVED → GROUNDED → FEATURED → VALIDATED → INDEX_REFERENCED → CACHED → CONTEXT_ADMITTED → PREFILL_BOUND → REUSED | EVICTED`.
Any proof or revision mismatch -> `REJECTED` (pre-admission) or `INVALIDATED` (cached).
`INDEX_REFERENCED` means linking to an existing vector index descriptor, **not** indexing this 4x6 tile as a semantic vector.

## Verification gates
- AVX2 vs scalar exact/tolerance parity; CPU feature probing and dispatch, no AVX2 instruction on unsupported hosts.
- simdjson fixture roundtrip, malformed/unread-field rejection, UTF-8 and role/tuple constraints.
- Domain taxonomy change invalidates tile; unrelated version change does not.
- Hyperedge participant/revision mismatch rejects tile and prevents phantom graph incidence.
- CPU/GPU scorer scores and rank parity; Qdrant/TurboVec/cuVS exact oracle KNN compares 768D only.
- Cache generation, lease, source revision and model/prompt-prefix identity validation; false KV hit must fail closed.
- p50/p95 parse, feature mapping, transfers, indexing lookup, prefill time, GPU memory, hit/miss/eviction metrics.
