# Atlas Python Environment Routing
**Status**: inventory 2026-10-19 (read-only probe) | **Authority**: routing aid only, `canonicalAuthority:false`

## TL;DR
Atlas runs 3 interpreter families: Windows system Pythons (py launcher), WSL2 venv/conda envs (GPU), and repo-local venvs. Pick the env by the job, invoke by **absolute interpreter path**, never a bare `python`. Versions below were read from `pyvenv.cfg` / live import probes; "Key pkgs" lists only packages from a fixed scan list, not full contents.

## A. WSL2 (Ubuntu) — GPU lane
| Env | Python | Key pkgs (probed) | Use for | Not for |
|---|---|---|---|---|
| `/home/james/miniforge3/envs/atlas-rapids-cu13` | 3.14.6 | cuvs, cugraph, cudf, torch, networkx | cuVS KMeans/ANN, cuGraph PageRank, `atlas:kmeans:*`, `atlas:cugraph:*`, `atlas:gpu:knn:*` | pytest (not probed), cuTile |
| `/home/james/.venvs/atlas-cutile-cu132` | 3.14.6 | torch 2.14.0+cu132 (CUDA True), numpy, duckdb, pytest (installed 2026-10-19) | cuTile/SIMT, `python/parent_atlas_tensor/` residency tests (17 passed) | RAPIDS (cuml/cugraph/cuvs/pandas/pyarrow/scipy absent) |
| `/home/james/.venvs/atlas-dspy-exp` | 3.13.13 | dspy | DSPy/GEPA experiments | torch, pytest absent |

Rule: the 8 GiB card cannot hold `:8090` Ornith + a RAPIDS job. See CLAUDE.md "WSL2 miniforge/conda GPU work".

## B. Windows system (`py` launcher)
| Selector | Path | Probed | Use for |
|---|---|---|---|
| `py -3.13` | `C:\Python313` | torch, xgboost, turbovec, sklearn, psycopg, fastapi all present | `ae:train`, classifier training (XGBoost CUDA, torch), TurboVec `:8791` (must be 3.13) |
| `py -3.14` (default `python`) | `...\Python314` | turbovec only; no torch/xgboost/sklearn/psycopg/fastapi | scratch scripts only; **not** TurboVec's interpreter of record (CLAUDE.md: `indexed:0` = wrong interpreter) |
| `py -3.12`, `py -3.11`, `py -3.14-32` | `...\Python312/311/314-32` | not probed | none assigned |
| `uv` | `%APPDATA%\Python\Python313\Scripts\uv.exe` | present | env creation only; install needs a proven capability gap |

## C. Repo-local venvs (`C:\Users\james\Videos\deeds-web-app`)
| Path | Python | Key pkgs (probed) | Likely role (unverified unless noted) |
|---|---|---|---|
| `.venv` | 3.11.9 | torch 2.13.0, transformers 5.13.1, xgboost 3.2.0, sklearn 1.9.0, onnx, fastapi 0.104.1, langextract 1.6.0 | general ML/ONNX/NLP sidecar work |
| `.venv-cu130` | 3.14.6 | torch 2.13.0+cu130 | CUDA 13.0 torch lane |
| `.venv-gemma4` | 3.11.9 | none from scan list | Gemma4/VLM tooling (historical) |
| `sveltekit-frontend/.venv_turbovec` | 3.13.5 | turbovec 0.3.0, numpy | TurboVec build/serve (3.13 matches CLAUDE.md) |
| `sveltekit-frontend/.venv` | 3.9.2 | xgboost 3.2.0, numpy | legacy; 3.9 is old, do not extend |
| `tools/agentic-research/.venv` | 3.13.5 | local_deep_research 1.10.1, langgraph 1.2.10, spacy 3.8.14, torch 2.13.0 | LDR upstream (CLAUDE.md "Local Deep Research MCP") |
| `docker/langgraph-synthesis/.venv` | 3.13.5 | langgraph 1.0.5, qdrant_client 1.15.1, torch 2.7.0+cu128 | LangGraph synthesis container dev env |
| `.venv/nlp-chunker-test` | 3.13.5 | none | chunker test scratch |
| `.tmp/langextract-1.6-probe` | 3.13.5 | langextract 1.6.0 | probe scratch |
| `.tmp/atlas/grounded-nlp-venv` | 3.14.7 | none from scan list | grounded-NLP scratch |

## Routing by task
| Task | Interpreter |
|---|---|
| KMeans (cuVS), cuGraph PageRank, GPU KNN | WSL `atlas-rapids-cu13` (free `:8090` first) |
| cuTile / tensor residency / `parent_atlas_tensor` tests | WSL `atlas-cutile-cu132` |
| DSPy / GEPA experiment | WSL `atlas-dspy-exp` |
| AE training, XGBoost/torch classifier, TurboVec `:8791` | `py -3.13` |
| LDR research | `tools/agentic-research/.venv` (or existing `ldr-mcp.mjs`) |
| NLP sidecar `:8095` | `scripts/launch-miniforge-nlp-sidecar.ps1` (interpreter not probed) |

## Invocation and search rules (WSL path / Git Bash)
| Need | Use | Avoid |
|---|---|---|
| Search the repo | the Grep tool / `rg` from the repo root (use narrow `path` + `glob`; repo-wide scans time out at 20 s) | `find`/`grep -r` through Git Bash |
| Run a WSL Python one-liner | PowerShell: pipe the script on stdin, `$script \| wsl -e <abs-python> -` | Git Bash `wsl -e /home/...` (path is rewritten to `C:/Program Files/Git/home/...`) |
| Run a multi-command WSL job | `wsl -e bash -c '<single-quoted script>'` | nested double quotes (stripped before bash) |
| Windows Python | `py -3.13 ...` (or absolute path) | bare `python` (resolves to 3.14) |
| Python one-liners | `import importlib.util` explicitly; probe from a cwd outside the repo root (`./duckdb` dir shadows the module) | `find_spec` from the repo root |
| Windows paths from WSL | `/mnt/c/Users/james/Videos/deeds-web-app/...` | Windows-style paths inside `bash -c` |

Git Bash remains fine for plain `git`, `curl`, `head`/`tail`, and `node`/`npm` from the repo root.

## GPU / JSON library check (2026-10-19, read-only; no GPU workload run)
| Item | Finding |
|---|---|
| GPU | RTX 3060 Ti, driver 580.88, **7846 / 8192 MiB in use** (Ornith `:8090`); no room for cuDF/cuVS jobs without the Prepare task |
| `atlas-rapids-cu13` | cudf 26.6.1, pylibcudf 26.6.1, rmm 26.6.0, cupy 14.1.1, cuda-python 13.3.0, cuvs, cugraph 26.6.0, numba-cuda 0.28.2, pyarrow 24.0.0, pandas 2.3.3, nvidia-cufile 1.15.1, CUDA runtime/NVRTC 13.0 |
| `atlas-cutile-cu132` | cuda-tile 1.5.0, cuda-toolkit 13.2.1, nvcc/nvrtc/tileiras 13.2.78, cupy-cuda13x 14.2.0, cuda-bindings 13.3.1; **no cudf/pyarrow/pandas** |
| Not found in either env | nvcomp, kvikio, nvJSON/cuJSON/GpJSON |
| Windows toolkits | CUDA v12.8 and v13.0 under `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA` |
| CPU JSON baseline (measured) | simdjson backend `icelake (AVX512)`. 768-d embedding text: native `simdJsonExtractNumbers` 36,056 rows/s vs V8 `JSON.parse`+`Float64Array.from` 10,879 rows/s (3.3x, parity max diff 0). V8 alone parses 1 KB NDJSON lines at ~154-289 MB/s. `simdJsonParse` returns a validated string, not an object. Receipts: `openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md` (JSON-CPU-BASELINE-01/02) |
| Not run | `cudf.read_json` (lines/NDJSON) exists in cudf by API, but no GPU parse test has been run; CPU parse of all 274,465 chunk vectors is ~8 s, so a GPU JSON path is not justified by speed |
| Existing design | `docs/architecture/phase-17g-gpu-json-tensor-mapping.md` (`gpu_json.profile_artifact`, `gpu_json.materialize_ldjson`); no `gpu_json` callers found under `python/`; `sveltekit-frontend/src` search timed out (unverified) |
| Repo rule | JSON parsing/validation is CPU work (simdjson N-API is CPU SIMD). A cuDF JSON path is a challenger: needs a measured case with CPU-reference parity, run in `atlas-rapids-cu13` only after freeing `:8090` |

## Gaps / open
- Duplicate-looking envs (`.venv`, `.venv-cu130`, `.venv-gemma4`, `sveltekit-frontend/.venv`) have no recorded owner; classify before archiving (archive, never delete).
- Roles marked "unverified" come from names/packages, not from callers. Grep callers before relying on them.
- Docker images (`atlas-gpu-8098`, `atlas-neural-decoder`) are separate runtimes and not listed here.
- Not added to `runtime-ownership-registry.json` or the TOC; TOC check is drifting (`DOC-GOV-TOC-CHECK-01`).
