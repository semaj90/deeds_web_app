"""Read-only prefix export probe for locating AtlasGemmaRank ONNX divergence.

This deliberately exports one fixed-shape prefix at a time and compares the final hidden
state, not a rank decision. It is diagnostic only: no checkpoint is changed or promoted.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import onnx
import onnxruntime as ort
import torch
from transformers import PreTrainedTokenizerFast

from atlas_gemma_rank_onnx_export_feasibility_v1 import build_model_from_standalone_artifact


TEXT = "Which function computes the canonical packet checksum for a candidate ordinal map?"


class PrefixWrapper(torch.nn.Module):
    def __init__(self, backbone: torch.nn.Module, layer_count: int) -> None:
        super().__init__()
        self.backbone = backbone
        self.layer_count = layer_count

    def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
        position_ids = torch.arange(input_ids.shape[1], device=input_ids.device).unsqueeze(0)
        position_ids = position_ids.expand(input_ids.shape[0], -1)
        hidden = self.backbone(
            input_ids=input_ids,
            attention_mask=attention_mask,
            position_ids=position_ids,
        ).last_hidden_state
        return hidden[:, -1, :]


def sha256_bytes(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def run(checkpoint_dir: Path, output_dir: Path, report_path: Path) -> dict[str, Any]:
    wrapper, config, source_checksum = build_model_from_standalone_artifact(checkpoint_dir)
    tokenizer = PreTrainedTokenizerFast(tokenizer_file=str(checkpoint_dir / "tokenizer.json"))
    encoded = tokenizer(TEXT, return_tensors="pt")
    input_ids = encoded["input_ids"]
    attention_mask = encoded["attention_mask"]

    output_dir.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, Any]] = []
    for layer_count in range(1, 5):
        # The module is changed only in this in-memory diagnostic copy.
        backbone = wrapper.backbone
        original_layers = backbone.layers
        backbone.layers = torch.nn.ModuleList(list(original_layers[:layer_count]))
        prefix = PrefixWrapper(backbone, layer_count).eval()
        with torch.no_grad():
            reference = prefix(input_ids, attention_mask).cpu().numpy()
        onnx_path = output_dir / f"prefix-{layer_count}.onnx"
        try:
            torch.onnx.export(
                prefix,
                (input_ids, attention_mask),
                str(onnx_path),
                input_names=["input_ids", "attention_mask"],
                output_names=["hidden_last"],
                opset_version=18,
                dynamo=True,
            )
            onnx.checker.check_model(onnx.load(str(onnx_path)))
            actual = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"]).run(
                ["hidden_last"],
                {"input_ids": input_ids.numpy(), "attention_mask": attention_mask.numpy()},
            )[0]
            delta = float(np.max(np.abs(actual - reference)))
            rows.append({
                "layerCount": layer_count,
                "layerType": (getattr(config, "layer_types", []) or [])[layer_count - 1]
                if getattr(config, "layer_types", None) else "unknown",
                "status": "PARITY_PASS" if delta < 1e-3 else "PARITY_FAILED",
                "maxAbsDelta": delta,
                "referenceFinite": bool(np.isfinite(reference).all()),
                "onnxFinite": bool(np.isfinite(actual).all()),
            })
        except Exception as error:  # diagnostic receipt must retain failure cause
            rows.append({
                "layerCount": layer_count,
                "status": "EXPORT_OR_RUNTIME_FAILED",
                "error": f"{type(error).__name__}: {error}"[:500],
            })
        finally:
            backbone.layers = original_layers

    result = {
        "schema": "atlas.gemma-rank-onnx-layer-localization.v1",
        "checkpointDir": str(checkpoint_dir),
        "sourceWeightsChecksum": source_checksum,
        "probeText": TEXT,
        "inputTokenIdsChecksum": sha256_bytes(input_ids.numpy().tobytes()),
        "layerResults": rows,
        "checkpointMutated": False,
        "trainingPerformed": False,
        "canonicalAuthority": False,
        "clientWiringPerformed": False,
        "status": "LOCALIZATION_PROVEN" if rows else "LOCALIZATION_UNPROVEN",
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    run(args.checkpoint_dir, args.output_dir, args.report)
