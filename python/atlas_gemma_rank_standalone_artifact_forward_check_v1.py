"""Read-only forward check for an exported AtlasGemmaRank initialization artifact."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path

import torch
from safetensors import safe_open
from transformers import Gemma4ForCausalLM, Gemma4TextConfig, PreTrainedTokenizerFast

from atlas_gemma_rank_load_init_proof_v1 import checksum, file_checksum


SCHEMA = "atlas.gemma-rank-standalone-artifact-forward-check.v1"


def check(artifact_dir: Path, text: str) -> dict[str, object]:
    weights_path = artifact_dir / "model.safetensors"
    config_path = artifact_dir / "config.json"
    tokenizer_path = artifact_dir / "tokenizer.json"
    for path in (weights_path, config_path, tokenizer_path):
        if not path.is_file():
            raise FileNotFoundError(path)

    config = Gemma4TextConfig.from_pretrained(str(artifact_dir), local_files_only=True)
    model = Gemma4ForCausalLM(config)
    del model.lm_head
    model_state = model.state_dict()
    with safe_open(str(weights_path), framework="pt", device="cpu") as handle:
        artifact_names = sorted(handle.keys())
        model_tensors = {
            name: handle.get_tensor(name)
            for name in artifact_names
            if name in model_state
        }
        rank_weight = handle.get_tensor("atlas.rank_head.weight")
        rank_bias = handle.get_tensor("atlas.rank_head.bias")
    load_result = model.load_state_dict(model_tensors, strict=True)
    model.eval()

    head = torch.nn.Linear(config.hidden_size, 1, bias=True, dtype=rank_weight.dtype).eval()
    with torch.no_grad():
        head.weight.copy_(rank_weight)
        head.bias.copy_(rank_bias)
    tokenizer = PreTrainedTokenizerFast(tokenizer_file=str(tokenizer_path))
    input_ids = torch.tensor([tokenizer(text)["input_ids"]], dtype=torch.long)
    with torch.inference_mode():
        hidden = model.model(
            input_ids=input_ids,
            attention_mask=torch.ones_like(input_ids),
        ).last_hidden_state
        score = head(hidden[:, -1, :].to(dtype=head.weight.dtype))

    result = {
        "schema": SCHEMA,
        "status": "EXPORTED_STANDALONE_FORWARD_FINITE_PROVEN" if (
            not load_result.missing_keys
            and not load_result.unexpected_keys
            and bool(torch.isfinite(hidden).all().item())
            and bool(torch.isfinite(score).all().item())
        ) else "BLOCKED_EXPORTED_STANDALONE_FORWARD",
        "artifactDir": str(artifact_dir),
        "artifactWeightsChecksum": file_checksum(weights_path),
        "runtimeClass": "Gemma4ForCausalLM",
        "inputTokenCount": int(input_ids.shape[1]),
        "hiddenShape": list(hidden.shape),
        "hiddenDtype": str(hidden.dtype),
        "score": float(score.item()),
        "modelStateTensorCount": len(model_state),
        "loadedModelTensorCount": len(model_tensors),
        "artifactTensorCount": len(artifact_names),
        "rankHeadPresent": "atlas.rank_head.weight" in artifact_names and "atlas.rank_head.bias" in artifact_names,
        "missingKeys": list(load_result.missing_keys),
        "unexpectedKeys": list(load_result.unexpected_keys),
        "hiddenFinite": bool(torch.isfinite(hidden).all().item()),
        "scoreFinite": bool(torch.isfinite(score).all().item()),
        "trainingPerformed": False,
        "checkpointMutated": False,
        "canonicalAuthority": False,
        "observedAt": datetime.now(timezone.utc).isoformat(),
    }
    result["receiptChecksum"] = checksum(result)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-dir", type=Path, required=True)
    parser.add_argument("--text", default="revision-qualified legal code retrieval")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = check(args.artifact_dir, args.text)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "schema": result["schema"],
        "status": result["status"],
        "inputTokenCount": result["inputTokenCount"],
        "hiddenShape": result["hiddenShape"],
        "scoreFinite": result["scoreFinite"],
        "output": str(args.output),
    }, sort_keys=True))
    return 0 if result["status"] == "EXPORTED_STANDALONE_FORWARD_FINITE_PROVEN" else 1


if __name__ == "__main__":
    raise SystemExit(main())
