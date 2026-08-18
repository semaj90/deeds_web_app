# Parent Atlas recommendation layer — test-later matrix

This branch intentionally wires contracts/reference math and resource policy without claiming local workstation execution.

## Ownership to preserve

- `semantic_768` is the canonical semantic representation.
- Qdrant/cuVS/CAGRA/DiskANN/TurboVec are executors behind one semantic lane.
- Tree-sitter is structural truth; ast-grep is query/rewrite only.
- Existing HyperGraphRAG tables/types/traversal own n-ary truth.
- NetworkX is the readable PageRank/PPR oracle on a frozen projection.
- cuGraph/Neo4j GDS are graph executors that must match projection/config identity before parity claims.
- Existing native GEMM CPU/cuBLAS/cuBLASLt dispatch remains the native math owner; LibTorch is an optional readable C++/CUDA reference.

## Test order

1. Typecheck changed SvelteKit files.
2. Run `tests/resource-aware-recommendation-policy.spec.ts`.
3. Run `tests/graph-reranker-resource-aware.spec.ts` and `tests/graph-reranker-semantic-refinement.spec.ts`.
4. Run `tests/recommendation-receipt.spec.ts` and `tests/prefill-rerank-features.spec.ts`.
5. Run existing HyperGraphRAG tests plus bounded traversal fixtures with maxEdges/maxMembers/maxHops/maxTokens/maxMillis exhaustion cases.
6. Run `python/tests/test_parent_atlas_networkx_pagerank.py` on the frozen projection.
7. Run the live cuGraph PageRank path with the same graph revision/projection/config and emit a `pagerank-execution-receipt.v1`.
8. Compare NetworkX/cuGraph score vectors with a declared numeric tolerance and top-K overlap; never compare different projection/config hashes.
9. Run `scripts/atlas/recommendation-math-reference.py` on CPU, then CUDA when available; compare semantic/final scores.
10. Compile the optional LibTorch recommendation reference only after `TorchConfig.cmake` is configured; compare it against the Python PyTorch oracle.
11. Run `tests/qdrant-query-budget.spec.ts`, then measure oversampling/rescore settings against semantic_768 Recall@K/MRR and latency on the real collection.
12. Exercise `/api/graph/fetch-rerank` with low/normal/high budgets and verify optional missing lanes do not lower scores merely because they were not executed.
13. Verify response telemetry contains only tool argument keys/checksum, not raw secret-bearing tool values.
14. For mutation/repair requests, verify a non-admissible plan blocks when required exact-promotion/structural evidence cannot fit the resource envelope.

## Alpha evaluation

Keep 0.85 as the reproducible default prior. Only tune after the same frozen graph/retrieval oracle can evaluate a sweep such as 0.70/0.80/0.85/0.90/0.95 using downstream Recall@K, MRR, exact-promotion success and compute cost.

## Promotion rule

No accelerator is canonical merely because it is faster. Promote a backend only after its receipt binds the same projection/config and its numerical/ranking parity falls within the declared tolerance.
