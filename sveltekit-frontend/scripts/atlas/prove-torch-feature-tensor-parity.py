#!/usr/bin/env python3
"""TORCH-03 feature tensor parity proof.

Consumes a JSON fixture containing the exact little-endian float32 feature bytes,
presence-mask bytes, ordered row keys, and checksums emitted by TypeScript.
Proves:
  - NumPy reconstructs exactly the same float32 bytes/shape/order
  - torch.from_numpy consumes the same logical tensor
  - CPU scoring is finite and deterministic
  - CUDA scoring (when available) is numerically close to CPU within tolerance

This script does not write canonical stores and does not own feature identity.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import torch


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_fixture(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    required = {
        "schema", "tensorRevision", "rowCount", "columnCount", "rowKeys",
        "featureBytesBase64", "presenceMaskBytesBase64", "featureBytesSha256",
        "presenceMaskBytesSha256", "rowKeysSha256",
    }
    missing = required.difference(data)
    if missing:
        raise ValueError(f"fixture missing fields: {sorted(missing)}")
    if data["columnCount"] != 25:
        raise ValueError("columnCount must be 25")
    if len(data["rowKeys"]) != data["rowCount"]:
        raise ValueError("row key count mismatch")
    return data


def digest_row_keys(row_keys: list[str]) -> str:
    h = hashlib.sha256()
    for value in row_keys:
        encoded = value.encode("utf-8")
        h.update(f"{len(encoded)}:".encode("utf-8"))
        h.update(encoded)
    return h.hexdigest()


def cosine_scores(x: torch.Tensor) -> torch.Tensor:
    # Deterministic, model-free parity kernel: row 0 is the query; all rows are corpus.
    if x.ndim != 2 or x.shape[1] != 25:
        raise ValueError(f"expected [C,25], received {tuple(x.shape)}")
    if x.shape[0] == 0:
        return torch.empty((0,), dtype=x.dtype, device=x.device)
    query = x[0:1]
    qn = torch.linalg.vector_norm(query, dim=1).clamp_min(1e-12)
    xn = torch.linalg.vector_norm(x, dim=1).clamp_min(1e-12)
    return (x @ query.T).squeeze(1) / (xn * qn[0])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--atol", type=float, default=1e-6)
    parser.add_argument("--rtol", type=float, default=1e-5)
    parser.add_argument("--require-cuda", action="store_true")
    args = parser.parse_args()

    fixture = load_fixture(args.fixture)
    feature_bytes = base64.b64decode(fixture["featureBytesBase64"], validate=True)
    mask_bytes = base64.b64decode(fixture["presenceMaskBytesBase64"], validate=True)

    if sha256(feature_bytes) != fixture["featureBytesSha256"]:
        raise RuntimeError("FEATURE_BYTES_CHECKSUM_MISMATCH")
    if sha256(mask_bytes) != fixture["presenceMaskBytesSha256"]:
        raise RuntimeError("PRESENCE_MASK_CHECKSUM_MISMATCH")
    if digest_row_keys(fixture["rowKeys"]) != fixture["rowKeysSha256"]:
        raise RuntimeError("ROW_KEYS_CHECKSUM_MISMATCH")

    expected_values = fixture["rowCount"] * fixture["columnCount"]
    if len(feature_bytes) != expected_values * 4:
        raise RuntimeError("FEATURE_BYTE_LENGTH_MISMATCH")
    if len(mask_bytes) != expected_values:
        raise RuntimeError("MASK_BYTE_LENGTH_MISMATCH")

    # Verify the immutable fixture bytes first, then copy into writable NumPy storage.
    # torch.from_numpy shares that writable storage; scoring clones it afterward.
    np_features = np.frombuffer(feature_bytes, dtype="<f4").copy().reshape(
        fixture["rowCount"], fixture["columnCount"]
    )
    np_mask = np.frombuffer(mask_bytes, dtype=np.uint8).copy().reshape(
        fixture["rowCount"], fixture["columnCount"]
    )
    if not np.isfinite(np_features).all():
        raise RuntimeError("NUMPY_NON_FINITE_FEATURES")
    if not np.isin(np_mask, [0, 1]).all():
        raise RuntimeError("NUMPY_INVALID_MASK")
    if np.any((np_mask == 0) & (np_features != 0)):
        raise RuntimeError("NUMPY_MISSING_VALUE_NOT_ZERO")

    torch_view = torch.from_numpy(np_features)
    cpu = torch_view.clone()
    cpu_scores_1 = cosine_scores(cpu)
    cpu_scores_2 = cosine_scores(cpu)
    if not torch.isfinite(cpu_scores_1).all():
        raise RuntimeError("PYTORCH_CPU_NON_FINITE")
    if not torch.equal(cpu_scores_1, cpu_scores_2):
        raise RuntimeError("PYTORCH_CPU_REPEAT_MISMATCH")

    cuda_available = torch.cuda.is_available()
    if args.require_cuda and not cuda_available:
        raise RuntimeError("CUDA_REQUIRED_BUT_UNAVAILABLE")

    cuda_result: dict[str, Any] = {
        "available": cuda_available,
        "device": None,
        "maxAbsoluteDeltaVsCpu": None,
        "allclose": None,
    }
    if cuda_available:
        device = torch.device("cuda")
        gpu = cpu.to(device)
        gpu_scores = cosine_scores(gpu).cpu()
        if not torch.isfinite(gpu_scores).all():
            raise RuntimeError("PYTORCH_CUDA_NON_FINITE")
        delta = torch.max(torch.abs(cpu_scores_1 - gpu_scores)).item() if gpu_scores.numel() else 0.0
        close = bool(torch.allclose(cpu_scores_1, gpu_scores, atol=args.atol, rtol=args.rtol))
        cuda_result = {
            "available": True,
            "device": torch.cuda.get_device_name(0),
            "maxAbsoluteDeltaVsCpu": delta,
            "allclose": close,
        }
        if not close:
            raise RuntimeError(f"PYTORCH_CUDA_PARITY_MISMATCH:{delta}")

    receipt = {
        "schema": "atlas.torch-feature-tensor-parity-receipt.v1",
        "fixture": str(args.fixture),
        "tensorRevision": fixture["tensorRevision"],
        "rowCount": fixture["rowCount"],
        "columnCount": fixture["columnCount"],
        "featureBytesSha256": fixture["featureBytesSha256"],
        "presenceMaskBytesSha256": fixture["presenceMaskBytesSha256"],
        "rowKeysSha256": fixture["rowKeysSha256"],
        "numpyDtype": str(np_features.dtype),
        "torchCpuDtype": str(cpu.dtype),
        "torchVersion": torch.__version__,
        "cpuRepeatExact": True,
        "cuda": cuda_result,
        "atol": args.atol,
        "rtol": args.rtol,
        "canonicalOwnerChanged": False,
        "evidenceAuthority": False,
    }
    print(json.dumps(receipt, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
