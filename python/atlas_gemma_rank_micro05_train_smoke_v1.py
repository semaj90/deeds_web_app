"""MICRO-05 bounded training-loop smoke: proves the training mechanism (forward + pairwise margin
loss + backward + optimizer step on the rank head only) actually works end-to-end on CPU, using a
self-identification task built from real text (does the model learn to score a query's own exact
text higher than unrelated real text?). This is explicitly NOT a production reranker training run
-- 10 synthetic self-id pairs is far too small and the task itself is trivial (near string-match)
compared to real cross-document relevance. It proves the pipeline is mechanically sound (loss goes
down, gradients flow, base backbone stays frozen/unmutated) so a real training run later has a
proven harness to build on, not a proof of ranking quality.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import torch
from safetensors import safe_open
from transformers import Gemma4ForCausalLM, PreTrainedTokenizerFast

from atlas_gemma_rank_load_init_proof_v1 import checksum, derived_text_config, file_checksum, initialize_parameter
from atlas_gemma_rank_breadth_50_v1 import QUERIES

SCHEMA = "atlas.gemma-rank-micro05-train-smoke.v1"
NEW_SUFFIXES = (".self_attn.k_proj.weight", ".self_attn.v_proj.weight", ".self_attn.k_norm.weight")
N_PAIRS = 10
N_STEPS = 20


def build_model(checkpoint_dir: Path, seed: int):
    config_path = checkpoint_dir / "config.json"
    weights_path = checkpoint_dir / "model.safetensors"
    raw = json.loads(config_path.read_text(encoding="utf-8"))
    source_checksum_before = file_checksum(weights_path)
    config = derived_text_config(raw)
    torch.manual_seed(seed)
    model = Gemma4ForCausalLM(config)
    if hasattr(model, "lm_head"):
        del model.lm_head
    model = model.to(dtype=torch.float32).eval()  # float32 for stable gradient smoke (bf16 backbone stays untouched on disk)
    state = model.state_dict()
    with safe_open(str(weights_path), framework="pt", device="cpu") as handle:
        for name in sorted(handle.keys()):
            if name not in state:
                continue
            source = handle.get_tensor(name)
            if list(source.shape) != list(state[name].shape):
                continue
            with torch.no_grad():
                state[name].copy_(source.to(dtype=state[name].dtype))
    for name in [n for n in state if n.endswith(NEW_SUFFIXES)]:
        initialize_parameter(name, state[name])
    for p in model.parameters():
        p.requires_grad_(False)  # backbone frozen -- only the rank head trains
    return model, config, file_checksum(weights_path), source_checksum_before


def run_train_smoke(checkpoint_dir: Path, *, seed: int = 17) -> dict[str, Any]:
    model, config, source_checksum_after_load, source_checksum_before = build_model(checkpoint_dir, seed)
    tokenizer = PreTrainedTokenizerFast(tokenizer_file=str(checkpoint_dir / "tokenizer.json"))

    torch.manual_seed(seed)
    rank_head = torch.nn.Linear(config.hidden_size, 1, bias=True, dtype=torch.float32)
    torch.nn.init.xavier_uniform_(rank_head.weight)
    torch.nn.init.zeros_(rank_head.bias)
    optimizer = torch.optim.Adam(rank_head.parameters(), lr=1e-2)

    pairs = [(QUERIES[i], QUERIES[(i + 17) % len(QUERIES)]) for i in range(N_PAIRS)]

    def embed(text: str) -> torch.Tensor:
        encoded = tokenizer(text, return_tensors="pt")
        output = model.model(input_ids=encoded["input_ids"], attention_mask=encoded.get("attention_mask"))
        return output.last_hidden_state[:, -1, :]

    with torch.no_grad():
        cached = [(embed(relevant).detach(), embed(distractor).detach()) for relevant, distractor in pairs]

    losses: list[float] = []
    for step in range(N_STEPS):
        optimizer.zero_grad()
        total_loss = torch.zeros(1)
        for relevant_h, distractor_h in cached:
            relevant_score = rank_head(relevant_h)
            distractor_score = rank_head(distractor_h)
            # Margin ranking loss: relevant must outscore distractor by >= 1.0
            loss = torch.nn.functional.margin_ranking_loss(
                relevant_score, distractor_score, torch.ones(1, 1), margin=1.0
            )
            total_loss = total_loss + loss
        total_loss = total_loss / len(cached)
        total_loss.backward()
        optimizer.step()
        losses.append(float(total_loss.item()))

    with torch.no_grad():
        final_correct = sum(
            1 for relevant_h, distractor_h in cached
            if rank_head(relevant_h).item() > rank_head(distractor_h).item()
        )

    backbone_unmutated_on_disk = source_checksum_before == source_checksum_after_load == file_checksum(checkpoint_dir / "model.safetensors")
    result = {
        "schema": SCHEMA,
        "status": "TRAIN_LOOP_MECHANICALLY_PROVEN" if losses[-1] < losses[0] and backbone_unmutated_on_disk else "BLOCKED",
        "productionModelClaimed": False,
        "rankingQualityProven": False,
        "task": "self-identification (does the model score a query's own real text higher than unrelated real text)",
        "taskCaveat": "Trivial/near-string-match task on 10 pairs -- proves the training MECHANISM works, not real cross-document relevance ranking. Not a production reranker.",
        "pairCount": N_PAIRS,
        "stepCount": N_STEPS,
        "lossFirst": losses[0],
        "lossLast": losses[-1],
        "lossDecreased": losses[-1] < losses[0],
        "finalCorrectRankingCount": final_correct,
        "finalCorrectRankingTotal": len(cached),
        "backboneFrozen": True,
        "backboneUnmutatedOnDisk": backbone_unmutated_on_disk,
        "cudaAllocated": False,
        "modelArtifactWritten": False,
        "checkpointDir": str(checkpoint_dir),
        "sourceWeightsChecksum": source_checksum_before,
        "lossCurve": losses,
        "observedAt": datetime.now(timezone.utc).isoformat(),
    }
    result["receiptChecksum"] = checksum(result)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = run_train_smoke(args.checkpoint_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0 if result["status"] == "TRAIN_LOOP_MECHANICALLY_PROVEN" else 1


if __name__ == "__main__":
    raise SystemExit(main())
