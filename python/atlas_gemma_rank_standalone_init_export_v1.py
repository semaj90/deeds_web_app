"""Create an untrained, standalone AtlasGemmaRank BF16 initialization artifact."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
from typing import Any

from safetensors import safe_open
from safetensors.torch import save_file

from atlas_gemma_rank_cuda_forward_probe_v1 import build_model
from atlas_gemma_rank_load_init_proof_v1 import file_checksum


SCHEMA = "atlas.gemma-rank-standalone-init-artifact.v1"
TOKENIZER_FILES = ("tokenizer.json", "tokenizer_config.json")


def checksum(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def export_artifact(checkpoint_dir: Path, output_dir: Path, *, seed: int, overwrite: bool) -> dict[str, Any]:
    source_weights = checkpoint_dir / "model.safetensors"
    source_config = checkpoint_dir / "config.json"
    if not source_weights.is_file() or not source_config.is_file():
        raise FileNotFoundError(f"SOURCE_CHECKPOINT_INCOMPLETE:{checkpoint_dir}")
    if output_dir.exists() and any(output_dir.iterdir()) and not overwrite:
        raise FileExistsError(f"OUTPUT_EXISTS_USE_OVERWRITE:{output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)

    model, rank_head, inventory = build_model(checkpoint_dir, seed=seed)
    with safe_open(str(source_weights), framework="pt", device="cpu") as handle:
        source_tensor_count = len(handle.keys())
    state = {
        name: tensor.detach().cpu().contiguous()
        for name, tensor in model.state_dict().items()
    }
    state.update({
        "atlas.rank_head.weight": rank_head.weight.detach().cpu().contiguous(),
        "atlas.rank_head.bias": rank_head.bias.detach().cpu().contiguous(),
    })

    output_weights = output_dir / "model.safetensors"
    save_file(state, str(output_weights), metadata={
        "format": "pt",
        "atlas_schema": SCHEMA,
        "dtype": "bfloat16",
        "training_performed": "false",
    })

    derived_config = inventory["config"].to_dict()
    derived_config["architectures"] = ["Gemma4ForCausalLM"]
    derived_config["model_type"] = "gemma4_text"
    (output_dir / "config.json").write_text(
        json.dumps(derived_config, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    for filename in TOKENIZER_FILES:
        source = checkpoint_dir / filename
        if not source.is_file():
            raise FileNotFoundError(f"TOKENIZER_FILE_MISSING:{source}")
        shutil.copy2(source, output_dir / filename)

    source_revision = file_checksum(source_weights)
    artifact_revision = file_checksum(output_weights)
    manifest = {
        "schema": SCHEMA,
        "status": "UNTRAINED_STANDALONE_INITIALIZATION",
        "canonicalAuthority": False,
        "trainingPerformed": False,
        "promotionPerformed": False,
        "source": {
            "checkpointDir": str(checkpoint_dir),
            "weights": str(source_weights),
            "weightsChecksum": source_revision,
            "configChecksum": file_checksum(source_config),
        },
        "artifact": {
            "outputDir": str(output_dir),
            "weights": str(output_weights),
            "weightsChecksum": artifact_revision,
            "configChecksum": file_checksum(output_dir / "config.json"),
            "tokenizerChecksum": file_checksum(output_dir / "tokenizer.json"),
            "dtype": "bfloat16",
        },
        "derivedConfig": {
            "runtimeClass": "Gemma4ForCausalLM",
            "hiddenSize": inventory["config"].hidden_size,
            "numHiddenLayers": inventory["config"].num_hidden_layers,
            "numAttentionHeads": inventory["config"].num_attention_heads,
            "numKeyValueHeads": inventory["config"].num_key_value_heads,
            "numKvSharedLayers": inventory["config"].num_kv_shared_layers,
            "useBidirectionalAttention": inventory["config"].use_bidirectional_attention,
            "useCache": inventory["config"].use_cache,
        },
        "tensorInventory": {
            "checkpointTensorCount": source_tensor_count,
            "inheritedTensorCount": len(inventory["loaded"]),
            "inheritedTensorNames": sorted(inventory["loaded"]),
            "initializedStandaloneAttentionTensorCount": len(inventory["initialized"]),
            "initializedStandaloneAttentionTensorNames": sorted(inventory["initialized"]),
            "rankHeadTensorNames": ["atlas.rank_head.weight", "atlas.rank_head.bias"],
            "exportedTensorCount": len(state),
            "shapeMismatches": inventory["shapeMismatches"],
        },
        "checkpointMutated": False,
        "forwardExecuted": False,
        "cudaAllocated": False,
        "observedAt": datetime.now(timezone.utc).isoformat(),
    }
    manifest["artifactManifestChecksum"] = checksum(manifest)
    (output_dir / "atlas-rank-manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=17)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    manifest = export_artifact(
        args.checkpoint_dir,
        args.output_dir,
        seed=args.seed,
        overwrite=args.overwrite,
    )
    print(json.dumps({
        "schema": manifest["schema"],
        "status": manifest["status"],
        "inheritedTensorCount": manifest["tensorInventory"]["inheritedTensorCount"],
        "initializedStandaloneAttentionTensorCount": manifest["tensorInventory"]["initializedStandaloneAttentionTensorCount"],
        "exportedTensorCount": manifest["tensorInventory"]["exportedTensorCount"],
        "artifactWeightsChecksum": manifest["artifact"]["weightsChecksum"],
        "outputDir": str(args.output_dir),
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
