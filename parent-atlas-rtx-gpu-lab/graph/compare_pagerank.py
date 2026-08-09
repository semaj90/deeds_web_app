#!/usr/bin/env python3
import argparse, json
import numpy as np
from scipy.stats import spearmanr

ap=argparse.ArgumentParser()
ap.add_argument("cpu_json")
ap.add_argument("gpu_json")
ap.add_argument("--topk",type=int,default=100)
a=ap.parse_args()

cpu=json.load(open(a.cpu_json))
gpu=json.load(open(a.gpu_json))

# CPU expected result: mapping node->score.
cs=cpu["result"]
# GPU may be native top100-only result or mapping from nx-cugraph.
if isinstance(gpu["result"],dict) and "top100" not in gpu["result"]:
    gs=gpu["result"]
    keys=sorted(set(cs)&set(gs))
    cv=np.array([cs[k] for k in keys],dtype=float)
    gv=np.array([gs[k] for k in keys],dtype=float)
    rho=float(spearmanr(cv,gv).statistic) if keys else None
    ctop=set(sorted(cs,key=cs.get,reverse=True)[:a.topk])
    gtop=set(sorted(gs,key=gs.get,reverse=True)[:a.topk])
    overlap=len(ctop&gtop)/max(1,a.topk)
    maxabs=float(np.max(np.abs(cv-gv))) if keys else None
else:
    rho=overlap=maxabs=None

print(json.dumps({
  "commonNodes":len(keys) if 'keys' in locals() else None,
  "spearman":rho,
  "topKOverlap":overlap,
  "maxAbsError":maxabs
},indent=2))
