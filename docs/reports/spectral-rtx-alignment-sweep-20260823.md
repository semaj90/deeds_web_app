# Spectral / RTX alignment sweep

Date: 2026-08-23  
Checkout: `deeds-web-app-hardware-proof`  
Status: `WIRED / FIXTURE_PROVEN / RUNTIME_EXECUTED / PARITY_BLOCKED`

## Audited surfaces

- TypeScript spectral fixture and multihop synthesis contracts.
- Python spectral reference and RAPIDS community request/response contracts.
- RAPIDS community sidecar capability discovery and `/v1/community/spectral`.
- WSL2 environment declaration, cuGraph/cuVS graph workers, and live-fixture
  benchmark scripts.
- cuVS gRPC, TurboVec N-API, cuBLAS/GEMM, and native C ABI/N-API OpenSpec
  boundaries.
- Spectral OpenSpec, RTX GPU lab tasks, and workstation TODO.

## What is complete

- A bounded spectral challenger route exists and is non-mutating.
- Requests are revision-bound and reject invalid spectral bounds:
  `numEigenvectors <= numClusters <= node_count`.
- TypeScript and Python fixtures use the same sorted CandidateOrdinal rows,
  canonical JSON/checksum rules, and explicit non-authority flags.
- The sidecar reports spectral capability dynamically instead of claiming it
  when cuGraph is unavailable.
- Existing cuGraph PageRank/Louvain parity receipts remain separate from the
  new spectral challenger; no authority was reassigned.

## Validation executed

- Python spectral/RAPIDS contract and parity lane: `6 passed`.
- TypeScript spectral fixture/multihop lane previously recorded: `16 passed`.
- WSL2 `atlas-rapids-cu13` 500-candidate run executed with frozen `K=8` and
  seed `684453`.
- Runtime: cuGraph `26.06.00`, cuDF `26.06.01`, cuPy `14.1.1`, CUDA runtime
  `13.2`, NVIDIA driver `580.88`, RTX 3060 Ti.
- CPU/cuGraph modularity ARI: `0.953547`, required threshold `0.99`.
- CPU/cuGraph assignment checksums differ; projection admission remains false.
- The raw 500-node COO input contains `4,807` undirected edge rows,
  `4,683` unique undirected pairs, and `124` duplicate pairs; there are no
  self-loops. The benchmark applies the explicit `SUM_BY_UNDIRECTED_PAIR`
  reduction before both CPU and GPU execution, so the current proof is not a
  zero-duplicate-input proof.
- Three repeated GPU runs have stability ARI `0.968814`; GPU repeat
  determinism is therefore not yet proven.
- The zero-duplicate derived fixture produced the same modularity ARI
  (`0.953547`) and GPU stability ARI (`0.968814`) as the summed-duplicate
  input. Duplicate COO rows are therefore not the primary cause of this
  mismatch, although the zero-duplicate receipt is now the cleaner parity
  fixture.
- Diagnostic eigensolver tolerance sweep (`1e-4`, `1e-5`, `1e-6`) produced
  the same modularity ARI (`0.953547`), balanced-cut ARI (`0.953306`), and
  GPU stability ARI (`0.968814`). Tightening `evs_tolerance` alone is not the
  explanation for the mismatch. Receipts:
  `docs/reports/spectral-live-fixture-zero-duplicates-evs-1e-4-receipt-500.json`
  and `docs/reports/spectral-live-fixture-zero-duplicates-evs-1e-6-receipt-500.json`.
- Explicit eigenvector-count diagnostics changed the result but did not pass:
  `num_eigen_vects=2` produced modularity ARI `0.951989`, while `4` produced
  `0.938476`; the baseline `3` remains best at `0.953547`. Component
  selection is therefore a real sensitivity, not a parity fix.
- Modularity quality also differs: CPU `0.295774` versus cuGraph `0.042387`;
  edge cut CPU `73.7181` versus cuGraph `72.1144`.
- The activated cuGraph 26.06 runtime emits a deprecation warning from the
  balanced-cut call. NVIDIA's current cuGraph documentation still documents
  both Balanced Cut and Modularity Maximization, so this is recorded as a
  runtime warning rather than an assertion that the API is globally removed.
  Balanced Cut remains exploratory for this proof; Modularity Maximization is
  the explicitly versioned promotion candidate.
- The documented modularity call is
  `cugraph.spectralModularityMaximizationClustering(G, num_clusters,
  num_eigen_vects, evs_tolerance, evs_max_iter, kmean_tolerance,
  kmean_max_iter, random_state)` and expects a weighted cuGraph graph. The
  receipt must preserve these effective parameters rather than relying on
  library defaults.
- Receipt: `docs/reports/spectral-live-fixture-receipt-500.json`.
- Zero-duplicate comparison receipt:
  `docs/reports/spectral-live-fixture-zero-duplicates-receipt-500.json`.
- No database, Qdrant, Neo4j, Valkey, or vector-index writes were performed.

## Remaining gaps

1. Diagnose GPU k-means initialization/oversampling semantics and eigenspace
   component selection before promotion; tolerance alone did not change the
   result and `num_eigen_vects=3` currently performs best.
2. Explain the remaining CPU/cuGraph partition difference before promotion;
   current ARI is below threshold.
3. Compare CPU and GPU eigenspace/convergence and quality metrics on the same
   ordinal map.
4. Keep the live receipt as `EXECUTED_UNPROVEN` until parity and repeat
   determinism pass.
5. Keep Qdrant tags, Valkey residency, Neo4j-derived features, and synthesis
   routing read-only until the parity receipt passes.
6. The native C ABI and N-API spectral/GEMM seam is still not implemented;
   Python sidecar transport remains the current isolation boundary.
7. The current RAPIDS environment is declared as 26.06/CUDA 13; version-pair
   support and the actual activated runtime must be captured in the receipt,
   not inferred from the environment file.
8. Workflow/A2A receipt wiring and grounded repair-outcome joins remain open.

## Next safe sequence

1. Run the focused Python/TypeScript tests.
2. Run the read-only WSL2 spectral smoke test with Conda explicitly activated.
3. Inspect the receipt and compare CPU/GPU checksums and metrics.
4. Only after parity, design a separate projection readback proof; do not add
   a new canonical table or mutate existing stores in this tranche.
