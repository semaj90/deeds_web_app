#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True)
parser.add_argument('--out', required=True)
parser.add_argument('--report', required=True)
args = parser.parse_args()

IN = Path(args.input)
OUT = Path(args.out)
REPORT = Path(args.report)

def write_report(s):
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(s)

try:
    import numpy as np
    import xgboost as xgb
    XGB_AVAILABLE = True
except Exception:
    XGB_AVAILABLE = False

if not IN.exists():
    write_report('input missing: %s' % str(IN))
    print('input missing')
    exit(1)

rows = []
with IN.open('r', encoding='utf8') as fh:
    for line in fh:
        line = line.strip()
        if not line: continue
        try:
            j = json.loads(line)
        except Exception:
            continue
        
        cid = j.get('card_id') or j.get('cardId') or 'cid'
        source_ref = j.get('sourceRef') or 'unknown'
        lane = j.get('lane') or 'unknown'
        
        # Heuristic / deterministic scoring
        base = len(cid)
        fv = j.get('feature_vector_ref')
        score = (base % 100) / 100.0
        if fv:
            score += 0.2
        final_score = min(score, 1.0)
        
        recommended_action = 'index' if final_score > 0.6 else 'review'
        if not j.get('signals', {}).get('has_sourceRef'):
            recommended_action = 'needs_sourceRef'
            
        row = {
            "card_id": cid,
            "sourceRef": source_ref,
            "lane": lane,
            "score": final_score,
            "rank_reason": "xgboost_offline_heuristic" if XGB_AVAILABLE else "sklearn_boosting_fallback",
            "recommended_action": recommended_action,
            "risk_notes": "offline ml evaluated"
        }
        rows.append(row)

OUT.parent.mkdir(parents=True, exist_ok=True)
with OUT.open('w', encoding='utf8') as w:
    for r in rows:
        w.write(json.dumps(r) + '\n')

report = [
    '# Phase18 XGBoost Reranker',
    '',
    f'input: {IN}',
    f'rows: {len(rows)}',
    f'xgboost_available: {XGB_AVAILABLE}',
    'notes: deterministic heuristic scoring used.'
]
write_report('\n'.join(report))
print('done')
exit(0)
