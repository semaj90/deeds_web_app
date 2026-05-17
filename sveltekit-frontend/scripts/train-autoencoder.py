#!/usr/bin/env python3
"""
train-autoencoder.py

Contrastive autoencoder 768→64→768 on codebase embeddings.
Runs on RTX 3060 Ti locally (~30 sec for 30 epochs on 3K embeddings).
Full backprop through encoder+decoder via PyTorch autograd.

VRAM budget: ~1.6MB weights + ~12MB activations = negligible.
Gemma4 (5.3GB) can stay loaded — no conflict.

Usage:
    python scripts/train-autoencoder.py
    python scripts/train-autoencoder.py --epochs 50 --lr 0.001
    python scripts/train-autoencoder.py --dry-run
    python scripts/train-autoencoder.py --resume

Output:
    Redis  ace:autoencoder:weights  (W1,b1,W2,b2,W3,b3,W4,b4 as CSV)
    Redis  ace:autoencoder:meta     (hash of run stats — trainedAt, bestLoss, epochs, n, …)
    File   logs/task-output/pipeline-test/autoencoder-train-<ts>.json
"""

import argparse, json, os, sys, time
from datetime import datetime, timezone
from pathlib import Path

# Fix UnicodeEncodeError on Windows cp1252 consoles (arrow/em-dash chars)
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import requests
import redis
import torch
import torch.nn as nn
import torch.nn.functional as F

# ── Args ──────────────────────────────────────────────────────────────────────
p = argparse.ArgumentParser()
p.add_argument("--epochs",   type=int,   default=30)
p.add_argument("--lr",       type=float, default=5e-4)
p.add_argument("--batch",    type=int,   default=128)
p.add_argument("--dry-run",  action="store_true")
p.add_argument("--resume",   action="store_true")
args = p.parse_args()

QDRANT_URL  = os.environ.get("QDRANT_URL",  "http://localhost:6333")
REDIS_URL   = os.environ.get("REDIS_URL",   "redis://127.0.0.1:6379")
COLLECTION  = "codebase_chunks_768"
DIM_IN      = 768
DIM_HIDDEN  = 256
DIM_LATENT  = 64

LOG_DIR = Path(__file__).parent.parent / "logs" / "task-output" / "pipeline-test"
LOG_DIR.mkdir(parents=True, exist_ok=True)
stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")

# ── Device ────────────────────────────────────────────────────────────────────
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
if device.type == "cuda":
    free, total = torch.cuda.mem_get_info()
    print(f"[ae-train] GPU: {torch.cuda.get_device_name()} — "
          f"{free/1e9:.1f}/{total/1e9:.1f} GB free")
else:
    print("[ae-train] CPU mode (GPU not available)")

# ── Model ─────────────────────────────────────────────────────────────────────
class Autoencoder(nn.Module):
    def __init__(self):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(DIM_IN, DIM_HIDDEN), nn.ReLU(),
            nn.Linear(DIM_HIDDEN, DIM_LATENT),
        )
        self.decoder = nn.Sequential(
            nn.Linear(DIM_LATENT, DIM_HIDDEN), nn.ReLU(),
            nn.Linear(DIM_HIDDEN, DIM_IN),
        )

    def encode(self, x):
        z = self.encoder(x)
        return F.normalize(z, dim=-1)  # L2-norm → cosine distance works in 64-dim

    def forward(self, x):
        z   = self.encode(x)
        x_r = self.decoder(z)
        return x_r, z

model = Autoencoder().to(device)
_n_params = sum(param.numel() for param in model.parameters())
print(f"[ae-train] Parameters: {_n_params:,} ({_n_params * 4 / 1e6:.2f} MB)")

# ── Load Qdrant embeddings ────────────────────────────────────────────────────
def fetch_embeddings():
    print(f"[ae-train] Fetching embeddings from Qdrant {COLLECTION}...")
    vecs, offset = [], None
    while True:
        body = {"limit": 250, "with_vector": True, "with_payload": False}
        if offset:
            body["offset"] = offset
        r = requests.post(f"{QDRANT_URL}/collections/{COLLECTION}/points/scroll",
                          json=body, timeout=30)
        r.raise_for_status()
        data = r.json()
        pts  = data["result"]["points"]
        if not pts:
            break
        for pt in pts:
            v = pt.get("vector", {})
            vec = v.get("content", v) if isinstance(v, dict) else v
            if isinstance(vec, list) and len(vec) == DIM_IN:
                vecs.append(vec)
        offset = data["result"].get("next_page_offset")
        print(f"\r[ae-train] Loaded {len(vecs)} embeddings...", end="", flush=True)
        if offset is None:
            break
    print(f"\n[ae-train] Total: {len(vecs)} embeddings")
    return torch.tensor(vecs, dtype=torch.float32)

data = fetch_embeddings()

if len(data) < 100:
    print("[ae-train] Too few embeddings — run npm run graphify:semantic first")
    sys.exit(0)

if args.dry_run:
    print(f"[ae-train] DRY RUN — {len(data)} embeddings ready, "
          f"would train {args.epochs} epochs @ batch={args.batch}")
    sys.exit(0)

# ── Resume from Redis weights ─────────────────────────────────────────────────
r = redis.from_url(REDIS_URL, decode_responses=True)

if args.resume:
    try:
        saved = r.hgetall("ace:autoencoder:weights")
        if saved.get("W1"):
            names  = ["W1","b1","W2","b2","W3","b3","W4","b4"]
            params = list(model.parameters())
            for i, name in enumerate(names):
                arr = torch.tensor([float(x) for x in saved[name].split(",")],
                                   dtype=torch.float32)
                params[i].data.copy_(arr.reshape(params[i].shape))
            print("[ae-train] Resumed from Redis ace:autoencoder:weights")
    except Exception as e:
        print(f"[ae-train] Resume failed: {e} — starting fresh")

# ── Training ──────────────────────────────────────────────────────────────────
opt       = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)
data      = data.to(device)

print(f"[ae-train] Training {args.epochs} epochs, "
      f"batch={args.batch}, lr={args.lr}, device={device}\n")

best_loss = float("inf")
losses    = []
t0        = time.time()

for epoch in range(args.epochs):
    model.train()
    idx      = torch.randperm(len(data), device=device)
    ep_loss  = 0.0
    n_batch  = 0

    for s in range(0, len(data), args.batch):
        X = data[idx[s : s + args.batch]]
        if len(X) < 2:
            continue

        # ── Forward ───────────────────────────────────────────────────────────
        X_hat, z = model(X)

        # Reconstruction loss
        rec_loss = F.mse_loss(X_hat, X)

        # Contrastive loss with genuine positives: use 768d nearest neighbours
        # within the batch as positives (truly similar pairs), random permutation
        # of the batch as negatives.  The original scheme used random-batch
        # halves as "positives" — statistically identical to negatives — causing
        # mode collapse.  NN-positives give the encoder a real separation signal.
        if len(X) >= 4:
            with torch.no_grad():
                X_n    = F.normalize(X, dim=-1)
                sim768 = torch.mm(X_n, X_n.t())        # (B, B) cosine sims in 768d
                sim768.fill_diagonal_(-2.0)             # exclude self
                nn_idx = sim768.argmax(dim=1)           # closest neighbour per sample
            pos       = z[nn_idx]                       # 64d latent of 768d NN
            neg_i     = torch.randperm(len(X), device=device)
            neg       = z[neg_i]
            sim_pos   = F.cosine_similarity(z, pos, dim=-1)
            sim_neg   = F.cosine_similarity(z, neg, dim=-1)
            cont_loss = F.relu(0.5 - sim_pos + sim_neg).mean()
            loss      = rec_loss + 0.1 * cont_loss
        else:
            loss = rec_loss

        # ── Backward ──────────────────────────────────────────────────────────
        opt.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()

        ep_loss += loss.item()
        n_batch  += 1

    scheduler.step()
    avg = ep_loss / max(n_batch, 1)
    losses.append(avg)
    if avg < best_loss:
        best_loss = avg

    arrow = "v" if avg <= (losses[-2] if len(losses) > 1 else 999) else "-"
    print(f"\r  Epoch {epoch+1:3d}/{args.epochs}  "
          f"loss={avg:.6f} {arrow}  best={best_loss:.6f}  "
          f"lr={scheduler.get_last_lr()[0]:.2e}",
          end="", flush=True)

elapsed = time.time() - t0
print(f"\n\n[ae-train] Done in {elapsed:.1f}s — best_loss={best_loss:.6f}")

# ── Save weights to Redis ─────────────────────────────────────────────────────
params     = list(model.parameters())
param_keys = ["W1", "b1", "W2", "b2", "W3", "b3", "W4", "b4"]
weight_map = {}
for key, param in zip(param_keys, params):
    weight_map[key] = ",".join(f"{v:.6f}" for v in param.data.cpu().flatten().tolist())

r.hset("ace:autoencoder:weights", mapping=weight_map)
r.expire("ace:autoencoder:weights", 7 * 24 * 3600)

meta = {
    "trainedAt": datetime.now(timezone.utc).isoformat(),
    "epochs": args.epochs, "lr": args.lr, "batch": args.batch,
    "n": len(data), "bestLoss": best_loss, "elapsedSec": round(elapsed, 1),
    "dimIn": DIM_IN, "dimHidden": DIM_HIDDEN, "dimLatent": DIM_LATENT,
    "device": str(device), "gpu": torch.cuda.get_device_name() if device.type == "cuda" else None,
    "architecture": f"{DIM_IN}-{DIM_HIDDEN}-{DIM_LATENT}-{DIM_HIDDEN}-{DIM_IN}",
    "activation": "relu",
    "latentNorm": "l2",
}
r.delete("ace:autoencoder:meta")  # clear old string key if present
r.hset("ace:autoencoder:meta", mapping={k: str(v) for k, v in meta.items() if v is not None})
r.expire("ace:autoencoder:meta", 7 * 24 * 3600)

report = {"status": "PASS", **meta, "losses": losses}
out    = json.dumps(report, indent=2)
(LOG_DIR / f"autoencoder-train-{stamp}.json").write_text(out)
(LOG_DIR / "autoencoder-train-latest.json").write_text(out)

print(f"[ae-train] Weights -> Redis ace:autoencoder:weights (7d TTL)")
print(f"[ae-train] Next: npm run karpathy:gpu  (uses trained encoder in blend)")
