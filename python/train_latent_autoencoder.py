"""Trains NestedSemanticAutoencoder (python/atlas_compute/latent_autoencoder.py) on live
semantic_768 rows.

Reads codebase_chunk_index.content_embedding (Postgres, read-only) as the canonical semantic_768
source per root CLAUDE.md's embedding dimension policy. Writes a checkpoint (.pt) and a
schema-versioned, checksummed training receipt (JSON) alongside it — never writes back to
Postgres, never touches any canonical table.

Usage:
  python train_latent_autoencoder.py --limit 2000 --epochs 20            # bounded proof run
  python train_latent_autoencoder.py --limit 0 --epochs 50 --out ckpt.pt # full corpus
"""
from __future__ import annotations

import os

# Must be set before CUDA initializes (i.e. before `import torch` below actually touches the
# GPU) - torch.use_deterministic_algorithms(True) raises at the first CuBLAS matmul otherwise
# (RuntimeError, confirmed live 2026-08-29: "CUBLAS_WORKSPACE_CONFIG=:4096:8 or :16:8" required
# for deterministic behavior on CUDA >= 10.2, per PyTorch's own error message). This is the
# documented requirement, not a workaround that weakens determinism.
os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")

import argparse
import json
import random
import sys
import time
from hashlib import sha256

import numpy as np
import psycopg2
import psycopg2.extras
import torch
from torch.optim import AdamW

sys.path.insert(0, os.path.dirname(__file__))
from atlas_compute.latent_autoencoder import (
    NestedAutoencoderConfig,
    NestedSemanticAutoencoder,
    build_training_receipt,
    evaluate_nested_latents,
    nested_autoencoder_loss,
    receipt_checksum,
)

DEFAULT_DATABASE_URL = "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db"


def fetch_semantic_768(database_url: str, limit: int) -> tuple[list[str], list[str], np.ndarray]:
    """Read-only. Returns (chunk_ids, source_refs, embeddings[N,768]), ordered by id."""
    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            sql = "SELECT id::text AS id, source_ref, content_embedding FROM codebase_chunk_index WHERE content_embedding IS NOT NULL ORDER BY id"
            if limit > 0:
                sql += f" LIMIT {int(limit)}"
            cur.execute(sql)
            rows = cur.fetchall()
    finally:
        conn.close()
    ids = [row["id"] for row in rows]
    source_refs = [row["source_ref"] or f"__no_source_ref__:{row['id']}" for row in rows]
    # pgvector returns a string like "[0.1,0.2,...]" via psycopg2 without a registered adapter.
    vectors = np.array(
        [np.fromstring(row["content_embedding"].strip("[]"), sep=",", dtype=np.float32) for row in rows],
        dtype=np.float32,
    )
    return ids, source_refs, vectors


def row_identity_checksum(ids: list[str]) -> str:
    digest = sha256()
    for chunk_id in sorted(ids):
        digest.update(chunk_id.encode("utf-8"))
    return digest.hexdigest()


def ordered_row_identity_checksum(ids: list[str]) -> str:
    """Unlike row_identity_checksum (order-independent, set membership only), this binds the
    EXACT ORDER fetch_semantic_768 returned (already ORDER BY id, so deterministic) — proves which
    55,169 vectors were trained, not just that some 55,169-row set was. Two different tables that
    happen to have the same 55,169 ids but different embeddings would still produce different
    semanticMatrixChecksum below; this checksum alone only proves row-set identity + order."""
    digest = sha256()
    for chunk_id in ids:
        digest.update(chunk_id.encode("utf-8"))
    return digest.hexdigest()


def semantic_matrix_checksum(embeddings: np.ndarray) -> str:
    """Checksums the actual ordered FP32 bytes — binds the receipt to the exact vectors trained
    on, not just their row identities. Catches the case row_identity_checksum can't: same ids,
    different embedding values (e.g. a re-embedding run between snapshot and training)."""
    return sha256(np.ascontiguousarray(embeddings, dtype=np.float32).tobytes()).hexdigest()


def source_grouped_split(source_refs: list[str], val_fraction: float, seed: int) -> tuple[np.ndarray, np.ndarray]:
    """Splits by DISTINCT source_ref, not by row — every chunk from one source file lands
    entirely in train or entirely in val, never both. Row-random splitting lets near-duplicate
    chunks from the same file leak across the split, inflating reconstruction/KNN metrics."""
    unique_sources = sorted(set(source_refs))
    rng = np.random.default_rng(seed=seed)
    perm = rng.permutation(len(unique_sources))
    val_source_count = max(1, int(len(unique_sources) * val_fraction))
    val_sources = set(np.array(unique_sources)[perm[:val_source_count]])
    source_array = np.array(source_refs)
    val_mask = np.isin(source_array, list(val_sources))
    val_idx = np.nonzero(val_mask)[0]
    train_idx = np.nonzero(~val_mask)[0]
    return train_idx, val_idx, len(unique_sources) - val_source_count, val_source_count


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL))
    parser.add_argument("--limit", type=int, default=2000, help="0 = full corpus")
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--val-fraction", type=float, default=0.1)
    parser.add_argument("--out", default="latent_autoencoder_checkpoint.pt")
    parser.add_argument("--receipt-out", default="docs/reports/latent-autoencoder-training-receipt-v1.json")
    parser.add_argument("--require-cuda", action="store_true", help="fail closed instead of silently falling back to CPU")
    parser.add_argument("--seed", type=int, default=0xA71A5)
    args = parser.parse_args()

    # Determinism: seed every RNG this run touches, and force deterministic CUDA kernels rather
    # than silently accepting whichever algorithm is fastest. If an op refuses deterministic
    # execution, that's useful evidence to surface, not something to quietly work around.
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.cuda.manual_seed_all(args.seed)
    deterministic_algorithms_enabled = False
    try:
        torch.use_deterministic_algorithms(True)
        deterministic_algorithms_enabled = True
    except Exception as exc:
        print(json.dumps({"event": "DETERMINISM_WARNING", "message": str(exc)}))

    cuda_available = torch.cuda.is_available()
    if args.require_cuda and not cuda_available:
        print(json.dumps({"status": "FAILED", "reason": "CUDA_REQUIRED"}))
        raise RuntimeError("CUDA_REQUIRED")
    device = torch.device("cuda" if cuda_available else "cpu")
    device_info = {"event": "device_selected", "device": str(device), "cuda_available": cuda_available, "require_cuda": args.require_cuda}
    if cuda_available:
        device_info["torch_version"] = torch.__version__
        device_info["cuda_runtime_version"] = torch.version.cuda
        device_info["device_name"] = torch.cuda.get_device_name(0)
        device_info["device_capability"] = list(torch.cuda.get_device_capability(0))
    print(json.dumps(device_info))
    if device.type == "cpu":
        print(json.dumps({"event": "NO_FALLBACK_NOTICE", "message": "CUDA unavailable; training on CPU. This is logged explicitly, not silent. Pass --require-cuda to fail closed instead."}))

    print(json.dumps({"event": "fetching_data", "limit": args.limit}))
    ids, source_refs, embeddings = fetch_semantic_768(args.database_url, args.limit)
    if len(ids) == 0:
        print(json.dumps({"status": "FAILED", "reason": "no rows fetched"}))
        sys.exit(1)
    print(json.dumps({"event": "data_fetched", "row_count": len(ids), "embedding_dim": embeddings.shape[1]}))

    train_idx, val_idx, train_source_count, val_source_count = source_grouped_split(source_refs, args.val_fraction, args.seed)
    train_source_checksum = row_identity_checksum(sorted(set(np.array(source_refs)[train_idx])))
    val_source_checksum = row_identity_checksum(sorted(set(np.array(source_refs)[val_idx])))
    print(json.dumps({
        "event": "split", "policy": "SOURCE_REF_GROUPED_V1",
        "train_rows": len(train_idx), "val_rows": len(val_idx),
        "train_source_count": train_source_count, "val_source_count": val_source_count,
    }))

    train_tensor = torch.from_numpy(embeddings[train_idx]).to(device)
    val_tensor = torch.from_numpy(embeddings[val_idx]).to(device)

    config = NestedAutoencoderConfig(seed=args.seed)
    model = NestedSemanticAutoencoder(config).to(device)
    optimizer = AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)

    started_at = time.time()
    for epoch in range(args.epochs):
        model.train()
        epoch_perm = torch.randperm(train_tensor.shape[0], device=device)
        epoch_loss_sum, batch_count = 0.0, 0
        for start in range(0, train_tensor.shape[0], args.batch_size):
            batch = train_tensor[epoch_perm[start:start + args.batch_size]]
            if batch.shape[0] < 2:
                continue
            optimizer.zero_grad()
            outputs = model(batch)
            loss, _metrics = nested_autoencoder_loss(outputs, config)
            loss.backward()
            optimizer.step()
            epoch_loss_sum += float(loss.detach().cpu())
            batch_count += 1
        avg_loss = epoch_loss_sum / max(batch_count, 1)

        model.eval()
        with torch.no_grad():
            val_outputs = model(val_tensor)
            val_metrics = evaluate_nested_latents(
                semantic_768=val_tensor.cpu().numpy(),
                latent128=val_outputs["latent128"].cpu().numpy(),
                latent64=val_outputs["latent64"].cpu().numpy(),
                decoded128=val_outputs["decoded128"].cpu().numpy(),
                decoded64=val_outputs["decoded64"].cpu().numpy(),
                k=10,
            )
        print(json.dumps({"event": "epoch_complete", "epoch": epoch, "train_avg_loss": avg_loss, "val_metrics": val_metrics}))

    duration_s = time.time() - started_at
    print(json.dumps({"event": "training_complete", "duration_s": duration_s}))

    torch.save(model.state_dict(), args.out)
    print(json.dumps({"event": "checkpoint_saved", "path": args.out}))

    receipt = build_training_receipt(
        model=model,
        source_snapshot_revision=f"codebase_chunk_index:limit={args.limit}:rows={len(ids)}",
        row_identity_checksum=row_identity_checksum(ids),
        metrics=val_metrics,
        producer_revision="atlas.train-latent-autoencoder.2026-08-29.v1",
    )
    receipt["training_duration_s"] = duration_s
    receipt["device"] = str(device)
    receipt["train_rows"] = len(train_idx)
    receipt["val_rows"] = len(val_idx)
    receipt["checkpoint_path"] = args.out
    receipt["seed"] = args.seed
    receipt["deterministic_algorithms"] = deterministic_algorithms_enabled
    receipt["require_cuda"] = args.require_cuda
    # Immutable snapshot binding: source_snapshot_revision alone (limit+rowcount string) doesn't
    # prove WHICH 55,169 vectors were trained - two different table states could produce the same
    # string. These two checksums close that gap: order-bound row identity, and the actual FP32
    # bytes trained on.
    receipt["training_snapshot"] = {
        "schema": "atlas.semantic768-training-snapshot.v1",
        "orderedRowIdentityChecksum": ordered_row_identity_checksum(ids),
        "semanticMatrixChecksum": semantic_matrix_checksum(embeddings),
        "eligibleRowCount": len(ids),
        "embeddingDimension": embeddings.shape[1],
    }
    receipt["split_policy"] = {
        "schema": "atlas.source-grouped-split.v1",
        "splitPolicy": "SOURCE_REF_GROUPED_V1",
        "splitSeed": args.seed,
        "trainSourceCount": train_source_count,
        "validationSourceCount": val_source_count,
        "trainSourceChecksum": train_source_checksum,
        "validationSourceChecksum": val_source_checksum,
        "sourceOverlap": 0,
    }
    if cuda_available:
        receipt["device_info"] = {
            "torchVersion": torch.__version__,
            "cudaRuntimeVersion": torch.version.cuda,
            "deviceName": torch.cuda.get_device_name(0),
            "deviceCapability": list(torch.cuda.get_device_capability(0)),
        }
    receipt["representations"] = {
        "latent_128": {"dimensions": 128, "relationship": "PHYSICAL_BOTTLENECK"},
        "latent_64": {"dimensions": 64, "relationship": "PREFIX_OF_LATENT_128", "prefixLength": 64, "renormalized": True},
    }
    receipt["receipt_checksum"] = receipt_checksum(receipt)

    os.makedirs(os.path.dirname(args.receipt_out) or ".", exist_ok=True)
    with open(args.receipt_out, "w", encoding="utf-8") as f:
        json.dump(receipt, f, indent=2)
    print(json.dumps({"event": "receipt_written", "path": args.receipt_out}))
    print(json.dumps({"status": "TRAINING_RECEIPT_PROVEN", "receipt": receipt}))


if __name__ == "__main__":
    main()
