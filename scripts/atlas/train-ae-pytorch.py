#!/usr/bin/env python3
"""
train-ae-pytorch.py — Real Autoencoder Training: 768 → 128 → 64

Architecture:
  Encoder:  768 → 128  (tanh)   ← semantic preservation layer
            128 →  64  (tanh)   ← routing/cache vector (latent_64)
  Decoder:   64 → 128  (tanh)
            128 → 768  (tanh)   ← reconstruction

Loss: MSE reconstruction  (L2 penalty on latent norms to prevent collapse)
Optimizer: Adam, lr=1e-3, weight_decay=1e-5
Epochs: 60 (early-stop if val loss < 1e-4)

Input:  Qdrant codebase_chunks_768 vectors (768-dim float32)
        OR models/autoencoder/training_vectors.npy if already fetched.

Output (models/autoencoder/):
  W_enc_768_128.npy    — encoder layer 1 weights  [128, 768]
  b_enc_128.npy        — encoder layer 1 bias      [128]
  W_enc_128_64.npy     — encoder layer 2 weights  [64, 128]
  b_enc_64.npy         — encoder layer 2 bias      [64]
  W_dec_64_128.npy     — decoder layer 1 weights  [128, 64]
  b_dec_128.npy        — decoder layer 1 bias      [128]
  W_dec_128_768.npy    — decoder layer 2 weights  [768, 128]
  b_dec_768.npy        — decoder layer 2 bias      [768]
  ae_meta.json         — dims, epoch, val_loss, cuda, timestamp

Usage:
  python scripts/atlas/train-ae-pytorch.py [--epochs 60] [--batch 256] [--dry-run]
  python scripts/atlas/train-ae-pytorch.py --vectors models/autoencoder/training_vectors.npy
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset, random_split

# ── Config ──────────────────────────────────────────────────────────────────

ROOT         = Path(__file__).resolve().parent.parent.parent
MODEL_DIR    = ROOT / "models" / "autoencoder"
QDRANT_URL   = os.getenv("QDRANT_URL", "http://127.0.0.1:6333")
COLLECTION   = os.getenv("AE_QDRANT_COLLECTION", "codebase_chunks_768")
INPUT_DIM    = 768
HIDDEN_DIM   = 128   # semantic layer
LATENT_DIM   = 64    # routing vector
L2_WEIGHT    = 1e-4  # latent norm regularisation

# ── Model ───────────────────────────────────────────────────────────────────

class Autoencoder(nn.Module):
    def __init__(self, input_dim=768, hidden_dim=128, latent_dim=64):
        super().__init__()
        self.enc1 = nn.Linear(input_dim, hidden_dim)
        self.enc2 = nn.Linear(hidden_dim, latent_dim)
        self.dec1 = nn.Linear(latent_dim, hidden_dim)
        self.dec2 = nn.Linear(hidden_dim, input_dim)

    def encode(self, x):
        h = torch.tanh(self.enc1(x))
        return torch.tanh(self.enc2(h))

    def decode(self, z):
        h = torch.tanh(self.dec1(z))
        return torch.tanh(self.dec2(h))

    def forward(self, x):
        z = self.encode(x)
        return self.decode(z), z

# ── Qdrant fetch ─────────────────────────────────────────────────────────────

def fetch_vectors_qdrant(qdrant_url, collection, limit=10000):
    """Scroll Qdrant and return numpy array of vectors."""
    print(f"[fetch] Scrolling {collection} @ {qdrant_url} (limit={limit})...")
    vecs = []
    offset = None
    while True:
        body = json.dumps({"limit": min(250, limit - len(vecs)),
                           "with_payload": False, "with_vector": True,
                           **({"offset": offset} if offset else {})})
        req = urllib.request.Request(
            f"{qdrant_url}/collections/{collection}/points/scroll",
            data=body.encode(), headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.load(r)
        except Exception as e:
            print(f"[fetch] Error: {e}", file=sys.stderr)
            break
        points = data.get("result", {}).get("points", [])
        if not points:
            break
        for p in points:
            vec = p.get("vector")
            if isinstance(vec, dict):
                vec = next(iter(vec.values()), None)  # named vector
            if vec and len(vec) == INPUT_DIM:
                vecs.append(vec)
        next_offset = data.get("result", {}).get("next_page_offset")
        if not next_offset or len(vecs) >= limit:
            break
        offset = next_offset
        print(f"[fetch] {len(vecs)} vectors so far...", end="\r")
    print(f"\n[fetch] Total: {len(vecs)} vectors")
    return np.array(vecs, dtype=np.float32)

# ── Training ─────────────────────────────────────────────────────────────────

def train(args):
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[train] Device: {device}" + (f" ({torch.cuda.get_device_name(0)})" if device.type == "cuda" else ""))

    # Load or fetch vectors
    vec_path = Path(args.vectors) if args.vectors else MODEL_DIR / "training_vectors.npy"
    if vec_path.exists():
        print(f"[train] Loading vectors from {vec_path}")
        X = np.load(str(vec_path))
    else:
        X = fetch_vectors_qdrant(QDRANT_URL, COLLECTION, limit=args.max_vectors)
        if len(X) == 0:
            print("[train] ❌ No vectors fetched — check Qdrant connection and collection name")
            sys.exit(1)
        np.save(str(vec_path), X)
        print(f"[train] Saved {len(X)} vectors to {vec_path}")

    n, d = X.shape
    print(f"[train] Dataset: {n} vectors × {d} dims")
    if d != INPUT_DIM:
        print(f"[train] ❌ Expected {INPUT_DIM}-dim vectors, got {d}")
        sys.exit(1)

    # L2-normalise (cosine space → unit sphere, matches Qdrant cosine metric)
    norms = np.linalg.norm(X, axis=1, keepdims=True).clip(min=1e-8)
    X = X / norms

    if args.dry_run:
        print(f"[dry-run] Would train AE on {n} vectors for {args.epochs} epochs. Exiting.")
        return

    # Build dataset with 90/10 train/val split
    T = torch.from_numpy(X)
    n_val   = max(1, int(n * 0.1))
    n_train = n - n_val
    ds_train, ds_val = random_split(TensorDataset(T), [n_train, n_val])
    dl_train = DataLoader(ds_train, batch_size=args.batch, shuffle=True,  pin_memory=(device.type == "cuda"))
    dl_val   = DataLoader(ds_val,   batch_size=args.batch, shuffle=False, pin_memory=(device.type == "cuda"))

    model = Autoencoder(INPUT_DIM, HIDDEN_DIM, LATENT_DIM).to(device)
    opt   = optim.Adam(model.parameters(), lr=args.lr, weight_decay=1e-5)
    sched = optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs, eta_min=1e-5)
    mse   = nn.MSELoss()

    best_val  = float("inf")
    best_state = None
    t0 = time.time()

    for epoch in range(1, args.epochs + 1):
        model.train()
        train_loss = 0.0
        for (batch,) in dl_train:
            batch = batch.to(device)
            recon, z = model(batch)
            loss = mse(recon, batch) + L2_WEIGHT * z.pow(2).mean()
            opt.zero_grad()
            loss.backward()
            opt.step()
            train_loss += loss.item() * len(batch)
        train_loss /= n_train

        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for (batch,) in dl_val:
                batch = batch.to(device)
                recon, z = model(batch)
                val_loss += mse(recon, batch).item() * len(batch)
        val_loss /= n_val
        sched.step()

        print(f"Epoch {epoch:3d}/{args.epochs}  train={train_loss:.6f}  val={val_loss:.6f}  lr={sched.get_last_lr()[0]:.2e}")

        if val_loss < best_val:
            best_val  = val_loss
            best_state = {k: v.clone() for k, v in model.state_dict().items()}

        if best_val < 1e-4:
            print(f"[train] Early stop at epoch {epoch} — val loss < 1e-4")
            break

    elapsed = time.time() - t0
    print(f"\n[train] Done in {elapsed:.1f}s — best val_loss={best_val:.6f}")

    # Restore best weights
    model.load_state_dict(best_state)

    # Export weights as float32 numpy arrays (row-major, matching C++ bridge convention)
    def w(name):
        return best_state[name].cpu().to(torch.float32).numpy()

    np.save(str(MODEL_DIR / "W_enc_768_128.npy"), w("enc1.weight"))   # [128, 768]
    np.save(str(MODEL_DIR / "b_enc_128.npy"),     w("enc1.bias"))     # [128]
    np.save(str(MODEL_DIR / "W_enc_128_64.npy"),  w("enc2.weight"))   # [64, 128]
    np.save(str(MODEL_DIR / "b_enc_64.npy"),      w("enc2.bias"))     # [64]
    np.save(str(MODEL_DIR / "W_dec_64_128.npy"),  w("dec1.weight"))   # [128, 64]
    np.save(str(MODEL_DIR / "b_dec_128.npy"),     w("dec1.bias"))     # [128]
    np.save(str(MODEL_DIR / "W_dec_128_768.npy"), w("dec2.weight"))   # [768, 128]
    np.save(str(MODEL_DIR / "b_dec_768.npy"),     w("dec2.bias"))     # [768]

    meta = {
        "input_dim":  INPUT_DIM,
        "hidden_dim": HIDDEN_DIM,
        "latent_dim": LATENT_DIM,
        "n_train":    n_train,
        "n_val":      n_val,
        "epochs_run": epoch,
        "best_val_loss": float(best_val),
        "cuda": device.type == "cuda",
        "device": str(device),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "weight_files": [
            "W_enc_768_128.npy", "b_enc_128.npy",
            "W_enc_128_64.npy",  "b_enc_64.npy",
            "W_dec_64_128.npy",  "b_dec_128.npy",
            "W_dec_128_768.npy", "b_dec_768.npy",
        ]
    }
    (MODEL_DIR / "ae_meta.json").write_text(json.dumps(meta, indent=2))

    print(f"\n✅ Weights saved to {MODEL_DIR}/")
    for f in meta["weight_files"]:
        p = MODEL_DIR / f
        print(f"   {f}  ({p.stat().st_size // 1024} KB)")
    print(f"   ae_meta.json")
    print(f"\n→ Next: node scripts/atlas/backfill-latent-vectors.mjs")

# ── CLI ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--epochs",      type=int,   default=60)
    p.add_argument("--batch",       type=int,   default=256)
    p.add_argument("--lr",          type=float, default=1e-3)
    p.add_argument("--max-vectors", type=int,   default=10000)
    p.add_argument("--vectors",     type=str,   default=None,
                   help="Path to pre-fetched .npy file; skips Qdrant scroll")
    p.add_argument("--dry-run",     action="store_true")
    args = p.parse_args()
    train(args)
