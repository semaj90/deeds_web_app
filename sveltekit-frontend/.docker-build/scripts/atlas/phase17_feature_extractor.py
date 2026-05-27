#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path

parser = argparse.ArgumentParser(description='Phase17 PyTorch feature extractor (lightweight)')
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
        line=line.strip()
        if not line: continue
        try:
            card = json.loads(line)
        except Exception:
            continue
        cid = card.get('cardId') or card.get('card_id') or card.get('id') or f'card_{count}'
        meta = {
            'card_id': cid,
            'metadata': {
                'title': card.get('title') or card.get('name'),
            }
        }
        if TORCH_AVAILABLE:
            # create a deterministic pseudo-feature using torch seeded by card id
            try:
                import hashlib
                h = int(hashlib.sha256(cid.encode('utf8')).hexdigest()[:8],16)
                torch.manual_seed(h)
                vec = torch.randn(768, dtype=torch.float32)
                vec_path = VECT_DIR / (cid + '.npy')
                np.save(str(vec_path), vec.numpy())
                meta['feature_vector_ref'] = str(vec_path)
                meta['extraction'] = 'pytorch-rand-deterministic'
            except Exception as e:
                meta['feature_vector_ref'] = None
                meta['extraction'] = 'pytorch-failed'
        else:
            meta['feature_vector_ref'] = None
            meta['extraction'] = 'no-pytorch'

        rows.append(meta)
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
