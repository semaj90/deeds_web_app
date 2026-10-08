"""KMEANS-01: independent nearest-center assignment after the LAST centroid update."""
from hashlib import sha256
import json
import math

def verify(rows, result, tolerance=1e-5):
    centers=result["centers"]
    labels=result["labels"]
    if not rows or len(labels)!=len(rows) or not centers:
        raise ValueError("KMEANS_SHAPE")
    width=len(rows[0])
    if not width or any(len(x)!=width for x in list(rows)+list(centers)):
        raise ValueError("KMEANS_WIDTH")
    if any(not math.isfinite(v) for r in list(rows)+list(centers) for v in r):
        raise ValueError("KMEANS_NONFINITE")
    assigned=[]
    inertia=0.0
    for row in rows:
        ds=[sum((a-b)**2 for a,b in zip(row,c)) for c in centers]
        idx=min(range(len(ds)),key=lambda k:(ds[k],k))
        assigned.append(idx)
        inertia+=ds[idx]
    if assigned!=labels:
        raise ValueError("KMEANS_STALE_ASSIGNMENT")
    digest=sha256(json.dumps(centers,separators=(",",":"),allow_nan=False).encode()).hexdigest()
    return {"status":"READBACK_PASS","assignments":assigned,"inertia":inertia,
            "centroid_sha256":"sha256:"+digest,"canonical_authority":False}
