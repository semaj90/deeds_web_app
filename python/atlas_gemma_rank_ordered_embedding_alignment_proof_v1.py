"""Read-only ordered-embedding permutation proof for AtlasGemmaRankV1.

The Gemma 4 assistant exposes ``masked_embedding.token_ordering`` because its
embedding rows may use an optimized order.  This proof validates the local
permutation and tokenizer bounds without loading the embedding matrix values,
changing the checkpoint, or claiming alignment with a separate target model.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Iterable, Sequence

from atlas_gemma_rank_checkpoint_inventory_v1 import checksum, file_checksum, load_json


SCHEMA = "atlas.gemma-rank-ordered-embedding-alignment-proof.v1"


def _tokenizer_ids(tokenizer: dict[str, Any]) -> tuple[set[int], dict[str, int]]:
    """Collect tokenizer vocabulary and added-token IDs without a tokenizer runtime."""
    ids: set[int] = set()
    named: dict[str, int] = {}
    model_vocab = tokenizer.get("model", {}).get("vocab", {})
    if isinstance(model_vocab, dict):
        for value in model_vocab.values():
            if isinstance(value, int):
                ids.add(value)

    for entry in tokenizer.get("added_tokens", []):
        if not isinstance(entry, dict) or not isinstance(entry.get("id"), int):
            continue
        token_id = int(entry["id"])
        ids.add(token_id)
        content = entry.get("content")
        if isinstance(content, str):
            named[content] = token_id
    return ids, named


def _special_token_names(tokenizer_config: dict[str, Any]) -> Iterable[str]:
    for key in ("bos_token", "eos_token", "pad_token", "unk_token", "mask_token"):
        value = tokenizer_config.get(key)
        if isinstance(value, str):
            yield value
        elif isinstance(value, dict) and isinstance(value.get("content"), str):
            yield value["content"]


def prove_ordered_embedding_alignment(
    *,
    vocab_size: int,
    embedding_shape: Sequence[int],
    token_ordering: Sequence[int],
    tokenizer_ids: set[int],
    special_token_ids: dict[str, int],
    target_embedding_available: bool = False,
) -> dict[str, Any]:
    """Validate the local ordered-row permutation and its reversible mapping."""
    ordering = [int(value) for value in token_ordering]
    expected_ids = set(range(vocab_size))
    ordering_set = set(ordering)
    permutation = len(ordering) == vocab_size and ordering_set == expected_ids

    inverse: list[int] = []
    round_trip = False
    if permutation:
        inverse = [0] * vocab_size
        for token_id, ordered_row in enumerate(ordering):
            inverse[ordered_row] = token_id
        round_trip = all(inverse[ordering[token_id]] == token_id for token_id in range(vocab_size))

    tokenizer_in_bounds = bool(tokenizer_ids) and all(
        0 <= token_id < vocab_size for token_id in tokenizer_ids
    )
    special_in_bounds = all(
        0 <= token_id < vocab_size for token_id in special_token_ids.values()
    )
    shape_valid = list(embedding_shape) == [vocab_size, int(embedding_shape[1])] if len(embedding_shape) == 2 else False

    sample_ids = sorted({0, 1, 2, vocab_size - 1, *special_token_ids.values()})
    sample_ids = [token_id for token_id in sample_ids if 0 <= token_id < vocab_size]
    samples = [
        {
            "canonicalTokenId": token_id,
            "orderedPosition": inverse[token_id] if round_trip else None,
            "roundTripCanonicalTokenId": (
                ordering[inverse[token_id]] if round_trip else None
            ),
        }
        for token_id in sample_ids
    ]

    target_alignment_proven = bool(target_embedding_available and permutation and round_trip)
    status = (
        "ORDERED_EMBEDDING_PERMUTATION_PROVEN_TARGET_ALIGNMENT_OPEN"
        if shape_valid and permutation and round_trip and tokenizer_in_bounds and special_in_bounds
        else "BLOCKED_ORDERED_EMBEDDING_ALIGNMENT"
    )
    return {
        "schema": SCHEMA,
        "status": status,
        "embeddingShape": list(embedding_shape),
        "vocabSize": vocab_size,
        "tokenOrderingLength": len(ordering),
        "tokenOrderingDirection": "ordered_position_to_canonical_token_id",
        "tokenOrderingIsPermutation": permutation,
        "permutationRoundTrip": round_trip,
        "tokenizerIdCount": len(tokenizer_ids),
        "tokenizerIdsInBounds": tokenizer_in_bounds,
        "specialTokenIds": special_token_ids,
        "specialTokenIdsInBounds": special_in_bounds,
        "sampleMappings": samples,
        "canonicalTargetEmbeddingAvailable": bool(target_embedding_available),
        "canonicalTargetAlignmentProven": target_alignment_proven,
        "targetAlignmentNote": (
            "The local ordered-row permutation is proven; a canonical Gemma4 target "
            "embedding table or verified upstream relabeling fixture is still required."
        ),
        "weightsMutated": False,
        "canonicalAuthority": False,
    }


def inspect(checkpoint_dir: Path) -> dict[str, Any]:
    config_path = checkpoint_dir / "config.json"
    tokenizer_path = checkpoint_dir / "tokenizer.json"
    tokenizer_config_path = checkpoint_dir / "tokenizer_config.json"
    weights_path = checkpoint_dir / "model.safetensors"
    config = load_json(config_path)
    tokenizer = load_json(tokenizer_path)
    tokenizer_config = load_json(tokenizer_config_path)

    from safetensors import safe_open

    with safe_open(str(weights_path), framework="pt") as handle:
        embedding_shape = list(handle.get_slice("model.embed_tokens.weight").get_shape())
        ordering = handle.get_tensor("masked_embedding.token_ordering").cpu().tolist()

    text_config = config.get("text_config", {})
    vocab_size = int(text_config.get("vocab_size") or config.get("vocab_size") or embedding_shape[0])
    tokenizer_ids, added_token_ids = _tokenizer_ids(tokenizer)
    special_token_ids = {
        token: added_token_ids[token]
        for token in _special_token_names(tokenizer_config)
        if token in added_token_ids
    }
    receipt = prove_ordered_embedding_alignment(
        vocab_size=vocab_size,
        embedding_shape=embedding_shape,
        token_ordering=ordering,
        tokenizer_ids=tokenizer_ids,
        special_token_ids=special_token_ids,
    )
    receipt.update({
        "observedAt": datetime.now(timezone.utc).isoformat(),
        "checkpointDir": str(checkpoint_dir),
        "configPath": str(config_path),
        "tokenizerPath": str(tokenizer_path),
        "weightsPath": str(weights_path),
        "weightsChecksum": file_checksum(weights_path),
        "configUseOrderedEmbeddings": config.get("use_ordered_embeddings"),
        "embeddingMatrixLoaded": False,
    })
    receipt["receiptChecksum"] = checksum(receipt)
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    receipt = inspect(args.checkpoint_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "schema": receipt["schema"],
        "status": receipt["status"],
        "embeddingShape": receipt["embeddingShape"],
        "tokenOrderingIsPermutation": receipt["tokenOrderingIsPermutation"],
        "permutationRoundTrip": receipt["permutationRoundTrip"],
        "tokenizerIdsInBounds": receipt["tokenizerIdsInBounds"],
        "canonicalTargetAlignmentProven": receipt["canonicalTargetAlignmentProven"],
        "output": str(args.output),
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
