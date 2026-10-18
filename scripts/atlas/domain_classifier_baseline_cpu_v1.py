#!/usr/bin/env python3
"""
CPU baseline: how predictable are the legacy domain_class labels from cheap features?

Read-only against Postgres (SELECT only), local report only. No GPU. No labels are written anywhere.
Run with the RAPIDS env python (it already has xgboost / scikit-learn / pandas / psycopg):
  /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python scripts/atlas/domain_classifier_baseline_cpu_v1.py

Important: the labels are the LEGACY feature_domain.domain_class values (weak labels, 40 classes, incl. noisy 'Other').
A good score here means "the legacy labels are predictable", NOT "the labels are correct". Split is grouped by directory so
files in the same folder never appear in both train and test.
"""
import hashlib, json, os, re, sys, time
from pathlib import Path
import numpy as np
import pandas as pd
import psycopg
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.preprocessing import LabelEncoder
from sklearn.svm import LinearSVC
import xgboost as xgb

ROOT = Path(__file__).resolve().parents[2]
env = {}
for line in (ROOT / '.env').read_text(encoding='utf-8', errors='replace').splitlines():
    m = re.match(r'\s*DATABASE_URL\s*=\s*(.+)', line)
    if m: env['DATABASE_URL'] = m.group(1).strip().strip('"').strip("'")
url = os.environ.get('DATABASE_URL') or env.get('DATABASE_URL')
if not url: sys.exit('DATABASE_URL not found')

with psycopg.connect(url) as conn, conn.cursor() as cur:
    cur.execute("""select source_ref, min(domain_class) from feature_domain
                   where domain_class is not null group by source_ref having count(distinct domain_class) = 1""")
    rows = cur.fetchall()
df = pd.DataFrame(rows, columns=['source_ref', 'label'])
df = df[df.source_ref.notna() & (df.source_ref != '')].reset_index(drop=True)

def tokens(p: str) -> str:
    p = p.replace('\\', '/')
    p = re.sub(r'([a-z0-9])([A-Z])', r'\1 \2', p)
    ext = p.rsplit('.', 1)[-1] if '.' in p.rsplit('/', 1)[-1] else 'noext'
    return re.sub(r'[^A-Za-z0-9]+', ' ', p).lower() + f' ext_{ext.lower()}'

df['text'] = df.source_ref.map(tokens)
df['group'] = df.source_ref.map(lambda p: '/'.join(p.replace('\\', '/').split('/')[:4]))
t0 = time.time()
le = LabelEncoder(); y_all = le.fit_transform(df.label)
splitter = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=17)
train_idx, test_idx = next(splitter.split(df, y_all, groups=df.group))
vec = TfidfVectorizer(ngram_range=(1, 2), min_df=3, max_features=5000, sublinear_tf=True)
Xtr = vec.fit_transform(df.text.iloc[train_idx]); Xte = vec.transform(df.text.iloc[test_idx])
ytr, yte = y_all[train_idx], y_all[test_idx]

def score(name, pred, extra=None):
    r = {'model': name, 'accuracy': round(float(accuracy_score(yte, pred)), 4), 'macroF1': round(float(f1_score(yte, pred, average='macro', zero_division=0)), 4),
         'weightedF1': round(float(f1_score(yte, pred, average='weighted', zero_division=0)), 4)}
    if extra: r.update(extra)
    return r

results = []
major = np.bincount(ytr).argmax()
results.append(score('majority_class', np.full_like(yte, major), {'majorityClass': le.classes_[major]}))
rng = np.random.default_rng(17)
results.append(score('label_shuffled_baseline_linear_svc', LinearSVC(C=0.5, max_iter=2000).fit(Xtr, rng.permutation(ytr)).predict(Xte)))
t = time.time(); svc = LinearSVC(C=0.5, max_iter=3000).fit(Xtr, ytr); results.append(score('tfidf_path_linear_svc', svc.predict(Xte), {'seconds': round(time.time() - t, 1)}))
# XGBoost needs contiguous class ids present in train
present = np.unique(ytr); remap = {c: i for i, c in enumerate(present)}
mask_te = np.isin(yte, present)
t = time.time()
clf = xgb.XGBClassifier(objective='multi:softprob', n_estimators=120, max_depth=6, learning_rate=0.2, tree_method='hist', n_jobs=4,
                        subsample=0.8, colsample_bytree=0.6, random_state=17, eval_metric='mlogloss')
clf.fit(Xtr, np.vectorize(remap.get)(ytr))
pred = present[clf.predict(Xte)]
results.append(score('tfidf_path_xgboost', pred, {'seconds': round(time.time() - t, 1), 'testRowsWithUnseenClass': int((~mask_te).sum())}))

excl = np.isin(le.classes_[yte], ['Other', 'Classification failed'], invert=True)
svc_pred = svc.predict(Xte)
extra = {'accuracy_excluding_Other_and_failed': round(float(accuracy_score(yte[excl], svc_pred[excl])), 4), 'rowsExcluded': int((~excl).sum())}
receipt = {'schema': 'atlas.domain-classifier-baseline-cpu.v1', 'generatedAt': time.strftime('%Y-%m-%d'), 'readOnly': True, 'writesPerformed': False, 'gpuUsed': False,
           'labels': 'LEGACY feature_domain.domain_class (weak, 40 classes) - not a reviewed taxonomy', 'features': 'TF-IDF (1-2 gram, 5000) over tokenized source_ref path + extension only',
           'split': 'GroupShuffleSplit by first 4 path components, 80/20, seed 17', 'rows': int(len(df)), 'train': int(len(train_idx)), 'test': int(len(test_idx)), 'classes': int(len(le.classes_)),
           'results': results, 'linearSvcExtra': extra, 'totalSeconds': round(time.time() - t0, 1),
           'caveats': ['labels are noisy legacy labels; high scores prove predictability, not correctness',
                       'path-only features: no content, embedding, AST, KMeans or SOM features yet', 'no reviewed labels exist, so no external truth is measured']}
receipt['checksum'] = 'sha256:' + hashlib.sha256(json.dumps(receipt, sort_keys=True).encode()).hexdigest()
out = ROOT / 'docs' / 'reports' / 'domain-classifier-baseline-cpu-v1.json'
out.write_text(json.dumps(receipt, indent=1), encoding='utf-8')
for r in results: print(r)
print(extra, 'rows', len(df), 'classes', len(le.classes_), 'seconds', receipt['totalSeconds'])
