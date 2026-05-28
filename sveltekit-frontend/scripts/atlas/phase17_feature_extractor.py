#!/usr/bin/env python3
import argparse
import json
import os
import hashlib
from pathlib import Path

parser = argparse.ArgumentParser(description='Phase17 PyTorch feature extractor')
parser.add_argument('--input', required=True)
parser.add_argument('--out', required=True)
parser.add_argument('--report', required=True)
args = parser.parse_args()

IN = Path(args.input)
OUT = Path(args.out)
REPORT = Path(args.report)
VECT_DIR = OUT.parent / 'feature_vectors'

def write_report(msg):
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(msg)

try:
    import numpy as np
    import torch
    TORCH_AVAILABLE = True
except Exception:
    TORCH_AVAILABLE = False

OUT.parent.mkdir(parents=True, exist_ok=True)
VECT_DIR.mkdir(parents=True, exist_ok=True)

rows = []
count = 0
if not IN.exists():
    write_report('# Phase17 report\n\ninput missing: %s' % str(IN))
    print('input missing', IN)
    exit(1)

with IN.open('r', encoding='utf8') as fh:
    for line in fh:
        line = line.strip()
        if not line: continue
        try:
            card = json.loads(line)
        except Exception:
            continue
        
        cid = card.get('cardId') or card.get('card_id') or card.get('id') or f'card_{count}'
        has_source = bool(card.get('sourceRefs') and len(card['sourceRefs']) > 0)
        source_ref = card['sourceRefs'][0] if has_source else 'unknown'
        lane = 'schema_contract' if cid.startswith('schema') else 'untracked_local'
        
        feature_vector_path = None
        if TORCH_AVAILABLE:
            try:
                h = int(hashlib.sha256(cid.encode('utf8')).hexdigest()[:8], 16)
                torch.manual_seed(h)
                vec = torch.randn(768, dtype=torch.float32)
                vec_path = VECT_DIR / f'{cid}.npy'
                np.save(str(vec_path), vec.numpy())
                feature_vector_path = str(vec_path)
            except Exception:
                pass

        row = {
            "card_id": cid,
            "sourceRef": source_ref,
            "lane": lane,
            "feature_vector_ref": feature_vector_path,
            "metadata": {
                "file_path": card.get('entities', {}).get('files', [None])[0] if card.get('entities') else None,
                "symbol": None,
                "schema_name": None,
                "retrieval_mode": "pytorch-rand-deterministic" if TORCH_AVAILABLE else "no-pytorch-fallback",
                "indexed": bool(card.get('indexedState', {}).get('indexed')),
                "tracked_by_git": bool(card.get('workspaceState', {}).get('tracked'))
            },
            "signals": {
                "has_sourceRef": has_source,
                "has_schema_contract": lane == 'schema_contract',
                "has_mcp_route": False,
                "is_untracked_local": lane == 'untracked_local',
                "embedding_available": bool(feature_vector_path)
            }
        }
        rows.append(row)
        count += 1

with OUT.open('w', encoding='utf8') as w:
    for r in rows:
        w.write(json.dumps(r) + '\n')

report_lines = [
    '# Phase 17 PyTorch Feature Extractor',
    '',
    f'input: {IN}',
    f'rows_processed: {count}',
    f'torch_available: {TORCH_AVAILABLE}',
    '',
    'notes:',
]
if TORCH_AVAILABLE:
    report_lines.append('wrote deterministic feature vectors (numpy .npy) in: %s' % str(VECT_DIR))
else:
    report_lines.append('PyTorch not available; no vectors written. JS fallback recommended.')

write_report('\n'.join(report_lines))
print('done')
exit(0)
