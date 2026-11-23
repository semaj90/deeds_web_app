from __future__ import annotations

import importlib.util
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_tournament_module():
    mod_path = REPO_ROOT / "scripts" / "atlas" / "run-cpu-challenger-tournament-v1.py"
    spec = importlib.util.spec_from_file_location("run_cpu_challenger_tournament_v1", mod_path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_cpu_challenger_tournament_runs_all_five_challengers_deterministically():
    mod = _load_tournament_module()
    rng = np.random.default_rng(7)
    x = rng.uniform(0.0, 1.0, size=(20, 5)).astype(np.float32)
    y = np.clip(0.5 * x[:, 0] + 0.3 * x[:, 1] + 0.2 * x[:, 2], 0.0, 1.0).astype(np.float32)

    result = mod.run_cpu_challenger_tournament_v1(x, y, seed=42, epochs=20)
    assert result["schema"] == "atlas.cpu-challenger-tournament.v1"
    assert result["challengerCount"] == 5
    assert result["identicalFrozenSplit"] is True
    assert result["canonicalAuthority"] is False
    assert result["writesPerformed"] is False
    assert result["winner"] == result["standings"][0]["name"]
    names = {row["name"] for row in result["standings"]}
    assert names == {
        "cosine_baseline",
        "hybrid_rrf_prior",
        "ewin_tang_low_rank",
        "pytorch_mlp",
        "xgboost_ranker",
    }
