"""CPU-only C25/KMeans/Dataset/UNKNOWN gate proofs. No store or model writes."""
import hashlib
import json
import math
import struct
from collections import Counter
from pathlib import Path

def c25_binary(matrix):
    if matrix.feature_count if hasattr(matrix,"feature_count") else False:
        pass
    if len(matrix.features)!=len(matrix.packet_keys) or len(matrix.mask)!=len(matrix.packet_keys):
        raise ValueError("C25_ROW_MISMATCH")
    rows=[]
    masks=[]
    for row,mask in zip(matrix.features,matrix.mask):
        if len(row)!=25 or len(mask)!=25 or any(type(x) is not int or x not in (0,1) for x in mask):
            raise ValueError("C25_WIDTH_OR_MASK")
        if any(not math.isfinite(x) for x in row):
            raise ValueError("C25_NONFINITE")
        rows.extend(row)
        masks.extend(mask)
    return {"packet_keys":list(matrix.packet_keys),
            "features_le_f32_hex":struct.pack("<"+"f"*len(rows),*rows).hex(),
            "presence_mask_hex":bytes(masks).hex(),
            "feature_count":25, "candidate_count":len(matrix.packet_keys)}

def compare_c25(expected, actual):
    keys=("packet_keys","features_le_f32_hex","presence_mask_hex","candidate_count","feature_count")
    errors=[k for k in keys if expected.get(k)!=actual.get(k)]
    return {"status":"PASS" if not errors else "FAIL","mismatches":errors,"canonical_authority":False}

def validate_kmeans_readback(rows, centroids, labels):
    if not rows or not centroids or len(rows)!=len(labels):
        raise ValueError("INVALID_CLUSTER_SHAPE")
    width=len(centroids[0])
    if width==0 or any(len(r)!=width for r in rows) or any(len(c)!=width for c in centroids):
        raise ValueError("INVALID_CLUSTER_WIDTH")
    if any(not math.isfinite(v) for vector in (*rows,*centroids) for v in vector):
        raise ValueError("NONFINITE_CLUSTER")
    nearest=[]
    inertia=0.0
    for row in rows:
        distances=[sum((a-b)**2 for a,b in zip(row,c)) for c in centroids]
        k=min(range(len(centroids)),key=lambda i:(distances[i],i))
        nearest.append(k)
        inertia+=distances[k]
    if tuple(labels)!=tuple(nearest):
        raise ValueError("STALE_CENTROID_ASSIGNMENT")
    return {"status":"PASS","inertia":inertia,"cluster_sizes":dict(Counter(nearest)),
            "centroid_sha256":"sha256:"+hashlib.sha256(json.dumps(centroids,separators=(",",":"),allow_nan=False).encode()).hexdigest(),
            "canonical_authority":False}

def frozen_dataset_manifest(records, feature_revision, taxonomy_revision, seed=7):
    if not records or not feature_revision or not taxonomy_revision or type(seed) is not int:
        raise ValueError("INVALID_DATASET")
    required={"query_id","group_id","label","features","mask"}
    ids=set()
    for row in records:
        if set(row)!=required or not all(isinstance(row[key],str) and row[key] for key in ("query_id","group_id","label")):
            raise ValueError("INVALID_LABEL_RECORD")
        if row["query_id"] in ids:
            raise ValueError("DUPLICATE_QUERY_ID")
        ids.add(row["query_id"])
        if len(row["features"])!=25 or len(row["mask"])!=25 or any(type(m) is not int or m not in (0,1) for m in row["mask"]):
            raise ValueError("INVALID_FEATURE_MASK")
        if any(type(v) not in (int,float) or not math.isfinite(v) for v in row["features"]):
            raise ValueError("INVALID_FEATURE_VALUE")
    data=sorted(records,key=lambda r:r["query_id"])
    groups=sorted({r["group_id"] for r in data})
    if len(groups)<3:
        raise ValueError("INSUFFICIENT_GROUPS")
    # Stable hash partition; sorting input rows cannot change membership.
    ranked=sorted(groups,key=lambda g:hashlib.sha256(f"{seed}:{g}".encode()).hexdigest())
    assignments={g:("test" if i%5==0 else "calibration" if i%5==1 else "train") for i,g in enumerate(ranked)}
    if len(set(assignments.values()))<3:
        raise ValueError("INSUFFICIENT_PARTITIONS")
    payload={"schema":"atlas.cpu-frozen-classifier-dataset.v1","feature_revision":feature_revision,
             "taxonomy_revision":taxonomy_revision,"seed":seed,"rows":data,
             "group_partition":assignments,"canonical_authority":False}
    digest=hashlib.sha256(json.dumps(payload,sort_keys=True,separators=(",",":"),allow_nan=False).encode()).hexdigest()
    return {"schema":payload["schema"],"digest":"sha256:"+digest,
            "row_count":len(data),"groups":assignments,
            "class_counts":dict(sorted(Counter(r["label"] for r in data).items())),
            "feature_revision":feature_revision,"taxonomy_revision":taxonomy_revision,
            "canonical_authority":False}

def calibrate_unknown(samples, max_false_accept=0.05):
    """Independent, labelled calibration samples: {confidence, margin, correct}.
    Conservative threshold search with explicit rejection when none meets policy.
    """
    if not samples or not 0<=max_false_accept<=1:
        raise ValueError("INVALID_CALIBRATION")
    for s in samples:
        if set(s)!={"confidence","margin","correct"} or type(s["correct"]) is not bool:
            raise ValueError("INVALID_CALIBRATION_SAMPLE")
        if any(type(s[k]) not in (int,float) or not math.isfinite(s[k]) or not 0<=s[k]<=1 for k in ("confidence","margin")):
            raise ValueError("INVALID_CALIBRATION_SCORE")
    thresholds=sorted({float(s["confidence"]) for s in samples})
    candidates=[]
    for t in thresholds:
        accepted=[s for s in samples if s["confidence"]>=t]
        if not accepted:
            continue
        false_accept=sum(not s["correct"] for s in accepted)/len(accepted)
        if false_accept<=max_false_accept:
            candidates.append((t, len(accepted)/len(samples),false_accept))
    if not candidates:
        return {"status":"NO_SAFE_THRESHOLD","threshold":None,"coverage":0.0,"canonical_authority":False}
    best=min(candidates,key=lambda x:(-x[1],x[0]))
    return {"status":"EVALUATION_ONLY","threshold":best[0],"coverage":best[1],
            "empirical_false_accept_rate":best[2],"sample_count":len(samples),
            "canonical_authority":False}
