#!/usr/bin/env python3
"""
Simple k-means clustering worker for Atlas exports.
Reads NDJSON/JSONL input, validates rows, runs k-means using numpy,
and writes cluster assignments to an output JSONL file.

Rules enforced:
- input must be JSONL
- preserve sourceRef and graphVersion
- validate vector dim (default 768)
- reject rows without sourceRef

Dry-run writes assignments file for preview; no external writes performed.
"""
import json
import argparse
import os
import sys
from math import sqrt

try:
    import numpy as np
except Exception as e:
    print('numpy required: please install numpy', file=sys.stderr)
    sys.exit(2)

def read_jsonl(path):
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line=line.strip()
            if not line: continue
            try:
                yield json.loads(line)
            except Exception:
                continue

def init_centroids(X, k):
    # simple random init
    idx = np.random.choice(X.shape[0], k, replace=False)
    return X[idx].astype(float)

def assign_clusters(X, centroids):
    # squared distances
    dists = np.sum((X[:, None, :] - centroids[None, :, :])**2, axis=2)
    return np.argmin(dists, axis=1), np.min(dists, axis=1)

def recompute_centroids(X, labels, k):
    D = X.shape[1]
    centroids = np.zeros((k, D), dtype=float)
    for i in range(k):
        pts = X[labels==i]
        if len(pts)==0:
            # reinitialize
            centroids[i] = X[np.random.randint(0, X.shape[0])]
        else:
            centroids[i] = pts.mean(axis=0)
    return centroids

def kmeans(X, k, max_iter=100, tol=1e-4):
    n, d = X.shape
    if n < k:
        k = max(1, n)
    centroids = init_centroids(X, k)
    labels = np.zeros(n, dtype=int)
    for it in range(max_iter):
        new_labels, dists = assign_clusters(X, centroids)
        new_centroids = recompute_centroids(X, new_labels, k)
        shift = np.linalg.norm(centroids - new_centroids)
        centroids = new_centroids
        labels = new_labels
        if shift <= tol:
            break
    # distances: euclidean sqrt of squared dists
    _, minsq = assign_clusters(X, centroids)
    dists = np.sqrt(minsq)
    return labels, centroids, dists

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--input', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--k', type=int, default=16)
    p.add_argument('--dim', type=int, default=768)
    p.add_argument('--dry-run', action='store_true')
    args = p.parse_args()

    inp = args.input
    out = args.out
    k = args.k
    dim = args.dim
    dry = args.dry_run

    rows = []
    vectors = []
    ids = []
    accepted = 0
    rejected_missing_sourceRef = 0
    rejected_bad_dim = 0
    total = 0

    for doc in read_jsonl(inp):
        total += 1
        # require sourceRef
        sourceRef = doc.get('sourceRef') or doc.get('source_ref')
        if not sourceRef:
            rejected_missing_sourceRef += 1
            continue
        # find vector
        vec = None
        for key in ('embedding','vector','embedding_vector'):
            if key in doc:
                vec = doc[key]
                break
        if vec is None:
            # maybe in payload.embedding
            if isinstance(doc.get('payload'), dict):
                for key in ('embedding','vector','embedding_vector'):
                    if key in doc['payload']:
                        vec = doc['payload'][key]
                        break
        if vec is None:
            rejected_bad_dim += 1
            continue
        try:
            arr = np.array(vec, dtype=float)
        except Exception:
            rejected_bad_dim += 1
            continue
        if arr.ndim != 1 or arr.shape[0] != dim:
            rejected_bad_dim += 1
            continue
        accepted += 1
        rows.append(doc)
        vectors.append(arr)
        ids.append(doc.get('id') or doc.get('uuid') or f'row-{total}')

    print('rows read', total)
    print('rows accepted', accepted)
    print('rows rejected_missing_sourceRef', rejected_missing_sourceRef)
    print('rows rejected_bad_dim', rejected_bad_dim)

    if accepted == 0:
        print('No rows to cluster. Exiting.')
        # still create empty output
        os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
        with open(out, 'w', encoding='utf-8') as f:
            pass
        print('output path', out)
        return

    X = np.vstack(vectors)
    labels, centroids, dists = kmeans(X, k)
    clusters = int(centroids.shape[0])
    avg_dist = float(np.mean(dists))
    print('clusters produced', clusters)
    print('avg distance to centroid', avg_dist)

    # compute cluster sizes
    sizes = {}
    for lab in labels:
        sizes[int(lab)] = sizes.get(int(lab), 0) + 1

    # write centroids summary
    centroids_out = out.replace('.jsonl', '.centroids.json')
    with open(centroids_out, 'w', encoding='utf-8') as cf:
        summary = {
            'clusters': clusters,
            'avg_distance': avg_dist,
            'dim': X.shape[1],
            'sizes': sizes,
            'centroids': centroids.tolist(),
        }
        json.dump(summary, cf)

    print('centroids path', centroids_out)

    # write assignments
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        for i, doc in enumerate(rows):
            entry = {
                'id': ids[i],
                'sourceRef': doc.get('sourceRef') or doc.get('source_ref'),
                'graphVersion': doc.get('graphVersion'),
                'cluster': int(labels[i]),
                'distance': float(dists[i])
            }
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')

    print('output path', out)

if __name__=='__main__':
    main()
#!/usr/bin/env python3
"""
atlas-cluster-worker.py

Reads NDJSON/JSONL input, validates rows, performs clustering.
Dry-run mode uses deterministic hashing assignment (no deps).
Real mode attempts to use scikit-learn + numpy for KMeans.

Outputs NDJSON assignments with fields:
  id, cluster, distance, sourceRef, graphVersion, embedding_len

Exits non-zero on fatal errors.
"""
import sys
import argparse
import json
import hashlib
from collections import defaultdict

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('--input', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--k', type=int, default=16)
    p.add_argument('--dry-run', action='store_true')
    p.add_argument('--dim', type=int, default=768)
    return p.parse_args()

def hash_assign(item_id, k):
    h = hashlib.sha1(item_id.encode('utf-8')).digest()
    return int.from_bytes(h[:8],'big') % k

def read_input(path):
    with open(path,'r',encoding='utf-8') as f:
        for line in f:
            line=line.strip()
            if not line: continue
            try:
                yield json.loads(line)
            except Exception:
                continue

def simple_stats(assignments):
    clusters = defaultdict(list)
    for a in assignments:
        clusters[a['cluster']].append(a)
    return clusters

def main():
    args = parse_args()
    rows_read=0
    rows_accepted=0
    rows_rejected_missing_sourceRef=0
    rows_rejected_bad_dim=0
    assignments=[]

    for rec in read_input(args.input):
        rows_read+=1
        sid = rec.get('id') or rec.get('uuid') or rec.get('key') or str(rows_read)
        sourceRef = rec.get('sourceRef') or rec.get('source_ref')
        vec = rec.get('embedding')
        graphVersion = rec.get('graphVersion') or rec.get('graph_version')
        if not sourceRef:
            rows_rejected_missing_sourceRef+=1
            continue
        if not isinstance(vec, list):
            rows_rejected_bad_dim+=1
            continue
        if len(vec) != args.dim:
            rows_rejected_bad_dim+=1
            continue
        rows_accepted+=1
        if args.dry_run:
            cluster = hash_assign(sid, args.k)
            # distance: use simple mean abs diff
            avg = sum(abs(v) for v in vec)/len(vec) if vec else 0
            distance = float(avg % 1.0)
            assignments.append({'id': sid, 'cluster': int(cluster), 'distance': distance, 'sourceRef': sourceRef, 'graphVersion': graphVersion or None, 'embedding_len': len(vec)})
        else:
            # try to perform real KMeans using sklearn
            # collect embeddings first (defer until all read)
            assignments.append({'id': sid, 'sourceRef': sourceRef, 'graphVersion': graphVersion or None, 'embedding': vec})

    if not args.dry_run:
        try:
            import numpy as np
            from sklearn.cluster import KMeans
        except Exception as e:
            print('Real clustering requires numpy + scikit-learn. Install via pip install numpy scikit-learn', file=sys.stderr)
            sys.exit(2)
        emb = [a['embedding'] for a in assignments]
        X = np.array(emb, dtype=np.float32)
        kmeans = KMeans(n_clusters=args.k, random_state=0).fit(X)
        labels = kmeans.labels_
        centers = kmeans.cluster_centers_
        out=[]
        for i,a in enumerate(assignments):
            lab = int(labels[i])
            dist = float(((X[i]-centers[lab])**2).sum()**0.5)
            out.append({'id': a['id'], 'cluster': lab, 'distance': dist, 'sourceRef': a['sourceRef'], 'graphVersion': a['graphVersion'], 'embedding_len': len(a['embedding'])})
        assignments = out

    # write output
    with open(args.out,'w',encoding='utf-8') as f:
        for a in assignments:
            f.write(json.dumps(a, ensure_ascii=False) + '\n')

    # basic stats
    clusters = simple_stats(assignments)
    avg_dist = sum(a['distance'] for a in assignments)/len(assignments) if assignments else 0
    print('rows read', rows_read)
    print('rows accepted', rows_accepted)
    print('rows rejected_missing_sourceRef', rows_rejected_missing_sourceRef)
    print('rows rejected_bad_dim', rows_rejected_bad_dim)
    print('clusters produced', len(clusters))
    print('avg distance to centroid (approx)', avg_dist)
    print('output path', args.out)

if __name__=='__main__':
    main()
