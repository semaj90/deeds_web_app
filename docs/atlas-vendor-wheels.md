**Vendor wheels for Atlas phases (offline / CI-friendly)**

Purpose: Provide a simple pattern for storing pre-built Python wheels (e.g., `torch`, `xgboost`, `numpy`) in-repo so developers and CI can install dependencies deterministically and offline.

Directory: `vendor/wheels/` (repo root)

Guidelines
- Download platform-appropriate wheels (Windows, Linux) for the target Python version. For PyTorch, use the official selector at https://pytorch.org/get-started/locally and copy the wheel URL for your CUDA/Python combo.
- Place wheel files (`*.whl`) into `vendor/wheels/`.
- Commit only small, vetted wheels or host them in a private artifact store. Large wheels may be kept off-repo and mirrored via an internal storage location referenced by CI.

Installer helper
- Use the provided script: `sveltekit-frontend/scripts/atlas/install_vendor_wheels.ps1`
- Activate your virtualenv then run:

```powershell
# from repo root
pwsh .\sveltekit-frontend\scripts\atlas\install_vendor_wheels.ps1
```

Or with a relative path to vendor dir:

```powershell
pwsh .\sveltekit-frontend\scripts\atlas\install_vendor_wheels.ps1 -VendorPath ".\vendor\wheels"
```

How `setup_windows_venv.ps1` uses vendor wheels
- When `vendor/wheels` exists and contains `*.whl`, `setup_windows_venv.ps1` will prefer installing from the vendor folder using `--no-index --find-links` and skip PyPI. This makes repeated installs fast and deterministic.

Security & maintenance
- Verify wheel checksums before adding to repo.
- Prefer CPU wheels for general CI; provide separate GPU wheel bundles for developer machines with CUDA.
- Rotate/clean up wheels periodically to avoid stale dependencies.
