#!/usr/bin/env python3
"""
GPU counterpart of kmeans_raw768_dryrun_v1.py: cuML KMeans K=256 on the cached RAW 768 vectors (.tmp/atlas/kmeans-raw768/V0.npy, ids0.json). Read-only: no DB access at all,
no writes except the report. REQUIRES the :8090 Ornith server to be stopped first (8 GiB card); check free VRAM before running.
Same deterministic 90/10 md5(id) split as the CPU run. Reports fit time, inertia, seed-to-seed ARI (train + holdout), fit-label vs predict replay, cluster size spread, VRAM peak.
Run: /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python scripts/atlas/kmeans_raw768_gpu_dryrun_v1.py [--k 256]
"""
import argparse, hashlib, json, subprocess, time
from pathlib import Path
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--k', type=int, default=256)
ap.add_argument('--min-free-mib', type=int, default=3000)
a = ap.parse_args()
ROOT = Path(__file__).resolve().parents[2]
D = ROOT / '.tmp' / 'atlas' / 'kmeans-raw768'


def free_mib():
    out = subprocess.run(['nvidia-smi', '--query-gpu=memory.free', '--format=csv,noheader,nounits'], capture_output=True, text=True).stdout.strip()
    return int(out.splitlines()[0])


free = free_mib()
if free < a.min_free_mib:
    raise SystemExit(f'BLOCKED: {free} MiB free < {a.min_free_mib} MiB required (is :8090 still running?)')
import cupy as cp
from cuml.cluster import KMeans
from sklearn.metrics import adjusted_rand_score

V = np.load(D / 'V0.npy')
ids = json.loads((D / 'ids0.json').read_text())
X = (V / np.linalg.norm(V, axis=1, keepdims=True)).astype(np.float32)
bucket = np.array([int(hashlib.md5(i.encode()).hexdigest(), 16) % 10 for i in ids])
tr, ho = bucket != 0, bucket == 0
Xtr, Xho = X[tr], X[ho]
Xtr_g, Xho_g = cp.asarray(Xtr), cp.asarray(Xho)
models, reps = {}, []
for seed in (42, 43):
    t = time.time()
    km = KMeans(n_clusters=a.k, max_iter=100, init='k-means||', n_init=1, random_state=seed, output_type='cupy').fit(Xtr_g)
    cp.cuda.Stream.null.synchronize()
    fit_s = time.time() - t
    lab = cp.asnumpy(km.labels_)
    pred = cp.asnumpy(km.predict(Xtr_g))
    ho_pred = cp.asnumpy(km.predict(Xho_g))
    sizes = np.bincount(pred, minlength=a.k)
    models[seed] = (pred, ho_pred)
    reps.append(dict(seed=seed, fitSeconds=round(fit_s, 1), inertia=round(float(km.inertia_), 3), iterations=int(km.n_iter_),
                     replayFitVsPredict=round(float((lab == pred).mean()), 5), emptyClusters=int((sizes == 0).sum()),
                     sizeMin=int(sizes.min()), sizeMedian=int(np.median(sizes)), sizeMax=int(sizes.max())))
    print(reps[-1], flush=True)
stab = {'trainARI_seed42_vs_43': round(float(adjusted_rand_score(models[42][0], models[43][0])), 4),
        'holdoutARI_seed42_vs_43': round(float(adjusted_rand_score(models[42][1], models[43][1])), 4)}
mem = cp.get_default_memory_pool()
out = {'schema': 'atlas.kmeans-raw768-gpu-dryrun.v1', 'generatedAt': time.strftime('%Y-%m-%d'), 'readOnly': True, 'writesPerformed': False, 'gpuUsed': True, 'canonicalAuthority': False,
       'recipe': 'RAW content_embedding_768 (L2-normalised)', 'executor': 'cuml.cluster.KMeans (k-means|| init, n_init=1)', 'k': a.k, 'rows': len(ids), 'train': int(tr.sum()), 'holdout': int(ho.sum()),
       'freeMiBAtStart': free, 'cupyPoolMiB': round(mem.total_bytes() / 2**20), 'models': reps, 'stability': stab,
       'caveats': ['models are not stored', 'compare with docs/reports/kmeans-raw768-dryrun-v1.json (CPU MiniBatchKMeans, n_init=3)', 'seed ARI shows stability, not semantic quality', 'one run, no timing repetition']}
out['checksum'] = 'sha256:' + hashlib.sha256(json.dumps(out, sort_keys=True).encode()).hexdigest()
(ROOT / 'docs' / 'reports' / 'kmeans-raw768-gpu-dryrun-v1.json').write_text(json.dumps(out, indent=1), encoding='utf-8')
print(json.dumps({'stability': stab, 'free': free}))
