**Atlas: Local Python deps & CI-safe runner (no GitHub Actions)**

Purpose: quick, reproducible instructions for installing optional Python deps for Phase 17/18 and running the atlas checks locally or in a generic CI runner (avoid GitHub Actions specifics).

1) Create and activate a venv (PowerShell):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip setuptools wheel
```

2) Install minimal deps by phase

- Phase 17 (feature extractor):
  - `pip install numpy`
  - PyTorch: prefer the official index for platform/cuda. Example (CPU-only):
    ```powershell
    pip install --index-url https://download.pytorch.org/whl/cpu torch
    ```
  - For CUDA builds, follow PyTorch's selector at https://pytorch.org/get-started/locally and copy the pip wheel URL for your CUDA version.

- Phase 18 (reranker):
  - `pip install numpy xgboost`

3) Optional: vendor wheels (fast CI installs)

Place wheel files under `vendor/wheels/` in the repo and install with:

```powershell
pip install --no-index --find-links=vendor/wheels numpy torch xgboost
```

This avoids building wheels on Windows CI images.

4) Run atlas phases or skip Python (force JS fallback)

Run with Python workers (if deps installed):

```powershell
npm run atlas:phase17-18
```

Force JS fallback (no Python spawn):

```powershell
npm run atlas:phase17 -- --no-py
npm run atlas:phase18 -- --no-py
```

CI-style report check (fails if outputs empty):

```powershell
npm run atlas:ci-check
```

5) Docker-friendly (Linux builder) — example pattern

Use a Linux container to build wheels or run the phases if Windows images are painful. Example (bash):

```bash
docker run --rm -v "$PWD":/work -w /work python:3.11-slim bash -lc '
  python -m venv .venv && . .venv/bin/activate && pip install --upgrade pip wheel setuptools && pip install numpy xgboost && npm run atlas:phase17-18'
```

Notes
- Prefer `--no-py` on lightweight CI images unless you add a step to install Python and wheels.
- The repo includes `sveltekit-frontend/scripts/ci/check_atlas_reports.mjs` which returns non-zero when expected JSONL/reports are empty — run it as the final gate.
