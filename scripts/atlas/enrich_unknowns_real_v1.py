#!/usr/bin/env python3
"""
Real (non-simulated) enrichment of 'unknown' domain chunks. Companion to enrich-unknowns-with-nb-baseline-v1.mjs, whose centroid
matches, NB priors and POS tags are hard-coded; this script computes them from data.

Read-only against Postgres (SELECT only). Local receipt only. CPU only: no CUDA context is created (the card is held by :8090 and a
256x768 comparison does not need it). Run with the RAPIDS env python (has xgboost/scikit-learn/torch/psycopg):
  /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python scripts/atlas/enrich_unknowns_real_v1.py [--n 16000] [--show 25]

What is computed for real:
  * Naive Bayes: sklearn ComplementNB fitted on path-token TF-IDF of LABELED chunks (grouped train/test split).
  * Centroid features: cosine of each chunk's content_embedding to the STORED K=256 centroids (atlas_cluster_models id 3) via torch
    (CPU ATen matmul on zero-copy numpy views); top-5 with inverse-pagination weight w_r = cos / log2(r+1).
  * XGBoost 3.x: ablation (path-SVD vs +centroid features vs centroid-only) on labeled test rows.
  * Unknown = legacy domain 'Other' / 'Classification failed'. Their predictions are NOT labels; they have no ground truth.
Caveats recorded in the receipt: labels are legacy weak labels; centroids are STALE for current vectors (replay agreement 81.25%).
"""
import argparse, hashlib, json, os, re, sys, time, urllib.request
from pathlib import Path
import numpy as np
import psycopg
import torch
import xgboost as xgb
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.naive_bayes import ComplementNB
from sklearn.preprocessing import LabelEncoder
from lib.xgb_resumable_fit_v1 import build_centroid_features, fit_resumable

ap = argparse.ArgumentParser(); ap.add_argument('--n', type=int, default=16000); ap.add_argument('--show', type=int, default=25)
ap.add_argument('--resume', action='store_true', help='reuse the stage-1 checkpoint (.tmp/atlas/enrich-real-v1) instead of re-reading Postgres')
ap.add_argument('--stage1-only', action='store_true', help='verify bounded read-only extraction and checkpoint without fitting models')
args = ap.parse_args()
if args.n < 1:
    ap.error('--n must be positive')
if args.show < 0:
    ap.error('--show must be non-negative')
ROOT = Path(__file__).resolve().parents[2]
url = os.environ.get('DATABASE_URL')
if not url:
    for line in (ROOT / '.env').read_text(encoding='utf-8', errors='replace').splitlines():
        m = re.match(r'\s*DATABASE_URL\s*=\s*(.+)', line)
        if m: url = m.group(1).strip().strip('"').strip("'")
if not url: sys.exit('DATABASE_URL not found')
UNKNOWN = {'Other', 'Classification failed'}
torch.set_num_threads(2)
t0 = time.time()

# Stage 1 is streamed (server-side cursor, rows parsed straight into a preallocated float32 array) and checkpointed, so a late failure
# never costs the database read again: rerun with --resume. Checkpoints live under .tmp (gitignored, rebuildable, never authoritative).
CK = ROOT / '.tmp' / 'atlas' / 'enrich-real-v1'; CK.mkdir(parents=True, exist_ok=True)
ck_file = CK / f'stage1-n{args.n}.npz'
if args.resume and ck_file.exists():
    z = np.load(ck_file, allow_pickle=False)
    C, V, stored, label = z['C'], z['V'], z['stored'], z['label']; ids = z['ids'].tolist(); refs = z['refs'].tolist()
    model_version, K, DIM, fitted_at, source_column = [str(x) for x in z['meta']]; K, DIM = int(K), int(DIM)
    print('resumed stage 1 from', ck_file, flush=True)
else:
    with psycopg.connect(url, options='-c default_transaction_read_only=on') as conn:
        with conn.cursor() as cur:
            cur.execute('show transaction_read_only')
            if cur.fetchone()[0] != 'on':
                raise RuntimeError('POSTGRES_READ_ONLY_TRANSACTION_NOT_CONFIRMED')
        with conn.cursor() as cur:
            cur.execute("select centroids::text, model_version, k, dim, created_at::text, source_column from atlas_cluster_models where id = 3")
            ctext, model_version, K, DIM, fitted_at, source_column = cur.fetchone()
        DIM = int(DIM); K = int(K)
        V = np.empty((args.n, DIM), dtype=np.float32); ids, refs, st, lb = [], [], [], []
        with conn.cursor(name='enrich_stream') as sc:
            sc.itersize = 1000
            sc.execute("""select c.id::text, c.source_ref, c.kmeans_cluster, c.content_embedding::text, fd.dc
                          from codebase_chunk_index c
                          join (select source_ref, min(domain_class) dc from feature_domain group by 1 having count(distinct domain_class) = 1) fd on fd.source_ref = c.source_ref
                          where c.kmeans_cluster is not null and c.content_embedding is not null
                          order by md5(c.id::text) limit %s""", (args.n,))
            for i, r in enumerate(sc):
                vector = np.asarray(json.loads(r[3]), dtype=np.float32)
                if vector.shape != (DIM,) or not np.isfinite(vector).all():
                    raise ValueError(f'INVALID_EMBEDDING_VECTOR:{r[0]}:{vector.shape}')
                V[i] = vector; ids.append(r[0]); refs.append(r[1] or ''); st.append(r[2]); lb.append(r[4])
                if (i + 1) % 2000 == 0: print('streamed', i + 1, flush=True)
    if not ids:
        raise RuntimeError('NO_QUALIFIED_CLUSTERED_ROWS')
    V = V[: len(ids)]
    v_norms = np.linalg.norm(V, axis=1, keepdims=True)
    if not np.isfinite(v_norms).all() or np.any(v_norms == 0):
        raise ValueError('INVALID_ZERO_OR_NONFINITE_EMBEDDING_NORM')
    V /= v_norms
    C = np.array(json.loads(ctext), dtype=np.float32)
    if C.shape != (K, DIM) or not np.isfinite(C).all():
        raise ValueError(f'INVALID_CENTROID_MATRIX:{C.shape}:expected={(K, DIM)}')
    c_norms = np.linalg.norm(C, axis=1, keepdims=True)
    if np.any(c_norms == 0):
        raise ValueError('INVALID_ZERO_CENTROID_NORM')
    C /= c_norms
    stored = np.array(st); label = np.array(lb)
    checkpoint_tmp = ck_file.with_name(ck_file.name + '.tmp')
    with checkpoint_tmp.open('wb') as checkpoint:
        np.savez_compressed(checkpoint, C=C, V=V, stored=stored, label=label, ids=np.array(ids), refs=np.array(refs),
                            meta=np.array([model_version, str(K), str(DIM), fitted_at, source_column]))
    os.replace(checkpoint_tmp, ck_file)
    print('checkpoint written', ck_file, flush=True)

if V.ndim != 2 or V.shape != (len(ids), DIM) or len(stored) != len(ids) or len(label) != len(ids) or len(refs) != len(ids):
    raise RuntimeError('STAGE1_CHECKPOINT_ROW_COUNT_MISMATCH')
if C.shape != (K, DIM) or not np.isfinite(V).all() or not np.isfinite(C).all():
    raise RuntimeError('STAGE1_CHECKPOINT_SHAPE_OR_FINITE_VALIDATION_FAILED')
v_norms = np.linalg.norm(V, axis=1, keepdims=True)
c_norms = np.linalg.norm(C, axis=1, keepdims=True)
if np.any(v_norms == 0) or np.any(c_norms == 0):
    raise RuntimeError('STAGE1_CHECKPOINT_ZERO_NORM')
V /= v_norms
C /= c_norms
if args.stage1_only:
    digest = hashlib.sha256(V.tobytes() + C.tobytes()).hexdigest()
    print(json.dumps({'stage1Only': True, 'readOnly': True, 'rows': len(ids), 'dimensions': int(V.shape[1]),
                      'checkpoint': str(ck_file), 'embeddingAndCentroidSha256': 'sha256:' + digest}, indent=1))
    sys.exit(0)

# ATen: zero-copy numpy -> torch CPU tensors; only a descriptor is persisted, never the tensor
Tv, Tc = torch.from_numpy(V), torch.from_numpy(C)
sims = (Tv @ Tc.T).numpy()
order = np.argsort(-sims, axis=1)[:, :5]
top_idx = order; top_cos = np.take_along_axis(sims, order, axis=1)
agree = float((top_idx[:, 0] == stored).mean())
rank_w = 1.0 / np.log2(np.arange(1, 6) + 1)

def tok(p):
    p = p.replace('\\', '/'); p = re.sub(r'([a-z0-9])([A-Z])', r'\1 \2', p)
    ext = p.rsplit('.', 1)[-1] if '.' in p.rsplit('/', 1)[-1] else 'noext'
    return re.sub(r'[^A-Za-z0-9]+', ' ', p).lower() + f' ext_{ext.lower()}'
text = [tok(p) for p in refs]; groups = np.array(['/'.join(p.replace('\\', '/').split('/')[:4]) for p in refs])
known = ~np.isin(label, list(UNKNOWN)); unk = ~known
le = LabelEncoder().fit(label[known])
kn_idx = np.where(known)[0]
tr, te = next(GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=17).split(kn_idx, groups=groups[kn_idx]))
tr, te = kn_idx[tr], kn_idx[te]
min_df_val = min(3, max(1, len(tr) // 2))
vec = TfidfVectorizer(ngram_range=(1, 2), min_df=min_df_val, max_features=3000, sublinear_tf=True).fit([text[i] for i in tr])
Xt = vec.transform(text)
n_comp = min(48, max(2, Xt[tr].shape[1] - 1))
svd = TruncatedSVD(n_components=n_comp, random_state=17).fit(Xt[tr]); Sv = svd.transform(Xt).astype(np.float32)
centroid_feats = build_centroid_features(top_cos, top_idx, K)
ytr, yte = le.transform(label[tr]), le.transform(label[te])

def score(pred): return {'accuracy': round(float(accuracy_score(yte, pred)), 4), 'macroF1': round(float(f1_score(yte, pred, average='macro', zero_division=0)), 4)}
results = {'majority': score(np.full_like(yte, np.bincount(ytr).argmax()))}
nb = ComplementNB(alpha=0.3).fit(Xt[tr], ytr); results['complement_nb_path_tfidf'] = score(nb.predict(Xt[te]))
present = np.unique(ytr); remap = {c: i for i, c in enumerate(present)}
def fit_xgb(X, name):
    params = {'objective': 'multi:softprob', 'num_class': int(len(present)), 'max_depth': 6, 'eta': 0.2,
              'tree_method': 'hist', 'nthread': 3, 'subsample': 0.8, 'colsample_bytree': 0.8,
              'seed': 17, 'eval_metric': 'mlogloss'}
    model_path = CK / 'models' / f'{name}.json'
    t = time.time()
    m, resume = fit_resumable(xgb, X[tr], np.vectorize(remap.get)(ytr), model_path, params, rounds=120, interval=10)
    probabilities = m.predict(xgb.DMatrix(X[te]))
    p = present[np.argmax(probabilities, axis=1)]
    results[name] = {**score(p), 'seconds': round(time.time() - t, 1)}
    results[name]['training'] = {'resumeStatus': resume['status'], 'completedRounds': resume['completedRounds'],
                                 'checkpoint': str(model_path.relative_to(ROOT)), 'inputFingerprint': 'sha256:' + resume['fingerprint']}
    partial = CK / 'results-partial.json'
    partial_tmp = partial.with_name(partial.name + '.tmp')
    partial_tmp.write_text(json.dumps(results, indent=1), encoding='utf-8')
    os.replace(partial_tmp, partial)
    return m
X_path = Sv; X_both = np.hstack([Sv, centroid_feats]); X_cent = centroid_feats
fit_xgb(X_path, 'xgboost_path_svd48'); m_both = fit_xgb(X_both, 'xgboost_path_svd48_plus_centroid_features'); fit_xgb(X_cent, 'xgboost_centroid_features_only')

# Enrich a sample of UNKNOWN chunks (predictions only; no ground truth exists for them)
rng = np.random.default_rng(17); pick = rng.permutation(np.where(unk)[0])[: args.show]
if len(pick) > 0:
    nb_lp = nb.predict_log_proba(Xt[pick]) if hasattr(nb, 'predict_log_proba') else None
    xp = m_both.predict(xgb.DMatrix(X_both[pick]))
else:
    nb_lp, xp = None, None
def fetch_pos_tags(phrase: str):
    for attempt in range(2):
        try:
            payload = json.dumps({'text': phrase}).encode('utf-8')
            req = urllib.request.Request('http://127.0.0.1:8095/pos', data=payload, headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=15.0) as res:
                if res.status == 200:
                    body = json.loads(res.read().decode('utf-8'))
                    return {
                        'nouns': body.get('nouns', []),
                        'proper_nouns': body.get('proper_nouns', []),
                        'adjectives': body.get('adjectives', []),
                        'verbs': body.get('verbs', []),
                        'lemmas': body.get('lemmas', []),
                        'noun_phrases': body.get('noun_phrases', []),
                    }
        except Exception as exc:
            if attempt == 1:
                return {'status': 'ERROR', 'error': str(exc)[:80]}
            time.sleep(0.5)
    return {'status': 'UNAVAILABLE'}

records = []
pos_tagged_count = 0
for j, i in enumerate(pick):
    nb_top = np.argsort(-nb_lp[j])[:3]; xg_top = np.argsort(-xp[j])[:3]
    pos_data = fetch_pos_tags(text[i])
    if 'nouns' in pos_data:
        pos_tagged_count += 1
    records.append({
        'chunkId': ids[i], 'sourceRef': refs[i], 'legacyDomain': str(label[i]), 'storedKmeansCluster': int(stored[i]),
        'naiveBayesTop3': [{'domain': str(le.classes_[k]), 'logProb': round(float(nb_lp[j][k]), 3)} for k in nb_top],
        'xgboostTop3': [{'domain': str(le.classes_[present[k]]), 'prob': round(float(xp[j][k]), 4)} for k in xg_top],
        'centroidTop5': [{'rank': r + 1, 'centroidId': int(top_idx[i][r]), 'cosine': round(float(top_cos[i][r]), 4),
                          'inversePaginationWeight': round(float(rank_w[r]), 4), 'rankScore': round(float(top_cos[i][r] * rank_w[r]), 4)} for r in range(5)],
        'nearestCentroidMatchesStoredCluster': bool(top_idx[i][0] == stored[i]),
        'posTags': pos_data,
        'predictionIsLabel': False})

pos = {
    'status': 'COMPLETED' if pos_tagged_count > 0 else ('SKIPPED_NO_UNKNOWNS' if len(pick) == 0 else 'FALLBACK'),
    'endpoint': 'http://127.0.0.1:8095/pos',
    'spacyModel': 'en_core_web_sm',
    'taggedCount': pos_tagged_count,
    'totalQueried': len(pick)
}
receipt = {
    'schema': 'atlas.unknowns-enrichment-real.v1', 'generatedAt': time.strftime('%Y-%m-%d'), 'readOnly': True, 'writesPerformed': False, 'gpuUsed': False, 'canonicalAuthority': False,
    'inputs': {'chunksSampled': len(ids), 'labeledChunks': int(known.sum()), 'unknownChunks': int(unk.sum()), 'train': int(len(tr)), 'test': int(len(te)), 'classes': int(len(le.classes_)),
               'split': 'GroupShuffleSplit by first 4 path components, seed 17', 'labels': 'LEGACY feature_domain.domain_class (weak); unknown = Other/Classification failed'},
    'centroidModel': {'table': 'atlas_cluster_models', 'id': 3, 'modelVersion': model_version, 'k': K, 'dim': DIM, 'fittedAt': fitted_at, 'sourceColumn': source_column,
                      'centroidBytesSha256': 'sha256:' + hashlib.sha256(C.tobytes()).hexdigest(), 'stale': True,
                      'staleEvidence': f'KMEANS-REPLAY-01: 81.25 percent of stored assignments reproduce; on this sample nearest-centroid equals stored cluster for {agree * 100:.2f} percent'},
    'atenDescriptor': {'library': 'torch', 'version': torch.__version__, 'device': 'cpu', 'chunkTensor': {'dtype': 'float32', 'shape': list(Tv.shape)}, 'centroidTensor': {'dtype': 'float32', 'shape': list(Tc.shape)},
                       'zeroCopyFromNumpy': True, 'rawTensorsPersisted': False},
    'results': results, 'pos': pos, 'records': records, 'totalSeconds': round(time.time() - t0, 1),
    'caveats': ['legacy labels are weak and partly path-derived; accuracy shows predictability, not correctness', 'centroids are stale for current vectors', 'unknown-chunk predictions are advisory, not labels',
                'no reviewed labels, so no external truth is measured'],
}
receipt['checksum'] = 'sha256:' + hashlib.sha256(json.dumps(receipt, sort_keys=True).encode()).hexdigest()
report = ROOT / 'docs' / 'reports' / 'unknowns-enrichment-real-v1.json'
report_tmp = report.with_name(report.name + '.tmp')
report_tmp.write_text(json.dumps(receipt, indent=1), encoding='utf-8')
os.replace(report_tmp, report)
print(json.dumps({'inputs': receipt['inputs'], 'centroidAgreementOnSample': round(agree, 4), 'results': results, 'seconds': receipt['totalSeconds']}, indent=1))
