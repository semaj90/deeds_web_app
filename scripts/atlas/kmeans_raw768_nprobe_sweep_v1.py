#!/usr/bin/env python3
"""
SEARCH-GOLDEN-01 precursor: nprobe sweep over the RAW-recipe K=256 partition. Read-only (DB read for id->source_ref only), CPU, no writes.
Reuses the vector cache from kmeans_raw768_dryrun_v1.py (.tmp/atlas/kmeans-raw768/V0.npy, ids0.json).
Queries = holdout chunks (md5(id)%10==0, never in the fit set); truth = exact cosine top-K over the train set EXCLUDING chunks from the query's own source_ref.
IVF-style probing: assign train rows with the model's Euclidean predict, route a query to its nprobe nearest centroids (Euclidean), search exact inside them.
Reports recall@K and candidate fraction per nprobe, for two seeds, against a random-subset null (recall of a random subset equals its fraction).
This is a self-query proxy, NOT a golden query set.
Run: /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python scripts/atlas/kmeans_raw768_nprobe_sweep_v1.py [--queries 1000] [--k 10]
"""
import argparse, hashlib, json, os, re, sys, time
from pathlib import Path
import numpy as np, psycopg
from sklearn.cluster import MiniBatchKMeans, KMeans

ap = argparse.ArgumentParser(); ap.add_argument('--queries', type=int, default=1000); ap.add_argument('--k', type=int, default=10); ap.add_argument('--K', type=int, default=256); ap.add_argument('--algo', choices=['minibatch', 'lloyd'], default='minibatch')
a = ap.parse_args()
ROOT = Path(__file__).resolve().parents[2]; D = ROOT / '.tmp' / 'atlas' / 'kmeans-raw768'
V = np.load(D / 'V0.npy'); ids = json.loads((D / 'ids0.json').read_text()); X = V / np.linalg.norm(V, axis=1, keepdims=True)
url = os.environ.get('DATABASE_URL')
if not url:
    for line in (ROOT / '.env').read_text(encoding='utf-8', errors='replace').splitlines():
        m = re.match(r'\s*DATABASE_URL\s*=\s*(.+)', line)
        if m: url = m.group(1).strip().strip('"').strip("'")
with psycopg.connect(url, options='-c default_transaction_read_only=on') as conn, conn.cursor() as cur:
    cur.execute('select id::text, coalesce(source_ref, id::text) from codebase_chunk_index where content_embedding_768 is not null order by id')
    ref_of = dict(cur.fetchall())
refs = np.array([ref_of[i] for i in ids]); codes = {r: j for j, r in enumerate(dict.fromkeys(refs.tolist()))}; rc = np.array([codes[r] for r in refs.tolist()])
bucket = np.array([int(hashlib.md5(i.encode()).hexdigest(), 16) % 10 for i in ids]); tr, ho = np.where(bucket != 0)[0], np.where(bucket == 0)[0]
Xtr = X[tr]; rtr = rc[tr]; rng = np.random.default_rng(17); qs = rng.choice(ho, size=min(a.queries, len(ho)), replace=False)
K = a.k; PROBES = [1, 2, 3, 5, 8, 16, 32]
truth = []
for q in qs:
    s = Xtr @ X[q]; s[rtr == rc[q]] = -2.0
    t = np.argpartition(-s, K)[:K]; truth.append(set(t.tolist()))
res = {}
for seed in (42, 43):
    km = (MiniBatchKMeans(n_clusters=a.K, batch_size=4096, n_init=3, max_iter=100, random_state=seed) if a.algo == 'minibatch'
          else KMeans(n_clusters=a.K, n_init=1, max_iter=100, algorithm='lloyd', random_state=seed)).fit(Xtr)
    asg = km.predict(Xtr); C = km.cluster_centers_
    members = [np.where(asg == c)[0] for c in range(a.K)]
    sizes = np.array([len(m) for m in members])
    rows = {}
    for p in PROBES:
        rec, frac = [], []
        for q, tset in zip(qs, truth):
            d = ((C - X[q]) ** 2).sum(1); probe = np.argsort(d)[:p]
            cand = np.concatenate([members[c] for c in probe]); cand = cand[rtr[cand] != rc[q]]
            rec.append(len(tset.intersection(cand.tolist())) / K); frac.append(len(cand) / len(Xtr))
        rows[p] = {'recallAt10': round(float(np.mean(rec)), 4), 'p10Recall': round(float(np.percentile(rec, 10)), 3),
                   'candidateFraction': round(float(np.mean(frac)), 4), 'recallOverNull': round(float(np.mean(rec) / np.mean(frac)), 1)}
        print(seed, p, rows[p], flush=True)
    res[seed] = rows; res[(seed, 'sizes')] = [int(sizes.min()), int(np.median(sizes)), int(sizes.max())]
out = {'schema': 'atlas.kmeans-raw768-nprobe-sweep.v1', 'generatedAt': time.strftime('%Y-%m-%d'), 'readOnly': True, 'writesPerformed': False, 'gpuUsed': False, 'canonicalAuthority': False,
       'recipe': 'RAW content_embedding_768', 'k': a.K, 'train': int(len(tr)), 'queries': int(len(qs)), 'topK': K, 'algo': a.algo, 'bySeed': {str(s): r for s, r in res.items() if not isinstance(s, tuple)}, 'clusterSizesMinMedMax': {str(s[0]): r for s, r in res.items() if isinstance(s, tuple)},
       'caveats': ['self-query proxy (holdout chunks), NOT a golden query set', 'same-source_ref chunks excluded from truth and candidates', 'exact search inside probed clusters; no HNSW/ANN effects',
                   'recall = share of the exact top-K kept by the partition; says nothing about answer quality', 'seed-to-seed ARI ~0.45, so compare seeds before trusting any single number']}
out['checksum'] = 'sha256:' + hashlib.sha256(json.dumps(out, sort_keys=True).encode()).hexdigest()
(ROOT / 'docs' / 'reports' / ('kmeans-raw768-nprobe-sweep-v1.json' if a.algo == 'minibatch' else f'kmeans-raw768-nprobe-sweep-{a.algo}-v1.json')).write_text(json.dumps(out, indent=1), encoding='utf-8')
