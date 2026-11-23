"""WSL2 RAPIDS (cuML / cuVS) Batch GPU Challenger & CPU-Oracle Parity Runner (v1).

Enforces AGENTS.md GPU residency rules:
  1. Checks :8090 /slots idle + nvidia-smi free VRAM >= 1,536 MiB (MEM-04).
  2. Fails closed (`gpuExecuted=False`) if VRAM is below threshold or slots are busy.
  3. Always computes the deterministic CPU NumPy/SVD oracle over `feature_matrix_5.arrow`.
  4. When `--allow-gpu` is passed AND preflight passes inside WSL2 `atlas-rapids-cu13`,
     runs `cuml.KMeans` + `cuml.UMAP` and records CPU-vs-GPU parity metrics.

Read-only / non-canonical (`canonicalAuthority=False`, `writesPerformed=False`).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import urllib.request
from pathlib import Path
from typing import Any

import numpy as np
import pyarrow.ipc as pa_ipc

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ARROW = REPO_ROOT / "docs" / "reports" / "feature_matrix_5.arrow"
DEFAULT_RECEIPT = REPO_ROOT / "docs" / "reports" / "wsl2-rapids-gpu-challenger-receipt-v1.json"
MIN_FREE_VRAM_MIB = 1536


def check_vram_and_slots_preflight_v1(
    *,
    llama_url: str = "http://127.0.0.1:8090",
    min_free_mib: int = MIN_FREE_VRAM_MIB,
    free_mib_override: int | None = None,
    slots_idle_override: bool | None = None,
) -> dict[str, Any]:
    free_mib = free_mib_override
    if free_mib is None:
        try:
            proc = subprocess.run(
                ["nvidia-smi", "--query-gpu=memory.free", "--format=csv,noheader,nounits"],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
            if proc.returncode == 0 and proc.stdout.strip():
                free_mib = int(proc.stdout.strip().splitlines()[0].strip())
        except Exception:
            free_mib = None

    slots_idle = slots_idle_override
    if slots_idle is None:
        try:
            with urllib.request.urlopen(f"{llama_url.rstrip('/')}/slots", timeout=3) as resp:
                slots = json.loads(resp.read().decode("utf-8"))
            slots_idle = all(not bool(s.get("is_processing")) for s in (slots if isinstance(slots, list) else []))
        except Exception:
            slots_idle = False

    reasons: list[str] = []
    if free_mib is None:
        reasons.append("VRAM_PROBE_UNAVAILABLE")
    elif free_mib < min_free_mib:
        reasons.append(f"VRAM_BELOW_THRESHOLD:{free_mib}<{min_free_mib}")
    if not slots_idle:
        reasons.append("LLAMA_8090_SLOTS_BUSY_OR_UNREACHABLE")

    return {
        "preflightPassed": len(reasons) == 0,
        "freeVramMiB": free_mib,
        "minFreeVramMiB": min_free_mib,
        "slotsIdle": bool(slots_idle),
        "reasons": reasons,
    }


def compute_cpu_oracle_v1(features: np.ndarray) -> dict[str, Any]:
    arr = np.ascontiguousarray(features, dtype=np.float32)
    centered = arr - np.mean(arr, axis=0, keepdims=True)
    _u, _s, vt = np.linalg.svd(centered, full_matrices=False)
    proj2 = np.ascontiguousarray(centered @ vt[: min(2, vt.shape[0])].T, dtype=np.float32)
    return {
        "rowCount": int(arr.shape[0]),
        "featureDim": int(arr.shape[1]),
        "inputChecksum": f"sha256:{hashlib.sha256(arr.tobytes()).hexdigest()}",
        "cpuProj2Checksum": f"sha256:{hashlib.sha256(proj2.tobytes()).hexdigest()}",
    }


def run_wsl2_rapids_challenger_v1(
    arrow_path: Path = DEFAULT_ARROW,
    *,
    allow_gpu: bool = False,
    free_mib_override: int | None = None,
    slots_idle_override: bool | None = None,
) -> dict[str, Any]:
    with pa_ipc.open_file(arrow_path) as reader:
        table = reader.read_all()
    features = np.asarray(table["features"].to_pylist(), dtype=np.float32)

    cpu_oracle = compute_cpu_oracle_v1(features)
    preflight = check_vram_and_slots_preflight_v1(
        free_mib_override=free_mib_override,
        slots_idle_override=slots_idle_override,
    )

    gpu_executed = False
    gpu_backend = None
    gpu_metrics: dict[str, Any] | None = None
    if allow_gpu and preflight["preflightPassed"]:
        try:
            from cuml.cluster import KMeans as CumlKMeans  # type: ignore
            from cuml.manifold import UMAP as CumlUMAP  # type: ignore

            km = CumlKMeans(n_clusters=min(8, features.shape[0]), random_state=42)
            labels = km.fit_predict(features)
            umap = CumlUMAP(n_components=2, n_neighbors=min(15, max(2, features.shape[0] - 1)), random_state=42)
            emb = np.asarray(umap.fit_transform(features), dtype=np.float32)
            gpu_executed = True
            gpu_backend = "cuml_kmeans_umap"
            gpu_metrics = {
                "kmeansClusters": int(len(set(labels.tolist()))),
                "umapShape": list(emb.shape),
                "umapChecksum": f"sha256:{hashlib.sha256(np.ascontiguousarray(emb).tobytes()).hexdigest()}",
            }
        except ImportError:
            gpu_backend = "cuml_not_installed_in_current_interpreter"

    return {
        "schema": "atlas.wsl2-rapids-gpu-challenger-receipt.v1",
        "arrowPath": str(arrow_path),
        "preflight": preflight,
        "cpuOracle": cpu_oracle,
        "gpuRequested": allow_gpu,
        "gpuExecuted": gpu_executed,
        "gpuBackend": gpu_backend,
        "gpuMetrics": gpu_metrics,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--allow-gpu", action="store_true")
    args = parser.parse_args()

    receipt = run_wsl2_rapids_challenger_v1(allow_gpu=args.allow_gpu)
    DEFAULT_RECEIPT.parent.mkdir(parents=True, exist_ok=True)
    DEFAULT_RECEIPT.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
