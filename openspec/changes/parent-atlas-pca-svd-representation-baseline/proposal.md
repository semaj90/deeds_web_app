## Why

In conversation (2026-09-12), the idea of adding a PCA/SVD-based linear projection lane alongside
the existing MRL-truncation and autoencoder-latent representation lanes was raised as a possible
third representation family and, more usefully, as a cheap baseline oracle to check whether the
trained autoencoder (`latent_64`/`128`/`256`) is actually earning its complexity over a plain
linear method. Before scoping any new work, a repo-wide search for existing PCA/SVD infrastructure
(per this repo's Duplication Prevention hard rule) found **both a real, well-built comparison
harness and a real, but fundamentally broken, prior PCA attempt** — this proposal exists to build
on the former and either fix or replace the latter, not to start from nothing or duplicate either.

**What already exists and is genuinely reusable**: `python/atlas_compute/representation_compare.py`
— `compare_representations()` / `RepresentationComparisonReceipt`, exported from
`atlas_compute/__init__.py`, with a real test file (`python/test_atlas_compute_graph_representation.py`).
Its own docstring already states the exact intent this proposal wants: *"This module does not
train or own an autoencoder. It evaluates already-produced representations (AE/PCA/SVD/etc.)
against the frozen canonical semantic matrix... because low reconstruction loss alone does not
prove retrieval usefulness."* It uses neighborhood-overlap@k and distance-correlation metrics —
genuinely retrieval-relevant, not just reconstruction MSE. **This is the correct destination for
PCA/SVD evaluation output; it should not be reimplemented.**

**What already exists and is broken, not just stale**: `scripts/atlas/pca-baseline-768-to-384.mjs`.
Read in full before this proposal was written, not assumed working from its name. Its `SimplePCA`
class's `_powerIteration` method does **not** perform power iteration or any real eigendecomposition
of the data's covariance structure — it generates **random vectors** (`Math.random()`) and
Gram-Schmidt-orthogonalizes them. These are not principal components; they are random orthonormal
directions with no relationship to the actual variance structure of the embedding corpus. Its
`docs/vector-governance/pca-baseline-report.json` output file does not exist on disk, confirming it
was never run to a completed, saved result (or if run, the output was never kept) — its single git
commit's message is an unrelated, garbled prompt-dump, consistent with auto-generated scaffold that
was never revisited. Its input path (`docs/stage3/semantic_facts.ndjson`) does exist, but the
loader function is literally named `loadMockVectors`, and whether its contents are real
embeddinggemma output or synthetic fixture data has not been checked here.

## What Changes

- Do **not** patch `SimplePCA`'s power iteration in place — hand-rolling numerically-correct PCA/SVD
  in plain JS is the wrong tool for this; real linear algebra libraries exist and are already
  proven live in this repo's GPU environment (`wsl::atlas-rapids-cu13`, per
  `DEPENDENCY-CAPABILITY-GUARD-01` — check that environment for `cuml.decomposition.TruncatedSVD`
  or fall back to CPU `numpy`/`scipy.linalg.svd` before considering any new dependency).
- Fit a real SVD/PCA basis on a representative sample of `codebase_chunk_index.content_embedding`
  (the same 768-dim canonical corpus every other representation lane already uses), freeze it as a
  versioned artifact, and transform the corpus through it to produce a `pca_128`-style derived
  column — mirroring exactly how `latent_128` was built this session
  (`scripts/atlas/backfill-latent-128-slice.mjs`), not a new backfill pattern.
- Feed the resulting representation into the **existing** `compare_representations()` harness
  alongside the current `latent_64`/`128`/`256` autoencoder outputs, using the same frozen
  canonical semantic matrix as the reference — this produces the actual "is the autoencoder earning
  its complexity" answer this proposal was raised to get.
- Register the new representation in whichever registry wins the `SYMBOL-REPRESENTATION-REGISTRY-
  RECONCILIATION-01` decision (`parent-atlas-ace-rlm-bitfrost-integration`) using
  `dimension_method: 'LINEAR_PROJECTION'` — an enum value that **already exists** in the pending
  `atlas_representations` migration (0152) and has never been used by anything. This proposal is
  the first real occupant of that slot, not a new schema need.
- Archive (not delete) `scripts/atlas/pca-baseline-768-to-384.mjs` once a real replacement exists,
  per this repo's archive-not-delete convention — it is broken, not merely superseded, so it should
  not remain as if it were a working baseline someone might run by mistake.

## Capabilities

### New Capabilities
- `atlas-linear-projection-representation`: a real (not stub) PCA/SVD-derived representation lane,
  evaluated via the existing comparison harness, explicitly as a baseline oracle first and a
  possible standing lane second — not assumed to become permanent by default.

### Modified Capabilities
- (none — this does not touch the MRL-truncation or autoencoder-latent lanes, which stay exactly
  as they are; this is additive)

## Impact

- **Compute**: fitting the basis is a one-time offline job; the transform itself is a single matrix
  multiply per embedding, cheaper than the autoencoder's forward pass at query/backfill time.
- **Schema**: depends on the registry-reconciliation decision already tracked elsewhere — this
  proposal does not introduce a competing schema of its own.
- **Explicitly sequenced behind**: `SYMBOL-REPRESENTATION-REGISTRY-RECONCILIATION-01`'s
  representation-lineage half (adopt `atlas_representations` / 0152), per the earlier session
  finding that this is the natural home for a new `dimension_method` value.
- **Risk**: low. This is read-only evaluation work plus one new derived column, additive only, no
  existing lane touched.
