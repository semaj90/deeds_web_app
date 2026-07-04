#!/usr/bin/env python3
"""
serve-policy-reranker.py

HTTP scoring sidecar for the trained PyTorch policy feedforward reranker.
Drop-in replacement for serve-xgboost-reranker.py — same POST /score contract.

POST /score
  Body: { "rows": [ { "cosine_score": 0.8, "bm25_rank_norm": 0.5, "som_cell_id": 142, ... } ] }
  Returns: { "scores": [0.73, 0.42, ...], "model": "pytorch_policy", "rows": N }

GET /health
  Returns: { "status": "ok", "model_loaded": true, "model_type": "pytorch_policy",
             "n_params": 42369, "ndcg_at_10": 0.73, "use_som": true }

Usage:
    python scripts/atlas/serve-policy-reranker.py
    python scripts/atlas/serve-policy-reranker.py --port=8765
    python scripts/atlas/serve-policy-reranker.py --model=models/policy-reranker.pt
    python scripts/atlas/serve-policy-reranker.py --no-som
"""

import argparse
import json
import math
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT         = Path(__file__).resolve().parent.parent.parent
DEFAULT_PATH = ROOT / 'models' / 'policy-reranker.pt'

SCALAR_FEATURES = [
    'cosine_score', 'bm25_rank_norm', 'ann_turbovec_score', 'concept_overlap',
    'same_feature', 'community_conf', 'reward_prior', 'domain_class_match',
    'freshness_score', 'pagerank_score', 'som_cache_hit', 'packet_hit_count_norm',
    'n_retrieved_norm', 'n_concepts_norm', 'trace_score', 'provenance_git_age',
]
SOM_GRID_SIZE = 400

MODEL        = None
MODEL_META   = {}
DEVICE       = 'cpu'


def load_model(path: Path, no_som: bool = False):
    import torch

    global MODEL, MODEL_META, DEVICE
    DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

    checkpoint = torch.load(str(path), map_location=DEVICE)
    use_som    = checkpoint.get('use_som', True) and not no_som

    # Rebuild model from checkpoint metadata
    import torch.nn as nn
    N_SCALAR    = len(SCALAR_FEATURES)
    SOM_EMB_DIM = 64
    in_dim      = N_SCALAR + (SOM_EMB_DIM if use_som else 0)

    class PolicyRanker(nn.Module):
        def __init__(self):
            super().__init__()
            self.use_som = use_som
            if use_som:
                self.som_embed = nn.Embedding(SOM_GRID_SIZE, SOM_EMB_DIM, padding_idx=0)
            self.net = nn.Sequential(
                nn.Linear(in_dim, 128), nn.BatchNorm1d(128), nn.ReLU(), nn.Dropout(0.30),
                nn.Linear(128, 64),     nn.BatchNorm1d(64),  nn.ReLU(), nn.Dropout(0.20),
                nn.Linear(64, 32),      nn.ReLU(),
                nn.Linear(32, 1),       nn.Sigmoid(),
            )
        def forward(self, x_scalar, x_cell=None):
            if self.use_som and x_cell is not None:
                import torch
                cell_emb = self.som_embed(x_cell)
                x = torch.cat([x_scalar, cell_emb], dim=1)
            else:
                x = x_scalar
            return self.net(x).squeeze(1)

    model = PolicyRanker().to(DEVICE)
    model.load_state_dict(checkpoint['model_state'])
    model.eval()

    MODEL = model
    MODEL_META = {
        'model_type':  'pytorch_policy',
        'model_path':  str(path),
        'n_params':    checkpoint.get('n_params', 0),
        'ndcg_at_10':  checkpoint.get('ndcg_at_10'),
        'mrr_at_10':   checkpoint.get('mrr_at_10'),
        'use_som':     use_som,
        'device':      DEVICE,
        'features':    SCALAR_FEATURES,
    }
    print(f'Loaded PolicyRanker: NDCG@10={MODEL_META["ndcg_at_10"]} device={DEVICE} SOM={use_som}')


def score_rows(rows):
    import torch
    import numpy as np

    def f(row, key):
        v = row.get(key, 0) or 0
        try:    return float(v)
        except: return 0.0

    def apply_norm(row):
        n_retrieved = max(1.0, f(row, 'n_retrieved'))
        hit_count   = f(row, 'packet_hit_count') or f(row, 'packet_hit_count_norm')
        return [
            f(row, 'cosine_score'),
            f(row, 'bm25_rank_norm'),
            f(row, 'ann_turbovec_score'),
            f(row, 'concept_overlap'),
            f(row, 'same_feature'),
            f(row, 'community_conf'),
            min(1.0, f(row, 'reward_prior')),
            f(row, 'domain_class_match'),
            f(row, 'freshness_score'),
            min(1.0, max(0.0, f(row, 'pagerank_score'))),
            f(row, 'som_cache_hit'),
            min(1.0, hit_count / n_retrieved) if hit_count <= 1.0 else min(1.0, hit_count / n_retrieved),
            min(1.0, math.log1p(n_retrieved) / math.log1p(200)),
            min(1.0, f(row, 'n_concepts') / 20.0),
            f(row, 'trace_score'),
            f(row, 'provenance_git_age'),
        ]

    X = np.array([apply_norm(r) for r in rows], dtype=np.float32)
    C = np.array([max(0, min(SOM_GRID_SIZE - 1, int(float(r.get('som_cell_id', 0) or 0)))) for r in rows], dtype=np.int64)

    xs = torch.tensor(X, device=DEVICE)
    cs = torch.tensor(C, device=DEVICE)

    with torch.no_grad():
        scores = MODEL(xs, cs)

    return scores.cpu().numpy().tolist()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args): pass

    def send_json(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path == '/health':
            self.send_json(200, {'status': 'ok', 'model_loaded': MODEL is not None, **MODEL_META})
        else:
            self.send_json(404, {'error': 'not found'})

    def do_POST(self):
        if self.path != '/score':
            self.send_json(404, {'error': 'not found'})
            return
        if MODEL is None:
            self.send_json(503, {'error': 'model not loaded'})
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
            body   = json.loads(self.rfile.read(length))
            rows   = body.get('rows', [])
            if not rows:
                self.send_json(400, {'error': 'rows array required'})
                return
            scores = score_rows(rows)
            self.send_json(200, {'scores': scores, 'model': 'pytorch_policy', 'rows': len(scores)})
        except Exception as e:
            self.send_json(500, {'error': str(e)})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port',   type=int, default=8765)
    parser.add_argument('--host',   default='127.0.0.1')
    parser.add_argument('--model',  default=None)
    parser.add_argument('--no-som', action='store_true')
    args = parser.parse_args()

    path = Path(args.model) if args.model else DEFAULT_PATH
    if not path.exists():
        print(f'ERROR: model not found at {path}')
        print('Run: python scripts/atlas/train-policy-reranker.py')
        sys.exit(1)

    try:
        import torch
    except ImportError:
        print('ERROR: torch not installed. Run: pip install torch')
        sys.exit(1)

    print(f'\n═══ Atlas Policy Reranker Sidecar ═══')
    load_model(path, no_som=args.no_som)
    print(f'Listen: http://{args.host}:{args.port}')
    print(f'Endpoints: GET /health  POST /score\n')

    server = HTTPServer((args.host, args.port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')


if __name__ == '__main__':
    main()
