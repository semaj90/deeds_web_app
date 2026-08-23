# Spectral / RTX alignment sweep

Date: 2026-08-23
Status: `TRANSFERRED / FIXTURE_PROVEN / RUNTIME_UNPROVEN`

Transferred into the canonical checkout:

- revision-qualified spectral request and Python/TypeScript fixture contracts;
- non-mutating RAPIDS spectral sidecar route;
- recommendation evidence bridge for PageRank, KNN, spectral/community,
  low-rank sampling, OKF/domain evidence, and bounded synthesis;
- semantic_768 canonical Qdrant contract with semantic_512 reference MRL lane;
- focused OpenSpec and workstation TODO updates.

Validation remains fixture-level. The real WSL2 cuGraph spectral receipt,
CPU/GPU assignment parity, isolated Postgres/Qdrant lineage readback, native
C ABI/N-API seam, and workflow/A2A grounded repair receipts remain open.

Documentation reconciliation remains open: historical OpenSpec proposals that
describe `semantic_512` as canonical must be superseded or explicitly scoped as
historical before migration work is promoted. The active runtime contract is
`semantic_768` with derived MRL reference lanes.

No database, Qdrant, Neo4j, Valkey, or GPU index writes were performed.

The canonical TypeScript dependency install is currently blocked by Windows
`EPERM` on the existing esbuild executable. The directory was not force-removed;
focused TypeScript tests remain unexecuted in this checkout.

Low-rank/Tang execution is explicitly owned by Python/PyTorch. Receipts record
`numerical_owner=python_pytorch` and the selected execution device; TypeScript
does not perform large-matrix reductions or sampling.

Bounded CPU↔CUDA parity passed on the RTX workstation fixture: singular-value
max delta `4.29e-6`, relative-error delta `1.19e-7`, valid sample bounds, and
`canonical_authority=false`. This is a fixture proof, not a full-corpus or
production promotion.

A read-only check against the first `256 × 768` rows of the frozen DuckDB
`vector-snapshot-5k-768` artifact also returned `PARITY_PROVEN` for
`representation_id=semantic_768`, revision `0`: singular-value delta
`2.36e-5`, relative-error delta `2.75e-4`, and valid sample bounds. Full
5,000-row execution then completed with valid shape, lineage, and sample
bounds. After separating scale-aware backend variance from absolute
diagnostics, the receipt is `PARITY_PROVEN`: singular-value max absolute delta
`1.17798e-2`, max relative delta `1.97203e-4`, and relative-error delta
`4.44651e-5`. The canonical semantic artifact remains read-only and
non-authoritative. CandidateOrdinal-map checksum joining and the full
revision-qualified receipt now have a deterministic join checksum:
`b77644ae7a9f87ebb08a8a26e990f76acc003df06a145ace36db59885c84bfd2`.
The receipt remains non-authoritative until it is persisted through the
approved artifact/receipt path.
