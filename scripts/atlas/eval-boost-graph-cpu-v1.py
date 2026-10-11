#!/usr/bin/env python3
"""Bounded, synthetic CPU graph eval: stdlib oracle vs optional Boost binary.
No package installs, canonical graph reads, database writes or GPU calls.
Run: python scripts/atlas/eval-boost-graph-cpu-v1.py [--boost-bin /path/to/binary]
"""
import argparse
import hashlib
import json
import random
import subprocess
import time
from collections import deque

def fixture(seed=31, nodes=256, edges=1024):
    if nodes < 1 or nodes > 100000 or edges < 0 or edges > 1000000:
        raise ValueError("INVALID_GRAPH_BOUNDS")
    rng=random.Random(seed)
    result=[(rng.randrange(nodes),rng.randrange(nodes)) for _ in range(edges)]
    return result

def bfs(nodes, edges):
    adj=[[] for _ in range(nodes)]
    for source,target in edges:
        if not (0 <= source < nodes and 0 <= target < nodes):
            raise ValueError("INVALID_EDGE")
        adj[source].append(target)
    distances=[-1]*nodes
    distances[0]=0
    queue=deque([0])
    while queue:
        source=queue.popleft()
        for target in adj[source]:
            if distances[target] != -1:
                continue
            distances[target]=distances[source]+1
            queue.append(target)
    return distances

def evaluate(nodes=256, edge_count=1024, boost_bin=None):
    edges=fixture(nodes=nodes,edges=edge_count)
    frozen=json.dumps({"nodes":nodes,"edges":edges},separators=(",",":"),sort_keys=True).encode()
    checksum=hashlib.sha256(frozen).hexdigest()
    start=time.perf_counter_ns()
    expected=bfs(nodes,edges)
    baseline_ms=(time.perf_counter_ns()-start)/1e6
    result={"schema":"atlas.graph-cpu-challenger-eval.v1",
       "cohort":"SYNTHETIC_FIXTURE_ONLY","inputChecksum":"sha256:"+checksum,
       "nodeCount":nodes,"edgeCount":edge_count,"cpuOracle":"stdlib_directed_bfs",
       "oracleMs":baseline_ms,"boost":{"status":"NOT_CONFIGURED"},
       "canonicalAuthority":False,"admissionAuthorized":False,
       "productionGraphParityProven":False,"gpuParityProven":False,
       "databaseWrites":False}
    if boost_bin:
        payload=f"{nodes} {edge_count}\n"+"".join(f"{a} {b}\n" for a,b in edges)
        start=time.perf_counter_ns()
        proc=subprocess.run([boost_bin],input=payload,text=True,capture_output=True,timeout=15,check=False)
        total_ms=(time.perf_counter_ns()-start)/1e6
        if proc.returncode != 0:
            result["boost"]={"status":"EXECUTION_FAILED","returnCode":proc.returncode,"stderr":proc.stderr[:500]}
        else:
            try:
                actual=[int(v) for v in proc.stdout.split()]
                matched=actual==expected
                result["boost"]={"status":"PARITY_PASS" if matched else "PARITY_FAIL","processRoundtripMs":total_ms,"matched":matched}
            except ValueError:
                result["boost"]={"status":"MALFORMED_OUTPUT"}
    return result

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--boost-bin",default=None)
    parser.add_argument("--nodes",type=int,default=256)
    parser.add_argument("--edges",type=int,default=1024)
    args=parser.parse_args()
    print(json.dumps(evaluate(args.nodes,args.edges,args.boost_bin),sort_keys=True,indent=2))
