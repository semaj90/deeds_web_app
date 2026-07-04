#!/usr/bin/env python3
"""
train-policy-reranker.py

PyTorch feedforward policy network for Atlas packet reranking.

WHY this instead of XGBoost:
  - Features are sparse [0,1] signals (cosine, BM25, SOM hits, TurboVec).
    XGBoost overfits sparse binary features because it can carve arbitrarily
    fine splits. A feedforward network with BatchNorm + Dropout learns
    smooth manifolds over sparse inputs without memorizing split boundaries.
  - SOM 20×20 cell embeddings (400 cells → 64-dim learned cell embedding)
    are dense continuous signals that gradient boosting cannot encode natively.
  - Provenance metadata (git diff age, community provenance type, cache hit
    indicator) are ordinal + categorical — best handled via learned embeddings
    and soft activations, not hard inequality splits.
  - Sequential error correction (XGBoost's core mechanism) requires enough
    examples per feature combination. With sparse features, many combos have
    zero support — gradient boosting just sets those leaves to prior.
  - Policy framing: treat the ranker as a policy that maps state
    (retrieval signals) → action (relevance score). This naturally extends
    to GRPO reward shaping later.

Architecture:
  Input (16 scalar features + 64-dim SOM embedding)
  ↓  Linear(80 → 128) + BatchNorm + ReLU + Dropout(0.3)
  ↓  Linear(128 → 64) + BatchNorm + ReLU + Dropout(0.2)
  ↓  Linear(64 → 32)  + ReLU
  ↓  Linear(32 → 1)   + Sigmoid
  Output: relevance score [0, 1]

Features (16 scalars):
  cosine_score          — Qdrant ANN cosine [0,1]
  bm25_rank_norm        — BM25 rank normalized [0,1]
  ann_turbovec_score    — TurboVec scalar rerank score [0,1]
  concept_overlap       — Jaccard(query_concepts, packet_concepts) [0,1]
  same_feature          — binary: feature_id matches
  community_conf        — community_confidence [0,1]
  reward_prior          — reward_prior / 10, clamped [0,1]
  domain_class_match    — binary: domain aligns
  freshness_score       — age-decay [0.1, 1.0]
  pagerank_score        — PageRank blend [0,1]
  som_cache_hit         — binary: SOM cell was a Redis cache hit
  packet_hit_count_norm — hit_count / n_retrieved [0,1]
  n_retrieved_norm      — log1p(n_retrieved) / log1p(200), clamped [0,1]
  n_concepts_norm       — n_concepts / 20, clamped [0,1]
  trace_score           — trace.score [0,1]
  provenance_git_age    — (now - git_mtime) / 365 days, clamped [0,1]

SOM embedding (64-dim):
  som_cell_id (int 0–399) → Embedding(400, 64) → 64-dim learned vector
  Allows the network to learn "which SOM cell regions matter for retrieval".

Loss: ListMLE (listwise) per trace group — optimizes ranking directly.
      Falls back to MSE when a group has only 1 example.

Training:
  Stratified 80/20 split by trace_id (no leakage)
  AdamW optimizer, cosine LR schedule with warm-up
  Early stopping on val NDCG@10 (patience=10)

Gate: NDCG@10 ≥ 0.70 (promotes model to Stage 4 cascade)

Usage:
    python scripts/atlas/train-policy-reranker.py
    python scripts/atlas/train-policy-reranker.py --epochs=50
    python scripts/atlas/train-policy-reranker.py --dry-run
    python scripts/atlas/train-policy-reranker.py --ndcg-gate=0.65
    python scripts/atlas/train-policy-reranker.py --no-som   # skip SOM embedding
"""

import argparse
import csv
import json
import math
import os
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

CSV_PATH     = ROOT / 'docs' / 'reports' / 'xgboost-features.csv'
MODEL_DIR    = ROOT / 'models'
REPORT_DIR   = ROOT / 'docs' / 'reports'
MODEL_PATH   = MODEL_DIR / 'policy-reranker.pt'
REPORT_PATH  = REPORT_DIR / 'policy-reranker-training-report.json'

# ── Feature schema ─────────────────────────────────────────────────────────────

SCALAR_FEATURES = [
    'cosine_score',
    'bm25_rank_norm',
    'ann_turbovec_score',    # new: TurboVec scalar rerank
    'concept_overlap',
    'same_feature',
    'community_conf',
    'reward_prior',
    'domain_class_match',
    'freshness_score',
    'pagerank_score',
    'som_cache_hit',         # new: SOM cell Redis cache hit
    'packet_hit_count_norm', # renamed: hit_count / n_retrieved
    'n_retrieved_norm',      # log-scaled
    'n_concepts_norm',       # / 20
    'trace_score',
    'provenance_git_age',    # new: git mtime decay [0,1]
]

LABEL_COL     = 'label'
ID_COL        = 'trace_id'
SOM_CELL_COL  = 'som_cell_id'   # int 0-399 (20×20 grid), -1 if not assigned
SOM_GRID_SIZE = 400              # 20×20

N_SCALAR      = len(SCALAR_FEATURES)
SOM_EMBED_DIM = 64

# ── NDCG / MRR ────────────────────────────────────────────────────────────────

def ndcg_at_k(rels, k=10):
    dcg  = sum((2**r - 1) / math.log2(i+2) for i, r in enumerate(rels[:k]))
    idcg = sum((2**r - 1) / math.log2(i+2) for i, r in enumerate(sorted(rels, reverse=True)[:k]))
    return dcg / idcg if idcg > 0 else 0.0

def mrr_at_k(rels, k=10):
    for i, r in enumerate(rels[:k]):
        if r > 0:
            return 1.0 / (i+1)
    return 0.0

# ── CSV loading ────────────────────────────────────────────────────────────────

def load_csv(path):
    rows = []
    with open(path, newline='', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            rows.append(row)
    print(f'Loaded {len(rows):,} rows from {path}')
    return rows

def parse_row(row):
    """Parse one CSV row into (scalar_vec, som_cell, label, trace_id)."""
    def f(key, default=0.0):
        v = row.get(key, '') or ''
        try:    return float(v)
        except: return default

    def i(key, default=-1):
        v = row.get(key, '') or ''
        try:    return int(float(v))
        except: return default

    # Remap legacy feature names → new schema
    hit_count   = f('packet_hit_count')
    n_retrieved = max(1.0, f('n_retrieved'))

    scalars = [
        f('cosine_score'),
        f('bm25_rank_norm'),
        f('ann_turbovec_score'),                       # 0 if not in CSV
        f('concept_overlap'),
        f('same_feature'),
        f('community_conf'),
        min(1.0, f('reward_prior')),
        f('domain_class_match'),
        f('freshness_score'),
        min(1.0, max(0.0, f('pagerank_score'))),
        f('som_cache_hit'),                            # 0 if not in CSV
        min(1.0, hit_count / n_retrieved),
        min(1.0, math.log1p(n_retrieved) / math.log1p(200)),
        min(1.0, f('n_concepts') / 20.0),
        f('trace_score'),
        f('provenance_git_age'),                       # 0 if not in CSV
    ]

    som_cell = max(0, min(SOM_GRID_SIZE - 1, i(SOM_CELL_COL, 0)))
    label    = f(LABEL_COL)
    trace_id = row.get(ID_COL, '')

    return scalars, som_cell, label, trace_id

def build_dataset(rows):
    import numpy as np
    X, C, Y, G = [], [], [], []
    for row in rows:
        scalars, cell, label, tid = parse_row(row)
        X.append(scalars)
        C.append(cell)
        Y.append(label)
        G.append(tid)
    return (np.array(X, dtype=np.float32),
            np.array(C, dtype=np.int64),
            np.array(Y, dtype=np.float32),
            G)

def train_val_split(X, C, Y, groups, val_ratio=0.2, seed=42):
    import numpy as np
    unique = list(set(groups))
    rng = np.random.default_rng(seed)
    rng.shuffle(unique)
    n_val = max(1, int(len(unique) * val_ratio))
    val_set   = set(unique[:n_val])
    train_set = set(unique[n_val:])
    tr = [i for i, g in enumerate(groups) if g in train_set]
    va = [i for i, g in enumerate(groups) if g in val_set]
    return (X[tr], C[tr], Y[tr], [groups[i] for i in tr],
            X[va], C[va], Y[va], [groups[i] for i in va])

# ── Model ──────────────────────────────────────────────────────────────────────

def build_model(use_som=True):
    import torch
    import torch.nn as nn

    class PolicyRanker(nn.Module):
        def __init__(self):
            super().__init__()
            self.use_som = use_som

            in_dim = N_SCALAR + (SOM_EMBED_DIM if use_som else 0)

            if use_som:
                # Learned SOM cell embeddings (20×20 = 400 cells)
                self.som_embed = nn.Embedding(SOM_GRID_SIZE, SOM_EMBED_DIM, padding_idx=0)
                nn.init.uniform_(self.som_embed.weight, -0.1, 0.1)

            self.net = nn.Sequential(
                nn.Linear(in_dim, 128),
                nn.BatchNorm1d(128),
                nn.ReLU(),
                nn.Dropout(0.30),

                nn.Linear(128, 64),
                nn.BatchNorm1d(64),
                nn.ReLU(),
                nn.Dropout(0.20),

                nn.Linear(64, 32),
                nn.ReLU(),

                nn.Linear(32, 1),
                nn.Sigmoid(),
            )

        def forward(self, x_scalar, x_cell=None):
            if self.use_som and x_cell is not None:
                cell_emb = self.som_embed(x_cell)
                x = torch.cat([x_scalar, cell_emb], dim=1)
            else:
                x = x_scalar
            return self.net(x).squeeze(1)

    return PolicyRanker()

# ── ListMLE loss (listwise ranking) ──────────────────────────────────────────

def list_mle_loss(scores, labels, groups):
    """
    ListMLE: maximize log-likelihood of the correct ranking.
    For each query group, sort by label descending → compute softmax log-prob.
    Sparse-friendly: groups with all-zero labels fall back to MSE.
    """
    import torch
    import torch.nn.functional as F

    group_indices = defaultdict(list)
    for i, g in enumerate(groups):
        group_indices[g].append(i)

    total_loss = torch.tensor(0.0, requires_grad=True)
    n_groups = 0

    for g, idxs in group_indices.items():
        if len(idxs) < 2:
            continue

        idx_t = torch.tensor(idxs, dtype=torch.long)
        s = scores[idx_t]
        l = labels[idx_t]

        if l.sum() == 0:
            # All labels zero — use MSE as fallback (policy still learns "low relevance")
            total_loss = total_loss + F.mse_loss(s, l)
        else:
            # ListMLE: sort by label desc, compute log-softmax of score differences
            order = torch.argsort(l, descending=True)
            s_ord = s[order]
            # Cumulative softmax trick for ListMLE
            log_probs = []
            for k in range(len(s_ord)):
                top_k_scores = s_ord[k:]
                log_prob = s_ord[k] - torch.logsumexp(top_k_scores, dim=0)
                log_probs.append(log_prob)
            group_loss = -torch.stack(log_probs).mean()
            total_loss = total_loss + group_loss

        n_groups += 1

    return total_loss / max(1, n_groups)

# ── Evaluation ─────────────────────────────────────────────────────────────────

def evaluate(model, X_val, C_val, Y_val, val_groups, k=10, device='cpu'):
    import torch
    model.eval()
    with torch.no_grad():
        xs = torch.tensor(X_val, dtype=torch.float32).to(device)
        cs = torch.tensor(C_val, dtype=torch.long).to(device)
        preds = model(xs, cs).cpu().numpy()

    trace_data = defaultdict(list)
    for i, tid in enumerate(val_groups):
        trace_data[tid].append((float(preds[i]), float(Y_val[i])))

    ndcgs, mrrs = [], []
    for rows in trace_data.values():
        rows_sorted = sorted(rows, key=lambda x: x[0], reverse=True)
        rels = [r[1] for r in rows_sorted]
        ndcgs.append(ndcg_at_k(rels, k))
        mrrs.append(mrr_at_k(rels, k))

    return (sum(ndcgs)/len(ndcgs) if ndcgs else 0.0,
            sum(mrrs)/len(mrrs)   if mrrs  else 0.0,
            len(ndcgs))

# ── Training loop ──────────────────────────────────────────────────────────────

def train(args):
    try:
        import torch
        import torch.optim as optim
        from torch.optim.lr_scheduler import CosineAnnealingLR
        import numpy as np
    except ImportError as e:
        print(f'ERROR: {e}. Run: pip install torch numpy')
        sys.exit(1)

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f'\nDevice: {device}')
    if device == 'cuda':
        print(f'GPU:    {torch.cuda.get_device_name(0)}')

    # Load data
    rows = load_csv(CSV_PATH)
    X, C, Y, groups = build_dataset(rows)
    print(f'Feature matrix: {X.shape} | SOM cells: {C.shape} | labels [{Y.min():.3f}, {Y.max():.3f}]')
    print(f'Positive labels: {(Y>0).sum():,} ({100*(Y>0).mean():.1f}%)')
    print(f'Unique traces:   {len(set(groups)):,}')

    X_tr, C_tr, Y_tr, g_tr, X_va, C_va, Y_va, g_va = train_val_split(X, C, Y, groups)
    print(f'\nTrain: {X_tr.shape[0]:,} rows ({len(set(g_tr))} traces)')
    print(f'Val:   {X_va.shape[0]:,} rows ({len(set(g_va))} traces)')

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    model = build_model(use_som=not args.no_som).to(device)
    n_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f'\nModel: PolicyRanker | {n_params:,} parameters | SOM={not args.no_som}')

    optimizer = optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-5)

    # ── Convert to tensors ───────────────────────────────────────────────────
    Xt  = torch.tensor(X_tr, dtype=torch.float32).to(device)
    Ct  = torch.tensor(C_tr, dtype=torch.long).to(device)
    Yt  = torch.tensor(Y_tr, dtype=torch.float32).to(device)

    # ── Training loop ────────────────────────────────────────────────────────
    best_ndcg    = 0.0
    best_epoch   = 0
    patience_cnt = 0
    history      = []

    BATCH = args.batch

    print(f'\nTraining {args.epochs} epochs, batch={BATCH}, lr={args.lr}')
    print('─' * 60)

    for epoch in range(1, args.epochs + 1):
        model.train()

        # Shuffle
        perm = torch.randperm(Xt.shape[0])
        epoch_loss = 0.0
        n_batches  = 0

        for start in range(0, Xt.shape[0], BATCH):
            idx   = perm[start:start+BATCH]
            xb    = Xt[idx]
            cb    = Ct[idx]
            yb    = Yt[idx]
            gb    = [g_tr[i] for i in idx.tolist()]

            optimizer.zero_grad()
            scores = model(xb, cb)
            loss   = list_mle_loss(scores, yb, gb)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

            epoch_loss += loss.item()
            n_batches  += 1

        scheduler.step()
        avg_loss = epoch_loss / max(1, n_batches)

        # Evaluate every 5 epochs
        if epoch % 5 == 0 or epoch == args.epochs:
            ndcg, mrr, n_traces = evaluate(model, X_va, C_va, Y_va, g_va, device=device)
            history.append({'epoch': epoch, 'loss': round(avg_loss, 6), 'ndcg': round(ndcg, 4), 'mrr': round(mrr, 4)})
            print(f'  Epoch {epoch:3d} | loss={avg_loss:.4f} | NDCG@10={ndcg:.4f} | MRR={mrr:.4f}')

            if ndcg > best_ndcg:
                best_ndcg  = ndcg
                best_epoch = epoch
                patience_cnt = 0
                torch.save({
                    'epoch':       epoch,
                    'model_state': model.state_dict(),
                    'ndcg_at_10':  ndcg,
                    'mrr_at_10':   mrr,
                    'features':    SCALAR_FEATURES,
                    'som_grid':    SOM_GRID_SIZE,
                    'use_som':     not args.no_som,
                    'n_params':    n_params,
                }, str(MODEL_PATH))
            else:
                patience_cnt += 1
                if patience_cnt >= args.patience:
                    print(f'\n  Early stop at epoch {epoch} (patience={args.patience})')
                    break

    print(f'\n  Best NDCG@10={best_ndcg:.4f} at epoch {best_epoch}')
    print(f'  Model saved: {MODEL_PATH}')

    # ── Final evaluation on best model ───────────────────────────────────────
    checkpoint = torch.load(str(MODEL_PATH), map_location=device)
    model.load_state_dict(checkpoint['model_state'])
    final_ndcg, final_mrr, n_traces = evaluate(model, X_va, C_va, Y_va, g_va, device=device)

    gate_pass = final_ndcg >= args.ndcg_gate

    print(f'\n══ Gate ══════════════════════════════════════════')
    print(f'  {"✅" if gate_pass else "❌"} NDCG@10 = {final_ndcg:.4f} (gate ≥{args.ndcg_gate})')
    print(f'  {"✅ GATE PASS — promote PolicyRanker to Stage 4" if gate_pass else "⚠️  GATE FAIL — need more traces or SOM coverage"}')

    report = {
        'generated':    __import__('datetime').datetime.utcnow().isoformat() + 'Z',
        'model_type':   'pytorch_policy_feedforward',
        'architecture': 'Linear(80→128→64→32→1) + BatchNorm + Dropout + SOM_Embed(400,64)',
        'model_path':   str(MODEL_PATH),
        'device':       device,
        'n_params':     n_params,
        'features':     SCALAR_FEATURES,
        'som_grid':     SOM_GRID_SIZE,
        'use_som':      not args.no_som,
        'train_rows':   int(X_tr.shape[0]),
        'val_rows':     int(X_va.shape[0]),
        'val_traces':   n_traces,
        'best_epoch':   best_epoch,
        'ndcg_at_10':   round(final_ndcg, 4),
        'mrr_at_10':    round(final_mrr,  4),
        'ndcg_gate':    args.ndcg_gate,
        'gate_pass':    gate_pass,
        'training_history': history,
        'why_not_xgboost': (
            'XGBoost overfits sparse [0,1] binary features (same_feature, som_cache_hit, '
            'domain_class_match) via arbitrarily fine splits with zero support. '
            'Feedforward + BatchNorm learns smooth relevance manifolds over sparse inputs. '
            'SOM 20×20 cell embeddings are dense continuous signals unsuitable for tree splits. '
            'Policy framing extends naturally to GRPO reward shaping.'
        ),
        'promotion_cmd': (
            'Start sidecar: python scripts/atlas/serve-policy-reranker.py && '
            'set POLICY_RERANKER_PATH env var, restart dev server'
        ) if gate_pass else 'Collect more agent traces with SOM cell assignments and retrain.',
    }

    with open(REPORT_PATH, 'w') as f:
        json.dump(report, f, indent=2)
    print(f'\n  Report: {REPORT_PATH}')

    if not gate_pass:
        sys.exit(1)


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--epochs',    type=int,   default=80)
    parser.add_argument('--batch',     type=int,   default=512)
    parser.add_argument('--lr',        type=float, default=3e-4)
    parser.add_argument('--patience',  type=int,   default=10,  help='Early stop patience (×5 epochs)')
    parser.add_argument('--ndcg-gate', type=float, default=0.70)
    parser.add_argument('--no-som',    action='store_true', help='Skip SOM cell embedding (ablation)')
    parser.add_argument('--dry-run',   action='store_true', help='Validate CSV only, no training')
    args = parser.parse_args()

    print(f'\n═══ Atlas Policy Reranker Training ═══\n')
    print(f'CSV:       {CSV_PATH}')
    print(f'Gate:      NDCG@10 ≥ {args.ndcg_gate}')
    print(f'Epochs:    {args.epochs} (early stop patience {args.patience}×5)')
    print(f'SOM embed: {"YES (400 cells → 64-dim)" if not args.no_som else "NO (ablation)"}')

    if not CSV_PATH.exists():
        print(f'ERROR: {CSV_PATH} not found. Run: npm run atlas:xgboost:export')
        sys.exit(1)

    rows = load_csv(CSV_PATH)
    _, _, Y, groups = build_dataset(rows)
    pos = sum(1 for y in Y if y > 0)
    print(f'Rows: {len(rows):,} | Positive: {pos:,} ({100*pos/max(1,len(rows)):.1f}%) | Traces: {len(set(groups)):,}')

    if args.dry_run:
        print('\n(dry-run — validation only)\n✅ CSV valid and loadable')
        return

    try:
        import numpy  # noqa
        import torch  # noqa
    except ImportError as e:
        print(f'ERROR: {e}. Run: pip install torch numpy')
        sys.exit(1)

    train(args)


if __name__ == '__main__':
    main()
