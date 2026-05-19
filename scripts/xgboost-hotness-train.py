#!/usr/bin/env python3
"""
xgboost-hotness-train.py

Phase C XGBoost training skeleton.
Reads models/xgboost-hotness/features.json (produced by xgboost-hotness-score.mjs).
When chunk_hit_log accumulates enough labeled data (gpu_cluster populated + hits),
this script trains an XGBRegressor and exports models/xgboost-hotness/model.json.

Currently: prints feature matrix, validates structure. Training blocked on data collection.
"""
import json
import sys
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FEATURES_PATH = os.path.join(SCRIPT_DIR, '../models/xgboost-hotness/features.json')


def main():
    if not os.path.exists(FEATURES_PATH):
        print('[xgb-train] features.json not found — run npm run xgboost:hotness:score first')
        sys.exit(0)

    with open(FEATURES_PATH) as f:
        data = json.load(f)

    clusters = data['clusters']
    print(f'[xgb-train] {len(clusters)} clusters, ts={data["ts"]}')
    print(f'[xgb-train] Feature matrix ({len(clusters)} samples × 10+ features):')
    print(
        f'  {"cluster":20} {"blend":8} {"points":8} {"hits24h":8} '
        f'{"hits7d":8} {"tags":8} {"langs":8} {"karpCov":8} {"hotness":8}'
    )
    for c in clusters:
        print(
            f'  {("cluster:gpu:" + str(c["clusterId"])):20} '
            f'{c.get("meanBlend", 0):8.3f} '
            f'{c.get("pointCount", 0):8} '
            f'{c.get("hits24h", 0):8} '
            f'{c.get("hits7d", 0):8} '
            f'{c.get("tagCount", 0):8} '
            f'{c.get("languageCount", 0):8} '
            f'{c.get("karpathyCoverage", 0):8.3f} '
            f'{c.get("hotness", 0):8.4f}'
        )

    # Training gate: need >= 5 clusters with labeled hit data
    labeled = [c for c in clusters if c.get('hits7d', 0) > 0]
    if len(labeled) < 5:
        print(
            f'\n[xgb-train] Only {len(labeled)} clusters have hit data. '
            'Accumulate more ACE queries before training.'
        )
        print(
            '[xgb-train] Training SKIPPED — '
            'using weighted heuristic scores from xgboost-hotness-score.mjs'
        )
        return

    try:
        import xgboost as xgb  # noqa: F401
        import numpy as np  # noqa: F401

        feature_keys = [
            'meanBlend', 'pointCount', 'hits24h', 'hits7d',
            'tagCount', 'languageCount', 'karpathyCoverage',
            'maxJaccard', 'meanJaccard', 'neighborCount',
        ]
        X = np.array([[c.get(k, 0) for k in feature_keys] for c in clusters], dtype=np.float32)
        y = np.array([c.get('hotness', 0) for c in clusters], dtype=np.float32)

        print(f'\n[xgb-train] X shape: {X.shape}, y shape: {y.shape}')
        print('[xgb-train] XGBoost available but data threshold not met for production training')
        print('[xgb-train] Increase ACE query volume and rerun once hits7d > 0 for >= 5 clusters')

    except ImportError:
        print('[xgb-train] xgboost not installed: pip install xgboost')


if __name__ == '__main__':
    main()
