## Production Wheels vs Native CUDA Installs

Summary
-------
- Purpose: capture the decision analysis for providing operator-managed Python wheels (vendor wheels) vs using native CUDA PyTorch installs in containers and CI.

When to use vendor wheels
-------------------------
- Reproducible, offline, or air-gapped installs where PyPI access is restricted.
- Operator control over exact binary ABI (CUDA/cuDNN/LibTorch) to avoid runtime mismatches.
- Environments where building from source is unacceptable (time, permissions, or variability).

When to prefer native CUDA installs
----------------------------------
- Developer iteration: simpler `pip install torch` when host drivers/CUDA are present.
- Faster iteration locally and fewer artifacts to manage in the repo.

Risks and mitigations
---------------------
- Risk: wheel ABI mismatch with installed drivers → runtime CUDA errors.
  - Mitigation: use NVIDIA CUDA base images in Docker, or document required driver/CUDA versions.
- Risk: missing TurboQuant/Gemma4-compatible binaries on PyPI.
  - Mitigation: operator can provide vendor wheels for production-only runs; development stays native.

Recommended policy (pragmatic compromise)
-----------------------------------------
1. Default development path: prefer native CUDA PyTorch installs (`pip install torch`) when running on developer machines or CUDA-enabled containers that match the expected driver/toolkit.
2. Production / CI: allow an operator-provided `vendor/wheels` path. The container runner should:
   - Prefer native install if `USE_NATIVE_PYTORCH=1` is set and the base image has matching CUDA, otherwise
   - If `/vendor/wheels` exists, install from that path via `pip --no-index --find-links=/vendor/wheels -r /work/sveltekit-frontend/vendor/wheels/requirements.txt`.
3. Use an NVIDIA CUDA base image for production containers to align wheel ABI and driver; keep vendor wheels as a fallback for air-gapped or pinned installs.

Quick Docker example (preferred native path):

```bash
# build (on machine with Docker / proper context)
docker build -t deeds-atlas-phases:latest -f sveltekit-frontend/.docker-build/Dockerfile sveltekit-frontend

# run (native preferred; ensures host driver availability via nvidia runtime)
docker run --gpus all --rm -v "$PWD":/work deeds-atlas-phases:latest \
  bash -lc "python -m pip install --upgrade pip && python -m pip install torch && node scripts/atlas/phase17-pytorch-feature-extractor.mjs && node scripts/atlas/phase18-xgboost-reranker.mjs"
```

Quick Docker example (vendor wheels fallback):

```bash
docker run --gpus all --rm -v "$PWD":/work -v "$PWD/sveltekit-frontend/vendor/wheels":/vendor/wheels deeds-atlas-phases:latest \
  bash -lc "if [ -f /work/sveltekit-frontend/vendor/wheels/requirements.txt ]; then python -m pip install --no-index --find-links=/vendor/wheels -r /work/sveltekit-frontend/vendor/wheels/requirements.txt || true; fi && node scripts/atlas/phase17-pytorch-feature-extractor.mjs && node scripts/atlas/phase18-xgboost-reranker.mjs"
```

Notes
-----
- Do NOT commit wheel binaries into the repo. Keep `vendor/wheels` gitignored and provision wheels via an operator artifact store or CI artifact.
- Document the exact driver/CUDA versions required for native installs in your runbook and CI environment variables.

Next steps
----------
- Populate `sveltekit-frontend/vendor/wheels` in operator pipelines if air-gapped reproducibility is required.
- Prefer native installs during local development and only enable vendor wheels in production CI runs.
