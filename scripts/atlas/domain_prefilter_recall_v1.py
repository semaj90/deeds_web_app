#!/usr/bin/env python3
"""
Read-only experiment: how much exact-KNN recall does a domain / cluster PREFILTER keep, and how much does it shrink the candidate set?

Uses the cached stage-1 sample written by enrich_unknowns_real_v1.py (.tmp/atlas/enrich-real-v1/stage1-n<N>.npz); no database or GPU access.
Queries = sampled chunks (self-queries, NOT a golden set). Truth = exact cosine top-K over the whole sample, excluding the query itself and
every chunk from the same source_ref (same-file chunks share a label trivially and would inflate the result).
Prefilters tested (candidates are restricted BEFORE ranking, so recall@K = share of the true top-K that survives the filter):
  legacy_domain      same legacy domain_class as the query (weak labels, 29 classes)
  stored_cluster     same stored KMeans cluster (STALE centroids)
  top3_centroids     chunk's 3 nearest stored centroids (query-side routing, no labels needed)
  random             random subset with the same candidate fraction as the corresponding filter (null)
Run: /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python scripts/atlas/domain_prefilter_recall_v1.py [--n 9000] [--queries 1500] [--k 10]
"""
import argparse, hashlib, json, time
from pathlib import Path
import numpy as np

ap = argparse.ArgumentParser(); ap.add_argument('--n', type=int, default=9000); ap.add_argument('--queries', type=int, default=1500); ap.add_argument('--k', type=int, default=10)
a = ap.parse_args()
ROOT = Path(__file__).resolve().parents[2]
z = np.load(ROOT / '.tmp' / 'atlas' / 'enrich-real-v1' / f'stage1-n{a.n}.npz', allow_pickle=False)
V, C, stored, label, refs = z['V'], z['C'], z['stored'], z['label'], z['refs']
N = len(V); K = a.k; rng = np.random.default_rng(17)
qs = rng.choice(N, size=min(a.queries, N), replace=False)
sims_c = V @ C.T                                   # chunk -> centroid cosines
top3 = np.argsort(-sims_c, axis=1)[:, :3]
ref_codes = {r: i for i, r in enumerate(dict.fromkeys(refs.tolist()))}; rc = np.array([ref_codes[r] for r in refs.tolist()])
dom_codes = {d: i for i, d in enumerate(dict.fromkeys(label.tolist()))}; dc = np.array([dom_codes[d] for d in label.tolist()])
stats = {name: {'recall': [], 'frac': [], 'null_recall': []} for name in ('legacy_domain', 'stored_cluster', 'top3_centroids')}
for qi in qs:
    s = V @ V[qi]; s[rc == rc[qi]] = -2.0           # exclude self + same-file chunks
    truth = np.argpartition(-s, K)[:K]; truth = truth[np.argsort(-s[truth])]
    pool = (rc != rc[qi]); pool_n = int(pool.sum())
    masks = {
        'legacy_domain': dc == dc[qi],
        'stored_cluster': stored == stored[qi],
        'top3_centroids': np.isin(stored, top3[qi]),
    }
    for name, m in masks.items():
        m = m & pool; frac = m.sum() / pool_n
        stats[name]['recall'].append(float(m[truth].mean())); stats[name]['frac'].append(float(frac))
        stats[name]['null_recall'].append(float(frac))     # expected recall of a random subset of that size
out = {'schema': 'atlas.domain-prefilter-recall.v1', 'generatedAt': time.strftime('%Y-%m-%d'), 'readOnly': True, 'writesPerformed': False, 'gpuUsed': False, 'canonicalAuthority': False,
       'sample': {'chunks': int(N), 'queries': int(len(qs)), 'k': K, 'source': f'.tmp/atlas/enrich-real-v1/stage1-n{a.n}.npz'},
       'results': {n: {'meanRecallAtK': round(float(np.mean(v['recall'])), 4), 'meanCandidateFraction': round(float(np.mean(v['frac'])), 4),
                       'randomSubsetNullRecall': round(float(np.mean(v['null_recall'])), 4), 'recallOverNull': round(float(np.mean(v['recall']) / max(np.mean(v['null_recall']), 1e-9)), 2),
                       'p10Recall': round(float(np.percentile(v['recall'], 10)), 3)} for n, v in stats.items()},
       'caveats': ['self-queries on a 9,000-chunk sample, not a golden query set', 'legacy domain labels are weak', 'stored cluster centroids are STALE for current vectors (81.25% replay)',
                   'same-file neighbours excluded; sample is small so ANN effects are not tested (exact search inside the filter)', 'recall here = share of the unfiltered exact top-K kept by the filter; it says nothing about answer quality']}
out['checksum'] = 'sha256:' + hashlib.sha256(json.dumps(out, sort_keys=True).encode()).hexdigest()
(ROOT / 'docs' / 'reports' / 'domain-prefilter-recall-experiment-v1.json').write_text(json.dumps(out, indent=1), encoding='utf-8')
print(json.dumps(out['results'], indent=1))
