from __future__ import annotations

import importlib.util
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_mod():
    mod_path = REPO_ROOT / "scripts" / "atlas" / "run-wsl2-rapids-gpu-challenger-v1.py"
    spec = importlib.util.spec_from_file_location("run_wsl2_rapids_gpu_challenger_v1", mod_path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_wsl2_rapids_challenger_fails_closed_under_low_vram_and_computes_cpu_oracle():
    mod = _load_mod()
    res = mod.run_wsl2_rapids_challenger_v1(
        allow_gpu=True,
        free_mib_override=512,
        slots_idle_override=True,
    )
    assert res["preflight"]["preflightPassed"] is False
    assert "VRAM_BELOW_THRESHOLD:512<1536" in res["preflight"]["reasons"]
    assert res["gpuExecuted"] is False
    assert res["cpuOracle"]["rowCount"] == 200
    assert res["cpuOracle"]["featureDim"] == 5
    assert res["canonicalAuthority"] is False
    assert res["writesPerformed"] is False
