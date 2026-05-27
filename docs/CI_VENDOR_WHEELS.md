CI vendor wheels — platform tips
================================

This short guide explains how to use the `sveltekit-frontend/vendor/wheels` folder in CI and locally, with Windows-specific PowerShell examples and cross-platform notes.

1) Purpose
----------
Place operator-provided Python wheels (`*.whl`) here for deterministic installs inside the Atlas Docker runner or CI. Avoid committing wheel binaries to Git; instead keep them in a secure artifact store or mount them at CI runtime.

2) Recommended workflow (cross-platform)
---------------------------------------
- Build the Docker image in CI from the repository root.
- Mount the workspace and `vendor/wheels` into the container.
- Run pip with `--no-index --find-links=/vendor/wheels` and the `requirements.txt` file in the mounted folder.

3) CI workflow note
-------------------
This repository does not include an active GitHub Actions workflow for running atlas phases. If you need CI automation, use the `docker run` pattern above to construct your job, but prefer downloading vendor wheels from a secure artifact store into `sveltekit-frontend/vendor/wheels` at runtime rather than committing them.

4) PowerShell / Windows runner adjustments
-----------------------------------------
- On Windows hosted runners or local PowerShell, quoting differs. Use double quotes for the local path and escape inner quotes in the bash command.

Example (PowerShell):

```powershell
#$PWD resolves to repository root in PowerShell
$pwdPath = (Get-Location).Path
docker run --rm -v "${pwdPath}:/work" -v "${pwdPath}\sveltekit-frontend\vendor\wheels:/vendor/wheels" deeds-atlas-phases:latest `
  bash -lc "python -m pip install --no-index --find-links=/vendor/wheels -r /work/sveltekit-frontend/vendor/wheels/requirements.txt && node /work/sveltekit-frontend/scripts/atlas/phase17-pytorch-feature-extractor.mjs"
```

5) CI with artifact store (preferred for security)
-------------------------------------------------
If wheels are stored in an artifact bucket (S3, GCS, or internal), download them in a prior CI step into `sveltekit-frontend/vendor/wheels` before running the Docker container. Ensure CI secrets are scoped to read-only for that artifact bucket.

6) Air-gapped / offline CI
--------------------------
- Ensure the Docker image contains system-level build tools needed by the wheels (e.g., `gcc`, `musl-dev`, or `build-essential`) or vendor-only pure wheels are provided.
- Use `--no-index` to ensure pip does not try to reach PyPI.

7) Troubleshooting
------------------
- If pip errors with `No matching distribution found`, confirm the wheel's Python ABI and manylinux tag match the runner/container Python version.
- Use `python -m pip debug --verbose` inside the container to inspect interpreter and platform tags.

8) Security note
----------------
Do not commit wheels containing native code from untrusted sources. Prefer vendor wheels signed by your operator team or produced by a trusted builder.