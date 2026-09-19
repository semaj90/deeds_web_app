#!/usr/bin/env python3
"""Deterministic structural KMeans challenger for Parent Atlas file topology.

This is navigation/routing evidence only. It never changes execution state.
It consumes openspec-directory-graph-v1.json and clusters numeric structural
features plus a deterministic one-hot of the file's primary taxonomy topic.
"""
from __future__ import annotations
import json, math, random, sys, hashlib
from pathlib import Path

inp = Path(sys.argv[1] if len(sys.argv) > 1 else 'docs/reports/openspec-directory-graph-v1.json')
out = Path(sys.argv[2] if len(sys.argv) > 2 else 'docs/reports/openspec-file-kmeans-v1.json')
k = max(2, int(sys.argv[3]) if len(sys.argv) > 3 else 12)
seed = int(sys.argv[4]) if len(sys.argv) > 4 else 1337

source = json.loads(inp.read_text(encoding='utf-8'))
files = source.get('files') or []
if not files:
    raise SystemExit('No files in directory graph input')

topics = sorted({str(f.get('primaryTopic') or 'other') for f in files})
topic_index = {t:i for i,t in enumerate(topics)}

def safe_log1p(v):
    try: return math.log1p(max(0.0, float(v)))
    except Exception: return 0.0

def vector(f):
    p = str(f.get('path') or '')
    g = f.get('graph') or {}
    base = [
        safe_log1p(f.get('bytes', 0)),
        safe_log1p(g.get('inboundImports', 0)),
        safe_log1p(g.get('outboundImports', 0)),
        float(p.count('/')),
        1.0 if f.get('treeNodeEvidence') else 0.0,
        1.0 if f.get('graphifyEvidence') else 0.0,
        1.0 if f.get('openspecEvidence') else 0.0,
    ]
    onehot = [0.0] * len(topics)
    onehot[topic_index[str(f.get('primaryTopic') or 'other')]] = 1.0
    return base + onehot

X = [vector(f) for f in files]
d = len(X[0])
means = [sum(row[j] for row in X)/len(X) for j in range(d)]
stds = []
for j in range(d):
    v = sum((row[j]-means[j])**2 for row in X)/len(X)
    stds.append(math.sqrt(v) or 1.0)
X = [[(row[j]-means[j])/stds[j] for j in range(d)] for row in X]

k = min(k, len(X))
rng = random.Random(seed)
# deterministic kmeans++-like initialization
first = rng.randrange(len(X))
centroids = [X[first][:]]
while len(centroids) < k:
    distances = []
    for row in X:
        best = min(sum((a-b)**2 for a,b in zip(row,c)) for c in centroids)
        distances.append(best)
    total = sum(distances)
    if total <= 0:
        idx = next(i for i in range(len(X)) if X[i] not in centroids)
    else:
        r = rng.random() * total
        acc = 0.0; idx = len(X)-1
        for i,val in enumerate(distances):
            acc += val
            if acc >= r:
                idx = i; break
    centroids.append(X[idx][:])

assign = [-1]*len(X)
for _ in range(50):
    changed = False
    for i,row in enumerate(X):
        c = min(range(k), key=lambda ci: sum((a-b)**2 for a,b in zip(row,centroids[ci])))
        if c != assign[i]: assign[i]=c; changed=True
    sums = [[0.0]*d for _ in range(k)]
    counts = [0]*k
    for row,c in zip(X,assign):
        counts[c]+=1
        for j in range(d): sums[c][j]+=row[j]
    for c in range(k):
        if counts[c]: centroids[c]=[v/counts[c] for v in sums[c]]
    if not changed: break

clusters=[]
for c in range(k):
    members=[files[i] for i,a in enumerate(assign) if a==c]
    tc={}
    for f in members:
        t=str(f.get('primaryTopic') or 'other'); tc[t]=tc.get(t,0)+1
    clusters.append({
        'clusterId':c,
        'count':len(members),
        'dominantTopics':[{'topic':t,'count':n} for t,n in sorted(tc.items(), key=lambda x:(-x[1],x[0]))[:5]],
        'sampleFiles':[str(f.get('path')) for f in sorted(members,key=lambda x:str(x.get('path')))[:12]],
    })

assignments=[{'path':str(f.get('path')),'clusterId':assign[i],'primaryTopic':str(f.get('primaryTopic') or 'other')} for i,f in enumerate(files)]
payload={
    'schema':'atlas.openspec-file-kmeans.v1',
    'source':str(inp),
    'algorithm':{'name':'deterministic-kmeans','k':k,'seed':seed,'maxIterations':50},
    'featureContract':['log_bytes','log_inbound_imports','log_outbound_imports','path_depth','tree_node_observed','graphify_observed','openspec_observed','topic_one_hot'],
    'clusters':clusters,
    'assignments':assignments,
    'authority':'CHALLENGER_NAVIGATION_ONLY',
    'writesPerformed':False,
}
semantic = json.dumps(payload, sort_keys=True, separators=(',',':')).encode()
payload['semanticChecksum']=hashlib.sha256(semantic).hexdigest()
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(payload,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'outputPath':str(out),'files':len(files),'clusters':k,'semanticChecksum':payload['semanticChecksum']},indent=2))
