# Live graph proof runtime

This runtime file installs only the small Python NVTX annotation package needed by the proof runner. The existing Atlas RAPIDS environment remains the owner of CUDA, CuPy, cuDF, cuGraph and cuVS; do not use this requirements file to resolve or reinstall that stack.

## Install

Preferred inside the existing RAPIDS/Miniforge environment:

```bash
conda install -c conda-forge nvtx
```

or, when that environment is pip-managed for small utility packages:

```bash
python -m pip install -r python/requirements-atlas-live-graph.txt
```

The pinned add-on is:

```text
nvtx==0.2.15
```

## Side-effect-free probe

```bash
PYTHONPATH=python python python/probe_live_graph_runtime.py
```

Require headless NVIDIA profilers as well:

```bash
PYTHONPATH=python python python/probe_live_graph_runtime.py --require-profilers
```

The probe checks these imports without running a graph workload:

```text
nvtx
numpy
cupy
cudf
cugraph
cuvs
psycopg2
```

and reports availability/version for:

```text
nsys
ncu
```

Missing RAPIDS/CUDA components must be repaired in the existing Atlas RAPIDS environment rather than installed by this requirements file.

## Execution ordering

```text
runtime probe
  -> semantic_512 reconciliation proof
  -> build_live_graph_fixture_semantic512.py
  -> prove_live_graph_fixture.py
  -> profile-live-graph-fixture.sh
```

No daily Graphify adoption is allowed from import success alone. The live revision-qualified receipts remain the proof gate.
