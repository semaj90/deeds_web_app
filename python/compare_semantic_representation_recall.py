"""Compares knn_recall@k across semantic_768, MRL-truncated EmbeddingGemma projections
(semantic_mrl_128/256), and the learned NestedSemanticAutoencoder latents (latent_128/latent_64).

This does NOT retrain or re-embed anything. It reads the same canonical semantic_768 source
(codebase_chunk_index.content_embedding) used by train_latent_autoencoder.py, reproduces the
IDENTICAL source-grouped held-out validation split (same seed, same val_fraction) so results are
directly comparable to the knn_recall_128/knn_recall_64 figures already recorded in
docs/reports/latent-autoencoder-training-receipt-v2-full01.json, and loads the trained checkpoint
for the learned latents.

MRL truncation here means prefix + L2-renormalize, matching this repo's existing hard rule
(root CLAUDE.md, Embedding Dimensions Policy): "lower-dimensional projections ... may only be
produced from a 768-dim source that has already been indexed and validated". semantic_768 here is
that already-indexed source (55,169 populated rows).

canonical_authority is always false: this is a benchmark for a possible future field, not itself
a canonical representation or a schema-promotion decision.
"""

from __future__ import annotations

import argparse
from hashlib import sha256
import json
import os
import sys

import numpy as np
import torch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "atlas_compute"))
from latent_autoencoder import (  # noqa: E402
    NestedAutoencoderConfig,
    NestedSemanticAutoencoder,
    exact_knn_indices,
    knn_recall,
)

from train_latent_autoencoder import (  # noqa: E402
    DEFAULT_DATABASE_URL,
    fetch_semantic_768,
    source_grouped_split,
)


def mrl_truncate(source_norm: np.ndarray, dims: int) -> np.ndarray:
    """Matryoshka-style prefix truncation + L2 renormalize. Not a learned projection —
    EmbeddingGemma's own native MRL training makes prefix truncation meaningful."""
    truncated = source_norm[:, :dims]
    norms = np.linalg.norm(truncated, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1.0, norms)
    return truncated / norms


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL))
    parser.add_argument("--limit", type=int, default=0, help="0 = full corpus")
    parser.add_argument("--val-fraction", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=684453, help="must match the training run's split seed for a fair comparison")
    parser.add_argument("--checkpoint", default="python/checkpoints/nested_semantic_autoencoder_v3_full01.pt")
    parser.add_argument("--k", type=int, default=10)
    parser.add_argument("--out", default="docs/reports/semantic-representation-recall-comparison-v1.json")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    print(json.dumps({"event": "fetching_data", "limit": args.limit}))
    ids, source_refs, vectors = fetch_semantic_768(args.database_url, args.limit)
    print(json.dumps({"event": "data_fetched", "row_count": len(ids), "embedding_dim": vectors.shape[1]}))

    train_idx, val_idx, train_source_count, val_source_count = source_grouped_split(
        source_refs, args.val_fraction, args.seed
    )
    print(json.dumps({
        "event": "split",
        "policy": "SOURCE_REF_GROUPED_V1",
        "train_rows": int(len(train_idx)),
        "val_rows": int(len(val_idx)),
        "train_source_count": int(train_source_count),
        "val_source_count": int(val_source_count),
    }))

    val_768 = vectors[val_idx]
    val_norm = val_768 / np.linalg.norm(val_768, axis=1, keepdims=True)

    model = NestedSemanticAutoencoder(NestedAutoencoderConfig())
    state_dict = torch.load(args.checkpoint, map_location=device, weights_only=True)
    model.load_state_dict(state_dict)
    model.to(device)
    model.eval()

    with torch.no_grad():
        val_tensor = torch.from_numpy(val_768).to(device)
        latent256, latent128, latent64 = model.encode(val_tensor)
        latent256_np = latent256.detach().cpu().numpy()
        latent128_np = latent128.detach().cpu().numpy()
        latent64_np = latent64.detach().cpu().numpy()

    mrl_128 = mrl_truncate(val_norm, 128)
    mrl_256 = mrl_truncate(val_norm, 256)
    mrl_512 = mrl_truncate(val_norm, 512)

    representations = {
        "semantic_mrl_128": {"dims": 128, "vectors": mrl_128, "kind": "NATIVE_MRL_TRUNCATION"},
        "semantic_mrl_256": {"dims": 256, "vectors": mrl_256, "kind": "NATIVE_MRL_TRUNCATION"},
        "semantic_mrl_512": {"dims": 512, "vectors": mrl_512, "kind": "NATIVE_MRL_TRUNCATION"},
        "latent_64": {"dims": 64, "vectors": latent64_np, "kind": "LEARNED_AUTOENCODER"},
        "latent_128": {"dims": 128, "vectors": latent128_np, "kind": "LEARNED_AUTOENCODER"},
        "latent_256": {"dims": 256, "vectors": latent256_np, "kind": "LEARNED_AUTOENCODER"},
    }

    results = {}
    for name, entry in representations.items():
        recall = knn_recall(val_norm, entry["vectors"], args.k)
        results[name] = {"dims": entry["dims"], "kind": entry["kind"], f"knn_recall_at_{args.k}": recall}
        print(json.dumps({"event": "recall_computed", "representation": name, **results[name]}))

    row_identity_checksum = sha256("".join(sorted(ids[i] for i in val_idx)).encode("utf-8")).hexdigest()

    receipt = {
        "schema": "atlas.semantic-representation-recall-comparison.v1",
        "canonical_authority": False,
        "note": "Benchmark only. Does not promote any representation or authorize a new schema field.",
        "k": args.k,
        "val_row_count": int(len(val_idx)),
        "val_source_count": int(val_source_count),
        "val_row_identity_checksum": row_identity_checksum,
        "split_seed": args.seed,
        "split_policy": "SOURCE_REF_GROUPED_V1",
        "checkpoint_path": args.checkpoint,
        "device": str(device),
        "results": results,
        "ground_truth": "exact cosine top-k over the same held-out semantic_768 rows (L2-normalized), per representation",
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(receipt, fh, indent=2)
    print(json.dumps({"event": "receipt_written", "path": args.out}))
    print(json.dumps({"status": "RECALL_COMPARISON_PROVEN", "results": results}))


if __name__ == "__main__":
    main()
