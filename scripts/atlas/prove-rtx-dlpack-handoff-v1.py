#!/usr/bin/env python3
"""
prove-rtx-dlpack-handoff-v1.py  (READ-ONLY; AFC-E2E-92)

Proves exactly one thing: a column of the summary-priority matrix, held as a cuDF/CuPy array,
reaches PyTorch through DLPack WITHOUT a copy (device-pointer equality), inside one process and
one CUDA context.

Not exercised (reported as NOT_EXERCISED, never scored): the 64-D SVD projection and the MLP
reranker. No frozen SVD basis and no trained weights exist; running zeros or random weights would
emit numbers that mean nothing. Those steps need the reviewed gold set (AFC-E2E-21) first.

Run inside the WSL RAPIDS environment (cuDF and torch live there; Windows torch is a different
build, so DLPack cannot cross the boundary):
    /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python scripts/atlas/prove-rtx-dlpack-handoff-v1.py
Precondition: free :8090 first (VS Code task "GPU: Prepare cuVS KMeans"); with Ornith loaded the card
has well under 1 GiB free, and this script refuses to start below that (exit 2, BLOCKED).
    --check-only   verify the matrix checksums and shape without importing torch/cudf or touching the GPU

The "import torch before cudf" ordering is applied here as a precaution and recorded in the receipt;
it is not claimed as a verified requirement.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys
import time

import numpy as np

MIN_FREE_VRAM_GIB = 1.0


def load_latest_matrix(root: pathlib.Path):
    base = root / ".tmp" / "atlas" / "summary-priority-matrix-v1"
    runs = sorted(d for d in base.iterdir() if (d / "descriptor.json").exists()) if base.exists() else []
    if not runs:
        raise FileNotFoundError("no summary-priority-matrix-v1 run; run scripts/atlas/build-summary-priority-matrix-v1.mjs")
    latest = runs[-1]
    desc = json.loads((latest / "descriptor.json").read_text(encoding="utf-8"))
    for name in ("X.f32le", "mask.u8", "ids.txt"):
        digest = hashlib.sha256((latest / name).read_bytes()).hexdigest()
        if digest != desc["files"][name]["sha256"]:
            raise ValueError(f"checksum mismatch on {name}")
    n, k = desc["shape"]
    x = np.fromfile(latest / "X.f32le", dtype="<f4").reshape(n, k)
    m = np.fromfile(latest / "mask.u8", dtype=np.uint8).reshape(n, k)
    return latest.name, desc, x, m


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check-only", action="store_true")
    args = ap.parse_args()
    t0 = time.perf_counter()
    root = pathlib.Path(__file__).resolve().parents[2]
    run, desc, x, m = load_latest_matrix(root)
    receipt = {
        "schema": "atlas.rtx-dlpack-handoff-receipt.v1",
        "matrixRun": run,
        "matrixShape": list(x.shape),
        "matrixChecksumsVerified": True,
        "canonicalAuthority": False,
        "writesPerformed": False,
        "svdProjection": "NOT_EXERCISED: no frozen basis exists",
        "mlpReranker": "NOT_EXERCISED: no trained weights; needs the reviewed gold set",
    }
    if args.check_only:
        receipt["status"] = "CHECK_ONLY_NO_GPU_TOUCHED"
    else:
        import torch  # imported before cudf as a precaution (not a verified requirement)

        if not torch.cuda.is_available():
            receipt["status"] = "BLOCKED_NO_CUDA"
        else:
            free_gib = torch.cuda.mem_get_info()[0] / (1024 ** 3)
            receipt["vramFreeGiB"] = round(free_gib, 3)
            if free_gib < MIN_FREE_VRAM_GIB:
                receipt["status"] = f"BLOCKED_VRAM_BELOW_{MIN_FREE_VRAM_GIB}_GIB"
            else:
                import cudf

                gdf = cudf.DataFrame({f"SPM_{i + 1:03d}": x[:, i] for i in range(x.shape[1])})
                col = gdf["SPM_001"].values  # CuPy ndarray (public API)
                tensor = torch.from_dlpack(col)
                zero_copy = col.data.ptr == tensor.data_ptr()
                # Negative control: an ordinary host-to-device copy must NOT share the pointer.
                copied = torch.as_tensor(x[:, 0].copy(), device="cuda")
                control_distinct = copied.data_ptr() != tensor.data_ptr()
                values_equal = bool(torch.equal(tensor[:1024].cpu(), torch.from_numpy(x[:1024, 0])))
                receipt.update(
                    {
                        "torch": torch.__version__,
                        "cudf": cudf.__version__,
                        "gpu": torch.cuda.get_device_name(0),
                        "dlpackZeroCopy": bool(zero_copy),
                        "negativeControlPointerDistinct": bool(control_distinct),
                        "valuesEqualFirst1024": values_equal,
                        "status": "DLPACK_ZERO_COPY_PROVEN" if (zero_copy and control_distinct and values_equal) else "NOT_PROVEN",
                    }
                )
    receipt["elapsedMs"] = round((time.perf_counter() - t0) * 1000, 1)
    out = root / ".tmp" / "atlas" / "rtx-dlpack-handoff-receipt-v1.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    print(json.dumps(receipt, indent=2))
    return 2 if str(receipt.get("status", "")).startswith("BLOCKED") else 0


if __name__ == "__main__":
    sys.exit(main())
