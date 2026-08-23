# Spectral / RTX alignment sweep

Date: 2026-08-23  
Checkout: `deeds-web-app-hardware-proof`  
Status: `WIRED / FIXTURE_PROVEN / RUNTIME_UNPROVEN`

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
- No database, Qdrant, Neo4j, Valkey, or vector-index writes were performed.

## Remaining gaps

1. Run `/v1/community/spectral` inside the activated WSL2
   `atlas-rapids-cu13` environment on the frozen fixture.
2. Produce a real execution receipt containing CUDA/driver/RAPIDS versions,
   graph/vector checksums, seed, tolerances, assignment checksum, latency, and
   GPU-memory observations.
3. Compare the live cuGraph assignment with the CPU/reference assignment using
   the same ordinal map before any projection is admitted.
4. Keep Qdrant tags, Valkey residency, Neo4j-derived features, and synthesis
   routing read-only until the parity receipt passes.
5. The native C ABI and N-API spectral/GEMM seam is still not implemented;
   Python sidecar transport remains the current isolation boundary.
6. The current RAPIDS environment is declared as 26.06/CUDA 13; version-pair
   support and the actual activated runtime must be captured in the receipt,
   not inferred from the environment file.
7. Workflow/A2A receipt wiring and grounded repair-outcome joins remain open.

## Next safe sequence

1. Run the focused Python/TypeScript tests.
2. Run the read-only WSL2 spectral smoke test with Conda explicitly activated.
3. Inspect the receipt and compare CPU/GPU checksums and metrics.
4. Only after parity, design a separate projection readback proof; do not add
   a new canonical table or mutate existing stores in this tranche.
