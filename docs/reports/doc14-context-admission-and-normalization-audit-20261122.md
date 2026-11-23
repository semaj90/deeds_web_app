# DOC-14 Context Admission and L2 Normalization Audit — 2026-11-22

## Scope and status

This read-only implementation audit follows the requested order: verify the recommendation admission boundary first, then record the separate geometry normalization slice. No database, graph, cache, model, or corpus writes were performed. No OpenSpec checkbox was changed.

## Recommendation boundary

### Existing owners and wiring

- `python/atlas_graph_runtime/dspy_predict_ace_recommender_v1.py::run_dspy_predict_ace_recommender_v1` rejects raw input containing only `canonicalized: true` and requires a V2 context manifest plus separately supplied records.
- It delegates to `python/atlas_graph_runtime/doc14_bounded_rlm_recommender_v1.py::run_bounded_dspy_recommendation_with_ace_manifest_v1`.
- That helper checks the manifest identity checksum and query, exact selected-node membership, evidence-ref membership, duplicate node bindings, `pgReadbackStatus == PROVEN`, `admissionStatus == INDEX_ELIGIBLE`, chunk text SHA-256, and source-revision-set checksum before invoking its DSPy predictor.
- `python/atlas_graph_runtime/oak_hypergraph_rag_pipeline_v1.py::run_sealed_oak_hypergraph_rag_v1` returns `CANONICAL_ACE_CONTEXT_REQUIRED` unless its caller supplies both `context_manifest_v2` and `ace_records`.

### Remaining integrity gap

The V2 manifest and row records are ordinary mappings passed into Python. The current Python function verifies internal consistency, but it does not itself perform a fresh PostgreSQL readback, validate tenant/case authorization scope, or verify an admission receipt issued by the authoritative ACE/PostgreSQL owner. A caller can construct a self-consistent checksum and supply rows labeled `PROVEN` / `INDEX_ELIGIBLE`; those strings are not a readback proof. The positive test `test_dspy_path_requires_verified_ace_manifest_and_exact_row_joins` uses such a synthetic manifest/row and a fake DSPy module, so it demonstrates fixture wiring, not an authorized live path.

The existing TypeScript `CurrentAceContextManifestAdmissionV1` builder creates a validated manifest from an admitted feature snapshot, but its return shape alone does not carry independently read-back chunk bodies or establish authorization scope for the Python call. The live adapter must connect that existing owner to a current scoped readback before calling DSPy. Do not fix this by trusting another caller-provided boolean or by rehashing data the caller supplied.

### Verification

- Command: `C:\Python313\python.exe -m pytest python/tests/test_dspy_predict_ace_recommender_v1.py python/tests/test_doc14_bounded_rlm_recommender_v1.py -q`
- Output: `11 passed in 2.74s`.
- Scope: focused fixture and adversarial tests; no live ACE manifest, authorized PostgreSQL readback, or deployed request was exercised.
- Existing adverse cases include raw boolean-only context, missing rows, tampered manifest checksum/query, evidence outside the allowlist, bad chunk hash/span, unsupported citation, and token-budget rejection before model resolution. Add explicit tests for forged status strings, authorization scope mismatch, substituted row membership, stale current-source revision, and no model call on each failure.

## Stabilized L2 normalization

### Existing functions

- PyTorch: `python/atlas_compute/l2_normalization_v1.py::stabilized_l2_normalize` uses `x / sqrt(sum(x²)+epsilon)`. Its custom VJP is `g/r - x*(x·g)/r³`, the exact derivative for this stabilized definition.
- WASM: `sveltekit-frontend/src/wasm/vector-operations.ts::normalizeWithEpsilon` and `l2NormalizeBackwardWithEpsilon` implement the same forward and backward formulas.
- Test/smoke callers: `python/tests/test_l2_normalization_v1.py` and `sveltekit-frontend/scripts/smoke-l2-normalization-wasm-v1.mjs`.

### Verification

- Command: `C:\Python313\python.exe -m pytest python/tests/test_l2_normalization_v1.py -q`
- Output: `5 passed in 8.88s`.
- Command: `node sveltekit-frontend/scripts/smoke-l2-normalization-wasm-v1.mjs`
- Output: `{"status":"PASS","batchL2":true,"stabilizedForward":true,"stabilizedBackward":true}`.
- Scope: PyTorch CPU autograd and the current checked-in/static WASM artifact smoke. No CUDA dispatch, PyTorch↔WASM shared numeric fixture, or fresh AssemblyScript compilation was verified.

### Wiring conclusion

The helpers are present and called by focused tests, but repository search found no production caller for the stabilized PyTorch or WASM functions. The basic unit-vector `normalize()` path is a separate operation. No facial measurement descriptor, `R^10 → R^22` head-measurement function, fitter, or procedural-mesh round trip is wired. The existing AST 22-feature vector is not facial geometry. Keep physical ratios separate from canonical embedding normalization.

## Ordered next work

1. Wire an authoritative server-side ContextManifest + current scoped Postgres readback verifier into the DOC-14 DSPy call. Reject forged readback labels, stale revisions, scope mismatch, altered membership, and checksum mismatch before model invocation.
2. Prove one current authorized readback and cited recommendation end to end, then persist only an independently validated receipt through the existing path if authorized.
3. Define the facial geometry measurement contract and connect it to an existing procedural head builder; retain the current L2 helpers only where the feature semantics call for angular normalization.
4. Add cross-runtime gradient parity and CUDA benchmarking only after there is a real geometry consumer and the normal GPU admission gates pass.

```yaml
likely_cause: The boolean shortcut is removed, but the Python recommendation boundary still accepts caller-supplied manifest and readback-shaped mappings whose status fields do not prove fresh authorized canonical readback.
evidence:
  - python/atlas_graph_runtime/dspy_predict_ace_recommender_v1.py
  - python/atlas_graph_runtime/doc14_bounded_rlm_recommender_v1.py
  - python/atlas_graph_runtime/oak_hypergraph_rag_pipeline_v1.py
  - python/tests/test_doc14_bounded_rlm_recommender_v1.py
  - python/atlas_compute/l2_normalization_v1.py
  - sveltekit-frontend/src/wasm/vector-operations.ts
  - python/tests/test_l2_normalization_v1.py: 5 passed
  - node sveltekit-frontend/scripts/smoke-l2-normalization-wasm-v1.mjs: PASS
patch_targets:
  - python/atlas_graph_runtime/dspy_predict_ace_recommender_v1.py
  - python/atlas_graph_runtime/doc14_bounded_rlm_recommender_v1.py
  - python/atlas_graph_runtime/oak_hypergraph_rag_pipeline_v1.py
  - openspec/changes/parent-atlas-versioned-doc-intelligence/tasks.md
  - openspec/changes/parent-atlas-tensor-residency-integration/tasks.md
safe_next_command: "rg -n -C 4 'run_dspy_predict_ace_recommender_v1|ace_records|context_manifest_v2|CurrentAceContextManifestAdmissionV1' python/atlas_graph_runtime sveltekit-frontend/src/lib/server/atlas"
smoke_command: "C:\\Python313\\python.exe -m pytest python/tests/test_dspy_predict_ace_recommender_v1.py python/tests/test_doc14_bounded_rlm_recommender_v1.py python/tests/test_l2_normalization_v1.py -q"
report_path: docs/reports/doc14-context-admission-and-normalization-audit-20261122.md
```
