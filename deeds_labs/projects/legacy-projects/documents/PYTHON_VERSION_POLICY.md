# Python Version Policy

This project uses both Python 3.11 and 3.12 across different scripts and deployment paths. To prevent fragmentation and subtle binary incompatibilities (CUDA, TensorRT, Triton, FlashAttention, Megatron-Core), this policy defines the **stable** and **experimental** lanes.

## Summary
- **Stable (Recommended for TensorRT-LLM builds & production):** Python 3.11.8
- **Experimental (Feature / future alignment / some Docker images):** Python 3.12.x
- **Do NOT mix environments during a single engine conversion/build cycle.**

| Use Case | Preferred Python | Rationale |
|----------|------------------|-----------|
| TensorRT-LLM engine conversion/build (Gemma3-Legal) | 3.11.8 | Wider tested wheel support; fewer edge-case skips (megatron-core) |
| FlashAttention 2 integration (current) | 3.11.8 | Conservative until all FA2 + cutlass stacks green on 3.12 |
| Runtime inference (served engine) | Matches build version | Engine + runtime ABI consistency |
| Experimental Triton / NVIDIA updated wheels | 3.12.x | Newer packaging ecosystem alignment |
| Docker `cuda13-optimized` images | 3.12.x | Image baseline already pinned |
| Local quick prototyping scripts (non-engine) | Either | Keep isolated; prefer `.venv` separation |
| Megatron-Core / distributed experiments | 3.11.8 | Known skips in test lists for 3.12 |

## Why 3.11.8 Is Stable
- Fewer upstream dependency conditional branches.
- Avoids test waivers (see: `TensorRT-LLM/tests/integration/test_lists/waives.txt`).
- Reduces risk of subtle performance regressions due to conditional codepaths for 3.12 (distutils removal, packaging transitions).

## When to Use 3.12
Use only if all of these are true:
1. You are inside an isolated experimental environment or container.
2. All required wheels (Torch, TensorRT, TensorRT-LLM, FlashAttention, plugins) resolve without source builds.
3. You are not producing an engine intended for a 3.11 runtime.
4. Benchmarks are being collected or validating forward-compat readiness.

If any of those conditions are false → fall back to 3.11.8.

## Environment Layout
```
.deeds-web-app/
  .python-version          # Usually set to 3.11.8 (stable)
  .venv/                   # Stable venv (3.11.8)
  .venv312/                # Optional experimental venv (3.12.x)
  TensorRT-LLM/            # Source checkout (do not mix env interpreters during build)
```

## Creating Environments
### Stable 3.11.8 (WSL2)
```bash
pyenv install -s 3.11.8
pyenv local 3.11.8   # or `pyenv global 3.11.8`
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip wheel setuptools
pip install -r requirements-cuda13.txt  # if compatible; otherwise curated minimal set
```

### Experimental 3.12.x
```bash
pyenv install -s 3.12.3
python3.12 -m venv .venv312
source .venv312/bin/activate
pip install --upgrade pip
pip install -r requirements-cuda13.txt
```

## Quick Switch Helper
Add to `~/.bashrc`:
```bash
workenv() {
  case "$1" in
    stable)   deactivate 2>/dev/null; source .venv/bin/activate ;;
    exp|exp12) deactivate 2>/dev/null; source .venv312/bin/activate ;;
    *) echo "Usage: workenv {stable|exp}"; return 1 ;;
  esac
  python -V
}
```
Usage:
```bash
workenv stable
workenv exp
```

## Verification Matrix
| Check | Command | Expected (3.11) | Expected (3.12) |
|-------|---------|-----------------|-----------------|
| Python version | `python -V` | 3.11.x | 3.12.x |
| Torch CUDA | `python -c 'import torch;print(torch.version.cuda)'` | CUDA 12.x | CUDA 12.x |
| TensorRT | `python -c 'import tensorrt as trt;print(trt.__version__)'` | 10.x | 10.x |
| TRT-LLM | `python -c 'import tensorrt_llm;print(tensorrt_llm.__version__)'` | >=0.21 | >=0.21 |
| Megatron-Core skips | test waives file | minimal | additional py3.12 skips |

## Build Consistency Rule
> Engine build Python version MUST equal inference runtime Python version.

Mismatch risks: plugin symbol resolution errors, serialized engine metadata assumptions, CUDA graph capture invalidation.

## Decision Flow (Pseudocode)
```text
Need to build engine?
  ├─ Are all required wheels green on 3.12? (check install log)
  │     ├─ No → Use 3.11.8
  │     └─ Yes → Benchmark both (optional) then choose fastest stable
  └─ Not building engine → Either env is fine (prefer stable for simplicity)
```

## Migration Strategy Toward 3.12 Default
1. Ensure no test skips referencing 3.12 (`waives.txt`).
2. Run performance diff suite (latency / throughput) under both versions.
3. Freeze dependency lock for 3.12 (hash-locked requirements file).
4. Update `.python-version` → 3.12.x once parity confirmed.

## Common Pitfalls
| Pitfall | Impact | Fix |
|---------|--------|-----|
| Building under 3.12, serving under 3.11 | Engine load failure | Rebuild under target version |
| Mixed venv activation (PATH leakage) | Random import failures | `deactivate` before switching |
| System `typing_extensions` conflict logs | Benign noise | Ignore; venv shadows it |
| Forgetting `pyenv local` | Wrong interpreter for pip installs | Set `.python-version` correctly |

## Automation (Optional)
Add a pre-build guard to engine scripts:
```python
import sys
if not sys.version.startswith('3.11.'):
    print('WARNING: Recommended build Python is 3.11.x for stability. Proceeding...')
```

## Next Steps
- Integrate this policy into build scripts (header notice).
- Add CI job matrix (3.11 vs 3.12) once tests stabilized.
- Benchmark before promoting 3.12 to default.

---
Maintained as living guidance; update when upstream (TensorRT-LLM + dependencies) declares full 3.12 parity without waivers.
