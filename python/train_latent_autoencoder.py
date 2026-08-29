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

import argparse
import json
import os
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


def fetch_semantic_768(database_url: str, limit: int) -> tuple[list[str], np.ndarray]:
    """Read-only. Returns (chunk_ids, embeddings[N,768])."""
    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            sql = "SELECT id::text AS id, content_embedding FROM codebase_chunk_index WHERE content_embedding IS NOT NULL ORDER BY id"
            if limit > 0:
                sql += f" LIMIT {int(limit)}"
            cur.execute(sql)
            rows = cur.fetchall()
    finally:
        conn.close()
    ids = [row["id"] for row in rows]
    # pgvector returns a string like "[0.1,0.2,...]" via psycopg2 without a registered adapter.
    vectors = np.array(
        [np.fromstring(row["content_embedding"].strip("[]"), sep=",", dtype=np.float32) for row in rows],
        dtype=np.float32,
    )
    return ids, vectors


def row_identity_checksum(ids: list[str]) -> str:
    digest = sha256()
    for chunk_id in sorted(ids):
        digest.update(chunk_id.encode("utf-8"))
    return digest.hexdigest()


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
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(json.dumps({"event": "device_selected", "device": str(device), "cuda_available": torch.cuda.is_available()}))
    if device.type == "cpu":
        print(json.dumps({"event": "NO_FALLBACK_NOTICE", "message": "CUDA unavailable; training on CPU. This is logged explicitly, not silent."}))

    print(json.dumps({"event": "fetching_data", "limit": args.limit}))
    ids, embeddings = fetch_semantic_768(args.database_url, args.limit)
    if len(ids) == 0:
        print(json.dumps({"status": "FAILED", "reason": "no rows fetched"}))
        sys.exit(1)
    print(json.dumps({"event": "data_fetched", "row_count": len(ids), "embedding_dim": embeddings.shape[1]}))

    rng = np.random.default_rng(seed=0xA71A5)
    perm = rng.permutation(len(ids))
    val_count = max(1, int(len(ids) * args.val_fraction))
    val_idx, train_idx = perm[:val_count], perm[val_count:]

    train_tensor = torch.from_numpy(embeddings[train_idx]).to(device)
    val_tensor = torch.from_numpy(embeddings[val_idx]).to(device)
    print(json.dumps({"event": "split", "train_rows": len(train_idx), "val_rows": len(val_idx)}))

    config = NestedAutoencoderConfig()
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
    receipt["receipt_checksum"] = receipt_checksum(receipt)

    os.makedirs(os.path.dirname(args.receipt_out) or ".", exist_ok=True)
    with open(args.receipt_out, "w", encoding="utf-8") as f:
        json.dump(receipt, f, indent=2)
    print(json.dumps({"event": "receipt_written", "path": args.receipt_out}))
    print(json.dumps({"status": "TRAINING_RECEIPT_PROVEN", "receipt": receipt}))


if __name__ == "__main__":
    main()
