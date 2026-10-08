#!/usr/bin/env python3
"""Phase-23 experimental GGUF tensor inventory gate.

Reads an actual GGUF via llama.cpp gguf-py and compares tensor name/type
against a declared surgical map. DOES NOT re-quantize or mutate files.
Exit 0 only for exact classification and counts; report includes source SHA256.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

EXPECTED = {
    "output": (1, "Q6_K"),
    "embedding": (1, "Q4_K"),
    "norm": (131, "F32"),
    "router": (80, "F32"),
    "attention_gate": (30, "Q8_0"),
    "shared_expert": (120, "Q4_K"),
    "anchor_qkv": (30, "Q4_K"),
    "anchor_output": (10, "Q6_K"),
    "ssm_scale": (120, "F32"),
    "linear_ssm": (90, "Q4_K"),
    "border_down": (4, "Q3_K"),
    "border_gate_up": (8, "IQ3_XXS"),
    "core_down": (36, "IQ3_XXS"),
    "core_gate": (36, "IQ2_S"),
    "core_up_early": (14, "IQ2_S"),
    "core_up_late": (22, "IQ2_XXS"),
}
# Boundaries/regexes intentionally strict. Unexpected spelling => UNCLASSIFIED.
def classify(name: str) -> str | None:
    if name == "output.weight":
        return "output"
    if name == "token_embd.weight":
        return "embedding"
    if re.search(r"(?:^|\.)(?:output_norm|attn_\w*_norm|post_attention_norm|ssm_norm)(?:\.weight)?$", name):
        return "norm"
    m = re.fullmatch(r"blk\.(\d+)\.(.+)", name)
    if not m:
        return None
    layer, tail = int(m.group(1)), m.group(2)
    if layer >= 40:
        return None
    if tail in {"ffn_gate_inp.weight", "ffn_gate_inp_shexp.weight", "ffn_gate_inp", "ffn_gate_inp_shexp"}:
        return "router"
    if tail == "attn_gate.weight":
        return "attention_gate"
    if re.fullmatch(r"ffn_(gate|down|up)_shexp(?:\.weight)?", tail):
        return "shared_expert"
    if layer % 4 == 3 and tail in {"attn_q.weight", "attn_k.weight", "attn_v.weight"}:
        return "anchor_qkv"
    if layer % 4 == 3 and tail == "attn_output.weight":
        return "anchor_output"
    if re.fullmatch(r"ssm_(alpha|a|conv1d|dt)(?:\.weight)?", tail):
        return "ssm_scale"
    if re.fullmatch(r"(attn_qkv|ssm_beta|ssm_out)(?:\.weight)?", tail):
        return "linear_ssm"
    e = re.fullmatch(r"ffn_(down|gate|up)_exps(?:\.weight)?", tail)
    if e:
        kind = e.group(1)
        border = layer in (0, 1, 38, 39)
        if border:
            return "border_down" if kind == "down" else "border_gate_up"
        if kind == "down":
            return "core_down"
        if kind == "gate":
            return "core_gate"
        return "core_up_early" if layer <= 15 else "core_up_late"
    return None


def audit(path: Path) -> dict:
    from gguf import GGUFReader
    reader = GGUFReader(str(path))
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(8 * 1024 * 1024), b""):
            digest.update(block)
    counts = Counter()
    sample = {}
    issues = []
    seen = set()
    for tensor in reader.tensors:
        name = str(tensor.name)
        if name in seen:
            issues.append(f"duplicate tensor: {name}")
        seen.add(name)
        group = classify(name)
        if group is None:
            issues.append(f"unclassified tensor: {name} ({tensor.tensor_type.name})")
            continue
        counts[group] += 1
        sample.setdefault(group, []).append({"name": name, "dtype": tensor.tensor_type.name, "shape": list(map(int, tensor.shape))})
        expected_dtype = EXPECTED[group][1]
        if tensor.tensor_type.name != expected_dtype:
            issues.append(f"dtype {name}: actual={tensor.tensor_type.name}, expected={expected_dtype}")
    for group, (expected_count, _) in EXPECTED.items():
        if counts[group] != expected_count:
            issues.append(f"count {group}: actual={counts[group]}, expected={expected_count}")
    return {
        "gate": "PH23-TENSOR-01",
        "status": "PASS" if not issues else "FAIL",
        "model_path": str(path),
        "sha256": digest.hexdigest(),
        "byte_size": path.stat().st_size,
        "tensor_total": len(reader.tensors),
        "classified_counts": dict(counts),
        "expected": {k: {"count": n, "dtype": t} for k, (n, t) in EXPECTED.items()},
        "issues": issues,
        "tensor_examples": {k: v[:3] for k, v in sample.items()},
        "limitations": ["Tensor presence and dtype do not prove model quality or model identity",
                        "Size target and claimed routing architecture must be verified separately"]
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("gguf", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    try:
        result = audit(args.gguf)
    except Exception as exc:
        result = {"gate": "PH23-TENSOR-01", "status": "FAIL", "issues": [f"{type(exc).__name__}: {exc}"]}
    result_json = json.dumps(result, indent=2)
    print(result_json)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(result_json + "\n", encoding="utf-8")
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
