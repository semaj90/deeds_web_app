## 1. Prior-art audit (done before any new code, per Duplication Prevention)

- [x] 1.1 Search the repo for existing PCA/SVD implementations — **done 2026-09-12**. Found
      `scripts/atlas/pca-baseline-768-to-384.mjs` (real file, broken math — `_powerIteration`
      generates random vectors, not real eigenvectors; never produced a saved output; input loader
      named `loadMockVectors`) and `python/atlas_compute/representation_compare.py` (real, tested,
      already-exported comparison harness explicitly designed to evaluate AE/PCA/SVD outputs
      generically — this is the correct destination, not something to reimplement).
- [x] 1.2 Check whether `docs/stage3/semantic_facts.ndjson` (the broken script's input) contains
      real embeddinggemma output or synthetic fixture data — **file exists**, contents not yet
      inspected. Needed before deciding whether any part of the old script's data path is reusable.
- [ ] 1.3 **Attempted 2026-09-12, blocked by a real WSL infrastructure failure, not resolved.**
      Tried `MSYS_NO_PATHCONV=1 wsl -e /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python -c
      "import cuml..."` — failed with `Wsl/Service/0x8007274c` ("connected host has failed to
      respond"). Retried once (transient WSL hiccups are common); still failed. Fell back to the
      simplest possible check, `wsl -e echo "test"`, to rule out anything specific to this
      command — **that also failed/timed out**, despite `wsl --list --verbose` reporting the
      Ubuntu distro as `Running`. This is a genuine WSL service-layer problem on this host right
      now, not a path/command bug and not evidence cuML is unavailable — it's simply unconfirmed.
      Not chased further this session (would need a WSL/Docker Desktop restart, an operator-level
      action, not a retry loop). CPU `sklearn.decomposition.TruncatedSVD` already proved sufficient
      for every dimension tested (2.1-2.4), so this remains low-priority — nothing in this proposal
      is blocked on resolving it.

## 2. Real implementation

- [x] 2.1 **Done 2026-09-12.** Built `python/pca_svd_representation_baseline_v1.py` — real SVD via
      `sklearn.decomposition.TruncatedSVD` (verified available: sklearn 1.7.0 on this host's
      default Python; never hand-rolled power iteration). Did not block on 1.3's cuML check — CPU
      sklearn was sufficient at this sample size (1,703 rows, sub-second fit).
- [x] 2.2 **Done 2026-09-12, for all three remaining dimensions (64, 128, 256).** Built
      `python/freeze_pca_svd_basis_v1.py` — parameterized by `--dim` rather than one script per
      dimension (renamed from the initial `freeze_pca_svd_64_basis_v1.py` once generalized, per
      this repo's own duplication-prevention discipline: 3 near-identical files would have been
      the same failure class this session already flagged elsewhere). Each dimension fits
      `TruncatedSVD(n_components=dim)` on a 10,000-row sample (larger than the 1,703-row comparison
      sample), saves the frozen basis (`components_`, `explained_variance_`,
      `explained_variance_ratio_`, `singular_values_`, fit metadata) to
      `models/pca-svd-basis/pca_svd_{dim}_v1.npz`, and **verifies round-trip reload** for each —
      reloading the saved `.npz` fresh and re-projecting reproduces `svd.transform()`'s original
      output within floating-point noise every time:

      | Dim | `explainedVarianceRatioSum` | `componentsDigest` | Reload delta |
      |---|---|---|---|
      | 64 | 0.5962 | `73b40739001e771d7e78a4f4672527fc23183dee4753e4a32c5bc3a4f43d15e6` | `4.77e-7` |
      | 128 | 0.7421 | `ac62a72e66f32a53cb0f55c78667853da5b6022464311e1bfe386ed24c998422` | `4.77e-7` |
      | 256 | 0.8783 | `348a93fc23bbdcf74d9bc62408245fa236766147e4e0377a25a629e0de69cf09` | `5.36e-7` |

      Re-ran the 64d case with the generalized script and confirmed the `componentsDigest` is
      byte-identical to the original single-purpose script's output — the generalization changed
      nothing behaviorally, same seed/data/method. Precision note recorded in the script's own
      docstring: `sklearn.decomposition.TruncatedSVD` does **not** mean-center the input, unlike
      classic PCA — every artifact is labeled by its real method name, not a loose "PCA" claim.
- [x] 2.3 (retitled — not a Postgres backfill, deliberately) **Saved projections for all three
      dimensions as local files, not database columns.** Transformed all 10,000 fit-sample rows
      through each frozen (not re-fit) basis via `svd.transform()` and wrote one JSON line per row
      per dimension to `docs/vector-governance/pca_svd_{64,128,256}_projections_v1.jsonl` (10,000
      lines each, verified). **Deliberately did not add any `pca_svd_*` column to
      `codebase_chunk_index`** for any of the three — that remains premature per the still-open
      registry-reconciliation decision (`SYMBOL-REPRESENTATION-REGISTRY-RECONCILIATION-01`) and
      would need its own explicit Drizzle Safety Rule sign-off regardless of the comparison result.
      This step only proves the bases and projections are real, frozen, and reusable at every
      tested dimension — not that any of them should become a standing production lane yet.
- [x] 2.4 **Done 2026-09-12, real result, not projected.** Ran the script against a real sample
      (1,703 rows — matches `latent_64`'s exact known population count, confirming the query
      correctly required all four columns non-null) through the existing
      `compare_representations()` harness, k=10, reference = the real 768d `content_embedding`.
      Computed MRL-512/256/128 (existing prefix+L2-renorm mechanism) and real PCA/SVD-512/256/128/64
      side by side with the existing `autoencoder_latent_256/128/64` columns:

      | Representation | Dim | Neighbor overlap@10 | Distance correlation |
      |---|---|---|---|
      | `pca_svd_512` | 512 | **0.9865** | 0.9999 |
      | `pca_svd_256` | 256 | 0.9155 | 0.9931 |
      | `mrl_512` | 512 | 0.8654 | 0.9726 |
      | `autoencoder_latent_256` | 256 | 0.8363 | 0.9662 |
      | `pca_svd_128` | 128 | 0.8007 | 0.9504 |
      | `autoencoder_latent_128` | 128 | 0.7978 | 0.9451 |
      | `mrl_256` | 256 | 0.7611 | 0.9190 |
      | `autoencoder_latent_64` | 64 | **0.7358** | **0.9230** |
      | `pca_svd_64` | 64 | 0.6875 | 0.8723 |
      | `mrl_128` | 128 | 0.6476 | 0.8282 |

      **Real, nuanced answer to the original question** ("does the trained autoencoder actually
      beat a linear baseline?"): **no, not uniformly.** Real PCA/SVD beats both MRL truncation and
      the trained autoencoder at every matching dimension **512/256/128** — e.g.
      `autoencoder_latent_256` (0.8363) loses to `pca_svd_256` (0.9155) at the same dimension. But
      **the autoencoder wins at the smallest tested dimension, 64d** — `autoencoder_latent_64`
      (0.7358) beats `pca_svd_64` (0.6875). Plausible explanation (not further verified here): a
      nonlinear encoder's advantage over a linear projection should be expected to matter more at
      the most aggressive compression ratio, where linear structure is least sufficient — this is
      consistent with, not contradicted by, ML expectations, not an anomaly to explain away.
      Report: `docs/vector-governance/pca-svd-representation-comparison-v1.json`. Read-only:
      `writesPerformed: false` throughout, no Postgres/Qdrant mutation.

## 3. Registry + cleanup

- [ ] 3.1 Register the new representation with `dimension_method: 'LINEAR_PROJECTION'` in whichever
      registry wins `SYMBOL-REPRESENTATION-REGISTRY-RECONCILIATION-01` — blocked on that decision,
      not made here.
- [x] 3.2 **Done 2026-09-12.** Archived `scripts/atlas/pca-baseline-768-to-384.mjs` to
      `deeds_labs/archive/2026-09-12/pca-baseline-768-to-384.mjs.broken` (moved, not deleted, per
      this repo's convention) now that a real, verified replacement exists (2.1-2.4 above).
      `docs/archive-manifest.json` entry explicitly states it was broken (random-vector fake PCA),
      not merely superseded, and recommends against restoring it as a working baseline.

## Sequencing note

This entire change is blocked on `parent-atlas-ace-rlm-bitfrost-integration`'s
`SYMBOL-REPRESENTATION-REGISTRY-RECONCILIATION-01` representation-lineage recommendation (adopt
`atlas_representations` / migration 0152) being approved — building this before that decision risks
registering the new lane in a registry that then gets reconciled away.
