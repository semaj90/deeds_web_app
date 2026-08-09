#!/usr/bin/env python3
"""
Exact -> CAGRA -> IVF-PQ benchmark for semantic_768 vectors.
Input: dataset.npy [N,768], queries.npy [Q,768], float32.
"""
import argparse, json, time
import cupy as cp
import numpy as np
from cuvs.neighbors import brute_force, cagra, ivf_pq

ap=argparse.ArgumentParser()
ap.add_argument("dataset_npy")
ap.add_argument("queries_npy")
ap.add_argument("-k",type=int,default=10)
args=ap.parse_args()

X=cp.asarray(np.load(args.dataset_npy).astype(np.float32,copy=False))
Q=cp.asarray(np.load(args.queries_npy).astype(np.float32,copy=False))
if X.ndim!=2 or Q.ndim!=2 or X.shape[1]!=768 or Q.shape[1]!=768:
    raise SystemExit(f"Expected [N,768] and [Q,768], got {X.shape} {Q.shape}")

def timed(fn):
    cp.cuda.Stream.null.synchronize()
    t=time.perf_counter()
    out=fn()
    cp.cuda.Stream.null.synchronize()
    return out,(time.perf_counter()-t)*1000

bf_idx=brute_force.build(X,metric="cosine")
(exact_d,exact_i), exact_ms=timed(lambda: brute_force.search(bf_idx,Q,args.k))

cg_idx,cg_build=timed(lambda: cagra.build(cagra.IndexParams(metric="sqeuclidean"),X))
(cg_d,cg_i),cg_ms=timed(lambda: cagra.search(cagra.SearchParams(),cg_idx,Q,args.k))

pq_params=ivf_pq.IndexParams(metric="sqeuclidean")
pq_idx,pq_build=timed(lambda: ivf_pq.build(pq_params,X))
(pq_d,pq_i),pq_ms=timed(lambda: ivf_pq.search(ivf_pq.SearchParams(n_probes=20),pq_idx,Q,args.k))

exact=cp.asnumpy(exact_i); cgi=cp.asnumpy(cg_i); pqi=cp.asnumpy(pq_i)
def recall(gold,test):
    return float(np.mean([len(set(g)&set(t))/len(g) for g,t in zip(gold,test)]))

print(json.dumps({
 "dataset":list(map(int,X.shape)),
 "queries":list(map(int,Q.shape)),
 "k":args.k,
 "bruteForce":{"searchMs":exact_ms},
 "cagra":{"buildMs":cg_build,"searchMs":cg_ms,"recallAtK":recall(exact,cgi)},
 "ivfPq":{"buildMs":pq_build,"searchMs":pq_ms,"recallAtK":recall(exact,pqi)}
},indent=2))
