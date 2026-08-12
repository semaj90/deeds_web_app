# GRAPH_SNAPSHOT_PARITY — CUDA/WSL2/RAPIDS Environment + File Map

**Status**: cuGraph backend LIVE ✅ | Cross-backend PageRank/component parity PROVEN ✅ | Louvain agreement NOT_PROVEN ⏳

---

## TL;DR

One WSL2 Ubuntu distro, one miniforge install, one conda env (`atlas-rapids-cu13`) runs RAPIDS/cuGraph on the RTX 3060 Ti. It was broken (cuBLAS symbol mismatch) and got fixed with a single `pip install --force-reinstall --no-deps nvidia-cublas`. The files below form five hyperedges — DEFINES_CONTRACT, EXPORTS_SNAPSHOT, VALIDATES_PARITY, RUNS_IN_ENV, and one governance flag (DUPLICATE_OWNER) for a package split discovered mid-session.

---

## Environment Specs

| Layer | Value |
|---|---|
| Host OS | Windows 10, GPU: NVIDIA RTX 3060 Ti (8GB VRAM) |
| WSL2 distro | `Ubuntu` (also present: `docker-desktop`), WSL version 2 |
| GPU driver | 580.88 (Windows-side, shared into WSL2) |
| CUDA (driver-reported) | 13.0 |
| Python (env) | 3.14 |
| Package manager | miniforge3 at `~/miniforge3` (micromamba-backed: `_conda -> micromamba`) |
| Conda env | `atlas-rapids-cu13` at `~/miniforge3/envs/atlas-rapids-cu13` |

**RAPIDS packages in `atlas-rapids-cu13`** (verified live):

| Package | Version |
|---|---|
| `cugraph` | 26.06.00 |
| `cudf` | 26.6.1 |
| `nx-cugraph` | 26.6.0 |
| `pylibcugraph` | 26.6.0 |
| `pylibcudf` | 26.6.1 |
| `dask-cudf` / `dask-cuda` | 26.6.1 / 26.6.0 |
| `cuda-toolkit` | 13.0.3.0 |
| `cuda-python` / `cuda-bindings` / `cuda-core` | 13.3.0 / 13.3.1 / 0.7.0 |
| `nvidia-cublas` | **13.6.1.10** (was 13.1.1.3 — see incident below) |
| `nvidia-cudnn-cu13` | 9.20.0.48 (`Required-by: torch`) |
| `torch` | 2.13.0+cu130 |

**Conda registration** (`conda env list` — properly registered, not just a stray directory):
```
base                     /home/james/miniforge3
atlas-rapids-cu13        /home/james/miniforge3/envs/atlas-rapids-cu13
```
Backed by `conda 26.3.2` / `micromamba 2.5.0` (`_conda -> micromamba` symlink). **Not** auto-activated via `.bashrc`/`.profile` (no `conda init` present) — always invoke the env's binaries directly (`~/miniforge3/envs/atlas-rapids-cu13/bin/python`) or run `conda activate atlas-rapids-cu13` first; a bare `which conda` / `python3 -c "import cugraph"` in a fresh shell will look like RAPIDS isn't installed when it actually is.

**cuDNN — functionally verified in WSL2**, not just files-on-disk:
```
torch 2.13.0+cu130
cuda available True
cudnn version 92000
cudnn enabled True
conv2d output shape torch.Size([1, 4, 14, 14]) device cuda:0
```
Real GPU `conv2d` executed through cuDNN via `torch`. This matches the repo's existing (correct) documentation elsewhere — `docs/native/native-gpu-primitives-map.md` and `docs/architecture/local-deep-research-boundary.md` both already state cuDNN is WSL2/Docker-only, never Windows-native.

## Incident: cuBLAS symbol mismatch (fixed live this session)

```
ImportError: libcublas.so.13: undefined symbol:
  cublasLtZZZMatmulAlgoGetHeuristicForStream, version libcublasLt.so.13
```

**Cause**: two CUDA library sources coexist in the same env —
- conda-toolkit's own `libcublasLt.so.13` (symlink → `libcublasLt.so.13.6.0.2`, under `envs/atlas-rapids-cu13/lib/`) — **has** the symbol.
- the pip wheel `nvidia-cublas==13.1.1.3`'s bundled `libcublasLt.so.13` (under `.../site-packages/nvidia/cu13/lib/`) — **missing** the symbol.

The pip-bundled copy was the one actually loaded at import time (older, ABI-incompatible with what `pylibcugraph` 26.6.0 was built against).

**Fix** (one command, no full env rebuild):
```bash
~/miniforge3/envs/atlas-rapids-cu13/bin/pip install --force-reinstall --no-deps nvidia-cublas
# 13.1.1.3 -> 13.6.1.10, matching the conda-toolkit's 13.6.x line
```

**Verified after fix**: `import cugraph` PASS, `import nx_cugraph` PASS, live `cugraph.pagerank()` + `cugraph.connected_components()` against the full 162,234-node / 108,156-edge corpus — results below.

**Do not rebuild `atlas-rapids-cu13` from scratch** unless this same targeted fix stops working — a fresh `atlas-graph-2606` env was considered and explicitly not needed once both imports passed cleanly.

---

## File Relationships (n-ary hyperedges)

Each row is one hyperedge: a relation joining N participant files/artifacts, each with a role. This mirrors the repo's own `OntologyLinkedTuple` / hypergraph vocabulary (`subject/predicate/object` generalized to N participants) rather than a flat file list, so the *shape* of ownership is visible, not just the names.

### Hyperedge 1 — `DEFINES_CONTRACT`

The Zod schema and its pure-logic mapper, each with their own proof.

| Role | File |
|---|---|
| contract (schema + status derivation) | `sveltekit-frontend/src/lib/server/atlas/graph/graph-snapshot-parity-contract.ts` |
| contract test | `sveltekit-frontend/src/lib/server/atlas/graph/graph-snapshot-parity-contract.spec.ts` |
| pure mapper (node/edge row shape + hash) | `sveltekit-frontend/src/lib/server/atlas/graph/graph-snapshot-parity-exporter.ts` |
| mapper test | `sveltekit-frontend/src/lib/server/atlas/graph/graph-snapshot-parity-exporter.spec.ts` |

### Hyperedge 2 — `EXPORTS_SNAPSHOT`

Source corpus → frozen parquet artifact. Two code paths inside one producer, chosen by file size.

| Role | File / Artifact |
|---|---|
| source corpus | `graphify/frozen-graph-snapshot-v2.json` (486MB, 162,234 nodes / 108,156 edges) |
| source corpus producer (pre-existing, not touched this session) | `scripts/atlas/export-graph-snapshot-v2.mts` |
| producer (small-file JS path + large-file DuckDB-SQL path) | `sveltekit-frontend/scripts/atlas/export-graph-snapshot-parity-parquet.mts` |
| output: nodes table | `sveltekit-frontend/docs/reports/graph-snapshot-parity/nodes.parquet` |
| output: edges table | `sveltekit-frontend/docs/reports/graph-snapshot-parity/edges.parquet` |
| output: manifest | `sveltekit-frontend/docs/reports/graph-snapshot-parity/manifest.json` |

Large-file path avoids Node `JSON.parse` on the whole 486MB document entirely (the same V8 max-string-length risk class documented in `graph-snapshot.ts`'s `topologyHash()`), instead handing the file to DuckDB's native `read_json()` + `json_extract_string(..., '$[*].field')` + `UNNEST`.

### Hyperedge 3 — `VALIDATES_PARITY`

Two independent oracle backends, orchestrated into one receipt.

| Role | File / Artifact |
|---|---|
| orchestrator (reads parquet, shells to both backends, computes cross-backend metrics) | `sveltekit-frontend/scripts/atlas/validate-graph-snapshot-parity.mts` |
| backend: CPU oracle (runs on Windows directly) | `python/graph_snapshot_parity_networkx_oracle.py` |
| backend: GPU oracle (runs inside WSL2 `atlas-rapids-cu13`) | `python/graph_snapshot_parity_cugraph_oracle.py` |
| intermediate: NetworkX per-node PageRank | `sveltekit-frontend/docs/reports/graph-snapshot-parity/networkx-scores.ndjson` |
| intermediate: cuGraph per-node PageRank | `sveltekit-frontend/docs/reports/graph-snapshot-parity/cugraph-scores.ndjson` |
| output: receipt | `sveltekit-frontend/docs/reports/graph-snapshot-parity/receipt.json` |

Both oracle backends share the exact same I/O contract (`--nodes`, `--edges`, `--scores-out`) — they're two backends of the same relation, not two different relations, which is what makes their outputs directly comparable in the orchestrator.

**Live result (full corpus)**:

| Metric | Value |
|---|---|
| componentCount (both backends) | 54,078 (exact match) |
| pagerankTopKOverlap (top-50) | 1.0 |
| pagerankCorrelation (Spearman) | 1.0 |
| pagerankMaxDelta (L1-normalized) | 4.89e-9 (numerical noise) |
| louvainCommunityAgreement | 0 — **not computed**, deliberately not fabricated |
| receipt status | `PARTIAL` (correctly not `PASS`, gated by the un-computed Louvain field) |

### Hyperedge 4 — `RUNS_IN_ENV`

What actually depends on `atlas-rapids-cu13` existing and being healthy.

| Role | File |
|---|---|
| env | `~/miniforge3/envs/atlas-rapids-cu13` (WSL2, Ubuntu) |
| consumer (this session) | `python/graph_snapshot_parity_cugraph_oracle.py` |
| consumer (pre-existing, different purpose — writes `atlas_packets.page_rank_score` from Postgres import-graph edges, not from this contract's parquet artifacts) | `sveltekit-frontend/scripts/atlas/cugraph-pagerank.py` |
| unwired capability probe (designed to detect RAPIDS availability, zero real callers found this session) | `sveltekit-frontend/src/lib/server/workers/python-capability-probe.py`, `.../capability-manifest-types.ts` |

`cugraph-pagerank.py`'s docstring says `conda activate rapids` — that env name is stale/wrong (the real one is `atlas-rapids-cu13`); not fixed this session, flagged here so it isn't re-discovered from scratch.

### Hyperedge 5 — `DUPLICATE_OWNER` (governance flag, not resolved)

Two physically separate `@atlas/duckdb`-shaped packages exist, with **different underlying duckdb bindings**, and identical relative-import ergonomics make it easy to silently use the wrong one:

| Role | Path | Binding |
|---|---|---|
| root package | `packages/atlas-duckdb/` | `duckdb` npm package (older, callback-based `.run()`/`.all()`, wrapped in Promises) |
| sveltekit-local package | `sveltekit-frontend/packages/atlas-duckdb/` | `@duckdb/node-api` (official newer async API, `DuckDBInstance`/`DuckDBConnection`/`DuckDBResultReader`) |

A relative import from `sveltekit-frontend/scripts/atlas/*.mts` using `../../packages/atlas-duckdb/...` resolves to the **local** one (two `..` levels stops at `sveltekit-frontend/`, not the repo root) — this is what every existing script in `scripts/atlas/` already does (e.g. `phase2b-naive-bayes-classifier.mts`), and it's correct, but it's easy to *assume* it's the root one (as this session initially did) since the directory name and exported function name (`createAtlasDuckDB`) are identical. Per CLAUDE.md's duplication-prevention rule (Aug 9 2026 section): this is exactly the "N silently-competing owners" pattern — recorded here, not resolved. `export-graph-snapshot-parity-parquet.mts` uses the local (`@duckdb/node-api`) one correctly.

---

## Reproduction Commands

```bash
# 1. Export the full corpus to parquet (large-file DuckDB-SQL path, ~30s)
cd sveltekit-frontend
npm run atlas:graph-snapshot-parity:export -- \
  --input-json ../graphify/frozen-graph-snapshot-v2.json \
  --out-dir docs/reports/graph-snapshot-parity

# 2. Validate with both backends (~55s: NetworkX on Windows, cuGraph via WSL2)
npm run atlas:graph-snapshot-parity:validate -- \
  --manifest docs/reports/graph-snapshot-parity/manifest.json \
  --run-networkx --run-cugraph \
  > docs/reports/graph-snapshot-parity/receipt.json
```

## Next Steps

- [ ] Compute real Louvain community partitions on both backends and an agreement score (e.g. adjusted Rand index) to close `louvainCommunityAgreement` — the one field standing between `PARTIAL` and `PASS`.
- [ ] Fix the stale `conda activate rapids` reference in `cugraph-pagerank.py`'s docstring to `atlas-rapids-cu13`.
- [ ] Resolve or explicitly document the `packages/atlas-duckdb` vs `sveltekit-frontend/packages/atlas-duckdb` split per the runtime-ownership-registry governance process (CLAUDE.md, Aug 9 2026 section) — out of scope for this contract, flagged for a separate pass.
