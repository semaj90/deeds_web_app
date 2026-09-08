"""ONNX export feasibility proof for AtlasGemmaRankV1 (parent-atlas-best-fit-score-fabric).

Tests whether the standalone AtlasGemmaRank backbone + scalar rank head can be exported to ONNX
and produce numerically consistent output via onnxruntime (CPU). This is a feasibility check for
the "client-side ONNX reranker" direction recorded in CLAUDE.md's 2026-09-06 Client Model
Direction note -- it does NOT export a trained model (rank head remains Xavier-random, same as
every other AtlasGemmaRank proof so far), does NOT wire anything into the browser client, and does
NOT write the upstream checkpoint. FP32 is used throughout (not bfloat16), matching MICRO-05's own
finding that FP32 is the only currently-trusted numerical reference for this model family.
"""

from __future__ import annotations

import argparse
import json
import sys

# torch.onnx's dynamo exporter prints a checkmark ("✅") progress line on success. Windows'
# default console codepage (cp1252) can't encode it, which crashes the export mid-write -- found
# live: the export actually completed torch.export.export() tracing successfully before dying on
# this print, so no .onnx file was ever written. Force UTF-8 stdout/stderr before importing torch.
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import onnx
import onnxruntime as ort
import torch
from safetensors import safe_open
from transformers import Gemma4ForCausalLM, PreTrainedTokenizerFast

from atlas_gemma_rank_load_init_proof_v1 import checksum, derived_text_config, file_checksum, initialize_parameter

SCHEMA = "atlas.gemma-rank-onnx-export-feasibility.v1"
NEW_SUFFIXES = (".self_attn.k_proj.weight", ".self_attn.v_proj.weight", ".self_attn.k_norm.weight")
PROBE_TEXT = "Which function computes the canonical packet checksum for a candidate ordinal map?"


class AtlasGemmaRankOnnxWrapper(torch.nn.Module):
    """Combines the backbone + rank head into one forward() for ONNX export. Returns a single
    scalar score per sequence (last-token hidden state through the rank head), matching every
    other AtlasGemmaRank proof script's scoring convention."""

    def __init__(self, backbone: torch.nn.Module, rank_head: torch.nn.Module) -> None:
        super().__init__()
        self.backbone = backbone
        self.rank_head = rank_head

    def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
        position_ids = torch.arange(input_ids.shape[1], device=input_ids.device).unsqueeze(0).expand(input_ids.shape[0], -1)
        hidden = self.backbone(input_ids=input_ids, attention_mask=attention_mask, position_ids=position_ids).last_hidden_state
        last_token = hidden[:, -1, :]
        return self.rank_head(last_token)


def build_model_from_standalone_artifact(artifact_dir: Path) -> tuple[torch.nn.Module, Any, str]:
    """Loads the already-materialized standalone artifact
    (models/atlas-gemma-rank-v1/standalone-init-bf16/, produced by
    atlas_gemma_rank_standalone_init_export_v1.py) directly, rather than re-deriving the same
    46-inherited + 12-standalone-attention construction in memory every time. Same weights,
    same status (untrained/Xavier-random rank head) -- this only changes where they come from."""
    config_path = artifact_dir / "config.json"
    weights_path = artifact_dir / "model.safetensors"
    upstream = json.loads(config_path.read_text(encoding="utf-8"))
    source_checksum_before = file_checksum(weights_path)
    config = derived_text_config(upstream) if "text_config" in upstream else Gemma4ForCausalLM.config_class.from_dict(upstream)

    model = Gemma4ForCausalLM(config)
    if hasattr(model, "lm_head"):
        del model.lm_head
    model = model.to(dtype=torch.float32).eval()
    state = model.state_dict()

    rank_head = torch.nn.Linear(config.hidden_size, 1, bias=True, dtype=torch.float32)

    with safe_open(str(weights_path), framework="pt", device="cpu") as handle:
        names = set(handle.keys())
        for name in sorted(names):
            tensor = handle.get_tensor(name).to(dtype=torch.float32)
            if name == "atlas.rank_head.weight":
                with torch.no_grad():
                    rank_head.weight.copy_(tensor)
            elif name == "atlas.rank_head.bias":
                with torch.no_grad():
                    rank_head.bias.copy_(tensor)
            elif name in state:
                with torch.no_grad():
                    state[name].copy_(tensor)

    wrapper = AtlasGemmaRankOnnxWrapper(model.model, rank_head).eval()
    source_checksum_after = file_checksum(weights_path)
    if source_checksum_before != source_checksum_after:
        raise RuntimeError("ATLAS_GEMMA_RANK_ONNX_CHECKPOINT_MUTATED")
    return wrapper, config, source_checksum_before


def run_export(checkpoint_dir: Path, output_dir: Path, *, seed: int = 17) -> dict[str, Any]:
    wrapper, config, source_checksum = build_model_from_standalone_artifact(checkpoint_dir)
    tokenizer = PreTrainedTokenizerFast(tokenizer_file=str(checkpoint_dir / "tokenizer.json"))
    encoded = tokenizer(PROBE_TEXT, return_tensors="pt")
    input_ids = encoded["input_ids"]
    attention_mask = encoded.get("attention_mask", torch.ones_like(input_ids))

    with torch.no_grad():
        pytorch_output = wrapper(input_ids, attention_mask)
    pytorch_score = pytorch_output.detach().numpy()

    output_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = output_dir / "atlas_gemma_rank_v1_feasibility.onnx"

    export_attempts: list[dict[str, Any]] = []
    exported = False
    export_method = None
    for method in ("dynamo_static_shape", "dynamo", "legacy_torchscript"):
        try:
            if method == "dynamo_static_shape":
                # dynamic_axes is explicitly flagged unreliable under dynamo=True by torch's own
                # warning. Isolate whether dynamic shapes are the source of the parity failure by
                # exporting with the exact fixed shape of the real probe input -- no dynamic_axes.
                torch.onnx.export(
                    wrapper,
                    (input_ids, attention_mask),
                    str(onnx_path),
                    input_names=["input_ids", "attention_mask"],
                    output_names=["score"],
                    opset_version=18,
                    dynamo=True,
                )
            elif method == "dynamo":
                torch.onnx.export(
                    wrapper,
                    (input_ids, attention_mask),
                    str(onnx_path),
                    input_names=["input_ids", "attention_mask"],
                    output_names=["score"],
                    dynamic_axes={
                        "input_ids": {0: "batch", 1: "sequence"},
                        "attention_mask": {0: "batch", 1: "sequence"},
                        "score": {0: "batch"},
                    },
                    opset_version=18,
                    dynamo=True,
                )
            else:
                torch.onnx.export(
                    wrapper,
                    (input_ids, attention_mask),
                    str(onnx_path),
                    input_names=["input_ids", "attention_mask"],
                    output_names=["score"],
                    dynamic_axes={
                        "input_ids": {0: "batch", 1: "sequence"},
                        "attention_mask": {0: "batch", 1: "sequence"},
                        "score": {0: "batch"},
                    },
                    opset_version=18,
                    dynamo=False,
                )
            exported = True
            export_method = method
            export_attempts.append({"method": method, "ok": True, "error": None})
            break
        except Exception as error:  # noqa: BLE001 -- must record whichever export path fails, not just re-raise
            export_attempts.append({"method": method, "ok": False, "error": f"{type(error).__name__}: {error}"[:500]})

    result: dict[str, Any] = {
        "schema": SCHEMA,
        "probeText": PROBE_TEXT,
        "checkpointDir": str(checkpoint_dir),
        "sourceWeightsChecksum": source_checksum,
        "checkpointMutated": False,
        "trainingPerformed": False,
        "rankHeadTrained": False,
        "cudaAllocated": False,
        "canonicalAuthority": False,
        "clientWiringPerformed": False,
        "exportAttempts": export_attempts,
        "exportSucceeded": exported,
        "exportMethod": export_method,
        "pytorchScore": pytorch_score.tolist(),
    }

    if exported:
        onnx_model = onnx.load(str(onnx_path))
        onnx.checker.check_model(onnx_model)
        session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
        onnx_output = session.run(
            None,
            {
                "input_ids": input_ids.numpy(),
                "attention_mask": attention_mask.numpy(),
            },
        )
        onnx_score = onnx_output[0]
        max_abs_delta = float(np.max(np.abs(onnx_score - pytorch_score)))
        # The dynamo exporter writes large tensors to a sibling `<name>.onnx.data` external-data
        # file rather than inlining them in the graph file -- checking onnx_path.stat().st_size
        # alone undercounts total size by ~250x for this model (found live: 1.2MB main file vs a
        # real 309MB external-data file sitting right next to it). Sum both.
        external_data_path = onnx_path.with_suffix(onnx_path.suffix + ".data")
        onnx_file_bytes = onnx_path.stat().st_size
        onnx_total_bytes = onnx_file_bytes + (external_data_path.stat().st_size if external_data_path.exists() else 0)
        result.update({
            "onnxCheckerPassed": True,
            "onnxScore": onnx_score.tolist(),
            "maxAbsDeltaPytorchVsOnnx": max_abs_delta,
            "parityWithinTolerance": max_abs_delta < 1e-3,
            "onnxGraphFileBytes": onnx_file_bytes,
            "onnxExternalDataFileBytes": external_data_path.stat().st_size if external_data_path.exists() else 0,
            "onnxTotalBytes": onnx_total_bytes,
            "onnxFilePath": str(onnx_path),
            "browserSizeFeasible": onnx_total_bytes < 200 * 1024 * 1024,
        })
        status = "ONNX_EXPORT_FEASIBILITY_PROVEN" if result["parityWithinTolerance"] else "ONNX_EXPORT_PARITY_FAILED"
    else:
        status = "ONNX_EXPORT_BLOCKED"

    result["status"] = status
    result["observedAt"] = datetime.now(timezone.utc).isoformat()
    result["receiptChecksum"] = checksum({k: v for k, v in result.items() if k != "receiptChecksum"})
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    result = run_export(args.checkpoint_dir, args.output_dir)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k not in ("pytorchScore", "onnxScore")}, indent=2))
    return 0 if result["status"] == "ONNX_EXPORT_FEASIBILITY_PROVEN" else 1


if __name__ == "__main__":
    raise SystemExit(main())
