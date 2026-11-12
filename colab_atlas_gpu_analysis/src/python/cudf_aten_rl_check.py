"""
cudf_aten_rl_check.py
Verifies three things the Colab bundle depends on, and reports each as PASS / FAIL / SKIP:

1. libcudf  : cudf.read_json(lines=True) + groupby on GPU agrees with pandas.
2. ATen     : cudf -> torch zero-copy handoff via DLPack, and torch.ops.aten ops run on the GPU tensor.
3. RL       : group-relative advantage (GRPO-style) computed with torch matches the repo's pure-Python
              grpo_policy_shadow_v1.evaluate() exactly. This is a SHADOW evaluator: it updates no weights.

Usage: python src/python/cudf_aten_rl_check.py  (writes data/cudf_aten_rl_check_receipt.json)
"""
import json
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import numpy as np
import torch

results = {}


def record(name, status, detail=""):
    results[name] = {"status": status, "detail": detail}
    print(f"[{status:4s}] {name}: {detail}")


# ---- 1. libcudf vs pandas -------------------------------------------------
try:
    import cudf
    import pandas as pd

    rows = [{"cohort": i % 7, "score": float(i % 13) / 13.0, "lut": i % 11} for i in range(6527)]
    ndjson = "\n".join(json.dumps(r) for r in rows)
    gdf = cudf.read_json(ndjson, lines=True)
    pdf = pd.read_json(ndjson, lines=True)
    g_agg = gdf.groupby("cohort")["score"].mean().sort_index().to_pandas().to_numpy()
    p_agg = pdf.groupby("cohort")["score"].mean().sort_index().to_numpy()
    ok = bool(np.allclose(g_agg, p_agg, atol=1e-9)) and len(gdf) == len(pdf) == 6527
    record("libcudf_read_json_groupby_parity", "PASS" if ok else "FAIL", f"rows={len(gdf)} cudf={cudf.__version__}")
except ImportError as e:
    gdf = None
    record("libcudf_read_json_groupby_parity", "SKIP", f"cudf not installed ({e}); on Colab install RAPIDS first")
except Exception as e:  # real failure, do not hide it
    gdf = None
    record("libcudf_read_json_groupby_parity", "FAIL", f"{type(e).__name__}: {e}")

# ---- 2. cudf -> ATen via DLPack ------------------------------------------
if gdf is not None and torch.cuda.is_available():
    try:
        col = gdf["score"]
        t = torch.from_dlpack(col.to_dlpack()) if hasattr(col, "to_dlpack") else torch.from_dlpack(col.values)
        same_values = bool(np.allclose(t.cpu().numpy(), col.to_pandas().to_numpy()))
        # run real ATen ops (not nn wrappers) on the handed-off tensor
        s = torch.ops.aten.sum.default(t)
        m = torch.ops.aten.mean.default(t)
        top = torch.ops.aten.topk.default(t, 5)
        ok = same_values and t.is_cuda and abs(float(s) / t.numel() - float(m)) < 1e-6 and top[0].numel() == 5
        record("cudf_to_aten_dlpack", "PASS" if ok else "FAIL", f"device={t.device} dtype={t.dtype} n={t.numel()}")
    except Exception as e:
        record("cudf_to_aten_dlpack", "FAIL", f"{type(e).__name__}: {e}")
else:
    record("cudf_to_aten_dlpack", "SKIP", "needs cudf and a CUDA device")

# ---- 3. GRPO-style group-relative advantage: torch vs repo oracle ----------
try:
    from grpo_policy_shadow_v1 import evaluate, reward

    rng = np.random.default_rng(7)
    payload = {"groups": []}
    for g in range(4):
        cands = []
        for c in range(6):
            cands.append({
                "policyId": f"g{g}-p{c}",
                "taskSucceeded": bool(rng.integers(0, 2)),
                "validationScore": float(rng.random()),
                "tokenSavings01": float(rng.random()),
                "latencyPenalty01": float(rng.random()),
                "failedActionPenalty01": float(rng.random()),
            })
        payload["groups"].append({"taskRef": f"task{g}", "candidates": cands})

    oracle = evaluate(payload)
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    max_err = 0.0
    for grp_in, grp_out in zip(payload["groups"], oracle["groups"]):
        r = torch.tensor([reward(x) for x in grp_in["candidates"]], dtype=torch.float64, device=dev)
        sigma = r.std(unbiased=False)  # population std, same as statistics.pstdev
        adv = (r - r.mean()) / sigma if float(sigma) > 1e-12 else torch.zeros_like(r)
        by_id = {c["policyId"]: c["groupRelativeAdvantage"] for c in grp_out["candidates"]}
        for cand, a in zip(grp_in["candidates"], adv.cpu().tolist()):
            max_err = max(max_err, abs(a - by_id[cand["policyId"]]))
    ok = max_err < 1e-9 and oracle["training"] is False and oracle["modelWeightsChanged"] is False
    record("grpo_group_advantage_torch_vs_oracle", "PASS" if ok else "FAIL", f"max_abs_err={max_err:.2e} device={dev} shadow_only=True")
except Exception as e:
    record("grpo_group_advantage_torch_vs_oracle", "FAIL", f"{type(e).__name__}: {e}")

out = {
    "schema": "atlas.cudf-aten-rl-check.v1",
    "torch": torch.__version__,
    "cuda": torch.version.cuda,
    "device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu",
    "results": results,
    "trainsModelWeights": False,
    "canonicalAuthority": False,
}
data_dir = HERE.parent.parent / "data"
data_dir.mkdir(exist_ok=True)
(data_dir / "cudf_aten_rl_check_receipt.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
failed = [k for k, v in results.items() if v["status"] == "FAIL"]
print("\nOVERALL:", "FAIL " + ", ".join(failed) if failed else "no failures (SKIPs are not passes)")
sys.exit(1 if failed else 0)
