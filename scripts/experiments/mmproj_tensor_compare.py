#!/usr/bin/env python3
"""Fail-closed BF16 vs Q8_0 GGUF mmproj comparison (no model weights in repo).

Requires numpy and llama.cpp/gguf-py on PYTHONPATH. Reads tensors through GGUFReader.
This audits file/tensor identity and numerical reconstruction; NOT vision-output parity.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from gguf import GGUFReader


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(8 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def bf16_to_f32(raw: bytes) -> np.ndarray:
    u16 = np.frombuffer(raw, dtype="<u2")
    return (u16.astype(np.uint32) << 16).view(np.float32)


def q8_0_to_f32(raw: bytes) -> np.ndarray:
    if len(raw) % 34:
        raise ValueError("Q8_0 tensor byte length is not divisible by 34")
    blocks = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 34)
    scales = np.ascontiguousarray(blocks[:, :2]).view("<f2").astype(np.float32)
    codes = blocks[:, 2:].view(np.int8).astype(np.float32)
    return (codes * scales[:, None]).reshape(-1)


def field_signature(field) -> tuple:
    # GGUFReader fields have typed parts; compare logical decoded contents
    # rather than file offsets, which can change when tensor sizes change.
    return (tuple(str(t) for t in field.types),
            tuple(bytes(field.parts[i]) for i in field.data))


def compare(src_path: Path, dst_path: Path, abs_limit: float, rel_floor: float) -> dict:
    src = GGUFReader(str(src_path))
    dst = GGUFReader(str(dst_path))
    errors = []
    sf, df = src.fields, dst.fields
    if set(sf) != set(df):
        errors.append("metadata key set differs")
    skip_fields = {"general.file_type", "general.quantization_version"}
    for key in sorted(set(sf) & set(df) - skip_fields):
        try:
            if field_signature(sf[key]) != field_signature(df[key]):
                errors.append(f"metadata changed: {key}")
        except Exception as exc:
            errors.append(f"metadata could not be verified: {key}: {exc}")
    st = {t.name: t for t in src.tensors}
    dt = {t.name: t for t in dst.tensors}
    if len(st) != len(src.tensors) or len(dt) != len(dst.tensors):
        errors.append("duplicate tensor name")
    if set(st) != set(dt):
        errors.append("tensor name sets differ")
    quantized = passthrough = 0
    worst_abs = 0.0
    worst_name = None
    tensors = []
    for name in sorted(set(st) & set(dt)):
        a, b = st[name], dt[name]
        shape_a, shape_b = tuple(map(int, a.shape)), tuple(map(int, b.shape))
        if shape_a != shape_b:
            errors.append(f"shape mismatch: {name}")
            continue
        ta, tb = a.tensor_type.name, b.tensor_type.name
        ba, bb = a.data.tobytes(), b.data.tobytes()
        if ta == tb:
            if ba != bb:
                errors.append(f"passthrough tensor altered: {name}")
            else:
                passthrough += 1
        elif ta == "BF16" and tb == "Q8_0":
            if len(shape_a) < 2 or shape_a[0] % 32:
                errors.append(f"unsafe Q8_0 block alignment: {name}")
                continue
            x, y = bf16_to_f32(ba), q8_0_to_f32(bb)
            if x.size != y.size:
                errors.append(f"element count mismatch: {name}")
                continue
            if not np.all(np.isfinite(x)) or not np.all(np.isfinite(y)):
                errors.append(f"nonfinite values: {name}")
                continue
            delta = np.abs(x - y)
            max_abs = float(delta.max(initial=0))
            mean_abs = float(delta.mean())
            mean_rel = float((delta / np.maximum(np.abs(x), rel_floor)).mean())
            tensors.append({"name": name, "max_abs": max_abs,
                            "mean_abs": mean_abs, "mean_rel_floored": mean_rel})
            if max_abs > worst_abs:
                worst_abs, worst_name = max_abs, name
            if max_abs > abs_limit:
                errors.append(f"absolute error exceeds limit: {name}: {max_abs}")
            quantized += 1
        else:
            errors.append(f"unsupported dtype transition: {name}: {ta}->{tb}")
    if quantized == 0:
        errors.append("no BF16->Q8_0 tensors found")
    return {
        "status": "PASS" if not errors else "FAIL",
        "source": {"path": str(src_path), "bytes": src_path.stat().st_size, "sha256": sha256(src_path)},
        "candidate": {"path": str(dst_path), "bytes": dst_path.stat().st_size, "sha256": sha256(dst_path)},
        "source_tensors": len(st), "candidate_tensors": len(dt),
        "passthrough_identical": passthrough, "converted_q8_0": quantized,
        "worst_max_abs": worst_abs, "worst_tensor": worst_name,
        "errors": errors, "converted_tensor_metrics": tensors,
        "limitations": ["Does not verify real-image CLIP outputs", "Does not prove VRAM/runtime compatibility",
                        "Does not prove vision quality or model-family match"]
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("source", type=Path)
    p.add_argument("candidate", type=Path)
    p.add_argument("--max-abs", type=float, default=0.005)
    p.add_argument("--relative-floor", type=float, default=1e-4)
    p.add_argument("--report", type=Path)
    a = p.parse_args()
    if a.max_abs <= 0 or a.relative_floor <= 0:
        p.error("thresholds must be positive")
    try:
        report = compare(a.source, a.candidate, a.max_abs, a.relative_floor)
    except Exception as exc:
        report = {"status": "FAIL", "errors": [f"{type(exc).__name__}: {exc}"]}
    output = json.dumps(report, indent=2)
    print(output)
    if a.report:
        a.report.parent.mkdir(parents=True, exist_ok=True)
        a.report.write_text(output + "\n", encoding="utf-8")
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
