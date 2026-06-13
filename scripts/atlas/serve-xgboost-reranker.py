#!/usr/bin/env python3
"""
serve-xgboost-reranker.py

Lightweight HTTP scoring sidecar for the trained XGBoost/LightGBM reranker.
Exposes POST /score and GET /health so the SvelteKit atlas cascade can call
it without spawning a Python process per request.

Usage:
    python scripts/atlas/serve-xgboost-reranker.py
    python scripts/atlas/serve-xgboost-reranker.py --port=8765
    python scripts/atlas/serve-xgboost-reranker.py --model=models/lgbm-reranker.txt --lightgbm

POST /score
  Body: { "rows": [ { "cosine_score": 0.8, "bm25_rank_norm": 0.5, ... } ] }
  Returns: { "scores": [0.73, 0.42, ...], "model": "xgboost"|"lightgbm", "rows": N }

GET /health
  Returns: { "status": "ok", "model_loaded": true, "model_type": "xgboost" }
"""

import argparse
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

DEFAULT_XGB_PATH = ROOT / 'models' / 'xgboost-reranker.ubj'
DEFAULT_LGB_PATH = ROOT / 'models' / 'lgbm-reranker.txt'

FEATURE_COLS = [
    # Retrieval signals
    'cosine_score', 'bm25_rank_norm', 'ann_turbovec_score',
    'concept_overlap', 'same_feature', 'community_conf', 'reward_prior',
    'domain_class_match', 'freshness_score', 'pagerank_score',
    # som_cache_hit is a plain binary — valid for tree splits
    # som_cell_id (topology int) is excluded: tree splits on SOM indices have
    # no semantic meaning; SOM routing belongs in the PyTorch policy (Stage 5).
    'som_cache_hit', 'provenance_git_age',
    # Trace context
    'packet_hit_count', 'n_retrieved', 'n_concepts', 'trace_score',
]

# Global model state
MODEL = None
MODEL_TYPE = None


def load_xgboost(path: Path):
    try:
        import xgboost as xgb
    except ImportError:
        print('ERROR: xgboost not installed. Run: pip install xgboost')
        sys.exit(1)

    booster = xgb.Booster()
    booster.load_model(str(path))

    class XGBWrapper:
        def predict(self, rows):
            import xgboost as xgb
            import numpy as np
            X = np.array([[float(r.get(c, 0) or 0) for c in FEATURE_COLS] for r in rows], dtype=np.float32)
            dm = xgb.DMatrix(X, feature_names=FEATURE_COLS)
            return booster.predict(dm).tolist()

    return XGBWrapper(), 'xgboost'


def load_lightgbm(path: Path):
    try:
        import lightgbm as lgb
    except ImportError:
        print('ERROR: lightgbm not installed. Run: pip install lightgbm')
        sys.exit(1)

    model = lgb.Booster(model_file=str(path))

    class LGBWrapper:
        def predict(self, rows):
            import numpy as np
            X = np.array([[float(r.get(c, 0) or 0) for c in FEATURE_COLS] for r in rows], dtype=np.float32)
            return model.predict(X).tolist()

    return LGBWrapper(), 'lightgbm'


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # suppress per-request logs

    def send_json(self, code: int, body: dict):
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
            self.send_json(200, {
                'status': 'ok',
                'model_loaded': MODEL is not None,
                'model_type': MODEL_TYPE,
                'features': FEATURE_COLS,
            })
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
            body = json.loads(self.rfile.read(length))
            rows = body.get('rows', [])
            if not rows:
                self.send_json(400, {'error': 'rows array required'})
                return

            scores = MODEL.predict(rows)
            self.send_json(200, {
                'scores': scores,
                'model': MODEL_TYPE,
                'rows': len(scores),
            })
        except Exception as e:
            self.send_json(500, {'error': str(e)})


def main():
    global MODEL, MODEL_TYPE

    parser = argparse.ArgumentParser()
    parser.add_argument('--port',     type=int,  default=8765)
    parser.add_argument('--host',     default='127.0.0.1')
    parser.add_argument('--model',    default=None, help='Path to model file')
    parser.add_argument('--lightgbm', action='store_true')
    args = parser.parse_args()

    # Resolve model path
    if args.model:
        model_path = Path(args.model)
    elif args.lightgbm:
        model_path = DEFAULT_LGB_PATH
    else:
        model_path = DEFAULT_XGB_PATH

    if not model_path.exists():
        print(f'ERROR: model not found at {model_path}')
        print('Run: python scripts/atlas/train-xgboost-reranker.py')
        sys.exit(1)

    print(f'\n═══ XGBoost Reranker Sidecar ═══')
    print(f'Model: {model_path}')
    print(f'Type:  {"LightGBM" if args.lightgbm else "XGBoost"}')

    if args.lightgbm or str(model_path).endswith('.txt'):
        MODEL, MODEL_TYPE = load_lightgbm(model_path)
    else:
        MODEL, MODEL_TYPE = load_xgboost(model_path)

    print(f'Loaded: {MODEL_TYPE}')
    print(f'Listen: http://{args.host}:{args.port}')
    print(f'Endpoints: GET /health  POST /score\n')

    server = HTTPServer((args.host, args.port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')


if __name__ == '__main__':
    main()
