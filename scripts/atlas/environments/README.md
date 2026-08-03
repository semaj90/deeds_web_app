# Frozen environment exports

## atlas-rapids-cu13.yml

WSL2 Ubuntu conda environment (`~/miniforge3/envs/atlas-rapids-cu13`), discovered
already-provisioned (2026-07-10, origin not tracked in this repo's history) and
verified working live in GS1.33/GS1.37 (`openspec/changes/parent-atlas-graph-retrieval-proof/tasks.md`).

Contains a real, CUDA-13-built RAPIDS suite (cuVS, cuGraph, cuML, cuDF, RMM,
CuPy, `nx-cugraph`) plus `torch==2.13.0+cu130` and `langextract==1.6.0`.
Exported via `conda env export --no-builds` so it captures both conda and pip
packages without OS-specific build hashes.

**Reproduce this environment:**
```bash
wsl -d Ubuntu -e bash -lc "
  ~/miniforge3/bin/conda env create -n atlas-rapids-cu13-restored -f scripts/atlas/environments/atlas-rapids-cu13.yml
"
```

**Activate and use:**
```bash
wsl -d Ubuntu -e bash -lc "
  source ~/miniforge3/bin/activate atlas-rapids-cu13
  cd /mnt/c/Users/james/Videos/deeds-web-app
  python scripts/atlas/prove-symbol-identity-knn.py --top-k 3
"
```

**Known import-order requirement** (see code comments in
`scripts/atlas/prove-pagerank-networkx-neo4j-parity.py`): import `torch`
before `cudf`/`cugraph` in the same process, or `cugraph` fails with
`undefined symbol: cublasLtZZZMatmulAlgoGetHeuristicForStream` — PyTorch's
bundled CUDA libraries resolve a symbol the conda-installed RAPIDS build
otherwise can't find on its own.

**Re-export after any change to this environment:**
```bash
wsl -d Ubuntu -e bash -lc "
  ~/miniforge3/bin/conda env export -n atlas-rapids-cu13 --no-builds
" > scripts/atlas/environments/atlas-rapids-cu13.yml
```
