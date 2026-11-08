# Python runtime owner map (read-only survey, 2026-11-07)

Advisory inventory. No installs, no service changes. Canonical authority: none.

## Environments

| Environment | Python | GIL | torch | sklearn | RAPIDS (cudf / cuml / cuvs) | Notes |
|---|---|---|---|---|---|---|
| Windows `py -3.14` (default) | 3.14.7 | on | no | no | no | Task pipeline runs here (numpy, networkx) |
| Windows `py -3.13` | 3.13.5 | on | 2.8.0+cu128, CUDA available | 1.7.0 | no | NB / LR trainers, torch MLP challengers |
| Windows `py -3.14t` | not installed | n/a | n/a | n/a | n/a | No free-threaded interpreter; no code requires one |
| WSL2 `atlas-rapids-cu13` | 3.14.6 | on | 2.13.0+cu130, CUDA 13.0, `cuda_available=True` | yes | yes / yes / yes | GPU owner for cuDF, cuML, cuVS. Needs `:8090` stopped by a human for VRAM |
| WSL2 `atlas-cutile-cu132` | 3.14.6 | on | yes | not checked | no | cuTile / SIMT lane |
| Docker `atlas-gpu-8098` | 3.13.14 | on | no | yes | yes / yes / not checked | RAPIDS sidecar image, CPU-first tensor work |
| Docker `atlas-neural-decoder` | 3.12.3 | on | yes (image tag 2.13.0-cu132) | no | no | Neural decoder on `:8121` |

## Owner map (one owner per capability)

| Capability | Owner | Environment |
|---|---|---|
| Task extraction, PageRank, RRF fusion, Louvain, kNN | `scripts/atlas/openspec-task-*.py` | Windows 3.14 (numpy only) |
| Naive Bayes, logistic regression (classical) | `python/train_domain_classifier.py`, `scripts/atlas/apply-naive-bayes-predictions.mjs` | Windows 3.13 (sklearn) |
| Torch MLP challengers, Spherical Adaptive KMeans, Spectral UMAP & DSPy Graph RAG helpers | `scripts/atlas/prove-rtx-dlpack-svd-mlp-challenger-v1.py`, `scripts/atlas/prove-rtx-mlp-kmeans-umap-domain-dspy-v1.py` | Windows 3.13 (`torch 2.8.0+cu128` on `cuda:0` RTX 3060 Ti, bounded `<= 96 MiB` VRAM so `:8090` Ornith is untouched) |
| GPU KMeans / UMAP / cuGraph / cuVS (large corpus RAPIDS lane) | `python/atlas_compute/*` via RAPIDS | WSL2 `atlas-rapids-cu13` (or Docker 8098) |
| Neural decoder encode/decode | Docker `atlas-neural-decoder` | Docker, torch image |

## Gaps closed in this survey

- WSL `atlas-rapids-cu13` has sklearn (1.7-compatible check passed) and torch with CUDA built and available.
- Docker `atlas-gpu-8098` has sklearn, cuml, and cudf, but no torch.
- Docker `atlas-neural-decoder` has torch, but no sklearn, and runs Python 3.12.3.

## Remaining gaps

- No free-threaded 3.14t interpreter. Not needed today; install only with a measured need.
- Windows 3.14 has no torch or sklearn. Do not run classifier training there. Use 3.13 or WSL.
- `atlas-cutile-cu132` sklearn status not checked.
- GPU CUDA availability in WSL was checked as a flag only; VRAM is shared with the Ornith vision server on `:8090`.

## Rules applied

- No `pip` or `conda` install without a proven capability gap (DEPENDENCY-CAPABILITY-GUARD-01).
- GPU work follows the existing WSL RAPIDS path and its VRAM hygiene steps. Service lifecycle stays human-run.
