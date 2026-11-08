#!/usr/bin/env python3
"""Smoke-runs the v2 OKF learning notebook's code cells in a NEW EMPTY directory and checks the receipt.

Read-only with respect to the repo: it copies only the checksummed NES palette into the run directory, executes the notebook's code cells
there (cwd = that directory), and verifies the notebook wrote only inside it. A synthetic run must report DEMO_ONLY, promotion_allowed
false and zero datastore writes. It proves the notebook executes; it says nothing about classifier quality.
Exit codes: 0 pass, 1 check failed, 2 prerequisite missing (torch/sklearn).
"""
from __future__ import annotations

import argparse
import json
import os
import runpy
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NOTEBOOK = ROOT / "python" / "atlas_okf_learning_colab" / "Parent_Atlas_OKF_GRU_Shadow_Colab_v2.ipynb"
PALETTE = ROOT / "scripts" / "atlas" / "data" / "nes-domain-palette-v1.json"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-dir", default=None, help="New empty directory to run in (default: a fresh temp directory)")
    args = ap.parse_args()
    os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")  # CPU only: never take VRAM from the resident llama-server
    try:
        import torch  # noqa: F401
        import sklearn  # noqa: F401
    except ImportError as exc:
        print(f"PREREQUISITE_MISSING: {exc}")
        return 2

    run_dir = Path(args.run_dir) if args.run_dir else Path(tempfile.mkdtemp(prefix="okf-notebook-smoke-"))
    run_dir.mkdir(parents=True, exist_ok=True)
    if any(run_dir.iterdir()):
        print(f"RUN_DIR_NOT_EMPTY: {run_dir}")
        return 1
    shutil.copy2(PALETTE, run_dir / PALETTE.name)

    nb = json.loads(NOTEBOOK.read_text(encoding="utf-8"))
    code = "\n\n".join("".join(c["source"]) for c in nb["cells"] if c["cell_type"] == "code")
    script = run_dir.parent / f"{run_dir.name}-extracted.py"  # script lives OUTSIDE the run directory
    script.write_text(code, encoding="utf-8")

    cwd = Path.cwd()
    os.chdir(run_dir)
    try:
        sys.path = [p for p in sys.path if Path(p or ".").resolve() != run_dir.resolve()]
        runpy.run_path(str(script), run_name="__main__")
    finally:
        os.chdir(cwd)

    receipt_path = run_dir / "atlas_okf_shadow_outputs" / "learning-shadow-receipt.json"
    if not receipt_path.is_file():
        print("FAIL: receipt not written inside the run directory")
        return 1
    r = json.loads(receipt_path.read_text(encoding="utf-8"))
    problems = []
    if r.get("schema") != "atlas.okf.learning-shadow-receipt.v2":
        problems.append(f"schema={r.get('schema')}")
    if r.get("status") != "DEMO_ONLY":
        problems.append(f"status={r.get('status')} (a synthetic run must be DEMO_ONLY)")
    if r.get("promotion_allowed") is not False:
        problems.append("promotion_allowed is not false")
    if any(r.get(k) != 0 for k in ("pgvector_writes", "qdrant_writes", "valkey_writes")):
        problems.append("a datastore write count is not zero")
    if r.get("calibration") != "NOT_PERFORMED":
        problems.append("calibration claim present")
    if not (r.get("palette_revision") and r.get("palette_checksum")):
        problems.append("palette revision/checksum missing")
    if r.get("test_count", 0) < 1 or r.get("splits_disjoint_by_source_group") is not True:
        problems.append("split check missing")
    stray = [p.name for p in run_dir.parent.glob("atlas_okf_shadow_outputs")]
    if problems or stray:
        print("FAIL:", problems, stray)
        return 1
    print(f"NOTEBOOK_SMOKE_PASS status={r['status']} train/val/test={r['train_count']}/{r['validation_count']}/{r['test_count']} run_dir={run_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
