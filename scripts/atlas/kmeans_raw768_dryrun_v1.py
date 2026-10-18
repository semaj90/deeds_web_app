#!/usr/bin/env python3
"""
KMEANS-REBUILD-01 CPU dry run on the RAW recipe (codebase_chunk_index.content_embedding_768). Read-only: no DB writes, no GPU, no model rows.
Streams all raw vectors once (checkpointed to .tmp/atlas/kmeans-raw768/V.npy + ids), then fits MiniBatchKMeans K on a deterministic 90% train split
(md5(id) bucket) with two seeds and reports: seed-to-seed ARI, fit-vs-predict replay agreement (euclid and cosine), holdout agreement between the two models,
cluster size spread, inertia. Replay gate from the plan: >= 99%.
Run: /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python scripts/atlas/kmeans_raw768_dryrun_v1.py [--k 256] [--resume]
"""
import argparse, hashlib, json, os, re, sys, time
from pathlib import Path
import numpy as np, psycopg
from sklearn.cluster import MiniBatchKMeans
from sklearn.metrics import adjusted_rand_score

ap = argparse.ArgumentParser(); ap.add_argument('--k', type=int, default=256); ap.add_argument('--resume', action='store_true'); ap.add_argument('--limit', type=int, default=0)
a = ap.parse_args()
ROOT = Path(__file__).resolve().parents[2]; D = ROOT / '.tmp' / 'atlas' / 'kmeans-raw768'; D.mkdir(parents=True, exist_ok=True)
url = os.environ.get('DATABASE_URL')
if not url:
    for line in (ROOT / '.env').read_text(encoding='utf-8', errors='replace').splitlines():
        m = re.match(r'\s*DATABASE_URL\s*=\s*(.+)', line)
        if m: url = m.group(1).strip().strip('"').strip("'")
if not url: sys.exit('DATABASE_URL not found')
DIM = 768; t0 = time.time()
vf, idf = D / f'V{a.limit}.npy', D / f'ids{a.limit}.json'
if a.resume and vf.exists() and idf.exists():
    V = np.load(vf); ids = json.loads(idf.read_text()); print('resumed', V.shape, flush=True)
else:
    with psycopg.connect(url, options='-c default_transaction_read_only=on') as conn:
        with conn.cursor() as cur:
            cur.execute('show transaction_read_only'); assert cur.fetchone()[0] == 'on', 'POSTGRES_READ_ONLY_NOT_CONFIRMED'
            cur.execute('select count(*) from codebase_chunk_index where content_embedding_768 is not null'); total = cur.fetchone()[0]
        n = min(total, a.limit) if a.limit else total
        V = np.empty((n, DIM), dtype=np.float32); ids = []
        with conn.cursor(name='km_raw') as sc:
            sc.itersize = 2000
            sc.execute('select id::text, content_embedding_768::text from codebase_chunk_index where content_embedding_768 is not null order by id' + (f' limit {n}' if a.limit else ''))
            for i, (cid, txt) in enumerate(sc):
                v = np.fromstring(txt.strip('[]'), sep=',', dtype=np.float32)
                if v.shape != (DIM,) or not np.isfinite(v).all(): raise ValueError(f'INVALID_VECTOR:{cid}')
                V[i] = v; ids.append(cid)
                if (i + 1) % 20000 == 0: print('streamed', i + 1, f'{time.time()-t0:.0f}s', flush=True)
    V = V[:len(ids)]; np.save(vf, V); idf.write_text(json.dumps(ids))
nr = np.linalg.norm(V, axis=1, keepdims=True)
if np.any(nr == 0) or not np.isfinite(nr).all(): raise ValueError('ZERO_OR_NONFINITE_NORM')
X = V / nr
bucket = np.array([int(hashlib.md5(i.encode()).hexdigest(), 16) % 10 for i in ids]); tr, ho = bucket != 0, bucket == 0
Xtr, Xho = X[tr], X[ho]; print('train', len(Xtr), 'holdout', len(Xho), flush=True)
def unit(c): return c / np.linalg.norm(c, axis=1, keepdims=True)
models = {}
for seed in (42, 43):
    t = time.time(); km = MiniBatchKMeans(n_clusters=a.k, batch_size=4096, n_init=3, max_iter=100, random_state=seed).fit(Xtr)
    lab = km.labels_; cu = unit(km.cluster_centers_)
    eu = km.predict(Xtr); co = np.argmax(Xtr @ cu.T, axis=1)
    models[seed] = dict(km=km, cu=cu, ho=np.argmax(Xho @ cu.T, axis=1), tr_cos=co)
    sizes = np.bincount(co, minlength=a.k)
    models[seed]['rep'] = dict(seed=seed, fitSeconds=round(time.time() - t, 1), inertia=round(float(km.inertia_), 3),
        replayFitLabelsVsEuclidPredict=round(float((lab == eu).mean()), 5), replayFitLabelsVsCosinePredict=round(float((lab == co).mean()), 5),
        emptyClusters=int((sizes == 0).sum()), sizeMin=int(sizes.min()), sizeMedian=int(np.median(sizes)), sizeMax=int(sizes.max()))
    print(models[seed]['rep'], flush=True)
m1, m2 = models[42], models[43]
cross = {'trainARI_seed42_vs_43_cosine': round(float(adjusted_rand_score(m1['tr_cos'], m2['tr_cos'])), 4),
         'holdoutARI_seed42_vs_43': round(float(adjusted_rand_score(m1['ho'], m2['ho'])), 4)}
out = {'schema': 'atlas.kmeans-raw768-dryrun.v1', 'generatedAt': time.strftime('%Y-%m-%d'), 'readOnly': True, 'writesPerformed': False, 'gpuUsed': False, 'canonicalAuthority': False,
       'recipe': 'RAW content_embedding_768 (L2-normalised)', 'k': a.k, 'rows': len(ids), 'train': int(tr.sum()), 'holdout': int(ho.sum()),
       'models': [m1['rep'], m2['rep']], 'stability': cross, 'replayGate': {'threshold': 0.99, 'note': 'fit-label vs cosine/euclid predict on the same centroids; a determinism check, not quality'},
       'caveats': ['MiniBatchKMeans on a 90% split; centroids NOT stored anywhere', 'high ARI between seeds shows stability, not semantic quality', 'no domain/label purity measured here', 'raw recipe chosen per EMB-RECIPE-DECISION-01 (recorded as reply to a recommendation)']}
out['checksum'] = 'sha256:' + hashlib.sha256(json.dumps(out, sort_keys=True).encode()).hexdigest()
(ROOT / 'docs' / 'reports' / 'kmeans-raw768-dryrun-v1.json').write_text(json.dumps(out, indent=1), encoding='utf-8')
print(json.dumps({'stability': cross}), f'total {time.time()-t0:.0f}s')
